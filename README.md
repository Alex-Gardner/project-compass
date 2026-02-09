# Project Compass Dev Scaffold

Bun-first technical demo scaffold for Project Compass.

## Quick Start
1. `cp .env.example .env`
2. `bun install`
3. Start your local Postgres/Redis (Docker or existing services)
4. `bun run dev`

Services:
- API: `http://localhost:3001`
- Worker: Redis-backed queue consumer
- Web app: `http://localhost:5173`

## Tech Demo Scope
- Auth: demo profile switcher in UI (Project Manager / Viewer / Site Admin)
- Notifications: Resend/Twilio stub logs only
- AI: OpenAI-only path enabled; fallback to local row extraction if key is missing
- Storage: on-disk files
- Deferred: WorkOS, Smartsheet, object storage, and observability hardening

## Single-Table Extraction Output
- Worker now produces one row per task assignment and stores it in `extraction_task_rows`.
- `GET /documents/:id` now includes `taskRows` alongside existing `fields` for compatibility.
- `GET /documents/:id/export.csv` exports canonical single-table columns in fixed order.
- Use `EXTRACTION_MODE=row` in `.env` for row extraction mode (default).

## OpenAI Connection (Local)
1. Create an API key in the OpenAI dashboard.
2. Set this in `.env`:
   - `OPENAI_API_KEY=sk-...`
   - optionally `OPENAI_MODEL=gpt-4o-mini`
3. Restart dev services.
4. Upload a PDF and watch worker logs:
   - If key is valid: extraction path uses OpenAI.
   - If key is missing/placeholder: worker prints fallback message and continues.
