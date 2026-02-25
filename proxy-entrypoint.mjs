import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const publicPort = Number(process.env.PORT || 8000);
const upstreamPort = Number(process.env.UPSTREAM_PORT || 8081);
const apiKey = process.env.MCP_PROXY_API_KEY || "";
const railwayProjectId = process.env.RAILWAY_PROJECT_ID || "";
const railwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID || "";
const railwayServiceId = process.env.RAILWAY_SERVICE_ID || "";

function ensureRailwayLink(cwd) {
	if (!railwayProjectId) {
		return;
	}

	const args = ["link", "--project", railwayProjectId, "--json"];
	if (railwayEnvironmentId) {
		args.push("--environment", railwayEnvironmentId);
	}
	if (railwayServiceId) {
		args.push("--service", railwayServiceId);
	}

	const result = spawnSync("railway", args, {
		cwd,
		env: process.env,
		encoding: "utf8",
	});

	if (result.status === 0) {
		console.log(`railway link ok for ${cwd}`);
		return;
	}

	const details = (result.stderr || result.stdout || "").trim();
	console.warn(`railway link failed for ${cwd}: ${details || `exit ${result.status}`}`);
}

function bootstrapRailwayLinks() {
	if (!railwayProjectId) {
		console.warn("RAILWAY_PROJECT_ID missing, skipping railway link bootstrap");
		return;
	}

	const targets = ["/", "/app", "/workspace"];
	for (const cwd of targets) {
		try {
			mkdirSync(cwd, { recursive: true });
		} catch {
			// ignore directory creation failures; link may still succeed
		}
		ensureRailwayLink(cwd);
	}
}

bootstrapRailwayLinks();

const proxyArgs = [
	"--host",
	"127.0.0.1",
	"--port",
	String(upstreamPort),
	"--server",
	"sse",
	"--sseEndpoint",
	"/sse",
];

if (apiKey) {
	proxyArgs.push("--apiKey", apiKey);
}

proxyArgs.push("--", "railway-mcp-server");

const upstream = spawn("mcp-proxy", proxyArgs, {
	stdio: "inherit",
	env: process.env,
});

upstream.on("exit", (code, signal) => {
	console.error(
		`upstream mcp-proxy exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
	);
	process.exit(code ?? 1);
});

function forward(req, res) {
	const headers = { ...req.headers };
	headers.host = `127.0.0.1:${upstreamPort}`;
	if (apiKey) {
		headers["x-api-key"] = apiKey;
	}

	const upstreamReq = http.request(
		{
			hostname: "127.0.0.1",
			port: upstreamPort,
			path: req.url || "/",
			method: req.method,
			headers,
		},
		(upstreamRes) => {
			res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
			upstreamRes.pipe(res);
		},
	);

	upstreamReq.on("error", (error) => {
		if (!res.headersSent) {
			res.writeHead(502, { "content-type": "application/json" });
		}
		res.end(
			JSON.stringify({
				error: "upstream_proxy_error",
				message: error.message,
			}),
		);
	});

	req.pipe(upstreamReq);
}

const server = http.createServer((req, res) => {
	const url = req.url || "/";

	if (req.method === "GET" && url === "/ping") {
		res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
		res.end("pong");
		return;
	}

	if (
		(req.method === "GET" && url.startsWith("/sse")) ||
		(req.method === "POST" && url.startsWith("/messages")) ||
		(req.method === "POST" && url.startsWith("/mcp"))
	) {
		forward(req, res);
		return;
	}

	res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	res.end("Not found");
});

server.requestTimeout = 0;
server.headersTimeout = 0;

server.listen(publicPort, "0.0.0.0", () => {
	console.log(`proxy listening on port ${publicPort}, forwarding to ${upstreamPort}`);
});

function shutdown(signal) {
	console.log(`received ${signal}, shutting down`);
	server.close(() => {
		if (!upstream.killed) {
			upstream.kill("SIGTERM");
		}
		process.exit(0);
	});
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
