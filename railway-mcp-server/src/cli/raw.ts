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

	constructor({
		command,
		stdout,
		stderr,
		exitCode,
		timedOut = false,
		message,
	}: {
		command: string;
		stdout: string;
		stderr: string;
		exitCode: number | null;
		timedOut?: boolean;
		message?: string;
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
	}
}

export const runRailwayArgsCommand = async (
	args: string[],
	options: RunRailwayArgsOptions = {},
): Promise<RailwayCommandResult> => {
	const {
		cwd,
		timeoutMs = 120_000,
		allowNonZeroExit = false,
	} = options;

	const normalizedArgs = args.filter(Boolean);
	const command = `railway ${normalizedArgs.join(" ")}`.trim();

	return new Promise<RailwayCommandResult>((resolve, reject) => {
		const start = Date.now();
		let stdout = "";
		let stderr = "";
		let timedOut = false;

		const child = spawn("railway", normalizedArgs, {
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

			reject(
				new RailwayCommandError({
					command,
					stdout,
					stderr,
					exitCode: null,
					message: `Failed to run Railway CLI command: ${error.message}`,
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

export const normalizeRailwayCommand = (command: string): string[] => {
	const parts = command
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);

	if (parts[0]?.toLowerCase() === "railway") {
		return parts.slice(1);
	}

	return parts;
};
