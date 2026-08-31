# MathArchive Agent Guide

## Purpose and scale

MathArchive is a small public educational website for one mathematics teacher. Public users are mainly the teacher's students. There is one administrator, who is also the owner/developer and is the only person who creates, edits, or deletes materials.

Optimize for correctness, simplicity, maintainability, and reliable access to educational files. Evaluate design and review severity against this real usage model, not against an enterprise CMS or high-traffic SaaS product.

Prefer the smallest coherent change that fixes demonstrated behavior. Avoid speculative abstractions and rewrites. Unless a current requirement clearly justifies them, do not introduce CQRS, event sourcing, microservices, distributed transactions, queues, Redis, generic repository/unit-of-work rewrites, global frontend state, generic mutation frameworks, sophisticated idempotency, multi-admin conflict handling, aggressive memoization, or unnecessary component decomposition.

## Repository map

- `backend/src/MathArchive.Domain`: document and analytics entities and enums.
- `backend/src/MathArchive.Application`: document, storage audit, and analytics use cases, DTOs, validation, and storage/repository abstractions.
- `backend/src/MathArchive.Infrastructure`: EF Core/PostgreSQL repository, migrations, local file storage, authentication implementations, and development seed data.
- `backend/src/MathArchive.Api`: ASP.NET Core controllers, DI composition, ProblemDetails handling, health checks, and runtime configuration.
- `backend/tests/MathArchive.Application.Tests`: xUnit unit, API, health, storage, and PostgreSQL integration tests.
- `frontend/math-archive-web`: React 19 + TypeScript + Vite SPA using Material UI, React Router, TanStack Query, React Hook Form, Zod, and Axios.
- `.github/workflows/ci.yml`: authoritative CI build/test flow.
- `docker-compose.yml`: local PostgreSQL 16, exposed at host port `5433`.

Read the relevant implementation and tests before editing. Follow existing code structure instead of creating parallel service, repository, API-client, error, or state-management layers.

## Backend conventions

- Target .NET 9 and use the existing dependency-injection registrations in the Application and Infrastructure projects.
- Keep controllers thin. Convert HTTP input into application commands and delegate document behavior to `DocumentService`.
- Keep persistence behind `IDocumentRepository` and file access behind `IFileStorage`. Do not bypass these abstractions from controllers.
- Use async APIs and propagate request `CancellationToken`s through controllers, services, EF Core, and file operations. Cleanup that must continue after a committed logical operation may intentionally use `CancellationToken.None`, as the current document lifecycle does.
- Use EF Core migrations for schema changes. Do not assume a manual production schema change. Consider existing rows when adding required fields or changing nullability.
- PostgreSQL stores metadata; physical file contents do not belong in the database.
- General materials use `Grade = null`. Preserve that contract through requests, validation, entities, migrations, DTOs, and frontend types.
- Enums are serialized as strings. Keep backend `DocumentType`, frontend `DocumentType`, and labels/options aligned.
- Validate document metadata with FluentValidation and uploaded files through `UploadedFileValidator`/`FileValidationRules`. Preserve server-side validation even when the frontend duplicates validation for UX.
- Return established HTTP status codes and ProblemDetails shapes. Expected failures are centralized in `GlobalExceptionHandler`; missing documents use the controllers' existing 404 ProblemDetails. Do not invent a second error envelope.
- Log unexpected failures and cleanup failures with structured `ILogger` messages. Do not hide the primary exception when best-effort cleanup also fails.
- Keep the database and file-storage health checks meaningful when changing their dependencies.

## File lifecycle invariants

Production documents are stored through `IFileStorage` on a Render Persistent Disk mounted under `/app/storage`; production `FileStorage__RootPath` points below that mount (currently `/app/storage/documents`). This single-instance storage model is intentional and proportionate.

Filesystem and PostgreSQL operations cannot share one atomic transaction. Preserve the existing priority:

> Protect valid referenced content over perfect automatic orphan-file cleanup.

### Create

1. Validate metadata and file.
2. Save the physical file.
3. Insert the database row.
4. If DB persistence fails after a successful file save, attempt to delete the new file and rethrow the original failure.

