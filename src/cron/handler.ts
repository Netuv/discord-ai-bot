import type { Env } from '../types/env';
import { D1Client } from '../core/d1';
import { traceLog, setTraceId } from '../core/trace-logger';
import type { ContentBrief } from '../content/types/content';
import type { PipelineOverrides } from '../agent/types';
import { runArticlePipeline } from '../agent/orchestrator';

interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  action: string;
  params: string;
  enabled: number;
  channel_id: string;
  category: string | null;
  format: string | null;
  last_run: string | null;
}

/**
 * Cron handler - runs every 6 hours (0 * /6 * * *)
 * Checks for enabled tasks and triggers article generation
 */
export async function handleCron(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const traceId = crypto.randomUUID().slice(0, 8);
  setTraceId(traceId);

  const scheduledTime = new Date(event.scheduledTime).toISOString();
  traceLog('info', 'Cron', `Triggered at ${scheduledTime}`);

  const db = new D1Client(env);

  // Find all enabled tasks
  const tasks = await db.query<ScheduledTask>(
    `SELECT * FROM scheduled_tasks WHERE enabled = 1 ORDER BY last_run ASC NULLS FIRST`
  );

  if (tasks.length === 0) {
    traceLog('info', 'Cron', 'No enabled tasks found — using default channel fallback');
    const result = await runArticlePipeline(
      env.DISCORD_DEFAULT_CHANNEL_ID,
      'cron',
      env,
      ctx
    );
    traceLog('info', 'Cron', `Fallback article ${result.success ? 'succeeded' : 'failed'}`, {
      contentId: result.contentId,
      totalMs: result.totalMs,
    });
    return;
  }

  traceLog('info', 'Cron', `Found ${tasks.length} enabled task(s)`);

  // Process each task
  for (const task of tasks) {
    // Check if task is due — skip if ran within last 5h (cron is every 6h)
    if (task.last_run) {
      const lastRun = new Date(task.last_run);
      const hoursSince = (Date.now() - lastRun.getTime()) / 3600000;
      if (hoursSince < 5) {
        traceLog('debug', 'Cron', `Skipping task ${task.name} - ran ${hoursSince.toFixed(1)}h ago`);
        continue;
      }
    }

    try {
      if (task.action === 'generate-article') {
        traceLog('info', 'Cron', `Executing task: ${task.name}`, {
          taskId: task.id,
          channel: task.channel_id,
        });

        // Parse params
        const params = JSON.parse(task.params) as Record<string, unknown>;

        // Run pipeline with task overrides
        const result = await runArticlePipeline(
          task.channel_id,
          'cron',
          env,
          ctx,
          {
            category: task.category ?? (params['category'] as ContentBrief['category'] | undefined),
            format: task.format ?? (params['format'] as ContentBrief['format'] | undefined),
            topic: params['topic'] as string | undefined,
          } as PipelineOverrides
        );

        // Update task status in scheduled_tasks
        await db.execute(
          `UPDATE scheduled_tasks
           SET last_run = datetime('now'),
               last_status = ?,
               run_count = run_count + 1,
               updated_at = datetime('now')
           WHERE id = ?`,
          result.success ? 'success' : 'failed',
          task.id
        );

        // Log to task_logs (only columns that exist: task_id, task_name, status, message, duration_ms)
        await db.execute(
          `INSERT INTO task_logs (task_id, task_name, status, message, duration_ms)
           VALUES (?, ?, ?, ?, ?)`,
          task.id,
          task.name,
          result.success ? 'success' : 'failed',
          result.error?.message || 'Task completed successfully',
          result.totalMs
        );

        traceLog('info', 'Cron', `Task ${task.name} ${result.success ? 'succeeded' : 'failed'}`, {
          messageId: result.discordMessageId,
          totalMs: result.totalMs,
        });

      } else {
        traceLog('warn', 'Cron', `Unknown action: ${task.action} for task ${task.name}`);

        // Update status to failed for unknown actions
        await db.execute(
          `UPDATE scheduled_tasks SET last_run = datetime('now'), last_status = 'failed',
           updated_at = datetime('now') WHERE id = ?`,
          task.id
        );

        await db.execute(
          `INSERT INTO task_logs (task_id, task_name, status, message)
           VALUES (?, ?, ?, ?)`,
          task.id,
          task.name,
          'failed',
          `Unknown action: ${task.action}`
        );
      }

    } catch (e) {
      const error = e as Error;
      traceLog('error', 'Cron', `Task ${task.name} failed`, { error: error.message });

      // Mark task as failed
      await db.execute(
        `UPDATE scheduled_tasks SET last_run = datetime('now'), last_status = 'failed',
         updated_at = datetime('now') WHERE id = ?`,
        task.id
      ).catch(() => {});

      // Log failure (no error_code column in task_logs)
      await db.execute(
        `INSERT INTO task_logs (task_id, task_name, status, message)
         VALUES (?, ?, ?, ?)`,
        task.id,
        task.name,
        'failed',
        error.message
      ).catch(() => {});
    }
  }

  traceLog('info', 'Cron', `Cron execution complete`);
}
