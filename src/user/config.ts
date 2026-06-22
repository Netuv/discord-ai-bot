/**
 * config.ts — Per-user provider/model configuration
 * v5.0 — KV-backed, stored under `user:config:{userId}`
 */

import type { Env } from '../types/env';

export interface UserAiConfig { userId: string; providerName: string | null; modelName: string | null; updatedAt: string; }
const KV_PREFIX = 'user:config:';

export async function getUserConfig(env: Env, userId: string): Promise<UserAiConfig | null> {
	try { const raw = await env.SCHEDULER_KV.get(`${KV_PREFIX}${userId}`, 'text'); return raw ? JSON.parse(raw) as UserAiConfig : null; } catch { return null; }
}

export async function setUserConfig(env: Env, userId: string, config: Partial<{ providerName: string | null; modelName: string | null }>): Promise<UserAiConfig> {
	const existing = await getUserConfig(env, userId);
	const newConfig: UserAiConfig = { userId, providerName: config.providerName !== undefined ? config.providerName : existing?.providerName ?? null, modelName: config.modelName !== undefined ? config.modelName : existing?.modelName ?? null, updatedAt: new Date().toISOString() };
	await env.SCHEDULER_KV.put(`${KV_PREFIX}${userId}`, JSON.stringify(newConfig));
	return newConfig;
}

export async function clearUserConfig(env: Env, userId: string): Promise<void> {
	try { await env.SCHEDULER_KV.delete(`${KV_PREFIX}${userId}`); } catch { /* ignore */ }
}
