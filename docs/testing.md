# Student testing

The testing module extends the existing Application/Infrastructure/API layers and Material UI/React Query frontend. Document storage and public materials remain unchanged. Student sessions use a separate authentication scheme from administrator JWTs; analytics event names remain unchanged.

## Data and history

`StudentTest` stores the searchable title, grade, publication status, timestamps and a bounded PostgreSQL `jsonb` definition. The definition contains `TestSettings`, ordered `TestQuestion` records, `TestOption` records and accepted text answers. Questions and options have stable UUIDs; array order is display order. Separate relational tables for each option are unnecessary for this single-teacher editor.

`TestAttempt` stores an independent UUID, nullable student account ID, per-student/test attempt number, retained legacy token/browser hashes, identification snapshot, lifecycle timestamps, deadline, stored answers, final score and an immutable definition snapshot. Question/option shuffling occurs once at attempt creation and is preserved in that snapshot. All future answer validation, grading, review and reporting use the snapshot, including when the author changes or deletes the test.

Deletion physically removes tests with no attempts; otherwise it sets `IsDeleted` and `DeletedAt`, preserving historical results and snapshots. Archiving hides the test and prevents new attempts while keeping it in administration. Owners may finish existing attempts until their deadline. Visibility and grading settings are snapshotted; the current retake setting governs new starts. A linked document UUID is optional and validated when saving; deleting a material does not delete tests or results.

## Grading and visibility

- Single choice requires the one configured correct option.
- Multiple choice requires exact set equality; no partial credit.
- Text answers are trimmed and compared with ordinal case-insensitive equality against explicitly configured alternatives. No expressions are evaluated; fractions/decimals are equivalent only if both are configured.
- Missing/empty answers receive zero points. Points support two decimal places. Percentages are rounded to two decimal places; passing compares that percentage with the configured threshold.
- Immediate feedback is returned only after explicitly locking an answer. A locked answer cannot be edited.
- After-completion feedback is absent until submission/expiry.
- Never-show feedback omits correctness, accepted answers, correct option IDs and explanations. The independent score setting controls aggregate points, percentage, passed status and correct-answer count.

Public question DTOs contain no answer keys. Public attempt DTOs contain no student names. Administrator review always includes the snapshot's answer key and student details.

## API

All routes start with `/api`. Administrator routes require the existing `AdminOnly` policy.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/tests?grade=5` | Published catalog |
| GET | `/tests/{id}` | Published metadata, without questions or keys |
| POST | `/tests/{id}/attempts` | Authenticated start/resume; identity comes from the session, not the request body; returns `{id,token:""}` |
| GET | `/test-attempts/{id}` | Resume, or finalize an expired attempt |
| PUT | `/test-attempts/{id}/answers` | Autosave one `{questionId,optionIds,text,lock}` |
| POST | `/test-attempts/{id}/submit` | Idempotent final submission |
| GET/POST | `/admin/tests` | List/create |
| GET/PUT/DELETE | `/admin/tests/{id}` | Editor/read/update/delete with historical preservation |
| POST | `/admin/tests/{id}/publish?status=Published` | Set `Draft`, `Published` or `Archived` |
| POST | `/admin/tests/{id}/duplicate` | Independent draft copy |
| GET | `/admin/tests/statistics` | Overview |
| GET | `/admin/tests/attempts` | Sorted, server-paged results |
| GET | `/admin/tests/attempts/{id}` | Protected individual review |
| GET | `/admin/tests/{id}/question-statistics` | Historical question variants and distributions |

Create/update optionally accept `?publish=true`, validating and saving publication in the same database write. This avoids creating repeated drafts if separate save/publish operations fail partway.

Attempt endpoints and snapshot images require the explicit `StudentOnly` policy. Student IDs come from the validated session. Ownership is checked in the backend before reading questions, answering, submitting, or loading images. Legacy attempt tokens do not grant public access. All personal and administrator responses use `Cache-Control: no-store`.

Student account routes:

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/students/register` | First name, surname, grade, PIN and confirmation; creates an account and session |
| POST | `/students/login` | Requires the correct PIN for the normalized name/surname/grade identity |
| POST | `/students/logout` | Revokes sessions and clears the cookie |
| GET | `/students/me` | Authenticated profile |
| GET | `/students/me/attempts` | Only the authenticated account's history, with permitted scores |
| GET | `/students/me/attempts/{id}` | Owner-only historical/active view with snapshot visibility rules |
| GET | `/students/me/tests/{id}/access` | Resume ID, previous attempt ID and permission to start |
| GET | `/admin/students` | Search, grade filter and paginated student list |
| GET | `/admin/students/{id}` | Profile, completed attempt/test counts and average percentage |
| GET | `/admin/students/{id}/attempts` | Paginated administrator history |
| PUT | `/admin/students/{id}/pin` | Secure administrator PIN reset (`{pin}`) |
| PUT | `/admin/students/{id}/active` | Enable/disable (`{isActive}`), revoking existing sessions |
| GET | `/admin/tests/student-statistics` | Registered/enabled/unique student counts and first/latest/best results |

