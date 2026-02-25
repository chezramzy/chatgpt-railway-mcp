FROM node:20-slim

RUN npm install -g mcp-proxy @railway/cli && corepack enable

WORKDIR /app

COPY railway-mcp-server /app/railway-mcp-server
RUN cd /app/railway-mcp-server && pnpm install --frozen-lockfile && pnpm build

COPY proxy-entrypoint.mjs /app/proxy-entrypoint.mjs

ENV PORT=8000
ENV MCP_SERVER_COMMAND="node /app/railway-mcp-server/dist/index.js"

EXPOSE 8000

CMD ["node", "/app/proxy-entrypoint.mjs"]
