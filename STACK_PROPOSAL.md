# Project Compass — Suggested Web Application Stack (Revised, JS-first)

## Confirmed decisions
- **Frontend:** React + React Router + Vite
- **JavaScript runtime/package manager:** **Bun** (favor Bun over Node)
- **Email provider:** **Resend**
- **Auth/SSO provider:** **WorkOS (SSO-only for v0.1)**
- **Backend API default:** Fastify + TypeScript
- **Async pipeline:** BullMQ + Redis
- **OCR provider (v0.1):** **Tesseract.js**
- **Model vendors to integrate:** **OpenAI, Claude, Gemini, and nano-banana**
- **AI spend guardrail:** **configurable cap of $20/day**
- **Initial extraction confidence threshold:** **70%**
- **SLA target:** **2 minutes per page**

## Recommended stack

### Frontend
- **Framework:** React + TypeScript + React Router (data routers)
- **Build tooling:** Vite
- **UI:** Tailwind CSS + shadcn/ui (or Radix primitives)
- **Data fetching/state:** TanStack Query
- **Charts:** Apache ECharts (project summary, operations status, timelines, KPI cards)
- **PDF review/annotation:** PDF.js + canvas/SVG overlays for field highlights

### Backend API and orchestration
- **API layer (recommended):** Fastify + TypeScript
  - optional alternatives: Express, Hono, AdonisJS, LoopBack, or tRPC-backed APIs
- **Async jobs:** BullMQ + Redis
  - queues: `document-ingest`, `extract`, `issue-detect`, `generate-output`, `publish-smartsheet`, `notify`
- **Reliability:** idempotent handlers, retry policies, dead-letter queue, structured audit events

### Runtime and execution model
- **Primary runtime:** Bun for API services, workers, scripts, and tooling where library compatibility permits
- **Compatibility note:** keep runtime-specific abstractions slim so any Node-only library edge cases can be isolated

### Data and persistence
- **Primary DB:** PostgreSQL
- **ORM/query:** Prisma (or Drizzle)
- **Object storage:** S3-compatible bucket (S3/MinIO)
- **Caching/queues:** Redis
- **Search/indexing:** Postgres full-text initially

### Document extraction and OCR (Bun/JS-first)
- **PDF text extraction:** `pdfjs-dist` and/or `pdf-parse`
- **OCR provider for v0.1:** **Tesseract.js**
- **Field mapping pipeline:** Bun worker services for schema mapping, source-coordinate linking, and confidence scoring
- **Confidence policy (initial):** fields under **70%** confidence generate issues for review

### AI model orchestration
Use a dedicated `ai-gateway` capability so product logic is not trapped inside one AI service.
- **Integrated vendors (v0.1):** OpenAI, Claude, Gemini, nano-banana
- **Gateway responsibilities:**
  - provider routing/failover
  - prompt & model version registry
  - policy controls (cost/latency/quality)
  - centralized telemetry and evaluations
- **Budget control:** configurable **$20/day** cap with alerting and graceful degradation policies

### Auth, permissions, and security
- **Identity + SSO:** WorkOS (**SSO-only rollout for v0.1**)
- **Authorization:** RBAC now, ABAC-ready model later
- **Auditability:** append-only audit records + immutable document version links
- **Security baseline:** signed URLs, encryption at rest, secrets manager, PII-aware logs

### Notifications and integrations
- **In-app notifications:** first-class `Notification` table + websocket/SSE updates
- **Email provider:** Resend (via `EmailProvider` adapter)
- **SMS provider:** Twilio (feature-flagged)
- **Smartsheet:** one-way publish adapter + template mapping config

### Deployment and DevOps
- **Runtime:** Dockerized services on ECS/Fargate (or Kubernetes if that is org standard)
- **IaC:** Terraform
- **CI/CD:** GitHub Actions
- **Observability:** OpenTelemetry + Prometheus/Grafana + Sentry
- **Feature flags:** OpenFeature-compatible provider

## API layer alternatives to NestJS
- **Fastify:** recommended default for this project
- **Express:** broad ecosystem and onboarding ease
- **Hono:** lightweight and modern
- **AdonisJS:** batteries included
- **LoopBack:** strong contract-first tooling
- **tRPC:** strongest end-to-end typing when frontend/backend are tightly coupled

## Reference service layout
- `web-app` (React + React Router)
- `api` (Fastify on Bun)
- `worker-jobs` (BullMQ processors on Bun)
- `ai-gateway` (provider routing, policy, prompt/model registry)
- `postgres`
- `redis`
- `object-storage`

## Canonical schema sketch
- `Document`
- `DocumentVersion`
- `ExtractionField`
- `Issue`
- `OutputTemplate`
- `OutputJob`
- `Notification`
- `AuditRecord`
- `IntegrationConnection`
- `PromptConfig` (optional)
- `ModelUsageLedger` (tracks per-provider spend against daily cap)

## Suggested v0.1 implementation cut
1. React Router portal: upload, document list, job status, issue queue, notifications.
2. Fastify API on Bun: entities, RBAC scaffolding, upload endpoints.
3. BullMQ pipeline on Bun with strict state transitions and retries.
4. JS extraction pipeline (`pdfjs-dist`/`pdf-parse` + Tesseract.js OCR + LLM mapping).
5. `ai-gateway` with OpenAI/Claude/Gemini/nano-banana integrations and $20/day controls.
6. Smartsheet one-way publisher.
7. Initial dashboard views:
   - project summary
   - operations status
   - timelines
   - 3 KPIs: processing success rate, average processing time/page, low-confidence issue rate

## Future update (lower priority)
- Template defaults should support both:
  - individual defaults
  - shareable defaults (team/org/project scope)

## Key non-functional targets
- End-to-end traceability from output fields to source coordinates.
- Re-runnable jobs without duplicate side effects.
- Initial confidence threshold of 70% with tunable policy over time.
- SLA target of 2 minutes per page.
- Provider/runtime swap capability via adapter interfaces.
