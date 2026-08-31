# Prompt: update documentation

## Inputs

```text
Change or topic:
[description/diff]

Documents in scope:
[paths]

Confirmed facts:
[tests, CI, and deployment only when supported by evidence]
```

## Prompt

```text
Synchronize MathArchive documentation with the actual repository. First inspect existing documentation and do not create a duplicate when an appropriate document already exists.

Verify exact endpoints, routes, roles/policies, DTO/type names, configuration keys, environment variables, commands, and supported behavior in code. Do not invent names or results. Repair stale internal links and use relative GitHub links.

Document current non-goals, security/data risks, operational limitations, and manual steps. Do not include secrets, production credentials, personal data, or real private filenames. Do not claim that tests, a PR, CI, merge, or deployment completed without evidence.

After editing, validate Markdown formatting, code fences, anchors, and all relative links.

Final response format:
- updated or created documents;
- sources for confirmed facts;
- repaired links;
- unsupported claims intentionally omitted;
- Markdown and link validation result.
```

