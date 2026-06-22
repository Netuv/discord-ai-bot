/**
 * client.ts — Turbo Layer HTTP Client
 * v5.0 — All functions OPTIONAL, return null/false on failure
 */

import type { Env } from '../types/env';
import { logger } from '../core/logger';

async function callTurbo(env: Env, endpoint: string, payload: unknown, timeoutMs = 120000): Promise<unknown | null> {
	const baseUrl = env.TURBO_SERVICE_URL;
	if (!baseUrl) return null;
	try {
		const res = await fetch(`${baseUrl}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) { logger.warn('TurboClient', `${endpoint} HTTP ${res.status}`); return null; }
		return await res.json();
	} catch (e) { logger.warn('TurboClient', `${endpoint} error`, { error: e instanceof Error ? e.message : String(e) }); return null; }
}

export async function turboChat(env: Env, messages: Array<{ role: string; content: string }>, model?: string): Promise<string | null> {
	const result = await callTurbo(env, '/ai/chat', { messages, model: model || undefined });
	if (result && typeof (result as Record<string, unknown>).content === 'string' && (result as Record<string, unknown>).content !== '') return (result as Record<string, unknown>).content as string;
	return null;
}

export async function turboHeavyArticle(env: Env, topic: string, research: { summary?: string; reviewSummary?: string }): Promise<Record<string, unknown> | null> {
	try {
		const mod = await import('../ai/writer');
		const prompt = mod.buildArticlePrompt(topic, research.summary || '', research.reviewSummary || '');
		const result = await callTurbo(env, '/ai/article', { topic, research, prompt });
		if (result && typeof result === 'object' && 'title' in (result as Record<string, unknown>)) return result as Record<string, unknown>;
		return null;
	} catch { return null; }
}

export async function discordFollowupDirect(appId: string, interactionToken: string, content: string): Promise<void> {
	try {
		await fetch(`https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 2000) }) });
	} catch { /* ignore */ }
}
