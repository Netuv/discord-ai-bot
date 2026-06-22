/**
 * scheduler.ts — Scheduler system types
 * v5.0
 */

export type ScheduledAction =
	| 'send-message'
	| 'ai-prompt'
	| 'ai-article'
	| 'purge-channel'
	| 'custom-webhook'
	| 'update-status'
	| 'github-run';

export interface ScheduledTask {
	id: string;
	name: string;
	description: string;
	cron: string;
	action: ScheduledAction;
	params: Record<string, unknown>;
	enabled: boolean;
	channel_id: string;
	guild_id: string;
	created_at: string;
	updated_at: string;
	last_run: string | null;
	last_status: 'success' | 'failed' | 'pending' | null;
	run_count: number;
	timezone?: string;
}

export interface TaskLogEntry {
	task_id: string;
	task_name: string;
	timestamp: string;
	status: 'success' | 'failed';
	message: string;
	duration_ms: number;
}

export interface SchedulerResult {
	executed: number;
	failed: number;
	logs: string[];
}
