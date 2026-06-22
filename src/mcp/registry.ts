/**
 * registry.ts — Centralized tool registry for MCP
 * v5.0 — Single source of truth for all MCP tool definitions
 */

export interface ToolInputSchema { type: "object"; properties: Record<string, unknown>; required?: string[]; }
export interface ToolDefinition {
	description: string;
	inputSchema: ToolInputSchema;
	handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>;
}

const toolStore = new Map<string, ToolDefinition>();

export function registerTool(name: string, definition: ToolDefinition): void {
	if (toolStore.has(name)) return;
	toolStore.set(name, definition);
}

export function registerTools(definitions: Record<string, ToolDefinition>): void {
	for (const [name, def] of Object.entries(definitions)) registerTool(name, def);
}

export function getTool(name: string): ToolDefinition | undefined { return toolStore.get(name); }

export function getAllTools(): Record<string, ToolDefinition> {
	const result: Record<string, ToolDefinition> = {};
	for (const [name, def] of toolStore) result[name] = def;
	return result;
}

export function getToolNames(): string[] { return Array.from(toolStore.keys()); }

export function getOpenApiSpec(): Record<string, unknown> {
	const paths: Record<string, unknown> = {};
	const schemas: Record<string, unknown> = {};
	for (const [name, def] of toolStore) {
		const schemaName = `${name}Input`;
		schemas[schemaName] = { type: "object", properties: def.inputSchema.properties, ...(def.inputSchema.required ? { required: def.inputSchema.required } : {}) };
		paths[`/tools/${name}`] = { post: { summary: def.description, operationId: name, requestBody: { content: { "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } } } }, responses: { "200": { description: "Tool execution result", content: { "application/json": { schema: { type: "object", properties: { content: { type: "array", items: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } } } } } } } } } } } };
	}
	return { openapi: "3.1.0", info: { title: "Discord AI Bot MCP", version: "5.0.0" }, servers: [{ url: "" }], paths, components: { schemas } };
}
