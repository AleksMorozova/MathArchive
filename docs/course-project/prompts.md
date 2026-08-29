# AI interaction log

This log records concrete prompts, decisions, and corrections. It is intentionally more specific than “AI helped me.”

## 1. Feature selection and requirements

**Prompt**

> Inspect MathArchive as a production educational archive for one administrator. Select a substantial course-project feature that fits the current PostgreSQL metadata + Render Persistent Disk architecture. Avoid speculative enterprise infrastructure. Define acceptance criteria, explicit non-goals, risks, tests, and a demo scenario.

**Useful output**

- Identified storage reconciliation as a real operational gap.
- Proposed missing, orphaned, and size-mismatch categories.
- Recommended read-only audit as the default and manual cleanup.

**My corrections**

- Rejected automatic database-row deletion because a missing file can be restored from backup.
- Rejected queues, scheduled workers, S3 migration, and distributed transactions as disproportionate.
- Required re-checking references before every delete, not only once at audit time.

## 2. Backend implementation

**Prompt**

> Implement storage audit inside the existing layers. Keep controllers thin, preserve IFileStorage and IDocumentRepository boundaries, propagate CancellationToken, return established JSON conventions, and protect referenced content over perfect orphan cleanup. Do not change the document lifecycle.

**Useful output**

- Application-level `StorageAuditService`.
- Minimal storage/reference projections instead of loading file streams or complete entities.
- Structured audit and cleanup result contracts.

**My corrections and verification**

- Added a confirmation phrase at the API boundary.
- Checked that cleanup never accepts arbitrary paths or filenames from the client.
- Ensured the local storage implementation returns names only, not absolute filesystem paths.
- Added a concurrency-focused unit test where an orphan becomes referenced between audit and delete.

## 3. Frontend implementation

**Prompt**

> Add a Ukrainian admin page for the storage audit using the project's Material UI and TanStack Query patterns. Show concise metrics and actionable problem groups. Cleanup must require confirmation, disable repeated submission, and update the report without an unnecessary second request.

**Useful output**

- Responsive metric cards and issue tables.
- Severity semantics: missing/mismatch are errors; orphans are warnings.
- Query cache is replaced with the authoritative post-cleanup report.

**My corrections and verification**

- Reused the existing Axios error normalization rather than introducing another error model.
- Added an explicit retry action for failed audit loading.
- Corrected zero-byte formatting from `1 КБ` to `0 КБ` for reclaimable space.
- Added a test that double-clicking cleanup produces one mutation only.

## 4. Review prompt for a second AI tool

Run this prompt in a second tool and append its response plus your decisions below. This repository does not claim a comparison that has not been performed.

> Review the storage-audit diff as a skeptical senior .NET/React engineer. Focus on data-loss risks, TOCTOU behavior, path safety, authorization, cancellation, API/frontend contract mismatches, and missing behavior-focused tests. Classify findings by severity for a single-admin educational archive. Do not suggest enterprise infrastructure without a demonstrated need.

**Second tool:** _to be recorded_

**Accepted findings:** _to be recorded_

**Rejected findings and reasons:** _to be recorded_

## Final assessment of AI

AI accelerated repository navigation, first-pass contract design, repetitive type definitions, and test scaffolding. Human judgment remained necessary for the risk model: preserving referenced content, refusing automatic “repair,” keeping the feature manual, and evaluating recommendations against the project's real scale.

The main AI risks observed were API assumptions, over-broad scope, and code that looked plausible before compilation. Each was controlled through reading repository conventions, explicit boundaries, focused tests, and build/test execution.
