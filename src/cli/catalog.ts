import { runRailwayArgsCommand } from "./raw";

export type RailwayCliCommandEntry = {
	path: string[];
	depth: number;
	description: string;
	parentPath: string | null;
};

export type RailwayCliCatalog = {
	rootCommandCount: number;
	totalCommandCount: number;
	entries: RailwayCliCommandEntry[];
};

const HELP_SECTION_STOP_HEADERS = new Set([
	"arguments:",
	"options:",
	"examples:",
]);

const parseCommandsFromHelp = (helpText: string) => {
	const lines = helpText.split(/\r?\n/);
	const commands: Array<{ name: string; description: string }> = [];

	let inCommandsSection = false;

	for (const rawLine of lines) {
		const line = rawLine.replace(/\t/g, "    ");
		const trimmed = line.trim();

		if (!inCommandsSection) {
			if (trimmed.toLowerCase() === "commands:") {
				inCommandsSection = true;
			}
			continue;
		}

		if (trimmed === "") {
			continue;
		}

		if (HELP_SECTION_STOP_HEADERS.has(trimmed.toLowerCase())) {
			break;
		}

		const match = line.match(/^\s{2,}([a-zA-Z0-9-]+)\s{2,}(.*)$/);
		if (!match) {
			continue;
		}

		const [, name, description] = match;
		commands.push({
			name,
			description: description.trim(),
		});
	}

	return commands;
};

export const getRailwayCliCatalog = async ({
	maxDepth = 3,
	timeoutMs = 20_000,
}: {
	maxDepth?: number;
	timeoutMs?: number;
} = {}): Promise<RailwayCliCatalog> => {
	const rootHelp = await runRailwayArgsCommand(["--help"], { timeoutMs });
	const rootCommands = parseCommandsFromHelp(
		rootHelp.stdout || rootHelp.output,
	);

	const entries: RailwayCliCommandEntry[] = [];
	const visited = new Set<string>();
	const queue: Array<{
		path: string[];
		depth: number;
		parentPath: string | null;
		description: string;
	}> = rootCommands.map((command) => ({
		path: [command.name],
		depth: 1,
		parentPath: null,
		description: command.description,
	}));

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}

		const key = current.path.join(" ");
		if (visited.has(key)) {
			continue;
		}
		visited.add(key);

		entries.push({
			path: current.path,
			depth: current.depth,
			parentPath: current.parentPath,
			description: current.description,
		});

		if (current.depth >= maxDepth) {
			continue;
		}

		try {
			const helpOutput = await runRailwayArgsCommand(
				[...current.path, "--help"],
				{
					timeoutMs,
				},
			);
			const children = parseCommandsFromHelp(
				helpOutput.stdout || helpOutput.output,
			);

			for (const child of children) {
				queue.push({
					path: [...current.path, child.name],
					depth: current.depth + 1,
					parentPath: current.path.join(" "),
					description: child.description,
				});
			}
		} catch {
			// Some command groups can fail to print help in restricted contexts.
			// We intentionally skip these and keep the rest of the catalog.
		}
	}

	return {
		rootCommandCount: rootCommands.length,
		totalCommandCount: entries.length,
		entries,
	};
};