A database row must never be created for a file that failed to save. `LocalFileStorage.SaveAsync` must remove a partially written target after failed or cancelled copying when cleanup is possible.

### Metadata update

Update the tracked document and save through the repository. Do not touch the physical file unless a replacement was supplied.

### File replacement

1. Save the replacement first.
2. Update the database to reference it.
3. If DB persistence fails, attempt to delete the replacement.
4. Delete the old file only after the DB references the successfully stored replacement.

Never delete the currently valid file before replacement storage and DB persistence succeed. A harmless orphan is preferable to losing accessible content.

### Delete

Preserve the current ordering: delete the DB record, then best-effort delete the physical file. A cleanup failure is logged and may leave an orphan, but should not casually turn an already completed logical delete into confusing API behavior.

Rare process-crash windows can leave complete orphan files. For this project's scale, they do not justify distributed transactions, queues, or background workers. Add manual reconciliation only if orphan accumulation becomes a real operational problem.

### Preview and download

- `GET /api/documents/{id}/preview`: stream content without changing `DownloadCount`.
- `GET /api/documents/{id}/download`: explicit download, preserve filename/content type, and increment `DownloadCount` once.

Automatic PDF/image previews must never call the counted download operation.

## Frontend conventions

- Use TanStack Query for server state. Keep transient UI and form state local unless a concrete need proves otherwise; do not add Redux or another global store.
- Use the key shapes in `src/api/queryKeys.ts`. Document list keys share the `['documents']` prefix so broad list invalidation covers paged and infinite variants.
- After create/update/delete mutations, preserve the established list invalidation behavior. Updates also invalidate the changed detail; deletes remove the deleted detail cache.
- Prevent repeated non-idempotent actions while their mutation is pending. Keep pending labels and disabled controls consistent with the existing admin forms/dialogs.
- Public material filters are represented in URL query parameters. Treat the URL as their source of truth and preserve the originating Materials URL when navigating to and from details.
- Render meaningful loading, error, and empty states. Distinguish initial-loading failures from partial/later failures when that distinction affects users.
- Use the existing Axios client and `ApiError`/ProblemDetails normalization. Blob endpoints can also return ProblemDetails blobs; preserve that handling.
- Use React Hook Form with Zod following `DocumentFormPage`. Async edit data is applied with `form.reset()`, once per document ID, so later background refetches do not overwrite unsaved edits.
- Follow React's Rules of Hooks. Do not prescribe `useMemo`, `useCallback`, or `React.memo` by default; add memoization only for a demonstrated render or identity need.
- Reuse Material UI, the existing theme, responsive patterns, and Ukrainian user-facing copy. Avoid introducing a parallel UI system.
- Keep preview blob loading local to the details page unless a demonstrated need justifies moving it into React Query. Pass cancellation signals where the current API supports them and revoke object URLs during cleanup.

## Frontend/backend contract

When changing document behavior, verify both sides agree on:

- nullable `grade` for general materials;
- string `DocumentType` values;
- `DocumentDto` fields and date/number shapes;
- multipart create/update field names and optional replacement file;
- `search`, `grade`, `generalOnly`, `topic`, `documentType`, `createdFrom`, `createdTo`, `sort`, `page`, and `pageSize` parameters;
- `PagedResult` fields and infinite-page progression;
- content types, filenames, preview/download semantics, and ProblemDetails status codes.

Avoid relying on a new undocumented assumption on only one side of the contract. Update focused backend and frontend tests together when the API changes.

## Analytics invariants

- Event names are `SiteVisit`, `DocumentPreview`, and `DocumentDownload`; reporting uses `summary.documentDownloads` and `documents[].downloadCount`.
- Track previews only after successful intentional PDF/image preview navigation. Track downloads from the MathArchive card download, details download, and details open-file actions, not effects, raw file endpoints, or browser PDF controls.
- Analytics action counts are separate from the document metadata `DownloadCount`. The open-file link uses `/preview` but records a `DocumentDownload` action.
- Dispatch must not block file access. The public tracking helper intentionally uses credential-free `fetch` with `keepalive: true`, bypassing Axios authentication interceptors. Do not add blind retries that can double-count actions.
- Reporting requires `AdminOnly`. Calendar dates use the browser timezone and become an inclusive UTC start and exclusive UTC end; material-list creation-date filters instead use inclusive UTC calendar dates.
- Event names are persisted as strings. Renaming them requires a data migration for existing rows. Historical events survive document deletion; do not introduce cascading deletion.
- See [analytics documentation](docs/analytics.md) for the exact API, privacy limitations, and verification commands.

