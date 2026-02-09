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

  const [docRes, jobRes, fieldRes, issueRes] = await Promise.all([
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
    )
  ]);

  if (!docRes.rows[0]) return reply.status(404).send({ error: "Document not found" });

  return {
    document: docRes.rows[0],
    job: jobRes.rows[0] ?? null,
    fields: fieldRes.rows.map((row) => ({ ...row, confidence: Number(row.confidence) })),
    issues: issueRes.rows
  };
});

app.get("/documents/:id/export.csv", async (request, reply) => {
  const schema = z.object({ id: z.string() });
  const { id } = schema.parse(request.params);

  const [docRes, fieldRes] = await Promise.all([
    pool.query(`SELECT id, filename FROM documents WHERE id = $1`, [id]),
    pool.query(
      `SELECT name, value, confidence, source_page AS "sourcePage", source_bbox AS "sourceBBox", created_at AS "createdAt"
       FROM extraction_fields
       WHERE document_id = $1
       ORDER BY created_at ASC`,
      [id]
    )
  ]);

  const document = docRes.rows[0];
  if (!document) return reply.status(404).send({ error: "Document not found" });

  const lines = [
    "documentId,filename,fieldName,fieldValue,confidence,sourcePage,sourceBBox,createdAt",
    ...fieldRes.rows.map((row) =>
      [
        csvEscape(id),
        csvEscape(document.filename),
        csvEscape(row.name),
        csvEscape(row.value),
        csvEscape(Number(row.confidence)),
        csvEscape(row.sourcePage),
        csvEscape(JSON.stringify(row.sourceBBox)),
        csvEscape(row.createdAt)
      ].join(",")
    )
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
