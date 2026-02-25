import z from "zod";
import { getRailwayCliCatalog } from "../cli";
import { createToolResponse } from "../utils";

const formatCatalog = (
	entries: Array<{
		path: string[];
		depth: number;
		description: string;
	}>,
) => {
	const sorted = [...entries].sort((a, b) =>
		a.path.join(" ").localeCompare(b.path.join(" ")),
	);

	return sorted
		.map((entry) => {
			const indent = "  ".repeat(Math.max(0, entry.depth - 1));
			const command = entry.path.join(" ");
			const description = entry.description || "(no description)";
			return `${indent}- ${command} :: ${description}`;
		})
		.join("\n");
};

export const listCliCommandsTool = {
	name: "list-cli-commands",
	title: "List Railway CLI Commands",
	description:
		"Enumerate Railway CLI commands and subcommands discovered from `railway --help`.",
	inputSchema: {
		maxDepth: z
			.number()
			.int()
			.min(1)
			.max(5)
			.optional()
			.describe(
				"Recursion depth for subcommands. 1 lists root commands only. Default: 3.",
			),
		timeoutMs: z
			.number()
			.int()
			.min(1000)
			.max(120000)
			.optional()
			.describe("Timeout per CLI help call in milliseconds. Default: 20000."),
	},
	handler: async ({
		maxDepth,
		timeoutMs,
	}: {
		maxDepth?: number;
		timeoutMs?: number;
	}) => {
		try {
			const catalog = await getRailwayCliCatalog({ maxDepth, timeoutMs });
			const formatted = formatCatalog(catalog.entries);

			return createToolResponse(
				[
					`Railway CLI command catalog (depth=${maxDepth ?? 3})`,
					`Root commands: ${catalog.rootCommandCount}`,
					`Discovered command paths: ${catalog.totalCommandCount}`,
					"",
					formatted || "(no commands discovered)",
				].join("\n"),
			);
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";

			return createToolResponse(
				[
					"Failed to list Railway CLI commands.",
					"",
					`Error: ${errorMessage}`,
					"",
					"Next steps:",
					"- Ensure Railway CLI is installed (`railway --version`).",
					"- Ensure the MCP runtime can execute Railway CLI.",
				].join("\n"),
			);
		}
	},
};
