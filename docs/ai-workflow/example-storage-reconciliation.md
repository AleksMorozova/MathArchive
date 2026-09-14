# Workflow example: Storage Reconciliation

This example is grounded in the actual code on the `storage-reconciliation` branch, the [course-project description](../course-project/README.md), the [AI interaction log](../course-project/prompts.md), and the existing [review checklist](../course-project/pr-review-checklist.md). It does not claim that external delivery steps were completed unless the repository confirms them.

## 1. Initial problem

PostgreSQL stores metadata while `LocalFileStorage` stores files on a separate disk. Partial failures can therefore leave:

- a database record without a physical file;
- a file without a database reference;
- a referenced file whose actual size differs from its stored metadata.

The task was to make these states visible to the administrator and allow manual cleanup of orphaned files only.

## 2. Risk analysis

The highest practical risk is deleting a file that became referenced after the initial audit. Other risks include path traversal, automatically deleting a recoverable database record, unauthorized cleanup, duplicate mutation requests, and falsely promising atomicity across PostgreSQL and the filesystem.

The chosen approach fits a single administrator and a single backend instance: manual audit and cleanup without a queue, background worker, or distributed transaction.

## 3. Implementation plan

1. Add narrow read contracts for database references and top-level stored files.
2. Implement an application service that classifies inconsistencies.
3. Re-read references immediately before every deletion.
4. Add protected admin endpoints with an explicit confirmation payload.
5. Add a Ukrainian admin page with query and mutation states.
6. Add behavior-focused backend and frontend tests.
7. Document safety decisions, the demo procedure, and limitations.

## 4. Backend implementation

- [`StorageAuditService`](../../backend/src/MathArchive.Application/StorageAudit/StorageAuditService.cs) compares `DocumentStorageReference` and `StoredFileInfo`, then produces missing, orphaned, and size-mismatch groups.
- [`StorageAuditReport`](../../backend/src/MathArchive.Application/StorageAudit/StorageAuditReport.cs) contains the categorized results and totals.
- [`DocumentRepository.GetStorageReferencesAsync`](../../backend/src/MathArchive.Infrastructure/Persistence/DocumentRepository.cs) uses an `AsNoTracking` projection containing only the required fields.
- [`LocalFileStorage.ListAsync`](../../backend/src/MathArchive.Infrastructure/Storage/LocalFileStorage.cs) enumerates top-level files and returns names, sizes, and timestamps without exposing physical paths.
- [`AdminStorageController`](../../backend/src/MathArchive.Api/Controllers/AdminStorageController.cs) delegates to the service and requires the exact confirmation phrase `DELETE ORPHANS`.

## 5. Frontend implementation

- [`StorageAuditPage`](../../frontend/math-archive-web/src/pages/admin/StorageAuditPage.tsx) displays metrics, healthy/warning/error states, and three issue groups.
- [`storageApi`](../../frontend/math-archive-web/src/api/storageApi.ts) uses the existing Axios client.
- [`storageAudit` types](../../frontend/math-archive-web/src/types/storageAudit.ts) mirror the backend result fields.
- Cleanup opens a confirmation dialog, prevents duplicate submission, and replaces the TanStack Query cache with `currentState` from the cleanup response.

## 6. Testing

The repository contains:

- [`StorageAuditServiceTests`](../../backend/tests/MathArchive.Application.Tests/StorageAuditServiceTests.cs), covering missing/orphaned/mismatch classification and the reference re-check before deletion;
- [`LocalFileStorageTests`](../../backend/tests/MathArchive.Application.Tests/LocalFileStorageTests.cs), including enumeration behavior added by the backend feature commit;
- [`StorageAuditPage.test.tsx`](../../frontend/math-archive-web/src/pages/admin/StorageAuditPage.test.tsx), covering confirmation, post-cleanup state, and duplicate-mutation prevention.

The course-project documentation lists full verification commands, but the presence of commands does not prove that a particular run succeeded. Results must be recorded separately for each task.

## 7. Safe orphan deletion

`DeleteOrphansAsync` first creates an audit and then calls `GetStorageReferencesAsync` again immediately before each `DeleteAsync`. A candidate that became referenced is skipped and logged structurally. Cleanup does not accept a filename or path from the client and does not change database rows, missing records, or size-mismatched referenced files.

A small check/delete race remains because the filesystem and PostgreSQL do not share a transaction. This is a documented limitation for MathArchive; preserving valid referenced content remains the priority.

## 8. Administrative authorization

`AdminStorageController` has `[Authorize(Policy = "AdminOnly")]`, and the policy in [`Program.cs`](../../backend/src/MathArchive.Api/Program.cs) requires the `Admin` role. The admin route is also registered in the frontend. No API integration test specifically covering storage authorization was found in the reviewed tests; this remains a manual check or a candidate for a future focused test.

## 9. Documentation updates

The feature is documented in the [course-project README](../course-project/README.md), AI decisions are recorded in the [prompt log](../course-project/prompts.md), and checks are listed in the [PR checklist](../course-project/pr-review-checklist.md). This example links to those sources instead of duplicating their full content.

## 10. AI review and manual review

The existing checklist requires review of data-loss risks, TOCTOU behavior, path safety, authorization, cancellation, API contracts, tests, and scope. The second-tool review section in the prompt log remains marked `to be recorded`; therefore, a comparative review and the developer's decisions are not confirmed.

## 11. Pull Request, CI, merge, and deployment

Repository history confirms local commits `569a3d8` for the backend, `9a0f850` for the frontend, and combined feature commit `9f6e87b` on the `storage-reconciliation` branch. The [CI workflow](../../.github/workflows/ci.yml) defines backend build/test/migration validation and frontend test/build jobs.

The repository does not confirm PR #36, a successful CI run, merge of this branch, or deployment of the feature. A link to PR #36 is therefore not included.

## 12. Limitations and residual risks

- cleanup does not repair missing or corrupted files;
- nested directories are not scanned;
- there is no automatic startup or background cleanup;
- the small check/delete race remains;
- a focused storage authorization integration test is not confirmed;
- second-tool review, PR, CI, merge, and deployment verification are not recorded.

## 13. Responsibility split

According to the [recorded interaction log](../course-project/prompts.md), AI supported repository navigation, contract design, type definitions, and test scaffolding. The developer rejected automatic database deletion and disproportionate distributed architecture, added confirmation, checked the path boundary, required the pre-delete reference check, and remains responsible for final manual review and delivery decisions.

