# Prompt: generate tests

## Inputs

```text
Behavior or diff:
[description/link]

Acceptance criteria:
[criteria]

Test level and constraints:
[unit/integration/frontend; available infrastructure]
```

## Prompt

```text
Inspect existing MathArchive tests, fixtures, naming, and assertion style before making changes. Identify the behavior that genuinely needs protection and avoid duplicating existing tests.

Create a test matrix covering, where relevant:
- happy paths;
- validation and boundary values;
- unauthenticated and forbidden authorization;
- cancellation;
- dependency, database, and filesystem failures;
- repeated or duplicate non-idempotent requests;
- concurrent changes and stale reads;
- protection against loss of valid referenced content;
- frontend/backend contracts and loading/error/empty/pending states.

Reuse existing xUnit, WebApplicationFactory, PostgreSQL integration, Vitest, and Testing Library patterns. Do not change production code solely to make tests pass or test private implementation details without a behavioral reason.

Implement the smallest sufficient set. Run focused tests and report exact results. If PostgreSQL or another dependency is unavailable, distinguish a code failure from an environment blocker.

Final response format:
- test matrix and protected risks;
- created or changed test files;
- commands executed and their results;
- gaps requiring manual or integration verification;
- confirmation that production code was not changed to bypass tests.
```

