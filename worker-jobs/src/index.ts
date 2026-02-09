import type { ConstraintType, DependencyType, TaskAssignmentRow, TaskStatus } from "@project-compass/shared-types";
import { ensureSchema, newId, pool, queueKey, redis } from "./db";
import { extractTaskRowsForDemo } from "./extraction";
import { logEmailSendIntent, logSmsSendIntent } from "./notification-stubs";

const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.7);
const extractionMode = process.env.EXTRACTION_MODE ?? "row";

const allowedDependencyTypes = new Set<DependencyType>(["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish", "none"]);
const allowedConstraintTypes = new Set<ConstraintType>(["none", "material", "crew", "access", "permit", "weather", "other"]);
const allowedStatuses = new Set<TaskStatus>(["not_started", "in_progress", "blocked", "complete", "unknown"]);

type QueuePayload = {
  jobId: string;
  documentId: string;
};

function compareIsoDates(left: string, right: string): number {
  if (!left || !right) return 0;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return a - b;
}

function validationMessages(row: TaskAssignmentRow): string[] {
  const messages: string[] = [];

  if (!row.taskName.trim()) messages.push("missing task_name");
  if (!row.scName.trim()) messages.push("missing sc_name");

  if (row.plannedStart && row.plannedFinish && compareIsoDates(row.plannedStart, row.plannedFinish) > 0) {
    messages.push("planned_finish occurs before planned_start");
  }

  if (!allowedDependencyTypes.has(row.dependencyType)) messages.push("invalid dependency_type");
  if (!allowedConstraintTypes.has(row.constraintType)) messages.push("invalid constraint_type");
  if (!allowedStatuses.has(row.status)) messages.push("invalid status");
  if (row.allocationPct < 0 || row.allocationPct > 100) messages.push("allocation_pct out of range (0-100)");
  if (row.confidence < confidenceThreshold) messages.push(`row confidence ${Math.round(row.confidence * 100)}% below threshold ${Math.round(confidenceThreshold * 100)}%`);

  return messages;
}

async function processJob(payload: QueuePayload): Promise<void> {
  const client = await pool.connect();

  try {
    const now = new Date().toISOString();
    await client.query("BEGIN");

    const jobRes = await client.query(
      `SELECT id, document_id, status, attempts
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

    await client.query(
      `UPDATE output_jobs
       SET status = 'processing', attempts = attempts + 1, started_at = COALESCE(started_at, $2)
       WHERE id = $1`,
      [payload.jobId, now]
    );

    await client.query(
      `INSERT INTO audit_records (id, actor_id, entity_type, entity_id, action, metadata, created_at)
       VALUES ($1, 'worker', 'OutputJob', $2, 'processing', $3::jsonb, $4)`,
      [newId("aud"), payload.jobId, JSON.stringify({ mode: extractionMode }), now]
    );

    const rows = await extractTaskRowsForDemo(String(document.filename), String(payload.documentId), String(document.storage_path));

    for (const row of rows) {
      await client.query(
        `INSERT INTO extraction_task_rows
         (record_id, document_id, project_name, gc_name, sc_name, trade, task_id, task_name, location_path,
          upstream_task_id, downstream_task_id, dependency_type, lag_days, planned_start, planned_finish,
          duration_days, sc_available_from, sc_available_to, allocation_pct, constraint_type, constraint_note,
          constraint_impact_days, status, percent_complete, confidence, source_page, source_snippet, extracted_at)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, NULLIF($14, '')::date, NULLIF($15, '')::date,
          $16, NULLIF($17, '')::date, NULLIF($18, '')::date, $19, $20, $21,
          $22, $23, $24, $25, $26, $27, $28)
         ON CONFLICT (record_id) DO NOTHING`,
        [
          row.recordId,
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
          row.confidence,
          row.sourcePage,
          row.sourceSnippet,
          row.extractedAt
        ]
      );

      // Compatibility field entry so existing UI and issue FK constraints remain valid.
      const fieldId = newId("fld");
      await client.query(
        `INSERT INTO extraction_fields
         (id, document_id, name, value, confidence, source_page, source_bbox, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          fieldId,
          payload.documentId,
          "task_assignment_row",
          `${row.taskName || "(unknown task)"} | ${row.scName || "(unknown subcontractor)"}`,
          row.confidence,
          row.sourcePage,
          JSON.stringify([0.05, 0.05, 0.95, 0.95]),
          now
        ]
      );

      const issues = validationMessages(row);
      for (const message of issues) {
        await client.query(
          `INSERT INTO issues
           (id, document_id, field_id, type, severity, status, details, created_at)
           VALUES ($1, $2, $3, 'row-validation', 'medium', 'open', $4, $5)`,
          [newId("iss"), payload.documentId, fieldId, `Row ${row.recordId}: ${message}`, now]
        );
      }
    }

    const notificationId = newId("ntf");
    const finishedAt = new Date().toISOString();

    await client.query(
      `UPDATE output_jobs
       SET status = 'completed', completed_at = $2, error = NULL
       WHERE id = $1`,
      [payload.jobId, finishedAt]
    );

    await client.query(
      `INSERT INTO notifications
       (id, user_id, type, title, body, created_at)
       VALUES ($1, $2, 'job.completed', 'Document processing complete', $3, $4)`,
      [notificationId, document.uploaded_by, `Finished processing ${document.filename}`, finishedAt]
    );

    await client.query(
      `INSERT INTO audit_records (id, actor_id, entity_type, entity_id, action, metadata, created_at)
       VALUES
       ($1, 'worker', 'OutputJob', $2, 'completed', $3::jsonb, $4),
       ($5, 'worker', 'Notification', $6, 'created', $7::jsonb, $4)`,
      [
        newId("aud"),
        payload.jobId,
        JSON.stringify({ rowsStored: rows.length, mode: extractionMode }),
        finishedAt,
        newId("aud"),
        notificationId,
        JSON.stringify({ userId: document.uploaded_by })
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
