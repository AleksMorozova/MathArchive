# Rules for using AI in MathArchive

These rules complement the root [`AGENTS.md`](../../AGENTS.md). If a rule conflicts with a specific task, AI must stop, describe the conflict, and request a developer decision.

## What AI may generate

- plans, explanations, documentation, prompts, and checklists;
- minimal production-code changes within an explicitly assigned task;
- unit, integration, and frontend tests that verify real behavior;
- review findings with a concrete practical impact;
- verification commands already supported by the repository.

AI must not invent classes, methods, endpoints, configuration, commands, or execution results. Every technical name must be found in the repository or explicitly labeled as a proposal.

## What AI may change only after analysis

Before making changes, AI must read the related code, tests, configuration, documentation, and analogous implementations. This is mandatory for:

- application services, repository abstractions, and storage abstractions;
- the document lifecycle and physical files;
- API DTOs, query parameters, and ProblemDetails;
- frontend API clients, types, and TanStack Query keys;
- authorization, validation, cancellation, and error handling;
- migrations, health checks, and deployment configuration.

Do not modify unrelated code or perform opportunistic refactoring.

## Decisions requiring human confirmation

- deleting or mass-changing files or records;
- changing a public API contract or introducing an incompatible migration;
- changing authorization, roles, secrets, or production configuration;
- pushing, opening a PR, merging, deploying, or changing access;
- accepting a data-loss risk;
- materially expanding the task scope or architecture.

## Data that must not be shared with AI

- secrets, access tokens, JWT signing keys, and passwords;
- production connection strings and provider credentials;
- personal data belonging to students, parents, teachers, or the administrator;
- private educational files without explicit permission;
- production logs or dumps that have not been sanitized.

Use fictitious values in examples. Never place real secrets in prompts, commands, documentation, or logs.

## What must not be accepted without manual review

- production code and migrations;
- authorization changes and deletion operations;
- API/frontend contract changes;
- claims about security, the absence of race conditions, or complete atomicity;
- AI review as a substitute for human review;
- test, CI, PR, merge, or deployment status without factual evidence.

## Required checks before completing a task

1. Review `git diff` and `git status`.
2. Confirm that the scope is minimal and unrelated changes are preserved.
3. Build the affected projects.
4. Run relevant tests; for broader changes, use the commands in [`AGENTS.md`](../../AGENTS.md#tests-and-validation).
5. Verify validation, authorization, error handling, and cancellation.
6. Align frontend and backend types, fields, enums, and status codes.
7. Validate documentation and relative links.
8. Report any unexecuted or blocked checks exactly.

## Safe deletion

- Never run destructive commands without explicit permission.
- Resolve the exact target and check current references before deletion.
- Never delete a file based only on a stale audit; immediately re-check whether it has become validly referenced.
- Never automatically delete database rows for missing or size-mismatched files.
- Preserve the priority: valid referenced content is more important than perfect orphan cleanup.

## Authorization

- Administrative endpoints must remain protected by the `AdminOnly` policy.
- Frontend route protection does not replace backend authorization.
- Tests should cover unauthenticated and insufficient-role scenarios when administrative behavior changes.
- Never weaken authorization to simplify tests or local development.

## API contracts

- Inspect the controller, application contract, frontend type, and API client first.
- Preserve established ProblemDetails and string-enum conventions.
- Update both sides of the contract and related tests within the same scope.
- Require human confirmation for incompatible changes and document the migration path.

## Database and migrations

- Change the schema only through EF Core migrations.
- Account for existing rows, nullability, defaults, and rollback or recovery risks.
- Do not store physical files in PostgreSQL.
- Never claim that a migration was applied in production without confirmation.

## Documentation

- Verify names, routes, endpoints, roles, and commands against the repository.
- Use relative GitHub links for internal files.
- Update an existing document instead of duplicating it.
- Record non-goals, limitations, residual risks, and blocked checks.
- Never invent test, CI, PR, merge, or deployment results.

