FROM node:20-slim

RUN npm install -g mcp-proxy @railway/mcp-server @railway/cli

WORKDIR /app
COPY proxy-entrypoint.mjs /app/proxy-entrypoint.mjs

ENV PORT=8000

EXPOSE 8000

CMD ["node", "/app/proxy-entrypoint.mjs"]
