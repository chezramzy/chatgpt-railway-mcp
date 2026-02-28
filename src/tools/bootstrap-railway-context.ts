import z from "zod";
import {
	checkRailwayCliStatus,
	getCliFeatureSupport,
	getLinkedProjectInfo,
	getRailwayCliCatalog,
	getRailwayServices,
	getRailwayVersion,
	listDeployments,
	runRailwayCommand,
} from "../cli";
import {
	classifyRailwayError,
	getRailwayErrorInfo,
	type RailwayErrorCode,
	type RailwayErrorInfo,
} from "../cli/error-handling";
import { createToolResponse } from "../utils";

const CACHE_TTL_MS = 60_000;

type BootstrapContextResponse = {
	status: "ok" | "degraded" | "failed";
	cli: {
		installed: boolean;
		version?: string;
		authenticated: boolean;
	};
	link: {
		projectLinked: boolean;
		projectName?: string;
		environmentName?: string;
		serviceName?: string;
	};
	services: string[];
	environments: string[];
	capabilities: {
		commands: string[];
		supports: {
			deploymentList: boolean;
			logLines: boolean;
			logFilter: boolean;
		};
	};
	recommendedNextActions: string[];
	errors: Array<{
		code: RailwayErrorCode;
		message: string;
		nextStep?: string;
	}>;
};

const cache = new Map<
	string,
	{
		expiresAt: number;
		value: BootstrapContextResponse;
	}
>();

const parseStatusLine = (label: string, output: string) => {
	const regex = new RegExp(`^${label}:\\s+(.+)$`, "im");
	return output.match(regex)?.[1]?.trim();
};

const appendError = (
	errors: BootstrapContextResponse["errors"],
	error: RailwayErrorInfo,
) => {
	const exists = errors.some(
		(entry) => entry.code === error.code && entry.message === error.message,
	);

	if (!exists) {
		errors.push({
			code: error.code,
			message: error.message,
			nextStep: error.nextStep,
		});
	}
};

const buildRecommendations = (context: BootstrapContextResponse) => {
	const recommendations: string[] = [];
	const errorCodes = new Set(context.errors.map((error) => error.code));

	if (errorCodes.has("CLI_NOT_FOUND")) {
		recommendations.push(
			"Install Railway CLI and confirm it is available in PATH via `railway --version`.",
		);
		return recommendations;
	}

	if (errorCodes.has("CLI_UNAUTHORIZED")) {
		recommendations.push(
			"Authenticate Railway CLI (`railway login`) or set a valid RAILWAY_TOKEN in this runtime.",
		);
	}

	if (!context.link.projectLinked) {
		recommendations.push(
			"Link or create a project first (`create-project-and-link` or `railway link`).",
		);
	}

	if (context.link.projectLinked && context.services.length === 0) {
		recommendations.push(
			"Create a service (`deploy-template`, `railway add`, or `deploy`).",
		);
	}

	if (context.link.projectLinked && context.services.length > 0) {
		recommendations.push(
			"Choose a service and continue with targeted actions (`link-service`, `get-logs`, `set-variables`).",
		);
	}

	if (recommendations.length === 0) {
		recommendations.push(
			"Run your desired action directly; context is healthy and linked.",
		);
	}

	return recommendations;
};

const computeStatus = (
	response: Omit<BootstrapContextResponse, "status" | "recommendedNextActions">,
): BootstrapContextResponse["status"] => {
	const hasCriticalError = response.errors.some(
		(error) =>
			error.code === "CLI_NOT_FOUND" || error.code === "CLI_UNAUTHORIZED",
	);
	if (hasCriticalError) {
		return "failed";
	}

	if (response.errors.length > 0 || !response.link.projectLinked) {
		return "degraded";
	}

	return "ok";
};

