/**
 * executors.ts — All 7 scheduled action executors + AI article pipeline
 * v6.0 — Each executor is a standalone async function
 */

import type { ScheduledTask, SchedulerResult } from '../../types/scheduler';
import type { Env } from '../../types/env';
import { AiRouter } from '../../ai/router';
import { researchArticle, generateArticle, generateFallbackArticle } from '../../ai/writer';
import { publishArticle } from '../../discord/publisher';
import { turboHeavyArticle } from '../../turbo/client';
import { logger } from '../../core/logger';
import { cronMatches } from './engine';
import { getTasks, updateTask } from './storage';
import { addLog } from './logging';

// ─── Executors ────────────────────────────────────────────

async function execSendMsg(task: ScheduledTask, env: Env): Promise<string> {
	const content = (task.params.message as string) || '⏰ **Tugas Terjadwal**';
	const res = await fetch(
		`https://discord.com/api/v10/channels/${task.channel_id}/messages`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bot ${env.DISCORD_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content,
				...(task.params.embed ? { embeds: [task.params.embed] } : {}),
			}),
		},
	);
	if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
	return `✅ Pesan ke <#${task.channel_id}>`;
}

async function execAiPrompt(task: ScheduledTask, env: Env): Promise<string> {
	const prompt = (task.params.prompt as string) || 'Buatkan pengumuman singkat.';
	const router = new AiRouter(env);
	const response = await router.chat([{ role: 'user', content: prompt }]);
	const res = await fetch(
		`https://discord.com/api/v10/channels/${task.channel_id}/messages`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bot ${env.DISCORD_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				content: `**🤖 Scheduled AI — ${task.name}**\n\n${response.slice(0, 1900)}`,
			}),
		},
	);
	if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
	return `✅ AI response ke <#${task.channel_id}>`;
}

async function execPurge(task: ScheduledTask, env: Env): Promise<string> {
	const limit = Math.min((task.params.jumlah as number) || 10, 100);
	const msgRes = await fetch(
		`https://discord.com/api/v10/channels/${task.channel_id}/messages?limit=${limit}`,
		{ headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` } },
	);
	if (!msgRes.ok) throw new Error(`Gagal ambil pesan: ${await msgRes.text()}`);
	const msgs: any[] = await msgRes.json();
	if (msgs.length === 0) return '📭 Tidak ada pesan.';
	const ids = msgs.map(m => m.id);
	if (ids.length === 1) {
		const r = await fetch(
			`https://discord.com/api/v10/channels/${task.channel_id}/messages/${ids[0]}`,
			{ method: 'DELETE', headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` } },
		);
		if (!r.ok) throw new Error(`Gagal hapus: ${await r.text()}`);
	} else {
		const r = await fetch(
			`https://discord.com/api/v10/channels/${task.channel_id}/messages/bulk-delete`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bot ${env.DISCORD_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ messages: ids }),
			},
		);
		if (!r.ok) throw new Error(`Bulk delete gagal: ${await r.text()}`);
	}
	return `✅ ${ids.length} pesan dihapus dari <#${task.channel_id}>`;
}

async function execWebhook(task: ScheduledTask, _env: Env): Promise<string> {
	const url = task.params.webhook_url as string;
	if (!url) throw new Error('webhook_url tidak diset');
	const method = (task.params.method as string) || 'POST';
	const headers =
		(task.params.headers as Record<string, string>) || {
			'Content-Type': 'application/json',
		};
	const body = task.params.body ? JSON.stringify(task.params.body) : undefined;
	const res = await fetch(url, { method, headers, body });
	return `✅ Webhook ${method} ${url} → ${res.status}`;
}

async function execUpdateStatus(task: ScheduledTask, env: Env): Promise<string> {
	const status = (task.params.status as string) || '🟢 Bot aktif';
	const res = await fetch(
		`https://discord.com/api/v10/channels/${task.channel_id}/messages`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bot ${env.DISCORD_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ content: `📊 **Status Update:** ${status}` }),
		},
	);
	if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text()}`);
	return `✅ Status ke <#${task.channel_id}>`;
}

async function execGithub(task: ScheduledTask, env: Env): Promise<string> {
	if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN tidak tersedia');
	const owner = (task.params.owner as string) || 'Netuv';
	const repo = task.params.repo as string;
	const command = (task.params.command as string) || "echo 'Scheduled run'";
	if (!repo) throw new Error('repo tidak diset');
	const res = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/actions/workflows/remote-run.yml/dispatches`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.GITHUB_TOKEN}`,
				'User-Agent': 'discord-ai-bot-scheduler',
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				ref: 'master',
				inputs: {
					command,
					shell: 'bash',
					working_directory: '.',
					run_id: crypto.randomUUID().slice(0, 8),
				},
			}),
		},
	);
	if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
	return `✅ GitHub Actions triggered`;
}

// ─── AI Article Pipeline ───────────────────────────────────

