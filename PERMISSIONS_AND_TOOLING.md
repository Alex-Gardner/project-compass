# Permissions and Tooling Notes (Tech Demo Scope)

This file tracks what is active now versus intentionally deferred while building the technical proof of concept.

## Active Now

### 1) Local Runtime
- Postgres + Redis for async processing.
- Bun monorepo services (`api`, `worker-jobs`, `web-app`).

### 2) Auth Mode: Demo Profiles (WorkOS deferred)
- Current behavior: frontend-only profile switcher with three roles:
  - Project Manager
  - Viewer
  - Site Admin
- WorkOS integration is intentionally hibernated until post-demo hardening.

### 3) Notification Mode: Stubbed Logs (Resend/Twilio deferred)
- Current behavior: worker logs when email/SMS should be sent.
- No external provider APIs are called.

### 4) AI Provider: OpenAI only
- Current behavior: worker supports OpenAI-based extraction when a real `OPENAI_API_KEY` is present.
- Fallback behavior: deterministic local extraction stub when key is missing/placeholder.

### 5) Storage: Local Disk
- Current behavior: uploaded PDFs remain on local disk.
- Object storage is intentionally deferred.

## Deferred (Hibernated for Tech Demo)
1. WorkOS production SSO flow
2. Resend delivery integration
3. Twilio delivery integration
4. Smartsheet publish integration
5. Multi-provider AI routing (Claude/Gemini/etc.)
6. Cloud object storage
7. Observability/error tracking stack

## OpenAI Setup Required For Live API Calls
- Required account: OpenAI platform account with billing enabled.
- Required secret: `OPENAI_API_KEY` in local `.env`.
- Optional: `OPENAI_MODEL` (default `gpt-4o-mini`).

## Current Status
- Tech demo implementation is set to local-first behavior.
- External integrations are intentionally stubbed/deferred.

## OpenAI Access Check (February 8, 2026)
- `.env` contains `OPENAI_API_KEY` with valid-looking format and `OPENAI_MODEL=gpt-5.2`.
- Live API call reached OpenAI but failed with `429 quota exceeded`.
- Impact: key is configured, but account/project billing or quota currently blocks usage.
- Action needed: enable billing and/or raise API usage limits in OpenAI project settings.
