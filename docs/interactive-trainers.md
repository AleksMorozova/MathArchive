# Interactive HTML trainers

Trainers extend the existing `Document` material, with `DocumentType = InteractiveTrainer`
and `trainerGrades` (one or more distinct grades 5–11). No student/test entities or result
storage are involved. The existing administrator form, material APIs, persistent storage,
replacement compensation, and deletion cleanup are reused.

## Administrator and public use

In **Додати матеріал**, choose **Інтерактивний тренажер**, enter a title, optional description,
topic, select grades, and upload a standalone UTF-8 `.html` file (default maximum 1 MiB).
The trainer-specific **Опубліковано** checkbox controls publication. Clearing it saves a private draft; existing trainers remain published after migration. Other material types keep their existing behavior.
After saving, use the existing preview action. Editing supports metadata-only changes and
file replacement. Changing between a trainer and another material type requires a new file.

Public navigation: `/materials?class=5&type=trainers` → trainer card → `/materials/{id}`.
The detail page includes **Повернутися до матеріалів** and preserves the originating filter URL
when opened from a card. No registration is required.

## Database and API

Migration `20261021125406_AddInteractiveTrainerGrades` adds a non-null PostgreSQL `integer[]`
column `documents.trainer_grades`, defaulting to an empty array for existing materials.
Other material records and their nullable `grade` semantics remain unchanged. A trainer's
legacy `grade` stores its smallest assigned grade; public grade filtering also checks the array.
Manual material ordering remains scoped to this primary grade, as it has one order value.

Existing `POST/PUT /api/admin/documents[/{id}]` accepts repeated multipart `trainerGrades`
fields and `trainerPublished` alongside existing metadata and file fields. Existing AdminOnly authorization and
DELETE behavior are unchanged. DTOs include `trainerGrades`; ordinary materials return `[]`.

- `GET /api/documents/{id}/trainer`: public launch URL; 503 if isolation is unconfigured.
- `GET /api/trainer-content/{id}`: executable HTML, **only on the configured content origin**.
- Ordinary `/preview` rejects trainers. Explicit `/download` forces an octet-stream attachment
  with a restrictive sandbox CSP and `nosniff`, never an executable application-origin preview.

## Deployment: required before trainers can run

Configure `Trainers__ContentOrigin=https://trainers.example.net` on the backend. This must
be a separate hostname from both the frontend and the normal API. Use HTTPS in production.
The application rejects a hostname shared with configured frontend origins; launch also
rejects a hostname shared with the API request. Do not add this hostname to frontend CORS
origins or OAuth callback origins.

Point that domain at the **same Render backend service** and configure its TLS/custom domain.
Keep the original Host header and forwarded scheme. This reuses the same instance, database,
and persistent disk; it does not create another backend instance or need another file copy.
Only GET content paths are accepted on that hostname; authentication, administrator/student
APIs, and other paths return 404. Incoming authorization/cookie headers are discarded and
Set-Cookie is suppressed. Use host-only authentication cookies (the existing default), with
no shared parent-domain cookies on the content hostname. A separate registrable domain
provides additional protection against future parent-domain cookie configuration mistakes.

Continue to mount the Render Persistent Disk at `/app/storage`, with
`FileStorage__RootPath=/app/storage/documents`. Never serve that directory as static web
content: all trainer responses must pass through the content controller's security headers.
Replacement and deletion prioritize referenced content over perfect orphan cleanup, as
documented in the repository's storage invariants. Database/file backup responsibilities
are unchanged. Apply migrations through the existing startup/deployment migration flow.

For local development, use the usual API on `http://localhost:5293`, configure
`Trainers__ContentOrigin=http://trainers.localhost:5293`, and ensure `trainers.localhost`
resolves to `127.0.0.1` (add a local hosts entry if needed). Keep the frontend on localhost.
HTTP content origins are allowed only in Development. Restart the API after configuration.
No production configuration or DNS is changed by this implementation.

