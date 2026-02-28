import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const reportPath =
	process.env.E2E_REPORT_PATH || "tests/e2e/artifacts/e2e-report.json";
const pendingPath =
	process.env.E2E_CLEANUP_PENDING_PATH ||
	"tests/e2e/artifacts/cleanup-pending.json";

const isPrefixedResource = (value) =>
	typeof value === "string" && value.startsWith("mcp-e2e-");

const writePendingCleanup = (payload) => {
	writeFileSync(pendingPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

if (!existsSync(reportPath)) {
	process.exit(0);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const projectId = report?.project?.id || null;
const projectName = report?.project?.name || null;
const cleanupOk = Boolean(report?.cleanup?.ok);

if (cleanupOk) {
	if (existsSync(pendingPath)) {
		rmSync(pendingPath, { force: true });
	}
	process.exit(0);
}

if (!projectId || !isPrefixedResource(projectName)) {
	writePendingCleanup({
		reportPath,
		reason: "Missing project id or non-prefixed project name; refusing delete.",
		projectId,
		projectName,
	});
	process.exit(1);
}

const result = spawnSync(
	"railway",
	["delete", "--project", projectId, "--yes"],
	{
		encoding: "utf8",
		env: process.env,
	},
);

if (result.status !== 0) {
	writePendingCleanup({
		reportPath,
		projectId,
		projectName,
		reason: "Forced cleanup command failed.",
		stdout: result.stdout,
		stderr: result.stderr,
	});
	process.exit(1);
}

report.cleanup = {
	...(report.cleanup || {}),
	attempted: true,
	ok: true,
	method: "workflow-forced",
	error: null,
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (existsSync(pendingPath)) {
	rmSync(pendingPath, { force: true });
}
