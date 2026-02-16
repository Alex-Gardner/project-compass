import { ensureSchema, newId, pool, queueKey, redis } from "./db";
import { extractTaskRowsForDemo } from "./extraction";
import { logEmailSendIntent, logSmsSendIntent } from "./notification-stubs";

const extractionMode = process.env.EXTRACTION_MODE ?? "row";

type QueuePayload = {
  jobId: string;
  taskId?: string;
  documentId: string;
};

async function processJob(payload: QueuePayload): Promise<void> {
  const client = await pool.connect();

  try {
    const now = new Date().toISOString();
    await client.query("BEGIN");

    const jobRes = await client.query(
      `SELECT id, task_id, document_id, status, attempts
       FROM output_jobs
       WHERE id = $1 FOR UPDATE`,
      [payload.jobId]
    );

    const job = jobRes.rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return;
    }

    if (job.status === "completed") {
      await client.query("COMMIT");
      return;
    }

    const docRes = await client.query(
      `SELECT id, filename, storage_path, uploaded_by
       FROM documents
       WHERE id = $1`,
      [payload.documentId]
    );

    const document = docRes.rows[0];
    if (!document) {
      await client.query(
        `UPDATE output_jobs
         SET status = 'failed', error = $2, completed_at = $3
         WHERE id = $1`,
        [payload.jobId, "Document not found", now]
      );
      await client.query("COMMIT");
      return;
    }

    const startRes = await client.query(
      `UPDATE output_jobs
       SET status = 'processing', attempts = attempts + 1, started_at = COALESCE(started_at, $2)
       WHERE id = $1
       RETURNING started_at`,
      [payload.jobId, now]
    );
    const startedAt = new Date(String(startRes.rows[0]?.started_at ?? now)).toISOString();

    await client.query(
      `INSERT INTO audit_records (id, actor_id, entity_type, entity_id, action, metadata, created_at)
       VALUES ($1, 'worker', 'OutputJob', $2, 'processing', $3::jsonb, $4)`,
      [newId("aud"), payload.jobId, JSON.stringify({ mode: extractionMode, taskId: job.task_id }), now]
    );

    const rows = await extractTaskRowsForDemo(String(document.filename), String(payload.documentId), String(document.storage_path));

    for (const row of rows) {
      const recordId = newId("row");
      await client.query(
        `INSERT INTO extraction_task_rows
         (record_id, document_id, project_name, gc_name, sc_name, trade, task_id, task_name, location_path,
          upstream_task_id, downstream_task_id, dependency_type, lag_days, planned_start, planned_finish,
          duration_days, sc_available_from, sc_available_to, allocation_pct, constraint_type, constraint_note,
          constraint_impact_days, status, percent_complete, confidence, source_page, source_snippet, extracted_at)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, NULLIF($14, '')::timestamptz, NULLIF($15, '')::timestamptz,
          $16, NULLIF($17, '')::timestamptz, NULLIF($18, '')::timestamptz, $19, $20, $21,
          $22, $23, $24, 0, $25, $26, $27)`,
        [
          recordId,
          row.documentId,
          row.projectName,
          row.gcName,
          row.scName,
          row.trade,
          row.taskId,
          row.taskName,
          row.locationPath,
          row.upstreamTaskId,
          row.downstreamTaskId,
          row.dependencyType,
          row.lagDays,
          row.plannedStart,
          row.plannedFinish,
          row.durationDays,
          row.scAvailableFrom,
          row.scAvailableTo,
          row.allocationPct,
          row.constraintType,
          row.constraintNote,
          row.constraintImpactDays,
          row.status,
          row.percentComplete,
          row.sourcePage,
          row.sourceSnippet,
          row.extractedAt
        ]
      );
    }

    const notificationId = newId("ntf");
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

    await client.query(
      `UPDATE output_jobs
       SET status = 'completed', completed_at = $2, error = NULL
       WHERE id = $1`,
      [payload.jobId, finishedAt]
    );

    await client.query(
      `INSERT INTO notifications
       (id, user_id, task_id, document_id, type, title, body, started_at, completed_at, duration_ms, created_at)
       VALUES ($1, $2, $3, $4, 'job.completed', 'Document processing complete', $5, $6, $7, $8, $9)`,
      [notificationId, document.uploaded_by, job.task_id, payload.documentId, `Finished processing ${document.filename}`, startedAt, finishedAt, durationMs, finishedAt]
    );

    await client.query(
      `INSERT INTO audit_records (id, actor_id, entity_type, entity_id, action, metadata, created_at)
       VALUES
       ($1, 'worker', 'OutputJob', $2, 'completed', $3::jsonb, $4),
       ($5, 'worker', 'Notification', $6, 'created', $7::jsonb, $4)`,
      [
        newId("aud"),
        payload.jobId,
        JSON.stringify({ rowsStored: rows.length, mode: extractionMode, taskId: job.task_id, durationMs }),
        finishedAt,
        newId("aud"),
        notificationId,
        JSON.stringify({ userId: document.uploaded_by, taskId: job.task_id, durationMs })
      ]
    );

    logEmailSendIntent(String(document.uploaded_by), "Document processing complete", `Finished processing ${document.filename}`);
    logSmsSendIntent(String(document.uploaded_by), `Project Compass: ${document.filename} is ready for review.`);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("worker failed", error);
  } finally {
    client.release();
  }
}

async function run(): Promise<void> {
  await ensureSchema();
  console.log("worker started (redis queue mode)");

  while (true) {
    try {
      const item = await redis.brpop(queueKey, 5);
      if (!item) continue;
      const payload = JSON.parse(item[1]) as QueuePayload;
      await processJob(payload);
    } catch (error) {
      console.error("worker loop error", error);
    }
  }
}

await run();