## Isolation and supported files

The iframe has only `sandbox="allow-scripts"` and a no-referrer policy. The HTML response
also supplies `Content-Security-Policy: sandbox allow-scripts`, so direct navigation retains
an opaque origin. It allows inline JavaScript/CSS and data images; network requests,
external scripts/styles, fonts/media, workers, nested frames, objects, forms, base URLs, popups, and top navigation
are restricted. No `allow-same-origin`, token transfer, postMessage bridge, or application DOM
injection is used. See the [iframe sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox)
and [CSP sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox).

HTML validation checks extension/MIME, actual bounded size, UTF-8, and standalone document
markers and parses the document to reject unsupported static resource dependencies. It does **not** claim that executable JavaScript is safe; runtime isolation is the
security boundary. Stored names remain generated by the existing safe file-storage service.
The HTML bytes and mathematical JavaScript are not rewritten.

In-memory exercise feedback/progress works. Trainers requiring localStorage, cookies,
IndexedDB, external resources, `eval`, form submission, downloads, or server calls are outside
the initial standalone contract. No scores or answers are sent to MathArchive. The sample
`test.html` was not present in the supplied repository, so its specific behavior must be
checked when available; tests use a standalone HTML/CSS/JavaScript fixture instead.

## Verification

Backend trainer integration tests cover authorization, validation, multi-grade filtering,
public launch, isolated-host routing/security headers, file replacement/deletion, and ordinary
preview/download restrictions. Unit tests cover preserved HTML, UTF-8, and size validation.
Frontend tests cover the sandbox configuration, refusing an application-host URL, unavailable
isolation configuration, grade-filter navigation, and multi-grade administrator upload.

Browser acceptance after configuring the real domain: upload a trainer; open it without
login; solve an exercise using keyboard input; verify local feedback on desktop/mobile;
check browser console for CSP-blocked dependencies; return to the originating materials;
replace and delete it. Automated DOM tests verify configuration but do not emulate a
browser's sandbox enforcement or prove compatibility with every uploaded trainer.

## Security hardening report

### Findings addressed

- **Medium:** uploads previously received only document-marker inspection. AngleSharp now parses HTML without a loader or JavaScript engine; static external dependencies and unsupported elements are rejected. CSP remains the runtime boundary for dynamically created content.
- **Medium:** the response previously lacked `frame-ancestors`. It now permits only the normalized configured MathArchive `AllowedOrigins`; an empty set denies embedding. Development does not use a wildcard here, so add your actual frontend port to `AllowedOrigins`.
- **Low:** the size limit was fixed at 2 MiB. `Trainers__MaximumFileSize` now defaults to `1048576` bytes, with a startup-validated range of 1 byte–20 MiB. `/api/documents/trainer-limits` supplies the same limit to the admin form. Declared length and actual stream bytes are both checked. Legacy content is revalidated before delivery.
- **Low:** stored-name handling silently discarded directory components. Read/delete now reject separators, drive prefixes, and traversal names and use a directory-boundary containment check. Uploads use generated GUID names and reject path-like original trainer filenames.

No administrator authorization bypass or application-origin DOM injection was found in the inspected flow. Existing AdminOnly endpoints, host-only student cookies (`__Host-` in production), JWT authorization for the administrator, and origin/header checks for student writes remain in force. Trainer scores remain untrusted browser-only values.

### Publication and migration

`20261021154902_AddTrainerPublication` adds `trainer_published`, default `true`, preserving existing publications. Administrators can save drafts by clearing **Опубліковано**. Only administrator-authenticated requests can include drafts in the material list/detail. Anonymous and student requests cannot read their metadata, launch URLs, content, previews, or downloads, and assistant search excludes their chunks. A query parameter cannot grant access. No new student authentication requirement is introduced.

