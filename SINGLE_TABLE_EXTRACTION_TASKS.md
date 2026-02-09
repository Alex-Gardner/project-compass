# Single-Table Extraction Implementation Tasks

## Objective
Produce spreadsheet-ready extraction output as a **single flat table** where each row represents one subcontractor task assignment at one location, with dependency, schedule, availability, and constraint context.

## Target Row Grain
- One row = `project + subcontractor + task (+ location)` assignment.
- A subcontractor can appear on multiple rows for multiple tasks.
- Dependencies stay row-level through upstream/downstream task identifiers.

## Task Backlog

### 1) Define and freeze the single-table schema
- [ ] Create a canonical column list for the extraction table with data types and required/optional flags.
- [ ] Include core columns:
  - `record_id`, `document_id`, `project_name`, `gc_name`
  - `sc_name`, `trade`
  - `task_id`, `task_name`, `location_path`
  - `upstream_task_id`, `downstream_task_id`, `dependency_type`, `lag_days`
  - `planned_start`, `planned_finish`, `duration_days`
  - `sc_available_from`, `sc_available_to`, `allocation_pct`
  - `constraint_type`, `constraint_note`, `constraint_impact_days`
  - `status`, `percent_complete`
  - `confidence`, `source_page`, `source_snippet`, `extracted_at`
- [ ] Add explicit normalization rules for dates, enums, and empty values.

### 2) Add shared TypeScript types for row-based extraction
- [ ] Add a `TaskAssignmentRow` interface in `packages/shared-types/src/index.ts`.
- [ ] Add enum-like string unions for constrained values (`dependency_type`, `status`, key `constraint_type` values).
- [ ] Keep existing field-level types for compatibility while introducing row-based types.

### 3) Implement LLM extraction contract for row output
- [ ] Replace the current three-field extraction prompt with a strict row-array JSON schema.
- [ ] Update OpenAI `responses.create` schema in `worker-jobs/src/extraction.ts` to return `rows` with all required columns.
- [ ] Add extraction guidance for ambiguous docs:
  - prefer explicit values from document;
  - infer minimally;
  - set unknowns to empty/null;
  - maintain confidence at row level.
- [ ] Preserve fallback behavior when OpenAI is unavailable.

### 4) Expand fallback parser for minimal row output
- [ ] Update heuristic fallback to emit at least one valid row with placeholder-safe values.
- [ ] Ensure fallback always returns parseable dates/strings that match schema constraints.
- [ ] Add confidence downgrade when values are inferred.

### 5) Store row extractions in persistence layer
- [ ] Add a new table (e.g., `extraction_task_rows`) via `ensureSchema` in both `api/src/db.ts` and `worker-jobs/src/db.ts`.
- [ ] Add indexes for `document_id`, `task_id`, and `sc_name`.
- [ ] Keep existing `extraction_fields` writes initially or add a phased switch-over plan.
- [ ] Update worker ingestion flow to insert one DB row per extracted assignment.

### 6) Update API response and export endpoints
- [ ] Extend `GET /documents/:id` to return row-based extraction data.
- [ ] Add/replace CSV export endpoint to output **single-table row format** directly.
- [ ] Ensure CSV header order matches frozen schema from Task 1.
- [ ] Ensure CSV escaping and null handling are stable for spreadsheet import.

### 7) Add validation and issue generation for row records
- [ ] Add row-level validation checks:
  - missing `task_name` or `sc_name`
  - invalid date ordering (`planned_finish < planned_start`)
  - invalid enum values
  - allocation outside expected range.
- [ ] Persist validation findings using existing `issues` mechanism.
- [ ] Add a confidence threshold rule that can flag low-confidence rows.

### 8) Add tests for extraction and export stability
- [ ] Add unit tests for schema parsing and fallback row generation.
- [ ] Add integration test for worker insertion of row data.
- [ ] Add API tests for `GET /documents/:id` and CSV export format.
- [ ] Include regression tests for “missing contractor/crew/availability” scenarios.

### 9) Add migration + rollout controls
- [ ] Add env flag to choose extraction mode (`field` vs `row`) during transition.
- [ ] Add migration notes for existing environments.
- [ ] Add backfill strategy (optional) for already-processed documents.

### 10) Document operating procedure for prompt tuning
- [ ] Add a short runbook section to `README.md`:
  - how to tune prompt/schema;
  - how to inspect low-confidence rows;
  - how to validate spreadsheet output.
- [ ] Include sample output row and accepted enum values.

## Milestone Plan

### Milestone A — Contract First
- Complete Tasks 1–3.
- Exit criteria: LLM returns valid row-array JSON against schema.

### Milestone B — Persist + Export
- Complete Tasks 4–6.
- Exit criteria: rows are stored and downloadable as single-table CSV.

### Milestone C — Quality + Rollout
- Complete Tasks 7–10.
- Exit criteria: validation, tests, and docs support production-like iteration.

## Definition of Done
- [ ] Single-table schema is documented and versioned.
- [ ] Worker extracts row-based data (LLM + fallback).
- [ ] API returns and exports row-based table.
- [ ] Validation + confidence checks are active.
- [ ] Tests cover extraction contract and CSV output.
- [ ] Documentation enables repeatable operation.
