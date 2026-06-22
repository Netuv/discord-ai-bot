/**
 * _helpers.ts — Shared MCP tool factory utilities
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { queueAction, formatPendingAction } from '../confirm';

export function makeTool(description: string, properties: Record<string, unknown>, required: string[], handler: (args: Record<string, unknown>) => Promise<string>, requiresConfirm = false, confirmDesc?: string): ToolDefinition {
	return {
		description, inputSchema: { type: 'object', properties, required },
		handler: requiresConfirm
			? requireConfirm(description.split('—')[0]?.trim() || description.slice(0, 40), confirmDesc || description, handler)
			: async (args) => ({ content: [{ type: 'text', text: await handler(args) }] }),
	};
}

function requireConfirm(actionName: string, description: string, handler: (args: Record<string, unknown>) => Promise<string>): ToolDefinition['handler'] {
	return async (args) => {
		const entry = queueAction(actionName, args, description, 1);
		return { content: [{ type: 'text', text: `⚠️ **Action requires confirmation!**\n\n${formatPendingAction(entry)}\n\nUse \`confirm-action\` tool with code \`${entry.code}\` to execute, or \`cancel-action\` to cancel.` }] };
	};
}

export function orFail<T>(val: T | null | undefined, msg: string): T {
	if (val === null || val === undefined) throw new Error(msg);
	return val;
}