export async function executeAiArticle(
	task: ScheduledTask,
	env: Env,
): Promise<string> {
	const topic = (task.params.topic ||
		task.params.prompt ||
		'berita anime/manga/game terkini') as string;
	const channelId = task.channel_id;

	let research = { summary: '📰 Gunakan pengetahuan umum.', reviewSummary: '' };
	try {
		research = await researchArticle(topic, env);
	} catch (e: any) {
		logger.warn('Scheduler', 'Research gagal', { error: e.message });
	}

	const [workerArticle, turboArticle] = await Promise.all([
		(async () => {
			try {
				return await generateArticle(topic, research, env);
			} catch {
				return generateFallbackArticle(topic);
			}
		})(),
		(async () => {
			try {
				return await turboHeavyArticle(env, topic, research);
			} catch {
				return null;
			}
		})(),
	]);

	const rawArticle =
		turboArticle &&
		typeof turboArticle === 'object' &&
		'title' in turboArticle &&
		'sections' in turboArticle
			? turboArticle
			: workerArticle;
	const article = rawArticle as any;
	const result = await publishArticle(env.DISCORD_TOKEN, channelId, article, env);

	if (!result.success) {
		const errDetail =
			result.errors.length > 0 ? ` — ${result.errors[0]}` : '';
		return `⚠️ Gagal publish: ${result.error}${errDetail}`;
	}

	const title = article.title || `📰 ${topic}`;
	return `✅ "${title.slice(0, 60)}..." → ${result.sectionsPublished} section${
		result.imagesPublished > 0 ? ` • ${result.imagesPublished} gambar` : ''
	}${result.videosPublished > 0 ? ` • ${result.videosPublished} video` : ''}`;
}

// ─── Executor Router ───────────────────────────────────────

async function executeTask(
	task: ScheduledTask,
	env: Env,
): Promise<string> {
	switch (task.action) {
		case 'send-message':
			return execSendMsg(task, env);
		case 'ai-prompt':
			return execAiPrompt(task, env);
		case 'ai-article':
			return executeAiArticle(task, env);
		case 'purge-channel':
			return execPurge(task, env);
		case 'custom-webhook':
			return execWebhook(task, env);
		case 'update-status':
			return execUpdateStatus(task, env);
		case 'github-run':
			return execGithub(task, env);
		default:
			throw new Error(`Unknown action: ${task.action}`);
	}
}

// ─── Handlers ──────────────────────────────────────────────

/** Run all scheduled tasks that match the current cron time. */
export async function handleScheduled(
	env: Env,
): Promise<SchedulerResult> {
	const tasks = await getTasks(env);
	const now = new Date();
	const due = tasks.filter(t => t.enabled && cronMatches(t.cron, now));
	const result: SchedulerResult = { executed: 0, failed: 0, logs: [] };

	if (due.length === 0) {
		result.logs.push('Tidak ada task yang perlu dijalankan sekarang.');
		return result;
	}

	for (const task of due) {
		const start = Date.now();
		try {
			const msg = await executeTask(task, env);
			const dur = Date.now() - start;
			await updateTask(env, task.id, {
				last_run: new Date().toISOString(),
				last_status: 'success',
				run_count: task.run_count + 1,
			});
			await addLog(env, {
				task_id: task.id,
				task_name: task.name,
				timestamp: new Date().toISOString(),
				status: 'success',
				message: msg,
				duration_ms: dur,
			});
			result.executed++;
			result.logs.push(`✅ "${task.name}": ${msg} (${dur}ms)`);
		} catch (e: any) {
			const dur = Date.now() - start;
			await updateTask(env, task.id, {
				last_run: new Date().toISOString(),
				last_status: 'failed',
				run_count: task.run_count + 1,
			});
			await addLog(env, {
				task_id: task.id,
				task_name: task.name,
				timestamp: new Date().toISOString(),
				status: 'failed',
				message: e.message,
				duration_ms: dur,
			});
			result.failed++;
			result.logs.push(`❌ "${task.name}": ${e.message} (${dur}ms)`);
		}
	}

	return result;
}

/** Run all enabled tasks (or a specific one) immediately — for testing. */
export async function handleTestCron(
	env: Env,
	taskId?: string,
): Promise<SchedulerResult> {
	const tasks = await getTasks(env);
	let targets = tasks.filter(t => t.enabled);
	if (taskId) {
		targets = targets.filter(t => t.id === taskId);
		if (targets.length === 0)
			return {
				executed: 0,
				failed: 0,
				logs: [`Task "${taskId}" tidak ditemukan.`],
			};
	}

	const result: SchedulerResult = { executed: 0, failed: 0, logs: [] };
	for (const task of targets) {
		const start = Date.now();
		try {
			const msg = await executeTask(task, env);
			const dur = Date.now() - start;
			await updateTask(env, task.id, {
				last_run: new Date().toISOString(),
				last_status: 'success',
				run_count: task.run_count + 1,
			});
			await addLog(env, {
				task_id: task.id,
				task_name: task.name,
				timestamp: new Date().toISOString(),
				status: 'success',
				message: msg,
				duration_ms: dur,
			});
			result.executed++;
			result.logs.push(`✅ "${task.name}": ${msg} (${dur}ms)`);
		} catch (e: any) {
			const dur = Date.now() - start;
			await updateTask(env, task.id, {
				last_run: new Date().toISOString(),
				last_status: 'failed',
				run_count: task.run_count + 1,
			});
			await addLog(env, {
				task_id: task.id,
				task_name: task.name,
				timestamp: new Date().toISOString(),
				status: 'failed',
				message: e.message,
				duration_ms: dur,
			});
			result.failed++;
			result.logs.push(`❌ "${task.name}": ${e.message} (${dur}ms)`);
		}
	}

	return result;
}
