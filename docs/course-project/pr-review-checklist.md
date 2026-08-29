# PR and review checklist

## Requirements

- [ ] User story and acceptance criteria are reflected in behavior.
- [ ] Non-goals remain out of scope.
- [ ] The demo can be repeated without production data risk.

## Backend

- [ ] Audit and cleanup endpoints require the `AdminOnly` policy.
- [ ] Controller delegates behavior to the application service.
- [ ] No physical root path is exposed through the API.
- [ ] Missing and mismatched referenced files are never auto-deleted.
- [ ] Every orphan candidate is re-checked before deletion.
- [ ] Cancellation tokens reach repository and file operations.
- [ ] Cleanup actions and skipped candidates are logged structurally.
- [ ] Existing create/update/delete ordering is unchanged.

## Frontend

- [ ] Loading, error, healthy, warning, and critical states are understandable.
- [ ] Cleanup requires a confirmation dialog.
- [ ] Pending cleanup cannot be submitted twice.
- [ ] The post-cleanup report replaces stale cached data.
- [ ] Ukrainian copy explains what automation will and will not do.
- [ ] Layout remains usable on a narrow screen.

## Tests and delivery

- [ ] Backend build and unit tests pass.
- [ ] PostgreSQL integration tests pass, or the infrastructure blocker is recorded.
- [ ] Frontend tests pass.
- [ ] Frontend production build passes.
- [ ] No credentials, production paths, or real document names were committed.
- [ ] A reviewer can explain every changed behavior from the diff and documentation.
