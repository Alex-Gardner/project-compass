# Project Compass MVP Build Plan

This document is a practical implementation guide for building the first runnable MVP.

## MVP Objective
Ship a working vertical slice that proves:
1. A user can upload a PDF.
2. The system processes it asynchronously.
3. Extracted fields are stored with confidence scores.
4. Low-confidence fields create review issues.
5. The user sees job status and completion notifications in-app.

## Definition of Done (MVP)
A local demo is successful when all of these are true:
- Uploading a PDF creates a `Document` record and a queued `OutputJob`.
- A worker picks up the job and transitions status through `queued -> processing -> completed`.
- At least one `ExtractionField` is saved for the document.
- Fields below confidence threshold (default 70%) create `Issue` entries.
- A `Notification` appears in the UI when processing completes.

---

## 1) Repository Structure
Create a simple monorepo layout:

```txt
project-compass/
  web-app/
  api/
  worker-jobs/
  packages/
    shared-types/
  infra/
    docker-compose.yml
```

### Shared package scope (`packages/shared-types`)
- Core enums: `JobStatus`, `IssueSeverity`.
- DTOs used by API + worker + web app.
- Queue/job payload contracts.

---

## 2) Infrastructure (Local)
Use local containers for dependencies:
- PostgreSQL
- Redis

### `infra/docker-compose.yml`
- `postgres:16`
- `redis:7`
- expose standard ports (`5432`, `6379`)

### Environment variables (baseline)
- `DATABASE_URL`
- `REDIS_URL`
- `PORT` (API)
- `CONFIDENCE_THRESHOLD` (default `0.7`)
- `STORAGE_MODE` (`local` for MVP)

---

## 3) Data Model (MVP subset)
Start with these tables/entities:

- `Document`
  - `id`, `filename`, `storagePath`, `uploadedBy`, `createdAt`
- `OutputJob`
  - `id`, `documentId`, `status`, `attempts`, `error`, `startedAt`, `completedAt`, `createdAt`
- `ExtractionField`
  - `id`, `documentId`, `name`, `value`, `confidence`, `sourcePage`, `sourceBBox`, `createdAt`
- `Issue`
  - `id`, `documentId`, `fieldId`, `type`, `severity`, `status`, `details`, `createdAt`
- `Notification`
  - `id`, `userId`, `type`, `title`, `body`, `readAt`, `createdAt`
- `AuditRecord`
  - `id`, `actorId`, `entityType`, `entityId`, `action`, `metadata`, `createdAt`

### Required indexes
- `OutputJob(documentId, status)`
- `ExtractionField(documentId)`
- `Issue(documentId, status)`
- `Notification(userId, readAt)`

---

## 4) API Service (`api`)
Build with Fastify + TypeScript.

### Endpoints (minimum)
- `POST /documents`
  - Accept multipart PDF upload.
  - Save file (local folder for MVP).
  - Insert `Document`.
  - Insert `OutputJob` (`queued`).
  - Enqueue `document-ingest` job in BullMQ.
  - Return `{ documentId, jobId }`.

- `GET /documents`
  - List recent documents with current job status.

- `GET /documents/:id`
  - Return document details + extracted fields + issues.

- `GET /jobs/:id`
  - Return job state timeline.

- `GET /notifications`
  - Return current user notifications.

### API implementation notes
- Keep request/response types in `shared-types`.
- Add basic request validation (Zod or Fastify schema).
- Write an `AuditRecord` on each major transition.

---

## 5) Worker Service (`worker-jobs`)
Use BullMQ with named queues:
- `document-ingest`
- `extract`
- `issue-detect`
- `notify`

### Processing flow
1. `document-ingest`
   - Mark job `processing`.
   - Fan out to `extract`.

2. `extract`
   - MVP-safe path: parse text from PDF and produce a few fields.
   - Save `ExtractionField` entries with confidence values.
   - Enqueue `issue-detect`.

3. `issue-detect`
   - For each field `< CONFIDENCE_THRESHOLD`, create an `Issue`.
   - Enqueue `notify`.

4. `notify`
   - Mark `OutputJob` completed.
   - Create `Notification` for uploader.

### Reliability baseline
- Idempotent processors (safe re-run).
- Retry with exponential backoff.
- Dead-letter queue for repeated failures.

---

## 6) Web App (`web-app`)
Build with React + React Router + Vite.

### Screens for MVP
1. **Upload**
   - File picker (PDF only)
   - Submit to `POST /documents`

2. **Documents / Jobs**
   - Table of documents + job status badges
   - Poll every few seconds for updates

3. **Issue Queue**
   - Show low-confidence fields and issue details

4. **Notifications**
   - List completion notifications

### UX expectations
- Show clear state transitions: queued/processing/completed/failed.
- Link issues back to field name and source page.

---

## 7) Suggested 5-Day Implementation Schedule

### Day 1
- Monorepo scaffold + Bun workspace setup.
- Docker compose for Postgres/Redis.
- DB schema + initial migration.

### Day 2
- `POST /documents` + file persistence.
- Create `OutputJob` and enqueue first job.
- `GET /documents` and `GET /jobs/:id`.

### Day 3
- Worker queue consumers and status transitions.
- Extraction stub writes fields + confidence.
- Issue generation from confidence threshold.

### Day 4
- React screens: upload + job list + issue queue.
- Notifications endpoint + UI.

### Day 5
- Hardening: retries, error states, audit records.
- End-to-end smoke testing and demo prep.

---

## 8) First Test Checklist (Smoke)
Run this sequence locally:
1. Start Postgres/Redis.
2. Start API.
3. Start worker.
4. Start web app.
5. Upload one sample PDF.
6. Confirm job transitions and completion.
7. Confirm issues created for confidence < 70%.
8. Confirm notification appears.

---

## 9) Post-MVP Immediate Next Steps
After MVP demo passes, add in this order:
1. Real OCR path (Tesseract.js) and coordinate mapping.
2. Immutable document versioning and source trace overlays.
3. Output templates (priority ordering and saved presets).
4. Smartsheet one-way publish adapter.
5. AI gateway with provider routing + daily spend guardrail.

This keeps momentum while preserving your architecture direction.
