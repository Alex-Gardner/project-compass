import { ensureSchema, newId, pool, queueKey, redis } from "./db";
import { extractFieldsForDemo } from "./extraction";
import { logEmailSendIntent, logSmsSendIntent } from "./notification-stubs";

const confidenceThreshold = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.7);

type QueuePayload = {
  jobId: string;
  documentId: string;
};

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
      [newId("aud"), payload.jobId, JSON.stringify({}), now]
    );

    const extracted = await extractFieldsForDemo(String(document.filename), String(document.storage_path));

    for (const field of extracted) {
      const fieldId = newId("fld");

      await client.query(
        `INSERT INTO extraction_fields
         (id, document_id, name, value, confidence, source_page, source_bbox, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          fieldId,
          payload.documentId,
          field.name,
          field.value,
          field.confidence,
          field.sourcePage,
          JSON.stringify(field.sourceBBox),
          now
        ]
      );

      if (field.confidence < confidenceThreshold) {
        await client.query(
          `INSERT INTO issues
           (id, document_id, field_id, type, severity, status, details, created_at)
           VALUES ($1, $2, $3, 'low-confidence', 'medium', 'open', $4, $5)`,
          [
            newId("iss"),
            payload.documentId,
            fieldId,
            `Field ${field.name} confidence ${Math.round(field.confidence * 100)}% is below threshold ${Math.round(confidenceThreshold * 100)}%`,
            now
          ]
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
        JSON.stringify({}),
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
