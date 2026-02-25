FROM node:20-alpine

RUN npm install -g supergateway @railway/mcp-server @railway/cli

ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "supergateway --stdio 'railway-mcp-server' --port ${PORT} --healthEndpoint /health"]
