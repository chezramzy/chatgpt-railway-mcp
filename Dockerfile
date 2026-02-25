FROM node:20-alpine

RUN npm install -g supergateway @railway/mcp-server

ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "supergateway --stdio 'npx -y @railway/mcp-server' --port ${PORT} --healthEndpoint /health"]
