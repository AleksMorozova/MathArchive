# Prompt: implement a feature

## Inputs

```text
Task:
[description]

Acceptance criteria:
[verifiable criteria]

Constraints and non-goals:
[scope, compatibility, prohibited changes]
```

## Prompt

```text
Work in the MathArchive repository as an engineering assistant. Final decisions and review belong to the developer.

1. Read the root AGENTS.md and README.md, check git status, and preserve unrelated changes.
2. Analyze the architecture, related production code, tests, and documentation. Find analogous implementations. Do not invent classes, endpoints, or conventions.
3. Ask clarifying questions only when material uncertainty affects scope, data, contracts, authorization, or risk.
4. Before editing, provide a short plan covering files, contracts, risks, tests, and documentation.
5. Make the smallest coherent change. Do not break backward compatibility without necessity and human confirmation. Do not refactor unrelated code.
6. Follow existing layers and patterns: thin controllers, Application services, IDocumentRepository, IFileStorage, the Axios client, TanStack Query, and Material UI.
7. Verify authorization, server-side validation, ProblemDetails/error handling, CancellationToken propagation, and file/data lifecycle. Backend authorization is mandatory for administrative operations.
8. If the API changes, align backend DTOs/controllers, frontend types/clients, and focused tests.
9. Add or update behavior-focused tests. Never change production code solely to make a test pass artificially.
10. Run the smallest relevant checks, followed by broader affected builds/tests. Never invent results; report exact blockers separately.
11. Update existing documentation when behavior, API, configuration, risks, or commands change. Use relative GitHub links.

Final response format:
- what changed and why;
- changed files;
- completed acceptance criteria;
- result of every verification command;
- unexecuted checks and blockers;
- risks and required manual checks;
- whether a migration is required;
- what intentionally remained out of scope.
```

