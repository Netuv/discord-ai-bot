/**
 * storage.ts — KV task CRUD operations
 * v6.0 — All task persistence via Scheduler KV
 */

import type { Env } from '../../types/env';
import type { ScheduledTask } from '../../types/scheduler';

const KV_TASKS_KEY = 'scheduler:tasks';

async function getRawTaskList(env: Env): Promise<ScheduledTask[]> {
	try {
		const raw = await env.SCHEDULER_KV.get(KV_TASKS_KEY, 'text');
		return raw ? JSON.parse(raw) : [];
	} catch {
		return [];
	}
}

async function saveTaskList(env: Env, tasks: ScheduledTask[]): Promise<void> {
	await env.SCHEDULER_KV.put(KV_TASKS_KEY, JSON.stringify(tasks));
}

export async function getTasks(env: Env): Promise<ScheduledTask[]> {
	return getRawTaskList(env);
}

export async function getTask(env: Env, taskId: string): Promise<ScheduledTask | null> {
	const tasks = await getRawTaskList(env);
	return tasks.find(t => t.id === taskId) || null;
}

export async function addTask(env: Env, input: ScheduledTask): Promise<ScheduledTask> {
	const tasks = await getRawTaskList(env);
	const task: ScheduledTask = {
		...input,
		id: crypto.randomUUID().slice(0, 8),
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		last_run: null,
		last_status: null,
		run_count: 0,
	};
	tasks.push(task);
	await saveTaskList(env, tasks);
	return task;
}

export async function updateTask(
	env: Env,
	taskId: string,
	updates: Partial<ScheduledTask>,
): Promise<ScheduledTask | null> {
	const tasks = await getRawTaskList(env);
	const idx = tasks.findIndex(t => t.id === taskId);
	if (idx === -1) return null;
	tasks[idx] = {
		...tasks[idx],
		...updates,
		id: tasks[idx].id,
		updated_at: new Date().toISOString(),
	};
	await saveTaskList(env, tasks);
	return tasks[idx];
}

export async function deleteTask(env: Env, taskId: string): Promise<boolean> {
	const tasks = await getRawTaskList(env);
	const filtered = tasks.filter(t => t.id !== taskId);
	if (filtered.length === tasks.length) return false;
	await saveTaskList(env, filtered);
	return true;
}

export async function clearAllTasks(env: Env): Promise<number> {
	const tasks = await getRawTaskList(env);
	await saveTaskList(env, []);
	return tasks.length;
}