Report filters: `studentId`, `testId`, `grade`, `search`, `status` (`InProgress`, `Completed`, `Expired`), `from` inclusive, `to` exclusive. Paging uses `page`, `pageSize` (1–100). Sort values: `dateDesc`, `dateAsc`, `scoreDesc`, `scoreAsc`, `name`. Completed/expired attempts use completion time; active attempts use start time. The frontend reuses browser-local inclusive date ranges converted to UTC boundaries.

Overview averages include completed and expired attempts only. The published-test card counts currently published tests **created within the selected period**, filtered by test/grade. Student statistics distinguish unique account IDs from total attempts. Legacy anonymous attempts contribute to attempt totals but not registered-student counts. Registered/enabled account counts are global; completed attempts, unique participating students, averages and per-student/test first/latest/best percentages respect report filters. “Active accounts” means accounts that have not been disabled. First/latest/best refers to the filtered set, using normalized percentage as the comparable score. Question statistics group identical question configurations across attempts, ignoring shuffled display order; edited question variants remain separate. Distribution lists show up to 20 most frequent responses. Unanswered attempts are counted separately from wrong submitted answers.

## Frontend

- `/tests`: public catalog with grade stored in URL parameters.
- `/tests/:id`: login gate, authenticated welcome, resumed/new attempt, timer, navigation, confirmation and results.
- `/student/login`: registration and returning-student login, with safe return to a test.
- `/student`, `/student/history`, `/student/attempts/:attemptId`: profile, available tests and private history.
- `/admin/students`, `/admin/students/:studentId`: account management and student results.
- `/admin/tests`: CRUD/publication/duplication/archive and result links.
- `/admin/tests/new`, `/admin/tests/:id/edit`: dedicated editor, dynamic question controls, drag ordering plus keyboard-accessible movement buttons, settings, preview and draft/publication saves.
- `/admin/tests/statistics`: period filters, overview, result table and question analytics.
- `/admin/tests/attempts/:id`: protected detailed review.

The editor uses React Hook Form/Zod, hydrates once per test ID and preserves dirty edits through background refetches. Student autosave uses one serial queue, approximately every 800 ms. Final submission drains pending saves first; failed saves are retained for retry. Closing/refreshing warns while saves are pending. The session cookie restores authentication after refresh. Active attempts are resolved from the authenticated account on the server across tabs/devices; PINs and attempt capabilities are not stored in browser storage. Logout/account switching cancels in-flight profile requests before updating session state, and removes private React Query data. An older profile response cannot restore a signed-out session. The assistant widget is absent during testing.

## Limits and security

Definitions allow up to 100 questions, 20 options and 20 accepted answers per question. Title/description/question/option/identity fields have explicit server bounds; request bodies are limited. UI renders plain React text, never HTML. Deadline is the earlier of the configured duration and availability end. Late answers are not accepted; expiry grades already saved answers. Expired attempts are also finalized lazily during reporting, without a background worker.

