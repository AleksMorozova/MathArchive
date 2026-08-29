# Course project: AI-assisted storage integrity audit

## Goal

Deliver a small but production-relevant feature through the full engineering cycle: requirements, implementation, tests, review, and documentation. The feature helps the MathArchive administrator detect inconsistencies between PostgreSQL metadata and files on the Render Persistent Disk.

The project evaluates control over AI output, not generated code volume. Every behavior below is intentional and must be explainable during the defense.

## User story

As the MathArchive administrator, I want to compare database references with physical files and safely remove unreferenced files so that broken materials are visible and disk space can be reclaimed without risking valid educational content.

## Acceptance criteria

1. Only an authenticated administrator can access the audit and cleanup API.
2. The audit reports:
   - database records whose file is missing;
   - disk files not referenced by any database record;
   - referenced files whose actual size differs from the recorded size;
   - totals for references, stored files, used bytes, and reclaimable bytes.
3. Audit is read-only and is the default action.
4. Cleanup deletes orphaned files only. It never deletes database rows, missing-file records, or size-mismatched referenced files.
5. Cleanup requires an explicit confirmation payload.
6. Before deleting each candidate, the application re-reads database references. A file that became referenced after the audit is skipped.
7. The admin page clearly distinguishes healthy, warning, and error states and prevents duplicate cleanup requests.
8. Existing document create, update, preview, download, and delete behavior remains unchanged.

## Explicit boundaries

This feature does not:

- repair or delete database records automatically;
- restore missing or damaged files;
- scan nested directories;
- run in a background job or on application startup;
- introduce a queue, distributed lock, S3 migration, or multi-instance design;
- promise an atomic transaction across PostgreSQL and the filesystem.

These boundaries follow MathArchive's actual scale: one administrator, one backend instance, and a persistent local disk. Manual, observable reconciliation is proportionate.

## Design

`StorageAuditService` is an application use case. It depends only on `IDocumentRepository`, `IFileStorage`, `IClock`, and logging. Infrastructure implements the two new read operations:

- `IDocumentRepository.GetStorageReferencesAsync` projects only fields needed for reconciliation;
- `IFileStorage.ListAsync` enumerates top-level stored files without exposing physical paths.

The API controller remains thin. The React page uses TanStack Query for the audit and mutation state and replaces cached audit data with the post-cleanup result.

### Safety decision

The initial audit result can become stale if an upload finishes while cleanup is running. Therefore cleanup re-reads storage references immediately before every delete. This deliberately favors preserving a harmless orphan over deleting newly valid content.

There is still a very small check/delete race because PostgreSQL and the filesystem do not share a transaction. That limitation is documented rather than hidden behind an unjustified distributed architecture.

## Demo scenario

1. Open `/admin/storage` with a healthy storage folder.
2. Copy a test file directly into the storage folder; run the audit and show it as orphaned.
3. Rename one referenced file outside the application; run the audit and show the missing file.
4. Restore that file and change its contents; run the audit and show the size mismatch.
5. Open cleanup confirmation and show that only the orphan is deleted.
6. Run the audit again and show that referenced problems remain visible for manual recovery.

Never perform steps 2-4 against the only production copy of a source document.

## Verification

```powershell
dotnet restore backend/MathArchive.sln
dotnet build backend/MathArchive.sln --no-restore
dotnet test backend/MathArchive.sln --no-build

cd frontend/math-archive-web
npm ci
npm test
npm run build
```

Focused tests cover classification, cleanup re-checking, file enumeration, confirmation UI, cache update, and duplicate-submit prevention.
