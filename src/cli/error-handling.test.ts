import { describe, expect, it } from "vitest";
import {
	analyzeRailwayError,
	classifyRailwayError,
	getRailwayErrorInfo,
	RailwayCliError,
} from "./error-handling";

describe("Railway error handling", () => {
	it("maps ENOENT spawn failures to CLI_NOT_FOUND", () => {
		const error = classifyRailwayError(
			{
				code: "ENOENT",
				message: "spawn railway ENOENT",
			},
			"railway --version",
		);

		expect(error).toBeInstanceOf(RailwayCliError);
		expect(error.code).toBe("CLI_NOT_FOUND");
		expect(error.message).toContain("[CLI_NOT_FOUND]");
	});

	it("maps unauthorized output to CLI_UNAUTHORIZED", () => {
		const error = classifyRailwayError(
			{
				stderr:
					"Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource.",
			},
			"railway whoami",
		);

		expect(error.code).toBe("CLI_UNAUTHORIZED");
	});

	it("maps unlinked project errors to NO_LINKED_PROJECT", () => {
		const error = classifyRailwayError(
			{
				stderr:
					"No linked project found. Run railway link to connect to a project",
			},
			"railway status --json",
		);

		expect(error.code).toBe("NO_LINKED_PROJECT");
	});

	it("maps service resolution failures to SERVICE_NOT_FOUND", () => {
		const error = classifyRailwayError(
			{
				stderr: 'Service "api" not found.',
			},
			"railway service api",
		);

		expect(error.code).toBe("SERVICE_NOT_FOUND");
	});

	it("maps policy/security blocks to POLICY_BLOCKED", () => {
		const error = classifyRailwayError(
			{
				message:
					"This action is blocked by platform security controls for this workspace.",
			},
			"railway logs",
		);

		expect(error.code).toBe("POLICY_BLOCKED");
	});

	it("preserves coded errors via analyzeRailwayError", () => {
		try {
			analyzeRailwayError(
				{
					stderr:
						"No linked project found. Run railway link to connect to a project",
				},
				"railway status --json",
			);
			throw new Error("Expected analyzeRailwayError to throw");
		} catch (error: unknown) {
			expect(error).toBeInstanceOf(RailwayCliError);
			const info = getRailwayErrorInfo(error);
			expect(info.code).toBe("NO_LINKED_PROJECT");
		}
	});
});
