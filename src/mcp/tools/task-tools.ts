import type { Env } from '../../types/env';
import { D1Client } from '../../core/d1';

/**
 * Task management tools - admin access
 */

export interface Task {
  id: string;
  name: string;
  description: string;
  cron: string;
  action: string;
  params: string;
  enabled: number;
  channel_id: string;
  guild_id: string;
  category: string | null;
  format: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
  last_run: string | null;
  last_status: string | null;
  run_count: number;
}

export interface CreateTaskArgs {
  name: string;
  description?: string;
  cron: string;
  action: string;
  params?: Record<string, unknown>;
  channelId: string;
  guildId: string;
  category?: string;
  format?: string;
  timezone?: string;
}

export interface ToggleTaskArgs {
  taskId: string;
  enabled: boolean;
}

export interface DeleteTaskArgs {
  taskId: string;
}

/**
 * List all scheduled tasks
 */
export async function listTasks(env: Env): Promise<{
  count: number;
  tasks: Task[];
}> {
  const db = new D1Client(env);

  const tasks = await db.query<Task>(
    'SELECT * FROM scheduled_tasks ORDER BY enabled DESC, name ASC'
  );

  return {
    count: tasks.length,
    tasks,
  };
}

/**
 * Create a new scheduled task
 */
export async function createTask(
  args: CreateTaskArgs,
  env: Env
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const db = new D1Client(env);

  // Validate cron expression (basic check)
  if (!isValidCron(args.cron)) {
    return {
      success: false,
      error: 'Invalid cron expression',
    };
  }

  // Generate task ID
  const taskId = crypto.randomUUID();

  try {
    await db.execute(
      `INSERT INTO scheduled_tasks
       (id, name, description, cron, action, params, channel_id, guild_id, category, format, timezone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      args.name,
      args.description ?? '',
      args.cron,
      args.action,
      JSON.stringify(args.params ?? {}),
      args.channelId,
      args.guildId,
      args.category ?? null,
      args.format ?? null,
      args.timezone ?? 'Asia/Jakarta'
    );

    return {
      success: true,
      taskId,
    };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }
}

/**
 * Toggle task enabled/disabled
 */
export async function toggleTask(
  args: ToggleTaskArgs,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const db = new D1Client(env);

  try {
    const result = await db.execute(
      `UPDATE scheduled_tasks
       SET enabled = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      args.enabled ? 1 : 0,
      args.taskId
    );

    if (result.changes === 0) {
      return {
        success: false,
        error: 'Task not found',
      };
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }
}

/**
 * Delete a scheduled task
 */
export async function deleteTask(
  args: DeleteTaskArgs,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const db = new D1Client(env);

  try {
    const result = await db.execute(
      'DELETE FROM scheduled_tasks WHERE id = ?',
      args.taskId
    );

    if (result.changes === 0) {
      return {
        success: false,
        error: 'Task not found',
      };
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
    };
  }
}

/**
 * Get task execution logs
 */
export async function getTaskLogs(
  taskId: string,
  limit: number,
  env: Env
) {
  const db = new D1Client(env);

  const logs = await db.query<{
    id: string;
    task_name: string;
    timestamp: string;
    status: string;
    message: string;
    error_code: string | null;
    duration_ms: number | null;
    trace_id: string | null;
  }>(
    `SELECT * FROM task_logs
     WHERE task_id = ?
     ORDER BY timestamp DESC
     LIMIT ?`,
    taskId,
    limit
  );

  return {
    taskId,
    count: logs.length,
    logs,
  };
}

/**
 * Basic cron validation (checks format, not semantics)
 */
function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  
  // Standard cron: 5 parts (minute hour day month weekday)
  // Extended cron: 6 parts (second minute hour day month weekday)
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }

  // Check each part is valid (number, *, /, -, or comma-separated)
  const validPattern = /^(\*|[0-9\-,/]+)$/;
  return parts.every((part) => validPattern.test(part));
}
