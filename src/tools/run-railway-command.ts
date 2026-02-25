import z from "zod";
import { normalizeRailwayCommand, runRailwayArgsCommand } from "../cli";
import { RailwayCommandError } from "../cli/raw";
import { createToolResponse } from "../utils";

const MAX_OUTPUT_CHARS = 25_000;

const clipOutput = (value: string) => {
	if (value.length <= MAX_OUTPUT_CHARS) {
		return value;
	}

	const omitted = value.length - MAX_OUTPUT_CHARS;
	return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n... [${omitted} chars omitted]`;
};

export const runRailwayCommandTool = {
	name: "run-railway-command",
	title: "Run Railway CLI Command",
	description:
		"Run any Railway CLI command (full CLI passthrough). Use this when a specific MCP tool does not exist.",
	inputSchema: {
		command: z
			.string()
			.describe(
				"Railway command path, for example `list`, `service link`, `deployment list`, or `up`.",
			),
		args: z
			.array(z.string())
			.optional()
			.describe("Additional CLI arguments passed verbatim."),
		workspacePath: z
			.string()
			.optional()
			.describe(
				"Working directory for the CLI command. Default: current directory.",
			),
		timeoutMs: z
			.number()
			.int()
			.min(1000)
			.max(600000)
			.optional()
			.describe("Timeout in milliseconds. Default: 120000."),
		allowNonZeroExit: z
			.boolean()
			.optional()
			.describe("If true, return output even when command exits non-zero."),
		addJsonFlag: z
			.boolean()
			.optional()
			.describe("Append `--json` when not already present."),
		parseJsonOutput: z
			.boolean()
			.optional()
			.describe("Parse stdout as JSON and pretty print it when possible."),
	},
	handler: async ({
		command,
		args,
		workspacePath,
		timeoutMs,
		allowNonZeroExit,
		addJsonFlag,
		parseJsonOutput,
	}: {
		command: string;
		args?: string[];
		workspacePath?: string;
		timeoutMs?: number;
		allowNonZeroExit?: boolean;
		addJsonFlag?: boolean;
		parseJsonOutput?: boolean;
	}) => {
		try {
			const commandParts = normalizeRailwayCommand(command);
			if (commandParts.length === 0) {
				return createToolResponse(
					"Invalid command. Provide a non-empty Railway command path.",
				);
			}

			const fullArgs = [...commandParts, ...(args || [])];
			if (addJsonFlag && !fullArgs.includes("--json")) {
				fullArgs.push("--json");
			}

			const result = await runRailwayArgsCommand(fullArgs, {
				cwd: workspacePath,
				timeoutMs,
				allowNonZeroExit,
			});

			const lines = [
				`Command: ${result.command}`,
				`Exit code: ${result.exitCode}`,
				`Duration: ${result.durationMs}ms`,
				"",
			];

			if (parseJsonOutput) {
				try {
					const parsed = JSON.parse(result.stdout.trim());
					lines.push("Stdout (parsed JSON):");
					lines.push(JSON.stringify(parsed, null, 2));
				} catch {
					lines.push("Stdout (raw):");
					lines.push(clipOutput(result.stdout || "<empty>"));
				}
			} else {
				lines.push("Stdout:");
				lines.push(clipOutput(result.stdout || "<empty>"));
			}

			lines.push("");
			lines.push("Stderr:");
			lines.push(clipOutput(result.stderr || "<empty>"));

			return createToolResponse(lines.join("\n"));
		} catch (error: unknown) {
			if (error instanceof RailwayCommandError) {
				const lines = [
					"Railway command failed.",
					"",
					`Command: ${error.command}`,
					`Exit code: ${error.exitCode ?? "unknown"}`,
					`Timed out: ${error.timedOut ? "yes" : "no"}`,
					"",
					"Stdout:",
					clipOutput(error.stdout || "<empty>"),
					"",
					"Stderr:",
					clipOutput(error.stderr || "<empty>"),
				];

				return createToolResponse(lines.join("\n"));
			}

			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";

			return createToolResponse(
				["Railway command failed.", "", `Error: ${errorMessage}`].join("\n"),
			);
		}
	},
};
