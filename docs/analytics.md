# Anonymous usage analytics

The admin statistics page is `/admin/analytics` ("Статистика"). It uses the existing admin authorization and theme. Counts represent site openings and intentional preview/file-open/download actions, not unique students or proof that someone read a document.

## Event meanings and frontend locations

- `SiteVisit`: the first mount of `PublicLayout` in a loaded browser page. A module-level guard prevents duplicates from StrictMode, rerenders, navigation, or repeated mounting. A full reload/new tab can count again. Admin-only routes do not record a site opening.
- `DocumentPreview`: `DocumentDetailsPage` successfully loads the embedded PDF/image preview after navigation to that document, including a direct link. Recorded once per details navigation, not for cards, search results, background refetches, failed previews, or raw backend file requests. Unsupported embedded-preview formats do not generate this event.
- `DocumentDownload`: activation of any MathArchive file action: "Завантажити" on a material card, "Завантажити файл" on the details page, or "Відкрити документ" on the details page (including keyboard and middle-click link activation). Each handler dispatches analytics synchronously before starting the file request/navigation, without awaiting analytics. Disabled pending download buttons prevent repeated actions. The link opens the existing `/preview` stream in a new tab. This metric measures intentional file-open/download actions, not completed transfers or PDF-reader activity. Browser PDF controls and context-menu actions are not tracked.

The existing document metadata `DownloadCount` remains unchanged: it counts the backend `/download` operation. The analytics `downloadCount` is a different, period-filtered action count that also includes explicit new-tab file opens and failed file-transfer attempts. Preview loading never records a download. No analytics are generated automatically by backend file endpoints.

`src/api/analyticsApi.ts` creates a random UUID in localStorage under `matharchive_session_id`, reuses it across visits, and falls back to a page-local ID when storage is unavailable. Clearing browser storage resets this ID. Concurrent first-ever tabs can each generate an ID; no cross-tab locking is introduced for this small application.

Public tracking uses a small fire-and-forget fetch with `keepalive: true`, `credentials: 'omit'`, and no Authorization header. It deliberately bypasses the shared Axios authentication interceptors so an analytics failure cannot log out the admin. Both synchronous and asynchronous failures are suppressed; events are not retried or queued. Missing browser crypto, offline mode, blockers, or server failures can cause undercounting without breaking the site. Keepalive supports navigation-time dispatch but does not guarantee delivery.

Only `Id`, `SessionId`, `EventType`, `DocumentId`, and `CreatedAt` are persisted. No IP address, user agent, name, email, account ID, page URL, or cookies are stored by this feature. Hosting/provider access logs are independent of this application table. The persistent random browser identifier is not an identified student account. Public browsing by the administrator is not excluded, and this is not a bot-proof analytics system.

## API contract

