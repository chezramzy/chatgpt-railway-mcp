# Railway MCP SSE (GitHub-ready)

This repository deploys an authenticated public SSE endpoint for Railway MCP on Railway.

It includes:
- A vendored local copy of `railway-mcp-server` with custom enhancements.
- A proxy entrypoint that:
  - Exposes `/sse` publicly.
  - Injects `X-API-Key` for upstream MCP transport.
  - Bootstraps `railway link` for common workspace paths (`/`, `/app`, `/workspace`).

## Included MCP enhancements

Inside [`railway-mcp-server`](./railway-mcp-server):
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

## Endpoints

- Health: `/ping`
- SSE: `/sse`

## Security notes

- `run-railway-command` can execute any Railway CLI command.
- Treat this deployment as privileged infrastructure access.
- Rotate `RAILWAY_API_TOKEN` and `MCP_PROXY_API_KEY` regularly.
- Restrict client access at the ChatGPT connector level.
