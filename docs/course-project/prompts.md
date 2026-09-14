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

**Second tool:** GitHub Copilot

**Accepted findings:**

- Authorization behavior should be covered by integration tests that verify unauthenticated and non-admin clients cannot access the storage audit and cleanup endpoints.
- Cancellation behavior should be documented: if cleanup is interrupted or times out, the administrator must run the audit again to obtain the authoritative current state.
- A defensive path-traversal test would improve coverage even though cleanup does not accept filenames or physical paths from the client.

**Rejected findings and reasons:**

- The finding that the reference re-check scenario is incomplete was rejected. `StorageAuditServiceTests.DeleteOrphansAsync_rechecks_references_before_each_delete` already simulates a file becoming referenced after the initial audit and verifies that it is skipped during cleanup.
- Distributed locking or stronger cross-resource transaction guarantees were not added. MathArchive has one administrator and one backend instance, while PostgreSQL and the filesystem cannot participate in one atomic transaction. Re-checking references before every deletion is proportionate to the demonstrated risk.

**Result:**

Copilot classified the feature as safe to ship for a single-admin educational archive. No P0 findings were reported. The review identified additional test and documentation improvements without finding a demonstrated data-loss defect in the implemented cleanup mechanism.


## Final assessment of AI

AI accelerated repository navigation, first-pass contract design, repetitive type definitions, and test scaffolding. Human judgment remained necessary for the risk model: preserving referenced content, refusing automatic “repair,” keeping the feature manual, and evaluating recommendations against the project's real scale.

The main AI risks observed were API assumptions, over-broad scope, and code that looked plausible before compilation. Each was controlled through reading repository conventions, explicit boundaries, focused tests, and build/test execution.