### `POST /api/analytics/events` (public)

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "eventType": "DocumentDownload",
  "documentId": "22222222-2222-4222-8222-222222222222"
}
```

- Success: `204 No Content`.
- Invalid UUID/empty session, unknown event type, invalid event/document combination, or nonexistent document: `400` ProblemDetails.
- `SiteVisit` requires a null document ID; both document events require a nonempty existing document ID.
- Request body limit: 1 KiB. Timestamps and event IDs are assigned by the server, never trusted from the caller.

### `GET /api/admin/analytics?from=<timestamp>&to=<timestamp>` (AdminOnly)

One endpoint returns the summary and document table from one PostgreSQL aggregation:

```json
{
  "summary": { "siteVisits": 24, "documentPreviews": 57, "documentDownloads": 31 },
  "documents": [
    { "documentId": "22222222-2222-4222-8222-222222222222", "title": "Vectors", "previewCount": 12, "downloadCount": 8 }
  ]
}
```

Supply ISO-8601 timestamps with `Z` or an explicit offset (URL-encode positive offsets). `from` is inclusive and `to` is exclusive. Both are required and `from < to`; invalid periods return `400`. Authentication failures use the existing `401`/`403` ProblemDetails.

Rows include documents with either kind of activity and are sorted by downloads descending, previews descending, then document ID for ties. Empty periods return zero totals and an empty list. Event rows are aggregated in PostgreSQL, never downloaded to the frontend.

## Calendar dates

The UI interprets dates in the administrator's browser timezone and shows that timezone. "Today" uses local midnight through the next local midnight. "7 days" includes today and the preceding six calendar days. Custom From/To dates are both inclusive in the UI.

`analyticsDates.ts` converts the start midnight and the midnight after the selected end date independently to UTC. It uses calendar arithmetic rather than adding 24 hours, so DST days are handled correctly. The database stores UTC timestamps. For example, August 31 in Kyiv is queried as `from=2026-08-30T21:00:00Z&to=2026-08-31T21:00:00Z`.

## Migration and deletion behavior

Initial migration: `20260831135409_AddAnalyticsEvents`.

Rename migration: `20260831145701_RenameDocumentViewToDocumentDownload`. Because EF stores event names as strings, this data-only migration changes existing `DocumentView` rows to `DocumentDownload`, preserving their IDs, sessions, documents, and timestamps. Down reverses the string rename without deleting rows. No schema changes are required for the rename. Previously untracked download clicks cannot be reconstructed and are not backfilled. Deploy backend and frontend together: old clients sending `DocumentView` are no longer supported.

The initial migration adds `analytics_events` with UUID ID/session/document fields, a string event type, and a UTC timestamp. Indexes cover `(created_at, event_type)` and `document_id`. There is no session index because this feature does not query sessions.

Historical document IDs intentionally have no foreign key: deleting a material must not erase its historical counts or block normal deletion. The report left-joins current document titles, displaying "Видалений матеріал" when the material no longer exists. Titles are not copied into events. No retention job is introduced; events remain until explicitly removed. Rolling back the initial `AddAnalyticsEvents` migration drops the analytics table and its data, but does not delete documents or files.

Generate/apply migrations using the existing deployment workflow. The backend's existing migration-on-startup setting applies this migration when enabled. Do not deploy tracking before the corresponding backend migration/API is available.

## Tests and local verification

- `AnalyticsServiceTests`: recording all event types, validation, UTC timestamps, and date-range validation/normalization.
- `AnalyticsApiIntegrationTests`: public recording/validation, admin authorization, PostgreSQL date boundaries, download summary/table fields, zero counters, sorting, empty results, preservation after document deletion, and migration of historical event names. Uses the existing temporary PostgreSQL database fixture; never a production database.
- `analyticsApi.test.tsx`: UUID reuse, credential-free payloads, StrictMode/remount/reload behavior, storage/network failure isolation.
- `analyticsDates.test.ts`: presets, invalid ranges, and independent local-midnight conversion across DST dates.
- `AnalyticsPage.test.tsx`: period requests, summary/table, Ukrainian download labels, loading, error/retry, and empty states.
- `DocumentDetailsPage.test.tsx`: preview deduplication, one download event per activation of all three MathArchive file controls (including the card), and usable file actions when analytics is offline.

```powershell
docker compose up -d postgres
dotnet restore backend/MathArchive.sln
dotnet build backend/MathArchive.sln --no-restore
dotnet test backend/MathArchive.sln --no-build
cd frontend/math-archive-web
npm ci
npx vitest run --maxWorkers=1
$env:VITE_API_BASE_URL='http://localhost:5293'
npm run build
```

## Refactor rationale

The previous metric omitted the card/details download buttons and described explicit file opens as "views". The implementation's recorded live trace found that the existing keepalive transport returned 204 and persisted the open-link event; it did not reproduce a transport failure. The refactor expanded action coverage rather than changing PDF-viewer behavior or adding retries that could double-count events.

## Implementation references

- [Public dispatch and report types](../frontend/math-archive-web/src/api/analyticsApi.ts)
- [Card download action](../frontend/math-archive-web/src/components/DocumentCard.tsx)
- [Preview and details file actions](../frontend/math-archive-web/src/pages/DocumentDetailsPage.tsx)
- [Admin statistics UI](../frontend/math-archive-web/src/pages/admin/AnalyticsPage.tsx)
- [Application contracts](../backend/src/MathArchive.Application/Analytics/AnalyticsContracts.cs)
- [Validation and recording](../backend/src/MathArchive.Application/Analytics/AnalyticsService.cs)
- [Database aggregation](../backend/src/MathArchive.Infrastructure/Persistence/AnalyticsRepository.cs)
- [Event-name migration](../backend/src/MathArchive.Infrastructure/Migrations/20260831145701_RenameDocumentViewToDocumentDownload.cs)

## Historical verification record

The download-refactor implementation report recorded 87 passing backend tests (including PostgreSQL and migration tests), 73 passing frontend tests, successful builds, and no pending EF model changes. It also recorded a browser run in which each of the three MathArchive file controls sent one `DocumentDownload` POST with the selected document ID, received 204, and added one database event. Preview opening added only a preview event.

These are historical implementation results, not a new test run or production deployment confirmation. The local rename migration was applied during that verification; production still requires coordinated backend/migration and frontend deployment. Run the commands above to verify the current checkout.