## Deployment and operations

- Frontend: Vercel; `vercel.json` provides SPA rewrites.
- Backend: Render, built with `backend/Dockerfile`.
- Database: Neon PostgreSQL in production; local development uses Docker Compose.
- Files: Render Persistent Disk mounted under `/app/storage` with document storage below it.
- The backend is expected to remain single-instance while it uses this disk model. Do not design for horizontal scaling unless deployment requirements change; reassess file storage if multiple backend instances become necessary.
- Source educational documents are backed up independently outside Render. Database recovery is managed separately from file storage. Distinguish application bugs from mount/configuration and disaster-recovery concerns; do not turn backup concerns into an application storage rewrite.
- Never commit production credentials, JWT signing keys, password hashes, connection strings containing real secrets, or provider tokens. Use environment variables/user secrets and the checked-in examples.
- Single-admin usage justifies simplicity, not weaker backend authorization, validation, path safety, or file checks.

## Tests and validation

Backend tests use xUnit in `backend/tests/MathArchive.Application.Tests`. Integration tests require PostgreSQL. Local Compose exposes it on `localhost:5433`; CI provides PostgreSQL on `localhost:5432` through workflow environment variables.

Frontend tests use Vitest, Testing Library, and jsdom beside the code they protect.

Prefer behavior-focused tests, especially for:

- create/update/delete DB-file ordering and compensation;
- failed/cancelled storage writes;
- validation and ProblemDetails;
- missing document/file behavior;
- preview versus counted download;
- public browsing, filtering, pagination, navigation, preview, and download;
- React Query invalidation and mutation pending behavior;
- async edit-form hydration and dirty-edit protection.

Do not require tests for trivial markup or purely stylistic changes.

Common validation commands:

```powershell
docker compose up -d postgres
dotnet restore backend/MathArchive.sln
dotnet build backend/MathArchive.sln --no-restore
dotnet test backend/MathArchive.sln --no-build

cd frontend/math-archive-web
npm ci
npm test
npm run test:seo-generator
$env:VITE_API_BASE_URL='http://localhost:5293'
npm run build
```

Run the smallest relevant tests while iterating, then the broader affected suite and production build when practical. If infrastructure prevents a test, report the exact blocker rather than presenting it as a code failure.

## Review severity

- **P0:** actual data loss, serious security issue, broken deployment, or widespread loss of public/file access.
- **P1:** realistic persisted-data correctness bug, common workflow failure, or deployment behavior likely to make uploaded files disappear.
- **P2:** recoverable admin/public edge case, orphan cleanup issue, partial failure, or meaningful maintainability problem.
- **P3:** polish, cleanup, rare harmless edge case, or theoretical optimization.

Always account for one admin and a small audience. Do not inflate theoretical concurrency or scalability concerns. When accurate, say: **Technically valid, but not worth fixing now for MathArchive.**

## Agent workflow

1. Inspect the relevant implementation, configuration, and tests before editing.
2. Confirm current runtime behavior and evaluate it against the real project scale.
3. Make the smallest coherent change and preserve intentional architecture unless the task explicitly changes it.
4. Protect meaningful behavior with focused tests; avoid tests coupled only to implementation details.
5. Run relevant tests and builds.
6. Report files changed, behavior changed, validation results, environment blockers, and intentionally out-of-scope concerns.

Preserve unrelated user changes in a dirty worktree. Do not modify backend and frontend areas outside the requested scope merely because adjacent cleanup is possible.

## AI-assisted development

Use the reusable workflow, prompts, and checklists in [`docs/ai-workflow/README.md`](docs/ai-workflow/README.md) for AI-assisted tasks. AI output requires human review, especially for authorization, API contracts, migrations, file deletion, CI, merge, and deployment. Never provide secrets or personal data to AI, and never invent test, PR, CI, or deployment results.
