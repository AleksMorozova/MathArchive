# Definition of Done for an AI-assisted task

- [ ] Acceptance criteria are complete and mapped to actual behavior.
- [ ] A developer reviewed the entire diff.
- [ ] Affected projects compile.
- [ ] Relevant unit, integration, and frontend tests passed.
- [ ] Unexecuted checks and environment blockers are stated explicitly.
- [ ] Documentation, contracts, commands, and links were updated.
- [ ] Security, secrets handling, and authorization were verified.
- [ ] Data integrity, safe deletion, and cancellation were checked where relevant.
- [ ] EF Core migrations were created and verified if the schema changed.
- [ ] CI passed for the specific commit; otherwise this item remains unchecked.
- [ ] Blocking review findings were fixed, and other findings were addressed or rejected with rationale.
- [ ] The PR was reviewed and approved by a developer.
- [ ] Merge occurred only after required checks.
- [ ] Deployment was verified when it was in scope; otherwise this is stated explicitly.

The presence of a CI workflow, deployment configuration, or test commands does not prove successful execution. Do not check an item without an actual result.