Answer saves, locks, expiry and final submission use a PostgreSQL transaction and `FOR UPDATE` row lock. Concurrent submissions return the persisted result without recalculation. Start/resume and deletion serialize on the test row; a partial unique index allows only one active attempt per student/test, and a second unique index protects attempt numbering. An unfinished attempt is resumed even when retakes are disabled. Completed/expired attempts block new starts when current `AllowRepeats` is false. Each permitted retake retains its own snapshot and result.

### Student sessions, PINs and deployment

Names, surnames and grades identify an account but never authenticate it. Registration normalizes Unicode, casing and whitespace and enforces a unique identity; collisions require PIN login or teacher-controlled recovery. PINs allow 8–64 non-whitespace characters with at least three distinct characters. The existing password hasher is reused with independent random salts and PBKDF2-SHA256 at 600,000 iterations. PINs and hashes are never returned by account APIs. Five failed logins lock an account for 15 minutes, including across IP changes; login/registration also share a 60-request/15-minute/IP limit.

A separate `StudentSession` cookie scheme and `StudentOnly` policy do not grant administrator access. The encrypted HttpOnly cookie expires after seven days, with no sliding renewal. Production cookies use `__Host-`, `Secure`, `SameSite=None`, host-only scope and path `/`; local HTTP development uses Lax. Each authenticated request checks the active account and session version. PIN reset, account disable/enable, and logout invalidate existing sessions. Logout signs the student out on **all devices**. No PIN, bearer session token, or new attempt capability is stored in browser storage.

Cookie writes, including registration/login/logout, require both the non-simple `X-Student-Request: 1` header and an exact trusted frontend Origin. CORS permits credentials only for configured origins (plus loopback origins in Development). Do not allow arbitrary production origins.

On Vercel, student requests use the frontend's own origin. `vercel.json` proxies `/api/students/*`, `/api/test-attempts/*` and `/api/tests/:id/attempts` to the established Render host, avoiding reliance on third-party cookies. Material/admin requests retain `VITE_API_BASE_URL`. If the backend hostname changes, update these proxy destinations and the existing CSP together. Other hosting must provide equivalent same-origin routing, or compatible same-site domains.

ASP.NET Data Protection keys persist under `<FileStorage:RootPath>/.session-keys`, below the existing persistent disk in production. Keep this private directory out of public serving and preserve it across deployments; rotating/removing keys logs sessions out but does not remove accounts or history. The default filesystem key ring is not encrypted at rest separately from disk access protection.

Migration `20261016202814_StudentAccounts` adds `students`, nullable `TestAttempt.StudentId`, `AttemptNumber`, `DeletedAt`, restrictive foreign keys and unique indexes. Existing anonymous attempts retain `StudentId=null` and remain available to the administrator; names are never used to claim them. Their old capability tokens no longer grant public access. Applying the migration is additive; rolling it back removes account linkage and account data, so back up the database first.

Self-registration establishes a PIN-protected account, not verified real-world identity. Retake limits are per account, and cannot prevent someone registering under different identity details. Namesake collisions in the same grade require teacher assistance. There is no email/phone recovery. Account editing, exports and automatic deletion/retention are outside this change.

No new retention policy or export feature is introduced. The teacher should decide how long to retain student identities/results. Reports aggregate snapshots in memory after database filtering, appropriate for the current small audience. Do not publish result pages or tokens. No production migration, deployment, or manual device review is implied by automated test results.

## Migration and verification

Migration: `20261016175709_AddStudentTesting`. It adds only `student_tests`, `test_attempts` and their indexes/FK. Existing documents are untouched. Review the migration and back up the database before deploying. The existing application startup migration setting applies it; for an explicit local migration:

```powershell
dotnet ef database update --project backend/src/MathArchive.Infrastructure --startup-project backend/src/MathArchive.Api
```

Use EF Core tooling compatible with EF 9. Rolling back this migration drops all testing definitions and attempts; preserve results first.

