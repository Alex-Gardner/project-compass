import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { ensureSchema, newId, pool, queueKey, redis } from "./db";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const uploadDir = process.env.UPLOAD_DIR ?? "../uploads";

if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

const taskRowCsvHeaders = [
  "record_id",
  "document_id",
  "project_name",
  "gc_name",
  "sc_name",
  "trade",
  "task_id",
  "task_name",
  "location_path",
  "upstream_task_id",
  "downstream_task_id",
  "dependency_type",
  "lag_days",
  "planned_start",
  "planned_finish",
  "duration_days",
  "sc_available_from",
  "sc_available_to",
  "allocation_pct",
  "constraint_type",
  "constraint_note",
  "constraint_impact_days",
  "status",
  "percent_complete",
  "confidence",
  "source_page",
  "source_snippet",
  "extracted_at"
] as const;

app.get("/health", async () => ({ ok: true }));

app.post("/documents", async (request, reply) => {
  const uploadedBy = String((request.headers["x-user-id"] as string) ?? "dev-user");
  const part = await request.file();

  if (!part || part.mimetype !== "application/pdf") {
    return reply.status(400).send({ error: "PDF upload required" });
  }

  const documentId = newId("doc");
  const jobId = newId("job");
  const filePath = join(uploadDir, `${documentId}-${part.filename}`);

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath);
    part.file.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  const client = await pool.connect();
  try {
    const now = new Date().toISOString();
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO documents (id, filename, storage_path, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [documentId, part.filename, filePath, uploadedBy, now]
    );

    await client.query(
      `INSERT INTO output_jobs (id, document_id, status, attempts, created_at)
       VALUES ($1, $2, 'queued', 0, $3)`,
      [jobId, documentId, now]
    );

    await client.query(
      `INSERT INTO audit_records (id, actor_id, entity_type, entity_id, action, metadata, created_at)
       VALUES ($1, $2, 'Document', $3, 'created', $4::jsonb, $5),
              ($6, $2, 'OutputJob', $7, 'queued', $8::jsonb, $5)`,
      [
        newId("aud"),
        uploadedBy,
        documentId,
        JSON.stringify({ filename: part.filename }),
        now,
        newId("aud"),
        jobId,
        JSON.stringify({ documentId })
      ]
    );

    await client.query("COMMIT");
    await redis.lpush(queueKey, JSON.stringify({ jobId, documentId }));

    return reply.status(201).send({ documentId, jobId });
  } catch (error) {
    await client.query("ROLLBACK");
    request.log.error({ err: error }, "failed to create document job");
    return reply.status(500).send({ error: "Failed to create document job" });
  } finally {
    client.release();
  }
});

app.get("/documents", async () => {
  const { rows } = await pool.query(`
    SELECT d.id,
           d.filename,
           d.storage_path AS "storagePath",
           d.uploaded_by AS "uploadedBy",
           d.created_at AS "createdAt",
           j.id AS "jobId",
           j.status AS "jobStatus"
    FROM documents d
    LEFT JOIN output_jobs j ON j.document_id = d.id
    ORDER BY d.created_at DESC
  `);

  return rows;
});

