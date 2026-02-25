import { analyzeRailwayError } from "./error-handling";
import { normalizeRailwayCommand, runRailwayArgsCommand } from "./raw";

export const runRailwayCommand = async (command: string, cwd?: string) => {
	const args = normalizeRailwayCommand(command);
	if (args.length === 0) {
		throw new Error("Railway command is empty");
	}

	const result = await runRailwayArgsCommand(args, { cwd });
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		output: result.output,
	};
};

export const runRailwayJsonCommand = async (command: string, cwd?: string) => {
	const { stdout } = await runRailwayCommand(command, cwd);
	return JSON.parse(stdout.trim());
};

export const checkRailwayCliStatus = async (): Promise<void> => {
	try {
		await runRailwayCommand("railway --version");
		await runRailwayCommand("railway whoami");
	} catch (error: unknown) {
		return analyzeRailwayError(error, "railway whoami");
	}
};
