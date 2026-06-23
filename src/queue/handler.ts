/**
 * handler.ts — Queue consumer handler
 * v6.0 — Receives messages from SCHEDULER_QUEUE, runs tasks with fresh BudgetTracker
 */

import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../types/env';
import { setEnv } from '../core/env';
import { createBudget } from '../core/subrequest';
import { logger } from '../core/logger';
import { handleScheduled, handleTestCron } from '../services/scheduler/executors';

export interface QueueMessage {
	type: 'scheduled-tick' | 'test-cron';
	taskId?: string;
	timestamp: string;
}

/**
 * Queue consumer — called by CF Queue when messages arrive.
 * Each invocation gets a FRESH 50 subrequest budget.
 */
export async function handleQueue(
	batch: MessageBatch<QueueMessage>,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	setEnv(env);

	const budget = createBudget('Queue', 50);

	for (const msg of batch.messages) {
		logger.info('Queue', `Processing ${msg.body.type}`, {
			taskId: msg.body.taskId,
			timestamp: msg.body.timestamp,
			budget: budget.remainingBudget,
		});

		try {
			if (msg.body.type === 'scheduled-tick') {
				const result = await handleScheduled(env);
				logger.info('Queue', 'Scheduled tick done', {
					executed: result.executed,
					failed: result.failed,
				});
			} else if (msg.body.type === 'test-cron') {
				const result = await handleTestCron(env, msg.body.taskId);
				logger.info('Queue', 'Test cron done', {
					executed: result.executed,
					failed: result.failed,
				});
			}

			msg.ack();
		} catch (error: any) {
			logger.error('Queue', 'Message failed', {
				type: msg.body.type,
				error: error.message,
			});
			msg.retry({ delaySeconds: 30 });
		}
	}

	logger.info('Queue', `Batch done: ${batch.messages.length} messages, budget ${budget.summary()}`);
}
