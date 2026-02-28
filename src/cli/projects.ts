import {
	checkRailwayCliStatus,
	runRailwayCommand,
	runRailwayJsonCommand,
} from "./core";
import {
	analyzeRailwayError,
	classifyRailwayError,
	ERROR_PATTERNS,
} from "./error-handling";

export type RailwayProject = {
	id: string;
	name: string;
	team?: {
		name: string;
	};
	environments?: {
		edges?: Array<{
			node: {
				name: string;
			};
		}>;
	};
	services?: {
		edges?: Array<{
			node: {
				name: string;
			};
		}>;
	};
	createdAt: string;
	updatedAt: string;
};

export type GetLinkedProjectInfoOptions = {
	workspacePath: string;
};

export const getLinkedProjectInfo = async ({
	workspacePath,
}: GetLinkedProjectInfoOptions): Promise<{
	success: boolean;
	project?: RailwayProject;
	error?: string;
}> => {
	try {
		await checkRailwayCliStatus();
		const project = await runRailwayJsonCommand(
			"railway status --json",
			workspacePath,
		);

		if (!project || typeof project !== "object") {
			return { success: false, error: "Invalid response from Railway CLI" };
		}

		return { success: true, project: project as RailwayProject };
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Check if it's a "no linked project" error
		if (
			ERROR_PATTERNS.NO_LINKED_PROJECT.test(errorMessage) ||
			errorMessage.includes("[NO_LINKED_PROJECT]")
		) {
			return {
				success: false,
				error:
					"[NO_LINKED_PROJECT] No Railway project is linked. Run 'railway link' to connect to a project",
			};
		}

		return {
			success: false,
			error: classifyRailwayError(error, "railway status --json").message,
		};
	}
};

export const listRailwayProjects = async (): Promise<RailwayProject[]> => {
	try {
		await checkRailwayCliStatus();
		const projects = await runRailwayJsonCommand("railway list --json");

		if (!Array.isArray(projects)) {
			throw new Error("Unexpected response format from Railway CLI");
		}

		return projects;
	} catch (error: unknown) {
		return analyzeRailwayError(error, "railway list --json");
	}
};

export type CreateProjectOptions = {
	projectName: string;
	workspacePath: string;
};

const getDefaultWorkspace = async (): Promise<string | null> => {
	try {
		const whoami = await runRailwayJsonCommand("railway whoami --json");
		if (!whoami || typeof whoami !== "object") {
			return null;
		}

		const workspaces = (whoami as { workspaces?: Array<{ id?: string }> })
			.workspaces;
		if (!Array.isArray(workspaces) || workspaces.length === 0) {
			return null;
		}

		return workspaces[0]?.id || null;
	} catch {
		return null;
	}
};

export const createRailwayProject = async ({
	projectName,
	workspacePath,
}: CreateProjectOptions): Promise<string> => {
	try {
		await checkRailwayCliStatus();

		// Check if there's already a linked project
		const linkedProjectResult = await getLinkedProjectInfo({ workspacePath });
		if (linkedProjectResult.success && linkedProjectResult.project) {
			return "A Railway project is already linked to this workspace. No new project created.";
		}

		const workspaceId = await getDefaultWorkspace();
		const workspaceArg = workspaceId ? ` --workspace ${workspaceId}` : "";

		const { output: initOutput } = await runRailwayCommand(
			`railway init --name ${projectName}${workspaceArg}`,
			workspacePath,
		);
		const { output: linkOutput } = await runRailwayCommand(
			`railway link -p ${projectName}`,
			workspacePath,
		);

		return `${initOutput}\n${linkOutput}`;
	} catch (error: unknown) {
		return analyzeRailwayError(error, `railway init --name ${projectName}`);
	}
};
