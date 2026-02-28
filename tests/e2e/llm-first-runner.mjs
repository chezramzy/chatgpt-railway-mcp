import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const configuredWorkspacePath = process.env.E2E_WORKSPACE_PATH;

const reportPath =
	process.env.E2E_REPORT_PATH ||
	path.join(repoRoot, "tests", "e2e", "artifacts", "e2e-report.json");
const logPath =
	process.env.E2E_LOG_PATH ||
	path.join(repoRoot, "tests", "e2e", "artifacts", "mcp-stderr.log");

const runId = process.env.GITHUB_RUN_ID || `${Date.now()}`;
const sha = (process.env.GITHUB_SHA || "local").slice(0, 6);
const runFragment = `${runId}`.replace(/[^a-z0-9]/gi, "").slice(-6) || "local";
const prefix = `mcp-e2e-${runFragment}-${sha}`
	.toLowerCase()
	.replace(/[^a-z0-9-]/g, "-");
const projectName = `${prefix}-p`;
const webServiceName = `${prefix}-web`;
const sqlSmokeRunnerPath = path.join(
	repoRoot,
	"tests",
	"e2e",
	"sql-smoke-runner.mjs",
);

const ensurePrefixed = (value, label) => {
	if (!value.startsWith("mcp-e2e-")) {
		throw new Error(
			`${label} '${value}' is not prefixed with 'mcp-e2e-' and cannot be mutated.`,
		);
	}
};

const extractToolText = (result) => {
	if (!result?.content || !Array.isArray(result.content)) {
		return "";
	}

	return result.content
		.filter((item) => item?.type === "text")
		.map((item) => item.text || "")
		.join("\n")
		.trim();
};

const parseSection = (text, marker) => {
	const index = text.indexOf(marker);
	if (index === -1) {
		return null;
	}

	const tail = text.slice(index + marker.length).trim();
	const nextSectionIndex = tail.indexOf("\n\nStderr:");
	return (
		nextSectionIndex === -1 ? tail : tail.slice(0, nextSectionIndex)
	).trim();
};

const parseToolJson = (text) => {
	const parseJsonWithFallback = (value) => {
		const trimmed = value?.trim();
		if (!trimmed || trimmed === "<empty>") {
			return null;
		}

		try {
			return JSON.parse(trimmed);
		} catch {
			// fallthrough
		}

		const lines = trimmed.split(/\r?\n/).map((line) => line.trim());
		for (let index = lines.length - 1; index >= 0; index--) {
			const line = lines[index];
			if (!line || line === "<empty>") {
				continue;
			}
			try {
				return JSON.parse(line);
			} catch {
				// continue searching
			}
		}

		for (let index = trimmed.length - 1; index >= 0; index--) {
			const char = trimmed[index];
			if (char !== "{" && char !== "[") {
				continue;
			}

			const candidate = trimmed.slice(index);
			try {
				return JSON.parse(candidate);
			} catch {
				// continue searching
			}
		}

		return null;
	};

	const direct = parseJsonWithFallback(text);
	if (direct) {
		return direct;
	}

	const parsedSection = parseSection(text, "Stdout (parsed JSON):");
	if (parsedSection) {
		const parsed = parseJsonWithFallback(parsedSection);
		if (parsed) {
			return parsed;
		}
	}

	const rawSection = parseSection(text, "Stdout:");
	if (rawSection) {
		const parsed = parseJsonWithFallback(rawSection);
		if (parsed) {
			return parsed;
		}
	}

	throw new Error(
		`Unable to parse JSON payload from tool output. Payload preview:\n${text.slice(0, 800)}`,
	);
};

const assertToolSuccessText = (text, stepName) => {
	if (!text) {
		return;
	}

	if (
		/(^|\n)\s*(❌|âŒ)/.test(text) ||
		/\bRailway command failed\./i.test(text) ||
		/(^|\n)\s*Failed to /i.test(text)
	) {
		throw new Error(`[${stepName}] ${text}`);
	}
};

