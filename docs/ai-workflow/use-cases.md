# AI use cases in MathArchive

| Use case | Goal | Inputs | Expected result | Required human control | Tool |
|---|---|---|---|---|---|
| Analyze a new task | Define scope, dependencies, risks, and acceptance criteria | Task description, `AGENTS.md`, related code and tests | Plan covering files, contracts, risks, and checks | Confirm requirements, non-goals, and risky decisions | [Implement feature](prompts/implement-feature.md) |
| Implement backend changes | Add a use case within existing layers | Application/API/Infrastructure analogues, contracts, validation | Minimal diff with cancellation, authorization, and ProblemDetails | Review data integrity, authorization, migrations, and API | [Implement feature](prompts/implement-feature.md), [AI review](checklists/ai-code-review.md) |
| Implement frontend changes | Add UI without creating a parallel architecture | Route, API type/client, MUI and TanStack Query patterns | Ukrainian UI with loading, error, empty, and pending states | Review UX, accessibility, and backend-contract alignment | [Implement feature](prompts/implement-feature.md) |
| Generate tests | Protect behavior and risky scenarios | Acceptance criteria, diff, existing test fixtures | Behavior-focused unit, integration, or UI tests | Confirm tests do not freeze implementation details | [Generate tests](prompts/generate-tests.md) |
| Refactor code | Improve structure without hidden behavior changes | Defined scope, baseline tests, public contracts | Small logical steps and a list of intentional changes | Compare behavior before and after; review the diff | [Refactor code](prompts/refactor-code.md) |
| Update documentation | Synchronize documentation with code | Actual routes, endpoints, roles, configuration, and commands | Accurate documentation with working relative links | Confirm operational facts and absence of secrets | [Update documentation](prompts/update-documentation.md) |
| Review a Pull Request | Find practical defects and residual risks | PR diff, issue/acceptance criteria, related code and tests | Blocking issues, warnings, suggestions, or an explicit statement that no blocking issues were found | Accept or reject findings and perform manual review | [Review PR](prompts/review-pull-request.md), [AI review](checklists/ai-code-review.md) |
| Analyze CI failures | Distinguish code failures from infrastructure blockers | Complete job log, workflow, local result | Root cause, minimal corrective action, and uncertainty | Verify secrets, environment, and rerun results | [AI review](checklists/ai-code-review.md) |
| Verify API contracts | Prevent frontend/backend drift | Controller/DTO, TypeScript types, API client, tests | Mapping of fields, types, nullability, enums, and status codes | Confirm backward compatibility | [Implement feature](prompts/implement-feature.md), [Review PR](prompts/review-pull-request.md) |

For file operations, also apply the file lifecycle rules in [`AGENTS.md`](../../AGENTS.md#file-lifecycle-invariants). Complete every use case with the [Definition of Done](checklists/definition-of-done.md).

