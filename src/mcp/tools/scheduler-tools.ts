/**
 * scheduler-tools.ts — Scheduler MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { getTasks, getTask, addTask, updateTask, deleteTask, getTaskLogs, clearAllTasks } from '../../workers/scheduler';
import { makeTool } from './_helpers';

export function createSchedulerTools(): Record<string, ToolDefinition> {
	return {
		'scheduler-list': makeTool('List all scheduled tasks', {}, [], async () => {
			const tasks = await getTasks(getEnv());
			if (tasks.length === 0) return '📭 No scheduled tasks.';
			return `**📋 Scheduled Tasks (${tasks.length})**\n${tasks.map(t => `• **${t.name}** (${t.id}) — \`${t.cron}\` — ${t.enabled ? '✅' : '⏸️'} — ${t.action} — last: ${t.last_run || 'never'}`).join('\n')}`;
		}),
		'scheduler-add': makeTool('Add a new scheduled task', { name: { type: 'string' }, cron: { type: 'string' }, action: { type: 'string' }, channel_id: { type: 'string' }, guild_id: { type: 'string' }, description: { type: 'string' }, params: { type: 'string' } }, ['name', 'cron', 'action', 'channel_id', 'guild_id'], async (args) => {
			let params: Record<string, unknown> = {};
			if (args.params) { try { params = JSON.parse(String(args.params)); } catch { return '❌ Invalid params JSON.'; } }
			const task = await addTask(getEnv(), { name: String(args.name), description: String(args.description || args.name), cron: String(args.cron), action: String(args.action) as any, params, enabled: true, channel_id: String(args.channel_id), guild_id: String(args.guild_id) } as any);
			return `✅ Task **${task.name}** (${task.id}) created.`;
		}),
		'scheduler-remove': makeTool('Remove a scheduled task', { id: { type: 'string' } }, ['id'], async (args) => {
			const ok = await deleteTask(getEnv(), String(args.id));
			return ok ? `✅ Task ${args.id} deleted.` : `❌ Task not found.`;
		}),
	};
}
