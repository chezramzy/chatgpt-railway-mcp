import { spawn } from "node:child_process";

export type RunRailwayArgsOptions = {
	cwd?: string;
	timeoutMs?: number;
	allowNonZeroExit?: boolean;
};

export type RailwayCommandResult = {
	command: string;
	stdout: string;
	stderr: string;
	output: string;
	exitCode: number;
	durationMs: number;
	timedOut: boolean;
};

export class RailwayCommandError extends Error {
	command: string;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
	code?: string;

	constructor({
		command,
		stdout,
		stderr,
		exitCode,
		timedOut = false,
		message,
		code,
	}: {
		command: string;
		stdout: string;
		stderr: string;
		exitCode: number | null;
		timedOut?: boolean;
		message?: string;
		code?: string;
	}) {
		super(
			message ||
				`Railway command failed (exit=${exitCode ?? "null"}): ${command}`,
		);
		this.name = "RailwayCommandError";
		this.command = command;
		this.stdout = stdout;
		this.stderr = stderr;
		this.exitCode = exitCode;
		this.timedOut = timedOut;
		this.code = code;
	}
}

export const runRailwayArgsCommand = async (
	args: string[],
	options: RunRailwayArgsOptions = {},
): Promise<RailwayCommandResult> => {
	const { cwd, timeoutMs = 120_000, allowNonZeroExit = false } = options;

	const normalizedArgs = args.filter(Boolean);
	const command = `railway ${normalizedArgs.join(" ")}`.trim();
	const spawnTarget =
		process.platform === "win32"
			? {
					command: process.env.ComSpec || "cmd.exe",
					args: ["/d", "/s", "/c", "railway", ...normalizedArgs],
				}
			: {
					command: "railway",
					args: normalizedArgs,
				};

	return new Promise<RailwayCommandResult>((resolve, reject) => {
		const start = Date.now();
		let stdout = "";
		let stderr = "";
		let timedOut = false;

		const child = spawn(spawnTarget.command, spawnTarget.args, {
			cwd,
			env: process.env,
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);

		child.stdout.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});

		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});

		child.on("error", (error) => {
			clearTimeout(timer);
			const spawnError = error as NodeJS.ErrnoException;

			reject(
				new RailwayCommandError({
					command,
					stdout,
					stderr,
					exitCode: null,
					code: spawnError.code,
					message: `Failed to run Railway CLI command: ${spawnError.message}`,
				}),
			);
		});

		child.on("close", (exitCode) => {
			clearTimeout(timer);

			const result: RailwayCommandResult = {
				command,
				stdout,
				stderr,
				output: stdout + stderr,
				exitCode: exitCode ?? -1,
				durationMs: Date.now() - start,
				timedOut,
			};

			if (timedOut) {
				reject(
					new RailwayCommandError({
						command,
						stdout,
						stderr,
						exitCode,
						timedOut: true,
						message: `Railway command timed out after ${timeoutMs}ms: ${command}`,
					}),
				);
				return;
			}

			if ((exitCode ?? 1) !== 0 && !allowNonZeroExit) {
				reject(
					new RailwayCommandError({
						command,
						stdout,
						stderr,
						exitCode,
					}),
				);
				return;
			}

			resolve(result);
		});
	});
};

export const splitCommandArgs = (command: string): string[] => {
	const args: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escapeNext = false;

	for (let index = 0; index < command.length; index++) {
		const char = command[index];

		if (escapeNext) {
			current += char;
			escapeNext = false;
			continue;
		}

		if (quote === null) {
			if (char === "\\" || char === "`") {
				escapeNext = true;
				continue;
			}

			if (char === "'" || char === '"') {
				quote = char;
				continue;
			}

			if (/\s/.test(char)) {
				if (current.length > 0) {
					args.push(current);
					current = "";
				}
				continue;
			}

			current += char;
			continue;
		}

		if (char === quote) {
			quote = null;
			continue;
		}

		if (quote === '"' && char === "\\") {
			const next = command[index + 1];
			if (next !== undefined) {
				current += next;
				index += 1;
				continue;
			}
		}

		current += char;
	}

	if (escapeNext) {
		current += "\\";
	}

	if (current.length > 0) {
		args.push(current);
	}

	return args;
};

export const normalizeRailwayCommand = (command: string): string[] => {
	const parts = splitCommandArgs(command.trim());

	if (parts[0]?.toLowerCase() === "railway") {
		return parts.slice(1);
	}

	return parts;
};
