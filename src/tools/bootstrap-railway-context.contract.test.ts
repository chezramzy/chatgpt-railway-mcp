import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { classifyRailwayError } from "../cli/error-handling";
import { bootstrapRailwayContextTool } from "./bootstrap-railway-context";

vi.mock("../cli", () => ({
	checkRailwayCliStatus: vi.fn().mockResolvedValue(undefined),
	getCliFeatureSupport: vi.fn().mockResolvedValue({
		logs: { args: { lines: true, filter: true } },
		deployment: { list: true },
	}),
	getLinkedProjectInfo: vi.fn().mockResolvedValue({
		success: true,
		project: {
			id: "project-id",
			name: "demo-project",
			createdAt: "2026-01-01T00:00:00Z",
			updatedAt: "2026-01-01T00:00:00Z",
			environments: { edges: [{ node: { name: "production" } }] },
			services: { edges: [{ node: { name: "api" } }] },
		},
	}),
	getRailwayCliCatalog: vi.fn().mockResolvedValue({
		rootCommandCount: 1,
		totalCommandCount: 1,
		entries: [
			{ path: ["status"], depth: 1, description: "status", parentPath: null },
		],
	}),
	getRailwayServices: vi.fn().mockResolvedValue({
		success: true,
		services: ["api"],
	}),
	getRailwayVersion: vi.fn().mockResolvedValue("4.30.2"),
	listDeployments: vi.fn().mockResolvedValue({
		success: true,
		output: "[]",
	}),
	runRailwayCommand: vi.fn().mockResolvedValue({
		stdout: "",
		stderr: "",
		output: "Project: demo-project\nEnvironment: production\nService: api\n",
	}),
}));

const bootstrapSchema = z.object({
	status: z.enum(["ok", "degraded", "failed"]),
	cli: z.object({
		installed: z.boolean(),
		version: z.string().optional(),
		authenticated: z.boolean(),
	}),
	link: z.object({
		projectLinked: z.boolean(),
		projectName: z.string().optional(),
		environmentName: z.string().optional(),
		serviceName: z.string().optional(),
	}),
	services: z.array(z.string()),
	environments: z.array(z.string()),
	capabilities: z.object({
		commands: z.array(z.string()),
		supports: z.object({
			deploymentList: z.boolean(),
			logLines: z.boolean(),
			logFilter: z.boolean(),
		}),
	}),
	recommendedNextActions: z.array(z.string()),
	errors: z.array(
		z.object({
			code: z.enum([
				"CLI_NOT_FOUND",
				"CLI_UNAUTHORIZED",
				"NO_LINKED_PROJECT",
				"SERVICE_NOT_FOUND",
				"POLICY_BLOCKED",
				"UNKNOWN_ERROR",
			]),
			message: z.string(),
			nextStep: z.string().optional(),
		}),
	),
});

describe("Bootstrap context contract", () => {
	it("returns output that matches the bootstrap JSON contract", async () => {
		const result = await bootstrapRailwayContextTool.handler({
			workspacePath: "/tmp/ws-contract",
			maxDepth: 2,
			includeDeployments: false,
		});
		const payload = JSON.parse(result.content[0].text);

		expect(() => bootstrapSchema.parse(payload)).not.toThrow();
	});

	it("maps known runtime failures to stable error codes", () => {
		const unauthorized = classifyRailwayError(
			{
				stderr:
					"Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource.",
			},
			"railway whoami",
		);
		const notFound = classifyRailwayError(
			{
				code: "ENOENT",
				message: "spawn railway ENOENT",
			},
			"railway --version",
		);
		const blocked = classifyRailwayError(
			{
				message: "Request blocked by platform security controls",
			},
			"railway logs",
		);

		expect(unauthorized.code).toBe("CLI_UNAUTHORIZED");
		expect(notFound.code).toBe("CLI_NOT_FOUND");
		expect(blocked.code).toBe("POLICY_BLOCKED");
	});
});
