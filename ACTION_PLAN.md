# Project Compass Action Plan

## Build Goal
Deliver a runnable MVP that proves the upload-to-extraction workflow end-to-end, with low-confidence issue creation and in-app completion notifications.

## Scope to Build First (MVP)
1. Upload PDF from UI and create a `Document` + queued `OutputJob`.
2. Process asynchronously with worker queue and visible status transitions.
3. Extract and persist fields with confidence scores.
4. Auto-create issues for fields below confidence threshold (70% default).
5. Show notifications in-app when processing completes.

## Phase Plan

### Phase 0: Foundation Setup
- Create monorepo structure:
  - `web-app/`
  - `api/`
  - `worker-jobs/`
  - `packages/shared-types/`
  - `infra/`
- Configure Bun workspace.
- Add local infra via Docker Compose (`postgres`, `redis`).
- Add environment variable templates for API and worker.

### Phase 1: Data Layer and Contracts
- Implement initial schema:
  - `Document`
  - `OutputJob`
  - `ExtractionField`
  - `Issue`
  - `Notification`
  - `AuditRecord`
- Add required indexes from MVP doc.
- Create first migration and seed script.
- Define shared enums/DTOs in `packages/shared-types`:
  - `JobStatus`
  - `IssueSeverity`
  - queue payload contracts

### Phase 2: API Service (Fastify + TypeScript)
- Implement endpoints:
  - `POST /documents`
  - `GET /documents`
  - `GET /documents/:id`
  - `GET /jobs/:id`
  - `GET /notifications`
- Add multipart PDF upload handling and local file storage path.
- On upload: persist `Document`, create `OutputJob(queued)`, enqueue `document-ingest`.
- Add request validation and audit records for major transitions.

### Phase 3: Worker Pipeline (BullMQ)
- Implement queues:
  - `document-ingest`
  - `extract`
  - `issue-detect`
  - `notify`
- Implement processor flow:
  - transition job status `queued -> processing -> completed/failed`
  - extraction stub using `pdfjs-dist`/`pdf-parse`, with OCR fallback path via Tesseract.js
  - issue creation for confidence below threshold
  - notification creation for uploader
- Add retries with exponential backoff, idempotency checks, and dead-letter handling.

### Phase 4: Web App (React + React Router + Vite)
- Build screens:
  - Upload
  - Documents/Jobs list with polling
  - Issue queue
  - Notifications list
- Add clear status badges and field-level issue display with source page metadata.
- Implement minimal dashboard cards for:
  - processing success rate
  - average time/page
  - low-confidence issue rate

### Phase 5: Hardening and Demo Validation
- Run smoke flow:
  1. start Postgres/Redis
  2. start API
  3. start worker
  4. start web app
  5. upload sample PDF
  6. verify status transitions
  7. verify issues for confidence < 70%
  8. verify notification appears
- Add baseline observability (structured logs + error tracking hook points).
- Document known gaps and post-MVP roadmap tasks.

## Implementation Order (Strict)
1. Repo scaffold + local infra
2. DB schema + migration
3. Shared types/contracts
4. Upload endpoint and job enqueue
5. Worker pipeline
6. Read endpoints
7. Web screens
8. Smoke test and bug fixes

## Definition of Done
- Single local command set can start infra, API, worker, and web app.
- At least one PDF can be processed end-to-end.
- Extracted fields, issues, and notifications are persisted and visible in UI.
- Failure paths are recoverable (retry/dead-letter), with no duplicate side effects.

## Post-MVP (Next)
1. Real OCR and source-coordinate overlays in review UI.
2. Output templates with ranking and saved defaults (user/team scope).
3. Smartsheet one-way publish adapter.
4. AI gateway with OpenAI/Claude/Gemini/nano-banana and daily spend cap enforcement.
5. RBAC policy expansion and SSO enforcement via WorkOS.
