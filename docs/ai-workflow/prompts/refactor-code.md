# Prompt: refactor code safely

## Inputs

```text
Refactoring goal:
[problem]

Scope:
[files/modules]

Public contracts and constraints:
[what must remain unchanged]
```

## Prompt

```text
Before editing, read AGENTS.md, related code, and tests; check git status; and record current observable behavior. Run focused baseline tests when the environment permits.

Define scope and non-goals precisely. Do not change public APIs, the database schema, routes, DTOs, error shapes, or UI behavior without a separate requirement and human confirmation. Make small logical changes while preserving file lifecycle, authorization, cancellation, and data integrity invariants. Do not introduce an abstraction without concrete value for MathArchive.

Review the diff after each logical step. Run the same tests after the change and build the affected project. List every intentional behavior change separately; if there are none, say so explicitly.

Final response format:
- baseline and scope;
- structural changes;
- intentional behavior changes or confirmation that none occurred;
- tests before and after, plus build result;
- risks and manual checks.
```