```powershell
docker compose up -d postgres
dotnet test backend/MathArchive.sln -m:1
cd frontend/math-archive-web
npm test
npm run test:seo-generator
$env:VITE_API_BASE_URL='http://localhost:5293'
npm run build
```

Backend tests cover deterministic grading, normalization, hidden DTOs, validation, authentication/authorization, ownership, PIN hashing/lockout, CSRF, session revocation, concurrent starts/submissions, expiry, account retake restrictions, refresh, snapshot history and report aggregation. Frontend tests cover URL grade filters, identity validation, resume/autosave-before-submit, locked feedback, result visibility, editor hydration/duplication/publication, cookie/CSRF request options, student login/history and administrator PIN management. Human review of teacher workflows and phone/tablet layouts remains part of release acceptance.

## Mathematical content and question images

Questions and choice options now optionally contain ordered `content` blocks: `Text`, `InlineMath`, `BlockMath`, and `Image`. Existing text-only definitions and snapshots remain compatible. Text blocks support Ukrainian paragraphs and the existing safe Markdown/KaTeX syntax (`\(...\)`, `\[...\]`, `$...$`, `$$...$$`). Formula blocks store LaTeX source. Adjacent text and inline formulas render in the same paragraph; images split the flow and have optional descriptions and left/center/right alignment. Plain `text` remains a server-derived summary for catalog/report compatibility.

The teacher editor includes MathLive visual formula input, a LaTeX mode, live KaTeX preview and templates for fractions, powers, roots, logarithms, trigonometry, inequalities, systems, integrals and Greek letters. Fonts are bundled locally; editing does not depend on a CDN. Content blocks can be moved with the up/down buttons. Uploads disable saving until complete. MathLive is lazy-loaded for editing; students use the existing KaTeX renderer. Raw HTML is discarded, remote Markdown images are disabled, and KaTeX runs with `trust: false` and expansion/size limits.

Images support PNG, JPEG and WebP; SVG is rejected. Each upload is limited to **5 MiB**, including verification of the actual stream length. SkiaSharp verifies the decoded format against the filename extension and MIME type, rejects malformed/truncated images, limits dimensions to 6000 pixels per side and 16 megapixels, honors orientation, and re-encodes decoded pixels without retaining source metadata or appended content. The normalized output is bounded at 16 MiB. Its Linux native runtime is included for the existing Render Linux deployment. No ImageSharp dependency or license key is needed.

A `TestImage` metadata row references a randomly named file in `<FileStorage:RootPath>/test-images`. This deliberately separate subdirectory uses `LocalFileStorage` through a keyed `IFileStorage` registration. The document storage audit enumerates only top-level document files, so document orphan cleanup cannot remove question images. Upload ordering is file first, metadata second, with best-effort compensation if metadata persistence fails. Existing document file behavior is unchanged.

Additional endpoints:

| Method | Route | Access |
| --- | --- | --- |
| POST | `/api/admin/test-images` | `AdminOnly`; multipart field `file`; returns `{id,width,height}` |
| GET | `/api/admin/test-images/{id}` | `AdminOnly`; editor, preview and historical admin review |
| GET | `/api/test-attempts/{attemptId}/images/{id}` | Requires student authentication, ownership of the attempt, and an image reference in its immutable snapshot |

Images have no anonymous public-file URL. Guessing an image UUID cannot retrieve a draft image. Responses use `no-store` and `nosniff`. The frontend loads blobs with the student session cookie or administrator JWT, cancels obsolete requests, revokes object URLs and supports click/keyboard enlargement without selecting an answer. Long expressions scroll horizontally, and responsive images preserve aspect ratio.

Image IDs are immutable. Replacement creates a new file/ID; removing an image from a question removes only its current reference. Old files and metadata remain available to historical attempts even after editing, archiving or deleting a test. Unattached uploads are retained too; there is deliberately no automatic image deletion or cleanup endpoint. This favors historical access over perfect cleanup. A future manual retention tool must inspect both current definitions and all attempt snapshots before deleting anything.