export const bootstrapRailwayContextTool = {
	name: "bootstrap-railway-context",
	title: "Bootstrap Railway Context",
	description:
		"One-shot LLM preflight that discovers Railway CLI status, project link context, services, environments, and capability support.",
	inputSchema: {
		workspacePath: z
			.string()
			.describe("The workspace path used for Railway CLI context resolution."),
		maxDepth: z
			.number()
			.int()
			.min(1)
			.max(4)
			.optional()
			.describe(
				"Maximum recursion depth when discovering Railway CLI commands. Default: 2.",
			),
		includeDeployments: z
			.boolean()
			.optional()
			.describe(
				"Whether to attempt deployment listing as part of preflight validation.",
			),
	},
	handler: async ({
		workspacePath,
		maxDepth,
		includeDeployments,
	}: {
		workspacePath: string;
		maxDepth?: number;
		includeDeployments?: boolean;
	}) => {
		const cached = cache.get(workspacePath);
		if (cached && cached.expiresAt > Date.now()) {
			return createToolResponse(JSON.stringify(cached.value, null, 2));
		}

		const response: Omit<
			BootstrapContextResponse,
			"status" | "recommendedNextActions"
		> = {
			cli: {
				installed: false,
				authenticated: false,
			},
			link: {
				projectLinked: false,
			},
			services: [],
			environments: [],
			capabilities: {
				commands: [],
				supports: {
					deploymentList: false,
					logLines: false,
					logFilter: false,
				},
			},
			errors: [],
		};

		try {
			await checkRailwayCliStatus();
			response.cli.installed = true;
			response.cli.authenticated = true;
		} catch (error: unknown) {
			appendError(response.errors, getRailwayErrorInfo(error));

			// Best effort: if we got a coded CLI error, mark flags accordingly.
			const info = getRailwayErrorInfo(error);
			if (info.code !== "CLI_NOT_FOUND") {
				response.cli.installed = true;
			}
			if (info.code !== "CLI_UNAUTHORIZED") {
				response.cli.authenticated = true;
			}
		}

		if (response.cli.installed) {
			response.cli.version = (await getRailwayVersion()) || undefined;
		}

		if (response.cli.installed && response.cli.authenticated) {
			try {
				const { output } = await runRailwayCommand(
					"railway status",
					workspacePath,
				);
				response.link.projectName =
					parseStatusLine("Project", output) || response.link.projectName;
				response.link.environmentName =
					parseStatusLine("Environment", output) ||
					response.link.environmentName;
				response.link.serviceName =
					parseStatusLine("Service", output) || response.link.serviceName;
			} catch (error: unknown) {
				appendError(
					response.errors,
					getRailwayErrorInfo(classifyRailwayError(error, "railway status")),
				);
			}

			const linked = await getLinkedProjectInfo({ workspacePath });
			if (linked.success && linked.project) {
				response.link.projectLinked = true;
				response.link.projectName =
					linked.project.name || response.link.projectName;

				response.environments =
					linked.project.environments?.edges?.map((edge) => edge.node.name) ||
					[];

				const linkedServices =
					linked.project.services?.edges?.map((edge) => edge.node.name) || [];
				response.services = linkedServices;
			} else {
				appendError(
					response.errors,
					getRailwayErrorInfo(
						classifyRailwayError(
							new Error(
								linked.error ||
									"No Railway project is linked. Run 'railway link' to connect to a project",
							),
							"railway status --json",
						),
					),
				);
			}

			if (response.link.projectLinked) {
				const servicesResult = await getRailwayServices({ workspacePath });
				if (servicesResult.success && servicesResult.services) {
					response.services = servicesResult.services;
				} else if (!servicesResult.success) {
					appendError(
						response.errors,
						getRailwayErrorInfo(
							classifyRailwayError(
								new Error(servicesResult.error || "Failed to list services"),
								"railway status --json",
							),
						),
					);
				}
			}
		}

		try {
			const catalog = await getRailwayCliCatalog({
				maxDepth: maxDepth || 2,
			});
			response.capabilities.commands = catalog.entries.map((entry) =>
				entry.path.join(" "),
			);
		} catch (error: unknown) {
			appendError(
				response.errors,
				getRailwayErrorInfo(classifyRailwayError(error, "railway --help")),
			);
		}

		try {
			const features = await getCliFeatureSupport();
			response.capabilities.supports.deploymentList = features.deployment.list;
			response.capabilities.supports.logLines = features.logs.args.lines;
			response.capabilities.supports.logFilter = features.logs.args.filter;

			if (
				includeDeployments &&
				features.deployment.list &&
				response.link.projectLinked
			) {
				const deployments = await listDeployments({
					workspacePath,
					json: true,
					limit: 5,
				});

				if (!deployments.success) {
					appendError(
						response.errors,
						getRailwayErrorInfo(
							classifyRailwayError(
								new Error(deployments.error),
								"railway deployment list --json",
							),
						),
					);
				}
			}
		} catch (error: unknown) {
			appendError(
				response.errors,
				getRailwayErrorInfo(classifyRailwayError(error, "railway --version")),
			);
		}

		const finalResponse: BootstrapContextResponse = {
			...response,
			status: computeStatus(response),
			recommendedNextActions: buildRecommendations({
				...response,
				status: "degraded",
				recommendedNextActions: [],
			}),
		};

		cache.set(workspacePath, {
			expiresAt: Date.now() + CACHE_TTL_MS,
			value: finalResponse,
		});

		return createToolResponse(JSON.stringify(finalResponse, null, 2));
	},
};
