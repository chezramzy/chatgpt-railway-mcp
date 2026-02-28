import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapRailwayContextTool } from "./bootstrap-railway-context";

vi.mock("../cli", () => ({
	checkRailwayCliStatus: vi.fn(),
	getCliFeatureSupport: vi.fn(),
	getLinkedProjectInfo: vi.fn(),
	getRailwayCliCatalog: vi.fn(),
	getRailwayServices: vi.fn(),
	getRailwayVersion: vi.fn(),
	listDeployments: vi.fn(),
	runRailwayCommand: vi.fn(),
}));

describe("bootstrap-railway-context tool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns structured healthy context for a linked workspace", async () => {
		const cli = await import("../cli");

		vi.mocked(cli.checkRailwayCliStatus).mockResolvedValue();
		vi.mocked(cli.getRailwayVersion).mockResolvedValue("4.30.2");
		vi.mocked(cli.runRailwayCommand).mockResolvedValue({
			stdout: "",
			stderr: "",
			output: "Project: demo-project\nEnvironment: production\nService: api\n",
		});
		vi.mocked(cli.getLinkedProjectInfo).mockResolvedValue({
			success: true,
			project: {
				id: "project-id",
				name: "demo-project",
				createdAt: "2026-01-01T00:00:00Z",
				updatedAt: "2026-01-01T00:00:00Z",
				environments: {
					edges: [{ node: { name: "production" } }],
				},
				services: {
					edges: [{ node: { name: "api" } }],
				},
			},
		});
		vi.mocked(cli.getRailwayServices).mockResolvedValue({
			success: true,
			services: ["api", "Postgres"],
		});
		vi.mocked(cli.getRailwayCliCatalog).mockResolvedValue({
			rootCommandCount: 2,
			totalCommandCount: 3,
			entries: [
				{ path: ["status"], depth: 1, description: "status", parentPath: null },
				{
					path: ["deployment", "list"],
					depth: 2,
					description: "list deployments",
					parentPath: "deployment",
				},
				{ path: ["logs"], depth: 1, description: "logs", parentPath: null },
			],
		});
		vi.mocked(cli.getCliFeatureSupport).mockResolvedValue({
			logs: { args: { lines: true, filter: true } },
			deployment: { list: true },
		});
		vi.mocked(cli.listDeployments).mockResolvedValue({
			success: true,
			output: "[]",
		});

		const result = await bootstrapRailwayContextTool.handler({
			workspacePath: "/tmp/ws-ok",
			maxDepth: 2,
			includeDeployments: true,
		});
		const payload = JSON.parse(result.content[0].text);

		expect(payload.status).toBe("ok");
		expect(payload.cli.installed).toBe(true);
		expect(payload.cli.authenticated).toBe(true);
		expect(payload.link.projectLinked).toBe(true);
		expect(payload.services).toEqual(["api", "Postgres"]);
		expect(payload.environments).toEqual(["production"]);
		expect(payload.capabilities.supports.deploymentList).toBe(true);
		expect(payload.capabilities.commands).toContain("status");
		expect(payload.errors).toEqual([]);
	});

	it("returns degraded state with NO_LINKED_PROJECT when workspace is unlinked", async () => {
		const cli = await import("../cli");

		vi.mocked(cli.checkRailwayCliStatus).mockResolvedValue();
		vi.mocked(cli.getRailwayVersion).mockResolvedValue("4.30.2");
		vi.mocked(cli.runRailwayCommand).mockResolvedValue({
			stdout: "",
			stderr: "",
			output: "Project: \nEnvironment: production\nService: \n",
		});
		vi.mocked(cli.getLinkedProjectInfo).mockResolvedValue({
			success: false,
			error:
				"No Railway project is linked. Run 'railway link' to connect to a project",
		});
		vi.mocked(cli.getRailwayCliCatalog).mockResolvedValue({
			rootCommandCount: 1,
			totalCommandCount: 1,
			entries: [
				{ path: ["status"], depth: 1, description: "status", parentPath: null },
			],
		});
		vi.mocked(cli.getCliFeatureSupport).mockResolvedValue({
			logs: { args: { lines: true, filter: true } },
			deployment: { list: true },
		});

		const result = await bootstrapRailwayContextTool.handler({
			workspacePath: "/tmp/ws-missing-link",
			maxDepth: 2,
			includeDeployments: false,
		});
		const payload = JSON.parse(result.content[0].text);

		expect(payload.status).toBe("degraded");
		expect(payload.link.projectLinked).toBe(false);
		expect(
			payload.errors.some(
				(error: { code: string }) => error.code === "NO_LINKED_PROJECT",
			),
		).toBe(true);
		expect(
			payload.recommendedNextActions.some((item: string) =>
				item.toLowerCase().includes("link"),
			),
		).toBe(true);
	});
});