Drafts have no public preview capability; publish an approved trainer to exercise its isolated runtime. No raw filesystem route exists. All executable responses have `Cache-Control: no-store`; replacing and deleting invalidate subsequent server access. Already loaded HTML cannot be remotely erased from a student's browser. Publishing defaults to true when omitted by existing administrator API clients; the updated form always sends the checkbox state.

### Exact execution policy

The iframe remains `sandbox="allow-scripts"`, `referrerpolicy="no-referrer"`, with a meaningful trainer title and no privileged messaging bridge. Its return button belongs to the parent application. There is no `srcDoc`, direct HTML injection, `allow-same-origin`, forms, downloads, popups, or top-navigation permission.

HTTP headers (the final `frame-ancestors` values are the actual configured frontend origins):

```http
Content-Type: text/html; charset=utf-8
Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none'; frame-ancestors <AllowedOrigins>
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Cache-Control: no-store
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=(), clipboard-read=(), clipboard-write=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), serial=(), hid=(), fullscreen=()
```

`navigate-to` is advisory and unsupported in tested Chromium; sandbox is the top-navigation/pop-up boundary. `font-src`, `media-src`, and `worker-src` are explicit instead of relying only on fallback directives. Data images are allowed; external image URLs and SVG data images are rejected at upload. The dedicated content host strips incoming Cookie/Authorization headers, suppresses Set-Cookie, and exposes no application APIs. It must use a separate hostname from the frontend **and API**; configure a separate registrable domain where feasible and keep all cookies host-only. DNS, TLS, parent-domain cookies set by other services, and CDN configuration require deployment review. Do not add the content domain to CORS or OAuth allowlists. Keep the existing single backend instance and `/app/storage` persistent disk.

Hash-based CSP was evaluated. Inline event handlers and style attributes are part of the supported existing trainer format. Script-block hashes alone would break those trainers, and automatically hashing arbitrary uploaded code does not establish trust in that code. This version keeps `unsafe-inline` within the opaque sandbox rather than rewriting uploaded JavaScript or adding `unsafe-hashes`/`unsafe-eval`. A curated format without inline handlers could adopt hashes later.

### Upload contract

Only `.html`/`text/html`, UTF-8 standalone documents with valid grade assignments are accepted. MIME is checked but never used as proof of content. File paths, invalid UTF-8/NUL bytes, oversized streams, external `src`/`href`, `srcset`, script sources/modules, links/stylesheets, base URLs, meta HTTP-equivalent directives, forms, embedded frames/objects, media, templates, SVG external-reference/animation constructs, targets, downloads, pings, and submission attributes are rejected. Fragment-only anchors and raster base64 data images are allowed. CSS imports, resource URLs, and escape sequences are rejected conservatively. JavaScript API string scanning is deliberately not used as a security guarantee. Uploaded bytes are not executed or rewritten on the server.

HTML parsing adds one runtime dependency, AngleSharp 1.8.5. Playwright is a development-only dependency for browser tests. Legacy files may need adjustment/re-upload if they violate the new standalone contract; no files or records are automatically removed. File replacement retains the existing save-new → commit-reference → best-effort-delete-old ordering.

### Real-browser checks

```powershell
docker compose up -d postgres
cd frontend/math-archive-web
npx playwright install chromium
npm run test:trainer-security
```

The global setup uploads the committed probe fixture through the real administrator endpoint in an isolated integration-test database, requests the real content controller response, and exports its exact HTML/security headers to a temporary file. Local HTTP servers replay that response to Chromium desktop and mobile contexts. This tests browser policy enforcement without production credentials, DNS changes, paid provider calls, or modifying the user's running app. The harness mirrors the production iframe attributes and applies the checked-in Vercel parent CSP (mapping only the content hostname to its local test server); component tests separately verify those attributes in React. The setup needs .NET and PostgreSQL and creates/drops its own temporary database. Do not run it concurrently with other API integration suites because the existing fixture uses process environment configuration.

