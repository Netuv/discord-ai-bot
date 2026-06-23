/**
 * logging.ts — KV task log management
 * v6.0 — Append-only log per task
 */

import type { Env } from '../../types/env';
import type { TaskLogEntry } from '../../types/scheduler';

const KV_LOGS_PREFIX = 'scheduler:logs:';
const MAX_LOGS = 50;

export async function getTaskLogs(env: Env, taskId: string): Promise<TaskLogEntry[]> {
	try {
		const raw = await env.SCHEDULER_KV.get(`${KV_LOGS_PREFIX}${taskId}`, 'text');
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

export async function addLog(env: Env, log: TaskLogEntry): Promise<void> {
	const key = `${KV_LOGS_PREFIX}${log.task_id}`;
	let logs: TaskLogEntry[] = [];
	try {
		const raw = await env.SCHEDULER_KV.get(key, 'text');
		logs = raw ? JSON.parse(raw) : [];
	} catch {
		/* fresh */
	}
	logs.unshift(log);
	if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
	await env.SCHEDULER_KV.put(key, JSON.stringify(logs));
}
