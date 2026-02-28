# Railway MCP SSE (GitHub-ready)

This repository deploys a public SSE endpoint for Railway MCP on Railway.

It includes:
- A local copy of the Railway MCP server code with custom enhancements.
- A proxy entrypoint that:
  - Exposes `/sse` publicly.
  - Injects `X-API-Key` for upstream MCP transport.
  - Bootstraps `railway link` for common workspace paths (`/`, `/app`, `/workspace`).

## Included MCP enhancements

Inside [`src`](./src):
- `bootstrap-railway-context`: one-shot structured preflight for LLM startup.
- `list-cli-commands`: discovers Railway CLI commands/subcommands from help output.
- `run-railway-command`: generic passthrough tool to run any Railway CLI command.

This allows reflecting Railway CLI capabilities from MCP without adding a dedicated tool per command.

## Required environment variables

Set these in Railway service variables:
- `RAILWAY_API_TOKEN`: Railway API token used by the MCP server.
- `MCP_PROXY_API_KEY`: API key used between the public endpoint and the upstream MCP proxy.

Optional:
- `UPSTREAM_PORT` (default `8081`)
- `PORT` (provided by Railway)

For GitHub Actions CI:
- `RAILWAY_TOKEN` (repository secret): Railway token used by deploy and E2E workflows.
- `RAILWAY_PROJECT_ID` (repository variable): target Railway project ID for production deploy workflow.
- `RAILWAY_ENVIRONMENT` (repository variable): target environment (for example `production`).
- `RAILWAY_SERVICE` (repository variable): target service name for `railway up`.

## Endpoints

- Health: `/ping`
- SSE: `/sse`

## Security notes

- `/sse` is public in this setup (no client header required at the edge).
- `run-railway-command` can execute any Railway CLI command.
- Treat this deployment as privileged infrastructure access.
- Rotate `RAILWAY_API_TOKEN` and `MCP_PROXY_API_KEY` regularly.
- Restrict client access at the ChatGPT connector level.

## CI validation

- `checks.yml`: typecheck + unit tests + contract tests + build.
- `e2e-railway.yml`: full Railway E2E validation on every push (creates isolated prefixed resources, runs SQL smoke, performs cleanup, uploads report artifacts).