Tests verify mathematical answer feedback; denied parent DOM, localStorage and cookies; no session cookie sent to the content host; blocked fetch/XHR/WebSocket/EventSource/beacon/image/script/style/font/frame/form probes; denied workers, popups and parent navigation; rejected unapproved embedding. A separate regression verifies that the parent frame-src blocks navigation of the iframe to an external origin. This is Chromium coverage, not cross-browser certification.

### Remaining findings and deployment decisions

| Severity | Finding | Status |
| --- | --- | --- |
| Critical | No demonstrated application takeover or data loss found in this review. | No guarantee against unknown browser vulnerabilities. |
| High | No demonstrated High-severity application flaw remains in the exercised paths. | Production DNS/TLS/cookie scope still requires operator verification. |
| Medium | A standalone trainer opened outside the application iframe can still navigate its own browsing context. The application parent CSP now restricts frame-src to the trainer origin and blocks external iframe navigation in tested Chromium. The child navigate-to directive is unsupported, and CSP does not reliably cover WebRTC on all browsers. | **Absolute zero outbound communication cannot be guaranteed with this architecture.** The current browser test demonstrates the parent navigation restriction; it does not certify zero egress through every browser API. Do not accept unaudited trainer code when zero egress is a hard requirement; a controlled restricted runtime or externally enforced network isolation would be a separate architectural task. Parent DOM/authentication remains isolated. |
| Low | CSS inspection is conservative and can reject otherwise harmless escape sequences; the original `test.html` was not supplied. | Check the real trainer for compatibility. No external resources will be enabled to fix it. |
| Low | Open pages retain already downloaded trainer bytes; CSP behavior beyond Chromium has not been exercised. | Revalidate Safari/Firefox and deployed CDN cache behavior before broad use. |

These limits follow the distinction between CSP fetch/navigation controls in the [CSP specification](https://www.w3.org/TR/CSP/) and its [documented exfiltration gaps](https://github.com/w3c/webappsec/issues/656). A strict requirement that arbitrary JavaScript can never contact any endpoint is a remaining blocker, not an implemented guarantee.

Manual deployment verification: apply both trainer migrations; set the content origin and exact frontend `AllowedOrigins`; verify TLS and host-only cookies in browser network tools; upload the actual grade-5 trainer as a draft and confirm anonymous 404s; publish, solve exercises with keyboard on desktop/mobile, and use the parent return button; inspect CSP violations without weakening the policy; replace/unpublish/delete and verify fresh requests fail or show the new version. Confirm authenticated administrator login and public ordinary materials still work.

Verification in this session: backend build passed with zero warnings/errors; the full backend suite passed 334 tests, followed by a final successful real upload/controller fixture export after legacy revalidation was added. Frontend build passed, 259 Vitest tests passed, and all 6 Chromium desktop/mobile policy tests passed. The frontend build used the existing SEO fallback because the local API was unavailable. The Vite bundle-size warning remains.

Separate dependency audit: `npm audit` reports 17 advisories (2 critical, 9 high, 2 moderate, 4 low), including the existing Vitest/tinypool development toolchain and existing Axios/router packages. Advisory severity is not a demonstrated production exploit rating. These package versions predate this task; the added Playwright packages are not named by this audit. They need a separate compatibility-tested dependency update/triage and were not mass-upgraded with `npm audit fix --force`. No AngleSharp advisory was reported for the selected 1.8.5 release during NuGet restore.

Parent CSP integration fix: the Vercel frame-src now explicitly permits https://trainers.morozovamath.com while retaining the main page anti-embedding policy and the child sandbox. A live Chromium preview of the public materials-to-trainer flow rendered successfully with only this response-header correction. Six desktop/mobile policy tests passed using the live child security headers and committed probe fixture. The normal backend-export test setup was blocked by Windows Application Control loading a .NET test assembly; production was not modified. Redeploy the Vercel frontend to activate the header change.
