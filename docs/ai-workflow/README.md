# AI-assisted workflow for MathArchive

## Purpose and scope

This workflow helps developers use AI consistently for analysis, implementation, testing, review, and documentation in MathArchive. It is intended for new and current contributors and applies to features, fixes, refactoring, tests, documentation, and CI analysis.

AI is a developer tool: it can accelerate navigation, prepare a diff, or support review, but it does not replace human responsibility for correctness, security, data, merge decisions, or deployment.

## Overall process

```text
Task definition
→ repository analysis
→ planning
→ implementation
→ test generation or updates
→ local verification
→ AI code review
→ manual review
→ documentation
→ Pull Request
→ CI
→ merge
→ deployment verification
```

Steps after local verification are performed by a developer or under explicit human control. Never mark a PR, CI run, merge, or deployment as complete without factual confirmation.

## Roles

### AI

- reads the task, `AGENTS.md`, related code, tests, and documentation;
- finds analogous implementations and proposes a minimal plan;
- prepares changes within the agreed scope;
- proposes or updates behavior-focused tests;
- runs available checks and reports their exact results;
- reviews the diff and identifies residual risks.

### Developer

- confirms requirements, risky decisions, and destructive operations;
- reviews the diff, contracts, authorization, and data scenarios;
- evaluates recommendations against MathArchive's actual scale;
- remains responsible for commits, Pull Requests, CI, merge, and deployment verification.

## How to use the workflow

1. Record the task description, acceptance criteria, constraints, and explicit non-goals.
2. Ask AI to read the [rules](ai-rules.md), root [`AGENTS.md`](../../AGENTS.md), and related files.
3. Select the relevant [use case](use-cases.md) and prompt from [`prompts/`](prompts/).
4. Before editing, inspect `git status`, architecture, analogous code, API contracts, and tests.
5. Confirm the plan if it changes data, authorization, an API, the database schema, or deployment.
6. Run the relevant local checks after implementation.
7. Perform AI review with the [checklist](checklists/ai-code-review.md), followed by manual review.
8. Complete the [Definition of Done](checklists/definition-of-done.md) before opening a PR. Leave unverified items unchecked and explain why.

## Quick start for a new developer

1. Read the root [`README.md`](../../README.md) and [`AGENTS.md`](../../AGENTS.md).
2. Review the [AI rules](ai-rules.md) and [Definition of Done](checklists/definition-of-done.md).
3. For the first task, copy the [feature implementation prompt](prompts/implement-feature.md), fill in its fields, and add acceptance criteria.
4. Read the [Storage Reconciliation example](example-storage-reconciliation.md) and its source [course-project documentation](../course-project/README.md) to understand the full cycle.
5. Never provide AI with secrets or production data, and never ask it to invent verification results.

## Documentation structure

- [AI rules](ai-rules.md)
- [Use cases](use-cases.md)
- [Storage Reconciliation example](example-storage-reconciliation.md)
- Prompts:
  - [Implement a feature](prompts/implement-feature.md)
  - [Generate tests](prompts/generate-tests.md)
  - [Refactor code safely](prompts/refactor-code.md)
  - [Update documentation](prompts/update-documentation.md)
  - [Review a Pull Request](prompts/review-pull-request.md)
- Checklists:
  - [AI code review](checklists/ai-code-review.md)
  - [Definition of Done](checklists/definition-of-done.md)

