import type { Env } from '../types/env';
import type { ContentBrief } from '../content/types/content';
import { D1Client } from '../core/d1';
import { traceLog, setTraceId } from '../core/trace-logger';
import { runArticlePipeline } from '../agent/orchestrator';
import type { PipelineOverrides } from '../agent/types';
import { moveToDLQ } from './dead-letter';

export interface QueueMessage {
  taskId: string;
  taskName: string;
  action: string;
  params: Record<string, unknown>;
  channelId: string;
  traceId: string;
  enqueuedAt: string;
}

/**
 * Queue consumer handler - processes messages from Cloudflare Queue
 * Max retries handled automatically by Cloudflare Queues
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  traceLog('info', 'Queue', `Processing batch: ${batch.messages.length} message(s)`);

  for (const msg of batch.messages) {
    const { taskId, taskName, action, params, channelId, traceId } = msg.body;
    setTraceId(traceId);

    traceLog('info', 'Queue', `Processing message`, {
      taskId,
      action,
      attempt: msg.attempts,
    });

    try {
      await executeTaskAction(action, params, channelId, env, ctx);

      // Update task status to success
      await updateTaskStatus(taskId, 'success', null, env);

      // Acknowledge message (removes from queue)
      msg.ack();

      traceLog('info', 'Queue', `Message processed successfully`, { taskId });
    } catch (e) {
      const error = e as Error;
      traceLog('error', 'Queue', `Message processing failed`, {
        taskId,
        error: error.message,
        attempt: msg.attempts,
      });

      // Update task status to failed
      await updateTaskStatus(taskId, 'failed', error.message, env);

      // Check if max retries reached (Cloudflare Queues default is 3)
      if (msg.attempts >= 3) {
        traceLog('error', 'Queue', `Max retries reached, moving to DLQ`, {
          taskId,
          attempts: msg.attempts,
        });

        // Move to dead letter queue
        await moveToDLQ(taskId, msg.body, error.message, env);

        // Ack to prevent infinite retries
        msg.ack();
      } else {
        // Retry message (will be redelivered)
        msg.retry();
        traceLog('info', 'Queue', `Message will be retried`, {
          taskId,
          nextAttempt: msg.attempts + 1,
        });
      }
    }
  }

  traceLog('info', 'Queue', `Batch processing complete`);
}

/**
 * Execute task action based on type
 */
async function executeTaskAction(
  action: string,
  params: Record<string, unknown>,
  channelId: string,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  switch (action) {
    case 'generate-article': {
      const result = await runArticlePipeline(
        channelId,
        'cron',
        env,
        ctx,
        {
          category: params['category'] as ContentBrief['category'] | undefined,
          format: params['format'] as ContentBrief['format'] | undefined,
          topic: params['topic'] as string | undefined,
        } as PipelineOverrides
      );

      if (!result.success) {
        throw new Error(result.error?.message || 'Pipeline failed');
      }

      break;
    }

    case 'send-message': {
      // TODO: Implement direct message sending
      traceLog('warn', 'Queue', 'send-message action not yet implemented');
      break;
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Update task status in database
 */
async function updateTaskStatus(
  taskId: string,
  status: 'success' | 'failed',
  errorMessage: string | null,
  env: Env
): Promise<void> {
  const db = new D1Client(env);

  await db.execute(
    `UPDATE scheduled_tasks
     SET last_status = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    status,
    taskId
  );

  // Log to task_logs
  await db.execute(
    `INSERT INTO task_logs (task_id, task_name, status, message)
     SELECT id, name, ?, ? FROM scheduled_tasks WHERE id = ?`,
    status,
    errorMessage || `Task ${status}`,
    taskId
  );
}