const run = async () => {
	const runtimeWorkspacePath =
		configuredWorkspacePath ||
		path.join(os.tmpdir(), "railway-mcp-e2e", prefix);

	const startedAt = new Date().toISOString();
	const report = {
		startedAt,
		finishedAt: null,
		durationMs: 0,
		status: "failed",
		workspacePath: runtimeWorkspacePath,
		prefix,
		project: {
			name: projectName,
			id: null,
		},
		steps: [],
		cleanup: {
			attempted: false,
			ok: false,
			method: null,
			error: null,
		},
	};

	let client;
	let transport;
	let logStream;
	let failedError = null;

	const callTool = async (name, args = {}) => {
		const result = await client.callTool({
			name,
			arguments: args,
		});
		return {
			result,
			text: extractToolText(result),
		};
	};

	const runStep = async (name, action) => {
		const stepStart = Date.now();
		try {
			const details = await action();
			report.steps.push({
				name,
				ok: true,
				durationMs: Date.now() - stepStart,
				details,
			});
			return details;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			report.steps.push({
				name,
				ok: false,
				durationMs: Date.now() - stepStart,
				error: message,
			});
			throw error;
		}
	};

	try {
		ensurePrefixed(projectName, "projectName");
		ensurePrefixed(webServiceName, "webServiceName");

		await mkdir(path.dirname(reportPath), { recursive: true });
		await mkdir(path.dirname(logPath), { recursive: true });
		await mkdir(runtimeWorkspacePath, { recursive: true });

		transport = new StdioClientTransport({
			command: "node",
			args: ["dist/index.js"],
			cwd: repoRoot,
			env: process.env,
			stderr: "pipe",
		});
		logStream = createWriteStream(logPath, { flags: "w" });
		if (transport.stderr) {
			transport.stderr.pipe(logStream);
		}

		client = new Client({
			name: "railway-mcp-e2e-runner",
			version: "1.0.0",
		});
		await client.connect(transport);

		await runStep("check-railway-status", async () => {
			const { text } = await callTool("check-railway-status");
			if (/failed/i.test(text)) {
				throw new Error(text);
			}
			return { text };
		});

		await runStep("list-cli-commands", async () => {
			const { text } = await callTool("list-cli-commands", { maxDepth: 2 });
			return { lines: text.split(/\r?\n/).length };
		});

		await runStep("bootstrap-pre", async () => {
			const { text } = await callTool("bootstrap-railway-context", {
				workspacePath: runtimeWorkspacePath,
				maxDepth: 2,
				includeDeployments: false,
			});
			const payload = parseToolJson(text);
			return { status: payload.status };
		});

		await runStep("create-project-and-link", async () => {
			const { text } = await callTool("create-project-and-link", {
				projectName,
				workspacePath: runtimeWorkspacePath,
			});
			assertToolSuccessText(text, "create-project-and-link");
			return { text };
		});

		const statusPayload = await runStep("status-json", async () => {
			const { text } = await callTool("run-railway-command", {
				command: "status",
				args: ["--json"],
				workspacePath: runtimeWorkspacePath,
				parseJsonOutput: true,
			});
			assertToolSuccessText(text, "status-json");
			return parseToolJson(text);
		});

		report.project.id = statusPayload.id || null;
		report.project.name = statusPayload.name || report.project.name;
		if (report.project.name) {
			ensurePrefixed(report.project.name, "linkedProjectName");
		}

		await runStep("list-services-initial", async () => {
			const { text } = await callTool("list-services", {
				workspacePath: runtimeWorkspacePath,
			});
			return { text };
		});

		const templateSearch = await runStep("deploy-template-search", async () => {
			const { text } = await callTool("deploy-template", {
				workspacePath: runtimeWorkspacePath,
				searchQuery: "Postgres",
			});
			return { text };
		});

		const needsIndex = /templateIndex|specify/i.test(templateSearch.text);
		if (needsIndex) {
			await runStep("deploy-template-apply", async () => {
				const { text } = await callTool("deploy-template", {
					workspacePath: runtimeWorkspacePath,
					searchQuery: "Postgres",
					templateIndex: 1,
				});
				return { text };
			});
		}

		let refreshedStatus = await runStep(
			"status-json-after-template",
			async () => {
				const { text } = await callTool("run-railway-command", {
					command: "status",
					args: ["--json"],
					workspacePath: runtimeWorkspacePath,
					parseJsonOutput: true,
				});
				return parseToolJson(text);
			},
		);

		let postgresService =
			refreshedStatus?.services?.edges
				?.map((edge) => edge.node?.name)
				?.find((name) => /postgres/i.test(name || "")) || null;

		if (!postgresService) {
			await runStep("add-postgres-fallback", async () => {
				const { text } = await callTool("run-railway-command", {
					command: "add",
					args: ["--database", "postgres", "--json"],
					workspacePath: runtimeWorkspacePath,
					parseJsonOutput: true,
				});
				assertToolSuccessText(text, "add-postgres-fallback");
				return parseToolJson(text);
			});

			refreshedStatus = await runStep(
				"status-json-after-add-postgres",
				async () => {
					const { text } = await callTool("run-railway-command", {
						command: "status",
						args: ["--json"],
						workspacePath: runtimeWorkspacePath,
						parseJsonOutput: true,
					});
					assertToolSuccessText(text, "status-json-after-add-postgres");
					return parseToolJson(text);
				},
			);

			postgresService =
				refreshedStatus?.services?.edges
					?.map((edge) => edge.node?.name)
					?.find((name) => /postgres/i.test(name || "")) || null;
		}

		if (!postgresService) {
			throw new Error(
				"Postgres service not found after deployment/add fallback.",
			);
		}

		await runStep("set-variables", async () => {
			const { text } = await callTool("set-variables", {
				workspacePath: runtimeWorkspacePath,
				service: postgresService,
				variables: [`MCP_E2E_MARKER=${prefix}`],
				skipDeploys: true,
			});
			return { text };
		});

		await runStep("list-variables", async () => {
			const { text } = await callTool("list-variables", {
				workspacePath: runtimeWorkspacePath,
				service: postgresService,
				json: true,
			});
			return { text: text.slice(0, 1200) };
		});

		await runStep("sql-smoke", async () => {
			const { text } = await callTool("run-railway-command", {
				workspacePath: runtimeWorkspacePath,
				command: "run",
				args: ["--service", postgresService, "node", sqlSmokeRunnerPath],
			});
			assertToolSuccessText(text, "sql-smoke");
			const stdout = parseSection(text, "Stdout:") || "";
			let parsed = null;
			try {
				parsed = JSON.parse(stdout);
			} catch {
				// keep raw output for diagnostics
			}
			return {
				stdout: parsed || stdout,
			};
		});

		await runStep("get-logs", async () => {
			const { text } = await callTool("get-logs", {
				workspacePath: runtimeWorkspacePath,
				logType: "deploy",
				service: postgresService,
				lines: 25,
			});
			return { text: text.slice(0, 1200) };
		});

		await runStep("add-web-service", async () => {
			const { text } = await callTool("run-railway-command", {
				workspacePath: runtimeWorkspacePath,
				command: "add",
				args: [
					"--service",
					webServiceName,
					"--image",
					"nginx:alpine",
					"--json",
				],
				parseJsonOutput: true,
			});
			assertToolSuccessText(text, "add-web-service");
			return parseToolJson(text);
		});

		await runStep("generate-domain", async () => {
			const { text } = await callTool("generate-domain", {
				workspacePath: runtimeWorkspacePath,
				service: webServiceName,
			});
			return { text };
		});

		await runStep("bootstrap-post", async () => {
			const { text } = await callTool("bootstrap-railway-context", {
				workspacePath: runtimeWorkspacePath,
				maxDepth: 2,
				includeDeployments: true,
			});
			const payload = parseToolJson(text);
			return { status: payload.status };
		});

		report.status = "success";
	} catch (error) {
		failedError = error;
		report.status = "failed";
	} finally {
		report.cleanup.attempted = true;
		if (report.project.id && report.project.name) {
			try {
				ensurePrefixed(report.project.name, "cleanupProjectName");
				if (client) {
					const { text } = await callTool("run-railway-command", {
						workspacePath: runtimeWorkspacePath,
						command: "delete",
						args: ["--project", report.project.id, "--yes"],
					});
					assertToolSuccessText(text, "cleanup-delete-project");
					report.cleanup.ok = true;
					report.cleanup.method = "mcp-tool";
				}
			} catch (cleanupError) {
				const result = spawnSync(
					"railway",
					["delete", "--project", report.project.id, "--yes"],
					{
						cwd: runtimeWorkspacePath,
						env: process.env,
						encoding: "utf8",
					},
				);
				if (result.status === 0) {
					report.cleanup.ok = true;
					report.cleanup.method = "cli-fallback";
				} else {
					report.cleanup.ok = false;
					report.cleanup.method = "cli-fallback";
					report.cleanup.error =
						(cleanupError instanceof Error
							? cleanupError.message
							: String(cleanupError)) +
						"\n" +
						(result.stderr || result.stdout || "").trim();
				}
			}
		}

		try {
			if (client) {
				await client.close();
			}
		} catch {
			// ignore close failures
		}
		try {
			if (transport) {
				await transport.close();
			}
		} catch {
			// ignore close failures
		}
		if (logStream) {
			logStream.end();
		}

		report.finishedAt = new Date().toISOString();
		report.durationMs =
			Date.parse(report.finishedAt) - Date.parse(report.startedAt);
		await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
	}

	if (failedError || !report.cleanup.ok) {
		const message = failedError instanceof Error ? failedError.message : null;
		const cleanupMessage = report.cleanup.ok
			? ""
			: `Cleanup failed: ${report.cleanup.error || "unknown error"}`;
		throw new Error([message, cleanupMessage].filter(Boolean).join("\n"));
	}
};

run().catch((error) => {
	console.error("Railway MCP E2E runner failed:");
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
