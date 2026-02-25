#!/usr/bin/env node
import {
	McpServer,
	type ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShape } from "zod";
import * as tools from "./tools";
import { getVersion } from "./utils";

type ToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: ZodRawShape;
	handler: ToolCallback<ZodRawShape>;
};

const startServer = async () => {
	const server = new McpServer(
		{
			name: "railway-mcp-server",
			title: "Railway MCP Server",
			version: getVersion(),
		},
		{
			capabilities: {
				logging: {},
			},
		},
	);

	const registeredTools = Object.values(tools) as ToolDefinition[];

	registeredTools.forEach((tool) => {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.inputSchema,
			},
			tool.handler,
		);
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
};

startServer().catch((error) => {
	console.error("Failed to start Railway MCP server:", error);
	process.exit(1);
});
