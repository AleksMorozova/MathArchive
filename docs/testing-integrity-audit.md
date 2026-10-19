# Testing integrity and interaction audit

Scope: the existing testing module, reviewed from PostgreSQL snapshots and row-locking repositories through application DTOs/controllers to the React student and administrator pages. Google/PIN login, administrator JWT authentication, materials, image storage, and mathematical rendering are preserved. No production deployment or database change was performed by this audit.

## Five architecture questions

| Question | Existing implementation | Finding and completed change | Remaining limitation |
| --- | --- | --- | --- |
| Are keys exposed? | Full `TestDefinition` lives in the database and immutable attempt snapshot. Public catalog/info contain metadata; student questions use `PublicQuestion`/`PublicOption`; administrator DTOs retain keys. `IsCorrect` grades only on the server. | Checked catalog, info, start, active answers, history, image access, errors, and administrator reports. A completed review could expose `EarnedPoints`, correctness and answer keys even with `ShowScore=false`. Student review is now suppressed whenever scores are hidden, preventing equivalent score reconstruction through that route. | A teacher can intentionally put an answer in public question text/images; software cannot infer that educational intent. Previously disclosed answers cannot be recalled. |
| Repeated submissions? | `WithAttemptAsync` uses PostgreSQL `SELECT ... FOR UPDATE`, commits before HTTP success, and freezes completed attempts. Immediate confirmed answers are already immutable; final submission is idempotent. | Drafts lacked concurrency metadata. Added per-question revisions and operation IDs; stale writes return 409, matching retries return the committed answer without another revision/event, conflicting reused IDs return 409. Events use the same attempt transaction. | Requests need the current revision. Old open frontend bundles should be refreshed when deploying this contract. |
| Premature answers/results/statistics? | StudentId comes from the cookie principal. Ownership returns 404 for foreign attempts. Test/report controllers separate public, student and AdminOnly access. Snapshots preserve visibility settings. | Added integration coverage for every visibility/score combination, active DTOs, hidden history, administrator statistics, occupied attempt IDs, forged scoring fields and foreign question/options. Hidden scores now suppress all student correctness review. | Retakes can reuse answers a student remembers or shares from a completed attempt. Self-registration is not verified identity or exam proctoring. No question statistics are exposed to students. |
| Interrupted attempt recovery? | Server persists the snapshot (including shuffled orders), answer drafts, locks, start/deadline and account ownership; starting again resumes one active attempt. Frontend drained an ordered save queue before submission. | Added per-question revisions, actual 800 ms debounce, explicit failed/saving/saved states, current-question persistence, progress revisions, server timestamps for timer offset, online retry, and bounded local latest-draft recovery after successful ownership verification. A stale local draft is preserved until the student explicitly chooses the server version. | Only acknowledged server answers follow a student to another device. Unsent answers cannot survive loss/clearing of the original browser storage. Offline drafts cannot extend a deadline. |
| Selections/changes before completion? | Only the latest stored answer existed. | Added optional snapshot setting `TrackAnswerChanges` (default false), server-recorded selection/deselection deltas, debounced text revision/length metadata, confirmations, visits and revisits, with `AfterRevisit` metadata. Added an AdminOnly timeline and change/revisit/frequent-change/confirmation-time summaries. | Events describe saved or client-requested actions, not attention, confidence, cheating, or knowledge. Rapid changes before debounce are coalesced. Offline events arrive when persisted and use server receipt time. |

## Trust boundaries and disclosure policy