Reports group image options by stable option ID and render their original content, so graph options without distinct text labels are not merged. Text-answer grading remains explicit trimmed/case-insensitive matching: `0,5`, `0.5`, `1/2`, `√2` and other mathematical spellings are accepted only when configured; no algebraic equivalence or expression evaluation was added.

Migration `20261016190045_AddTestImages` adds only the `test_images` metadata table; JSON content fields need no destructive migration. Existing startup migrations apply it after the API restarts. Back up **both** PostgreSQL and the entire configured storage tree, including `test-images`. The earlier educational source-file backup alone does not cover these uploaded diagrams.

Verification adds real PNG/JPEG/WebP decoding, malformed/type/size checks, upload authorization, persistence compensation, snapshot image authorization/history, legacy JSON compatibility, rich answer rendering, safe formulas, visual/LaTeX entry, image-only editing, zoom and object-URL cleanup tests. The backend can be built/tested with `--configuration Release` while a local Debug API is running.

Library integration references: [MathLive integration and local fonts](https://mathlive.io/mathfield/guides/integration/), [MathLive virtual keyboard](https://mathlive.io/mathfield/guides/virtual-keyboard/), and [SkiaSharp](https://github.com/mono/SkiaSharp).

Image decoding and normalization were also verified in the official Linux ASP.NET 9 runtime container for all three formats. Rolling back the image migration drops image metadata and makes those image IDs inaccessible; preserve the table/database backup before any rollback.

## Student test experience

Student sessions at `/tests/:id` use a dedicated МТВ layout, separate from the regular public navigation. The welcome screen shows test metadata and identification; active sessions use lettered answer cards, answered-question progress, a timer when configured, and persistent bottom navigation. Native radio/checkbox inputs preserve keyboard interaction. Mathematical content uses the existing safe KaTeX and image viewer.

Feedback and completion only render information returned by the student attempt DTO. Immediate feedback locks confirmed answers; delayed and hidden modes retain editable drafts until submission. Score, percentage, correct count, pass status, and detailed review remain conditional on returned permissions. Admin previews/history and backend grading are unchanged.

The student styles include mobile layouts and reduced-motion overrides. Long formulas scroll inside their content area; diagrams retain their proportions and can be enlarged without selecting an answer.



## Google and PIN student authentication

Both methods use the existing `Student`, `StudentSession` cookie, `StudentOnly` policy and StudentId-based attempt history. PIN registration needs no email. The login page offers Google plus the existing name/surname/grade/PIN form. A first Google login requires profile completion; later logins use the saved profile. `/student/profile` allows an already authenticated student to connect Google. Names, grades, and emails never merge accounts. A Google identity already linked elsewhere cannot be reassigned.

Configure a Google OAuth **Web application** client in Google Cloud Console and add the exact frontend origins to **Authorized JavaScript origins** (for example `http://localhost:5173` and `https://morozovamath.com`; include `https://www.morozovamath.com` only if used). Enable/configure the consent screen, publishing status, and test users as appropriate for the intended students. Use HTTPS outside localhost. This Google Identity Services flow uses an ID token callback, so no redirect URI or client secret is required. Google account eligibility and school administrator policies are external to MathArchive; PIN remains available.

Set the backend public client ID and restart it:

```powershell
$env:StudentGoogle__ClientId = 'YOUR_CLIENT_ID.apps.googleusercontent.com'
dotnet run --project backend/src/MathArchive.Api
```

Set the same environment variable on Render. There is no frontend client-secret setting. Keep existing `AllowedOrigins`, HTTPS, persistent session keys, and Vercel same-origin `/api/students/*` proxy configuration. The CSP permits only Google's documented GIS script/style/frame/connect URLs in addition to existing sources. Without a client ID, Google displays an availability message while PIN works normally. Browser popup/network blockers must allow Google Identity Services.

The browser loads the official Google button only after the student chooses Google. The server's official `Google.Apis.Auth` SDK checks the signed ID token, Google issuer, client audience, and expiry; MathArchive also checks a random single-use nonce. Credentials are sent only in the POST body and never saved to browser storage or URLs. A short-lived HttpOnly flow cookie refers to a bounded, ten-minute in-memory handshake. A backend restart interrupts pending Google sign-ins; start again. This is intentionally single-instance, matching current storage/deployment. Linking additionally requires the same active student session/version that created the challenge. Unsafe requests retain the existing origin/header checks and login rate limits.

Migration `AddStudentGoogleAuthentication` adds `student_authentication_identities`, makes `PasswordHash` nullable, and filters the PIN-name unique index to PIN-enabled accounts. Existing PIN hashes, StudentIds, attempts, and scores are retained. Google subjects are unique per provider; each student can have one linked Google identity. Google-only namesakes can coexist without taking over PIN accounts. Setting a PIN on a Google-only namesake conflicts if those PIN login details are already used; the teacher must resolve the profile identity before assigning a PIN. Back up before migration; do not roll back after creating Google-only accounts, because the old model cannot represent them or duplicate names and rollback drops provider links.

Administrators see linked authentication methods, can disable accounts, and can set a new PIN through the existing authenticated recovery dialog. Verify the student's identity personally before resetting a PIN, identify the correct account by its history, and deliver the new PIN privately. Name/grade matching alone is not sufficient proof. PIN hashes are PBKDF2-SHA256 (600,000 iterations); plaintext secrets are never returned. Resetting a PIN revokes prior sessions, including Google sessions, without changing history or removing the Google link. Disabled accounts cannot use either method. Lockout and unknown-account PIN login failures share the same 401 response; IP rate limits remain 429.

Automated tests replace only the external Google verifier in API integration tests. They exercise first-login completion, subsequent login, PIN-only accounts with no email, explicit linking/history preservation, retake restrictions, other-student access denial, occupied Google identities, challenge replay/nonce/browser checks, CSRF, session revocation, disabled accounts, and teacher-assisted recovery. The real verifier rejects malformed/unsigned credentials. Frontend tests exercise the official-button callback boundary, linking retries, stale callbacks, and profile completion. Live Google consent/sign-in requires a configured real client and a human test account; automated results do not claim that external verification.

References: [Google client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GIS JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

The student dashboard at `/student` uses one visible panel: `?tab=available` (default), `?tab=history`, or `?tab=statistics`. Tab changes and history page changes use browser history; `/student/history` redirects to the history tab for existing links. History is sorted newest first and paginated locally in groups of ten using the existing student-owned history response. Statistics reuse that response, excluding hidden percentages from the average and keeping a hidden latest result hidden. Test cards reuse the existing per-student access query for start/resume/review and retake decisions. No authentication, grading, administrator API, or database changes are required for this dashboard refactor.

For the security/answer-integrity review, visibility precedence, answer/progress revision contracts, optional answer-interaction tracking, offline draft recovery, and retention/deletion rules, see [testing integrity audit](testing-integrity-audit.md). In particular, hiding scores now also hides student correctness review, since exposing keys would allow score reconstruction.

Result completion messages use five Ukrainian message pairs per score range, selected deterministically from the attempt ID in `resultMessages.ts`. Visible results use gold/mint/blue/amber/lavender accents; unavailable scores use the same neutral presentation regardless of other result fields. Excellent permitted scores have a short CSS celebration; reduced-motion preferences disable animation. Grading, pass thresholds, retake permissions and backend visibility rules are unchanged.

The administrator test editor keeps one form and save flow across two URL-backed tabs: `?tab=settings` and `?tab=questions`. Panels stay mounted so formulas, unsaved field values and in-flight image uploads survive switching. Question count and error indicators appear in the tab labels; validation opens the relevant panel and focuses the field or question. Sticky save/publish/preview controls work from either panel. Drafts may have no questions; publishing (including editing an already published test) requires at least one valid question, matching the existing API. Leaving the editor with dirty state or an active save/upload requires confirmation; internal tab changes do not. There is no new autosave mechanism, API, database migration or dependency.
