# LLM Playbook (Railway MCP)

This playbook standardizes first-time LLM behavior so the model can move fast with minimal intermediate steps.

## Golden flow (2 calls max)

1. Call `bootstrap-railway-context`.
2. Execute one target action from `recommendedNextActions`.

If the first action fails, use `errors[].code` and `errors[].nextStep` from the bootstrap/tool response to recover.

## Required preflight input

- `workspacePath`: path linked to Railway context.
- `maxDepth` (optional): command discovery depth, default `2`.
- `includeDeployments` (optional): set `true` only when deployment validation is required.

## Stable error codes

- `CLI_NOT_FOUND`
- `CLI_UNAUTHORIZED`
- `NO_LINKED_PROJECT`
- `SERVICE_NOT_FOUND`
- `POLICY_BLOCKED`
- `UNKNOWN_ERROR`

## Operational rules

- Prefer specific tools first (`list-services`, `set-variables`, `get-logs`, etc.).
- Use `run-railway-command` for uncovered CLI features.
- For mutating actions, ensure resources are explicitly named and scoped.
- For test resources, use `mcp-e2e-` prefix only.

## Prompt starter (copy/paste)

```text
You are operating Railway through MCP.
First call `bootstrap-railway-context` with the current `workspacePath`.
Then execute exactly one action based on `recommendedNextActions`.
If any call fails, use the returned `errors[].code` and `errors[].nextStep` to recover.
Avoid extra discovery steps unless the bootstrap result is `degraded` or `failed`.
```
