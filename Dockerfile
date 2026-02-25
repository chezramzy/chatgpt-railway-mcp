FROM node:20-slim

RUN npm install -g mcp-proxy @railway/cli && corepack enable

WORKDIR /app

COPY . /app
RUN pnpm install --frozen-lockfile && pnpm build

ENV PORT=8000
ENV MCP_SERVER_COMMAND="node /app/dist/index.js"

EXPOSE 8000

CMD ["node", "/app/proxy-entrypoint.mjs"]
