# Prompt: review a Pull Request

## Inputs

```text
PR or diff:
[link or base/head]

Task and acceptance criteria:
[description]

Known constraints:
[scope, infrastructure, non-goals]
```

## Prompt

```text
Review the change as a skeptical senior .NET/React engineer while accounting for MathArchive's actual scale: one administrator, a small audience, PostgreSQL metadata, and single-instance file storage.

Read the complete diff and related code, tests, contracts, and documentation. Check security, backend authorization, data integrity, file lifecycle, safe deletion, concurrency/TOCTOU behavior, cancellation, validation, frontend/backend API contracts, ProblemDetails/error handling, logging without secrets, tests, and documentation.

Do not create ceremonial findings without practical impact or propose enterprise architecture without a demonstrated need.

Separate the result into:
1. Blocking issues.
2. Warnings.
3. Suggestions.

For every finding, provide:
- file and exact location;
- the problem;
- realistic impact;
- a concrete correction;
- why the severity fits MathArchive's scale.

If no blocking issues are found, say so explicitly. Finish with residual risks, unverified assumptions, and manual checks. Do not infer successful CI or deployment merely from the presence of a workflow.
```

