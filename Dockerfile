FROM node:20-slim

RUN npm install -g mcp-proxy @railway/mcp-server @railway/cli

ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "mcp-proxy --host 0.0.0.0 --port ${PORT} --server sse --sseEndpoint /sse --apiKey ${MCP_PROXY_API_KEY} -- railway-mcp-server"]
