import { describe, expect, it } from "vitest";
import { normalizeRailwayCommand, splitCommandArgs } from "./raw";

describe("splitCommandArgs", () => {
	it("parses basic railway commands", () => {
		expect(splitCommandArgs("railway --version")).toEqual([
			"railway",
			"--version",
		]);
	});

	it("parses quoted filter arguments", () => {
		expect(
			splitCommandArgs('railway logs --filter "error rate limit"'),
		).toEqual(["railway", "logs", "--filter", "error rate limit"]);
	});

	it("parses single-quoted arguments", () => {
		expect(splitCommandArgs("railway run --service 'My API'")).toEqual([
			"railway",
			"run",
			"--service",
			"My API",
		]);
	});
});

describe("normalizeRailwayCommand", () => {
	it("drops the leading railway token", () => {
		expect(normalizeRailwayCommand("railway status --json")).toEqual([
			"status",
			"--json",
		]);
	});

	it("keeps commands without the railway prefix", () => {
		expect(normalizeRailwayCommand("service link api")).toEqual([
			"service",
			"link",
			"api",
		]);
	});

	it("preserves quoted filter values as a single argument", () => {
		expect(
			normalizeRailwayCommand(
				'railway logs --deployment --filter "rate limit"',
			),
		).toEqual(["logs", "--deployment", "--filter", "rate limit"]);
	});
});
