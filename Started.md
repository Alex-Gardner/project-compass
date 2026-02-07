# Project Compass - Discovery Notes

## Objective
Build an automated helper for project managers at a general contracting company to reduce manual entry, preserve historical document traceability, and transform uploaded source material into structured, shareable outputs.

## Confirmed Business Requirements

### Core outcomes
- Drastically speed up / eliminate manual data entry.
- Maintain access to all submitted documents for later review.
- Make underlying extracted data visible, interactable, and shareable (including charting such as Gantt-style dependencies from subcontractor documents).

### Users (permission scaffolding now, detailed access later)
- PMs
- Assistants
- App admins

### Inputs / data sources
- **Critical:** accept PDFs.
- Scaffold infrastructure for future integrations:
  - Email
  - Spreadsheets
  - Smartsheet
  - Calendars

### Outputs
- Smartsheet exports/publish
- PDFs
- Dashboards
- Alerts

### Workflow & orchestration
- After document upload, processing runs asynchronously.
- User is alerted in-app when deliverables are ready.
- Users can rank desired outputs, and system delivers in that order.
- Output ranking supports saved templates.

### Constraints
- No current data limitations stated.

### Success criteria
- **Level 1:** Replace 80% of manual input time with >90% extraction accuracy.
- **Level 2:** Output consistently labeled spreadsheet data consumable by another program.
- **Level 3:** Output structured data (JSON-first) for analytics.
- **Level 4:** Create internal dashboards and dependency charts.
- **Level 5:** Make outputs interactable and augmentable with persistent user notes.

## Clarifications Added
- PDF layouts can vary by project; system should use active intelligence to infer arrangement from uploads.
- Low-confidence fields should generate issues that include:
  - flagged field metadata
  - source location within the uploaded document
  - visual highlight support (e.g., red overlay region)
- Alerts should be in-application first, while scaffolding email/SMS notification infrastructure for future enablement.
- Smartsheet integration starts as one-way publish.

## Recommended Immediate Build Step (v0.1 architecture scaffold)
1. Define canonical data model (`Document`, `ExtractionField`, `Issue`, `OutputJob`, `OutputTemplate`, `Notification`, `AuditRecord`).
2. Implement async job pipeline for upload -> extraction -> issue detection -> prioritized output generation.
3. Add permission/visibility framework skeleton (roles/resources/actions) without final policy matrix.
4. Build output-priority template system (save/apply template per user/team).
5. Add in-app notifications now; create adapter interfaces for email/SMS providers (disabled by feature flag).
6. Implement immutable document archive + versioned extraction/audit trail.

## Next Decisions Needed (to lock sprint scope)
- Initial KPI baselines (current manual entry time per document bundle).
- First dashboard views to ship (operations status vs dependency timeline vs exception queue).
- Preferred confidence thresholds and issue severity tiers.
- Whether template defaults are user-level only or can be shared at organization/project scope.

## Stack Collaboration Output
- See `STACK_PROPOSAL.md` for the finalized JS-first stack decisions (including Bun runtime, Tesseract.js OCR, model vendors, budget cap, dashboard scope, and SLA target).
