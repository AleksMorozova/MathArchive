# AI code review checklist

## Task and scope

- [ ] The diff matches the task and acceptance criteria.
- [ ] There are no invented APIs, classes, methods, endpoints, or configuration keys.
- [ ] The change follows existing architecture and patterns.
- [ ] The scope is minimal and unrelated code was not modified.
- [ ] There are no accidental generated, formatting, or user changes.

## Security and correctness

- [ ] Backend authorization was verified for administrative operations.
- [ ] Validation is enforced server-side.
- [ ] Error handling uses established ProblemDetails/API patterns.
- [ ] CancellationToken or AbortSignal is propagated where relevant.
- [ ] Realistic concurrency and TOCTOU scenarios were evaluated.
- [ ] Data integrity and file lifecycle invariants are preserved.
- [ ] Deletion verifies the exact target and current references.
- [ ] Valid referenced content is not put at risk for the sake of cleanup.
- [ ] Frontend and backend contracts agree.
- [ ] Logging is structured and contains no secrets or personal data.
- [ ] There are no hardcoded secrets, tokens, or production connection strings.

## Tests and documentation

- [ ] Unit tests cover key behavior and boundary/failure cases.
- [ ] Integration/API tests cover contracts and authorization where relevant.
- [ ] Frontend tests cover user behavior and pending/error/empty states.
- [ ] Tests are not unnecessarily coupled to implementation details.
- [ ] Documentation, commands, routes, and limitations were updated.
- [ ] Test/build/CI results were not invented; blockers are reported exactly.
- [ ] A developer manually verified critical scenarios.

The review result must separate blocking issues, warnings, and suggestions, and list residual risks even when no blocking issues are found.

