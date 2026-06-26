import type { Env } from '../types/env';
import type { QueueMessage } from './handler';
import { D1Client } from '../core/d1';
import { traceLog } from '../core/trace-logger';
import { safeFetch } from '../core/safe-fetch';

/**
 * Move failed message to dead letter queue after max retries
 */
export async function moveToDLQ(
  taskId: string | undefined,
  message: QueueMessage,
  errorMessage: string,
  env: Env
): Promise<void> {
  const db = new D1Client(env);

  await db.execute(
    `INSERT INTO dead_letter_queue
     (task_id, trace_id, queue_message, error_message, error_phase)
     VALUES (?, ?, ?, ?, ?)`,
    taskId ?? null,
    message.traceId,
    JSON.stringify(message),
    errorMessage,
    message.action
  );

  traceLog('error', 'DLQ', `Message moved to DLQ`, {
    taskId,
    action: message.action,
    error: errorMessage,
  });

  // Notify admin via Discord (non-blocking)
  await notifyAdminDLQ(taskId, message.taskName, errorMessage, env).catch((e) => {
    traceLog('warn', 'DLQ', 'Failed to notify admin', {
      error: (e as Error).message,
    });
  });
}

/**
 * Send Discord notification to admin channel about DLQ message
 */
async function notifyAdminDLQ(
  taskId: string | undefined,
  taskName: string,
  error: string,
  env: Env
): Promise<void> {
  if (!env.DISCORD_DEFAULT_CHANNEL_ID || !env.DISCORD_TOKEN) {
    return;
  }

  const payload = {
    embeds: [
      {
        title: '⚠️ Task Moved to Dead Letter Queue',
        description: `Task **${taskName}** (\`${taskId ?? 'unknown'}\`) failed after maximum retries.`,
        color: 0xff0000,
        fields: [
          {
            name: 'Error',
            value: error.slice(0, 500),
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await safeFetch(
    `https://discord.com/api/v10/channels/${env.DISCORD_DEFAULT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      timeoutMs: 10_000,
    }
  );

  traceLog('info', 'DLQ', 'Admin notification sent');
}

/**
 * Resolve (mark as handled) DLQ entries
 */
export async function resolveDLQ(
  ids: string[],
  resolution: string,
  env: Env
): Promise<number> {
  const db = new D1Client(env);

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.execute(
    `UPDATE dead_letter_queue
     SET resolved = 1,
         resolved_at = datetime('now'),
         resolution = ?
     WHERE id IN (${placeholders})`,
    resolution,
    ...ids
  );

  traceLog('info', 'DLQ', `Resolved ${result.changes} DLQ entries`);
  return result.changes;
}

/**
 * Get unresolved DLQ entries
 */
export async function getUnresolvedDLQ(env: Env, limit = 50) {
  const db = new D1Client(env);

  return db.query<{
    id: string;
    task_id: string | null;
    trace_id: string;
    queue_message: string;
    error_message: string;
    error_phase: string;
    error_count: number;
    first_seen: string;
    last_seen: string;
  }>(
    `SELECT * FROM dead_letter_queue
     WHERE resolved = 0
     ORDER BY last_seen DESC
     LIMIT ?`,
    limit
  );
}