app.get("/documents/:id", async (request, reply) => {
  const schema = z.object({ id: z.string() });
  const { id } = schema.parse(request.params);

  const [docRes, jobRes, fieldRes, issueRes, taskRowRes] = await Promise.all([
    pool.query(
      `SELECT id, filename, storage_path AS "storagePath", uploaded_by AS "uploadedBy", created_at AS "createdAt"
       FROM documents WHERE id = $1`,
      [id]
    ),
    pool.query(
      `SELECT id, document_id AS "documentId", status, attempts, error, started_at AS "startedAt",
              completed_at AS "completedAt", created_at AS "createdAt"
       FROM output_jobs WHERE document_id = $1 LIMIT 1`,
      [id]
    ),
    pool.query(
      `SELECT id, document_id AS "documentId", name, value, confidence, source_page AS "sourcePage",
              source_bbox AS "sourceBBox", created_at AS "createdAt"
       FROM extraction_fields WHERE document_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    pool.query(
      `SELECT id, document_id AS "documentId", field_id AS "fieldId", type, severity, status,
              details, created_at AS "createdAt"
       FROM issues WHERE document_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    pool.query(
      `SELECT
         record_id AS "recordId",
         document_id AS "documentId",
         project_name AS "projectName",
         gc_name AS "gcName",
         sc_name AS "scName",
         trade,
         task_id AS "taskId",
         task_name AS "taskName",
         location_path AS "locationPath",
         upstream_task_id AS "upstreamTaskId",
         downstream_task_id AS "downstreamTaskId",
         dependency_type AS "dependencyType",
         lag_days AS "lagDays",
         COALESCE(to_char(planned_start, 'YYYY-MM-DD'), '') AS "plannedStart",
         COALESCE(to_char(planned_finish, 'YYYY-MM-DD'), '') AS "plannedFinish",
         duration_days AS "durationDays",
         COALESCE(to_char(sc_available_from, 'YYYY-MM-DD'), '') AS "scAvailableFrom",
         COALESCE(to_char(sc_available_to, 'YYYY-MM-DD'), '') AS "scAvailableTo",
         allocation_pct AS "allocationPct",
         constraint_type AS "constraintType",
         constraint_note AS "constraintNote",
         constraint_impact_days AS "constraintImpactDays",
         status,
         percent_complete AS "percentComplete",
         confidence,
         source_page AS "sourcePage",
         source_snippet AS "sourceSnippet",
         extracted_at AS "extractedAt"
       FROM extraction_task_rows
       WHERE document_id = $1
       ORDER BY extracted_at ASC, record_id ASC`,
      [id]
    )
  ]);

  if (!docRes.rows[0]) return reply.status(404).send({ error: "Document not found" });

  return {
    document: docRes.rows[0],
    job: jobRes.rows[0] ?? null,
    fields: fieldRes.rows.map((row) => ({ ...row, confidence: Number(row.confidence) })),
    issues: issueRes.rows,
    taskRows: taskRowRes.rows.map((row) => ({
      ...row,
      lagDays: Number(row.lagDays),
      durationDays: Number(row.durationDays),
      allocationPct: Number(row.allocationPct),
      constraintImpactDays: Number(row.constraintImpactDays),
      percentComplete: Number(row.percentComplete),
      confidence: Number(row.confidence),
      sourcePage: Number(row.sourcePage)
    }))
  };
});

app.get("/documents/:id/export.csv", async (request, reply) => {
  const schema = z.object({ id: z.string() });
  const { id } = schema.parse(request.params);

  const [docRes, rowRes] = await Promise.all([
    pool.query(`SELECT id, filename FROM documents WHERE id = $1`, [id]),
    pool.query(
      `SELECT record_id, document_id, project_name, gc_name, sc_name, trade, task_id, task_name, location_path,
              upstream_task_id, downstream_task_id, dependency_type, lag_days,
              COALESCE(to_char(planned_start, 'YYYY-MM-DD'), '') AS planned_start,
              COALESCE(to_char(planned_finish, 'YYYY-MM-DD'), '') AS planned_finish,
              duration_days,
              COALESCE(to_char(sc_available_from, 'YYYY-MM-DD'), '') AS sc_available_from,
              COALESCE(to_char(sc_available_to, 'YYYY-MM-DD'), '') AS sc_available_to,
              allocation_pct, constraint_type, constraint_note, constraint_impact_days, status, percent_complete,
              confidence, source_page, source_snippet, extracted_at
       FROM extraction_task_rows
       WHERE document_id = $1
       ORDER BY extracted_at ASC, record_id ASC`,
      [id]
    )
  ]);

  const document = docRes.rows[0];
  if (!document) return reply.status(404).send({ error: "Document not found" });

  const lines = [
    taskRowCsvHeaders.join(","),
    ...rowRes.rows.map((row) => taskRowCsvHeaders.map((header) => csvEscape(row[header])).join(","))
  ];

  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${document.filename.replace(/\\.pdf$/i, "")}-extraction.csv"`)
    .send(lines.join("\n"));
});

app.get("/jobs/:id", async (request, reply) => {
  const schema = z.object({ id: z.string() });
  const { id } = schema.parse(request.params);

  const jobRes = await pool.query(
    `SELECT id, document_id AS "documentId", status, attempts, error, started_at AS "startedAt",
            completed_at AS "completedAt", created_at AS "createdAt"
     FROM output_jobs WHERE id = $1`,
    [id]
  );

  const job = jobRes.rows[0];
  if (!job) return reply.status(404).send({ error: "Job not found" });

  const timelineRes = await pool.query(
    `SELECT id, actor_id AS "actorId", entity_type AS "entityType", entity_id AS "entityId",
            action, metadata, created_at AS "createdAt"
     FROM audit_records
     WHERE (entity_type = 'OutputJob' AND entity_id = $1)
        OR (entity_type = 'Document' AND entity_id = $2)
     ORDER BY created_at ASC`,
    [id, job.documentId]
  );

  return { job, timeline: timelineRes.rows };
});

app.get("/notifications", async (request) => {
  const userId = String((request.headers["x-user-id"] as string) ?? "dev-user");

  const { rows } = await pool.query(
    `SELECT id, user_id AS "userId", type, title, body, read_at AS "readAt", created_at AS "createdAt"
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
});

await ensureSchema();
await app.listen({ port, host: "0.0.0.0" });
