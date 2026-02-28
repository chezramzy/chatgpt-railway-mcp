export const ERROR_PATTERNS = {
	UNAUTHORIZED: /Unauthorized\. Please login with `railway login`/,
	INVALID_TOKEN: /Unauthorized/,
	NO_LINKED_PROJECT:
		/No linked project found\. Run railway link to connect to a project/,
	PROJECT_NOT_FOUND:
		/Project not found\. Run `railway link` to connect to a project\./,
	PROJECT_DELETED:
		/Project is deleted\. Run `railway link` to connect to a project\./,
	ENVIRONMENT_DELETED:
		/Environment is deleted\. Run `railway environment` to connect to an environment\./,
	SERVICE_NOT_FOUND: /Service "[^"]+" not found\./,
	NO_SERVICES: /Project has no services\./,
	NO_SERVICE_LINKED:
		/No service linked\nRun `railway service` to link a service/,
	NO_PROJECTS: /No projects found\. Run `railway init` to create a new project/,
	POLICY_BLOCKED:
		/(blocked by.*security|blocked by.*policy|access denied by policy|forbidden by policy|security controls)/i,
} as const;

export type RailwayErrorCode =
	| "CLI_NOT_FOUND"
	| "CLI_UNAUTHORIZED"
	| "NO_LINKED_PROJECT"
	| "SERVICE_NOT_FOUND"
	| "POLICY_BLOCKED"
	| "UNKNOWN_ERROR";

export type RailwayErrorInfo = {
	code: RailwayErrorCode;
	message: string;
	nextStep?: string;
};

type RailwayError = {
	code?: string;
	stdout?: string;
	stderr?: string;
	message?: string;
};

export class RailwayCliError extends Error {
	code: RailwayErrorCode;
	nextStep?: string;

	constructor({ code, message, nextStep }: RailwayErrorInfo) {
		super(message);
		this.name = "RailwayCliError";
		this.code = code;
		this.nextStep = nextStep;
	}
}

const withCode = (info: RailwayErrorInfo) => {
	return new RailwayCliError({
		...info,
		message: `[${info.code}] ${info.message}`,
	});
};

export const classifyRailwayError = (
	error: unknown,
	command: string,
): RailwayCliError => {
	if (error instanceof RailwayCliError) {
		return error;
	}

	const err = error as RailwayError;
	const output = `${err.stdout || ""}${err.stderr || ""}`;
	const fullMessage = `${output}\n${err.message || ""}`.trim();

	if (
		err.code === "ENOENT" ||
		/(\bspawn\b.*\bENOENT\b)|(\bENOENT\b.*\brailway\b)/i.test(fullMessage)
	) {
		return withCode({
			code: "CLI_NOT_FOUND",
			message:
				"Railway CLI is not installed or not available in PATH for this runtime.",
			nextStep:
				"Install Railway CLI and verify with `railway --version` in the same runtime environment.",
		});
	}

	if (
		ERROR_PATTERNS.UNAUTHORIZED.test(fullMessage) ||
		ERROR_PATTERNS.INVALID_TOKEN.test(fullMessage) ||
		/not logged in|invalid or expired .*token/i.test(fullMessage)
	) {
		return withCode({
			code: "CLI_UNAUTHORIZED",
			message: "Railway CLI is not authenticated or token is invalid/expired.",
			nextStep: "Run `railway login` (or set a valid RAILWAY_TOKEN) and retry.",
		});
	}

	if (
		ERROR_PATTERNS.NO_LINKED_PROJECT.test(fullMessage) ||
		/no railway project is linked/i.test(fullMessage)
	) {
		return withCode({
			code: "NO_LINKED_PROJECT",
			message: "No Railway project is linked for this workspace context.",
			nextStep:
				"Run `railway link` or use `create-project-and-link` before service-level actions.",
		});
	}

	if (
		ERROR_PATTERNS.SERVICE_NOT_FOUND.test(fullMessage) ||
		/no service linked/i.test(fullMessage)
	) {
		return withCode({
			code: "SERVICE_NOT_FOUND",
			message: "Railway service could not be resolved in the current context.",
			nextStep:
				"Run `list-services` and then `link-service`, or pass `--service` explicitly.",
		});
	}

	if (ERROR_PATTERNS.POLICY_BLOCKED.test(fullMessage)) {
		return withCode({
			code: "POLICY_BLOCKED",
			message: "Action blocked by platform security/policy controls.",
			nextStep:
				"Adjust platform policy/permissions or run this action in an allowed environment.",
		});
	}

	if (err.message) {
		return withCode({
			code: "UNKNOWN_ERROR",
			message: `Railway CLI error while running '${command}': ${err.message}`,
			nextStep: "Inspect stderr output and rerun with verbose logging.",
		});
	}

	return withCode({
		code: "UNKNOWN_ERROR",
		message: `Railway CLI command '${command}' failed with an unknown error.`,
		nextStep:
			"Inspect runtime logs and verify CLI availability/authentication.",
	});
};

export const getRailwayErrorInfo = (error: unknown): RailwayErrorInfo => {
	if (error instanceof RailwayCliError) {
		return {
			code: error.code,
			message: error.message,
			nextStep: error.nextStep,
		};
	}

	const message =
		error instanceof Error ? error.message : "Unknown Railway error";
	return {
		code: "UNKNOWN_ERROR",
		message,
	};
};

export const analyzeRailwayError = (error: unknown, command: string): never => {
	throw classifyRailwayError(error, command);
};
