# Permissions and Tooling Notes

This file tracks external accounts, API keys, and access decisions needed to fully implement the Project Compass roadmap.

## Immediate (MVP Build Blockers)

### 1) Database and Queue Runtime
- Requirement: local Docker access to run `postgres:16` and `redis:7`.
- Needed from you:
  - confirm Docker Desktop/Engine is installed and running
  - permission to expose local ports `5432` and `6379`

### 2) GitHub Repository Access
- Requirement: push branches, open PRs, and configure CI later.
- Needed from you:
  - confirm collaborator permissions for this repo
  - decide branch protection rules for `main`

## Near-Term External Service Wiring

### 3) WorkOS (SSO-only in v0.1)
- Purpose: authentication and SSO.
- Needed from you:
  - WorkOS account/org
  - API key and client ID
  - callback URLs for local + production

### 4) Resend
- Purpose: email notifications adapter (initially scaffolded/feature-flagged).
- Needed from you:
  - Resend account
  - API key
  - verified sender domain/email

### 5) Twilio (feature-flagged)
- Purpose: SMS notifications for later enablement.
- Needed from you:
  - Twilio account
  - Account SID/Auth Token
  - sending phone number or messaging service SID

### 6) Smartsheet
- Purpose: one-way publish adapter.
- Needed from you:
  - Smartsheet developer/app access
  - API token
  - target workspace/sheet permissions

### 7) AI Providers
- Purpose: model routing through `ai-gateway`.
- Needed from you:
  - OpenAI API key
  - Anthropic (Claude) API key
  - Google AI/Gemini API key
  - nano-banana provider credentials (or confirmation of exact provider endpoint)
  - daily budget cap confirmation (`$20/day` proposed)

### 8) Object Storage
- Purpose: durable file storage outside local disk.
- Needed from you:
  - choose provider (AWS S3 / Cloudflare R2 / MinIO)
  - bucket name and region
  - access key + secret

### 9) Observability and Error Tracking
- Purpose: production-ready monitoring.
- Needed from you:
  - Sentry project DSN (recommended)
  - metrics stack preference (Prometheus/Grafana managed vs self-hosted)

## Recommended Environment Variable Groups
- `DATABASE_URL`, `REDIS_URL`, `PORT`, `CONFIDENCE_THRESHOLD`, `STORAGE_MODE`
- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`
- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `SMARTSHEET_API_TOKEN`
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NANO_BANANA_API_KEY`
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `SENTRY_DSN`

## Current Status
- Local clone completed.
- No OS-level permissions blocker encountered yet.
- External service accounts are not yet wired in this repository.