1. The administrator saves validated test definitions. Metadata goes to `student_tests`; question/option keys remain in the backend definition. Images use the existing validated, normalized image storage. Publication and deletion rules remain unchanged.
2. Public test routes return metadata only; they neither return questions nor grade keys. Draft/deleted tests cannot be started through public routes.
3. Authenticated student creation uses the existing StudentId from `StudentSession`. The server snapshots the complete definition and generated order once. Existing restrictive FKs/unique indexes and attempt/test row locks prevent duplicate active starts and preserve history.
4. A student GET/save/progress/submit checks ownership before data access or mutation. Input contains selected option IDs or text, confirmation intent, and concurrency metadata. The API client explicitly projects these fields; grading fields are not submitted or trusted. Questions and options must belong to that snapshot. Text matching remains explicit `Trim` plus ordinal case-insensitive comparison against configured accepted strings; there is no expression evaluation.
5. The server is the sole grader. It enforces the original deadline and freezes completed/expired attempts. Late saves receive the immutable result rather than altering answers. Final retries do not create attempts, scores, events or statistical rows.
6. Administrator attempt detail/question statistics/student reports require AdminOnly. Interaction JSON never appears in student DTOs. Existing student CSRF origin/header checks, credentialed requests, no-store private responses, Google token validation and PIN/session policies remain in place.

| Mode | Active attempt | After completion |
| --- | --- | --- |
| Immediate, score display enabled | Only a question whose submitted answer was atomically locked gets correctness, key and explanation. | Permitted question review and final score. |
| AfterCompletion, score display enabled | Drafts stay editable; no correctness/key/explanation/score. | Permitted question review and final score. |
| Never, score display enabled | No keys/correctness/explanation/score. | Final score/counts as configured, but no answer keys or detailed correctness review. |
| Any mode, score display disabled | No correctness/key/explanation or score. Immediate confirmation still locks answers. | No correctness/key/explanation, earned/max points, percentage, pass status or correct count. Administrator grading and reports still work. |

The stronger precedence of hidden scores is intentional: revealing keys and a student's selected answers would let the student reconstruct a supposedly hidden score. Historical attempts retain their original settings; the stronger DTO masking applies when reading them too.

## Persistence and API contracts

Migration `20261017201526_AttemptRecoveryAndInteractions` adds only four columns to `test_attempts`: nullable `CurrentQuestionId`, `ProgressRevision` (0), `InteractionSequence` (0), and `InteractionsJson` (`jsonb`, default `[]`). There is no new table/entity or duplicate grading system. Existing answer/snapshot JSON remains readable; absent answer revisions default to zero and absent tracking defaults to false. Old question positions were never stored and cannot be reconstructed; those attempts open at their first snapshot question.

- `PUT /api/test-attempts/{id}/answers`: existing content/lock fields plus `revision` (expected per-question revision) and optional UUID `operationId`. Response answers include their committed revision/operation ID. A byte/set-equivalent retry with the same last operation ID succeeds without duplicating events; a stale or conflicting change returns established 409 ProblemDetails. Clients must preserve the same operation ID and expected revision when retrying an uncertain request.
- `PUT /api/test-attempts/{id}/progress`: `{questionId, revision}`; ownership, snapshot membership and optimistic progress revision are checked. Identical current-question retries are no-ops. Returns the same student attempt projection.
- Student attempt responses add `serverTime`, `currentQuestionId`, `progressRevision`, and `trackAnswerChanges`. Deadline, start time, question/option order, confirmed answers and grading rules still come from the snapshot.
- `GET /api/admin/tests/attempts/{id}` adds `interactions` and `interactionLimitReached` beside the existing `view` and identity fields.
- `DELETE /api/admin/tests/attempts/{id}/interactions`: AdminOnly; removes auxiliary event metadata and permanently stops further collection for that attempt. It does not delete answers, marks, statistics or the attempt. The UI requires explicit confirmation.
- Existing test-definition settings add `trackAnswerChanges`; the teacher toggle is labelled **Відстежувати зміни відповідей** with the requested Ukrainian explanation. Editing a test affects new snapshots, never enables tracking retroactively.

Each interaction is identified by `(AttemptId, Sequence)` and stores question ID, server time, event type, selected/deselected option-ID deltas, answer revision and optional text length/after-revisit flag. There are no raw text revisions, credentials, tokens, mouse movements or unrelated browser observations. Grading reads `AnswersJson` exclusively; logs are auxiliary and reaching their cap does not block answers or scoring. Final confirmation logs are added once under the same row lock.

