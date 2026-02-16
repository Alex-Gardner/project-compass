import { Pool } from "pg";
import Redis from "ioredis";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/project_compass"
});

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
export const queueKey = process.env.QUEUE_KEY ?? "queue:document-ingest";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function ensureSchema(): Promise<void> {
  await pool.query("SELECT pg_advisory_lock($1)", [9021001]);
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS output_jobs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_fields (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence NUMERIC(4,3) NOT NULL,
      source_page INTEGER NOT NULL,
      source_bbox JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extraction_task_rows (
      record_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      project_name TEXT NOT NULL,
      gc_name TEXT NOT NULL,
      sc_name TEXT NOT NULL,
      trade TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_name TEXT NOT NULL,
      location_path TEXT NOT NULL,
      upstream_task_id TEXT NOT NULL,
      downstream_task_id TEXT NOT NULL,
      dependency_type TEXT NOT NULL,
      lag_days INTEGER NOT NULL,
      planned_start TIMESTAMPTZ,
      planned_finish TIMESTAMPTZ,
      duration_days INTEGER NOT NULL,
      sc_available_from DATE,
      sc_available_to DATE,
      allocation_pct NUMERIC(5,2) NOT NULL,
      constraint_type TEXT NOT NULL,
      constraint_note TEXT NOT NULL,
      constraint_impact_days INTEGER NOT NULL,
      status TEXT NOT NULL,
      percent_complete NUMERIC(5,2) NOT NULL,
      confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
      source_page INTEGER NOT NULL,
      source_snippet TEXT NOT NULL,
      extracted_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      field_id TEXT NOT NULL REFERENCES extraction_fields(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT,
      document_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      duration_ms BIGINT,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_records (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      metadata JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_output_jobs_document_status ON output_jobs (document_id, status);
    CREATE INDEX IF NOT EXISTS idx_extraction_fields_document ON extraction_fields (document_id);
    CREATE INDEX IF NOT EXISTS idx_task_rows_document ON extraction_task_rows (document_id);
    CREATE INDEX IF NOT EXISTS idx_task_rows_task_id ON extraction_task_rows (task_id);
    CREATE INDEX IF NOT EXISTS idx_task_rows_sc_name ON extraction_task_rows (sc_name);
    CREATE INDEX IF NOT EXISTS idx_issues_document_status ON issues (document_id, status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, read_at);

    ALTER TABLE output_jobs ADD COLUMN IF NOT EXISTS task_id TEXT;
    UPDATE output_jobs SET task_id = id WHERE task_id IS NULL;
    ALTER TABLE output_jobs ALTER COLUMN task_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_output_jobs_task_id ON output_jobs (task_id);

    ALTER TABLE extraction_task_rows ALTER COLUMN planned_start TYPE TIMESTAMPTZ USING planned_start::timestamptz;
    ALTER TABLE extraction_task_rows ALTER COLUMN planned_finish TYPE TIMESTAMPTZ USING planned_finish::timestamptz;
    ALTER TABLE extraction_task_rows ALTER COLUMN confidence SET DEFAULT 0;

    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS document_id TEXT;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS duration_ms BIGINT;
  `);
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [9021001]);
  }
}