## Recovery, privacy and retention

- At most 1,000 interaction records per attempt. At 180 days after completion (or start for unfinished attempts), metadata is no longer returned or appended and is cleared when its interaction history is next accessed. This is **lazy cleanup**, not a scheduled physical database purge. Untouched rows/backups may retain metadata longer; a strict timed purge would require a separate operational retention policy. No worker or queue was introduced.
- The administrator can clear an individual timeline earlier. That marks collection stopped for that attempt, including a resumed attempt. Test archiving or historical soft deletion preserves attempts and their auxiliary metadata until retention/clearing; it does not cascade-delete results.
- A browser keeps only latest unsent drafts for up to five attempts, scoped by authenticated StudentId and attempt ID, with seven-day expiry on access. It restores them only after the server authorizes the attempt. It never stores auth secrets or answer keys. A matching server operation ID or server lock prevents replay. Explicit logout clears these draft copies; a generation guard prevents an older in-flight save from recreating them after logout. Browser storage can be unavailable or cleared; the UI warns and retains server-save/error states.
- In a cross-session revision conflict the student sees their local answer, gets a 409 message, and must confirm before replacing local drafts with the server version. No automatic rebasing overwrites a newer session. The local copy is a recovery aid, not a cross-device synchronization or forensic audit system. Multiple tabs can conflict; the committed server answer is authoritative.
- Browser time only controls display; `serverTime` aligns the countdown, and the backend deadline always governs acceptance/expiry. Offline time never pauses the test or resets its original deadline.

## Changed implementation areas

- Domain: `TestingModels.cs` (setting, answer revisions, interaction metadata, attempt recovery fields).
- Application: `TestingContracts.cs`, `TestingService.cs`, new `AttemptInteractions.cs` (safe projections, concurrency, progress, bounded event capture).
- Infrastructure: `TestingRepository.cs`, the additive migration and model snapshot.
- API: `TestsController.cs` (owned progress and AdminOnly metadata deletion).
- Frontend: `types/testing.ts`, `api/testingApi.ts`, student session autosave/recovery in `StudentTests.tsx`, `attemptOutbox.ts`, logout cleanup in `StudentAccountControl.tsx`, teacher settings in `AdminTests.tsx`, and `AttemptInteractionHistory.tsx` integrated into administrator attempt detail in `TestStatistics.tsx`.
- Tests: `AttemptIntegrityIntegrationTests.cs`, `AttemptInteractionTests.cs`, and focused frontend recovery/API/settings/timeline/outbox tests. The pre-existing hidden-score assertion now expects the stronger mask.

## Verification and release limits

Verification results are reported in the accompanying completion message; no CI/PR/merge/deployment claim is implied. Tests use synthetic fixtures at external boundaries, never production credentials or fabricated UI data. The new API tests use PostgreSQL and the real controllers/services/repository.

Review the additive migration and coordinate frontend/backend deployment; refresh existing open test tabs to pick up revision-aware saving. Back up first. Rolling back drops only the new position/interaction columns, so it discards that auxiliary metadata while retaining answers/results. No production migration was applied here. Human review of the visibility precedence, retention policy and teacher workflow remains part of release acceptance.

Verified locally for this change:

- `dotnet build backend/MathArchive.sln --configuration Release --no-restore`: passed, zero warnings/errors.
- `dotnet test backend/MathArchive.sln --configuration Release --no-restore`: 303 passed, zero failed/skipped, including PostgreSQL integration tests and existing Google/PIN authentication.
- `npm test -- --run`: 220 passed across 40 files. After the final late-response guard, the 24 affected recovery/outbox/timeline/API tests passed again.
- `VITE_API_BASE_URL=http://localhost:5293 npm run build` (PowerShell environment syntax used when running): passed, including SEO generation. Existing Vite warnings about bundles larger than 500 kB remain.
- EF `migrations has-pending-model-changes`: no pending changes.

No production migration, CI run, deployment, or independent penetration test was performed.
