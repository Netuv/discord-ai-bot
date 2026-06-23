/**
 * cache.ts — KV cache wrapper (get/set with TTL)
 * v6.0 — Generic JSON cache for web search results
 */

import type { Env } from '../../types/env';

const CACHE_PREFIX = 'svc:cache:';
const DEFAULT_TTL = 3600;

export async function cacheGet<T>(env: Env, key: string): Promise<T | null> {
	try {
		const raw = await env.SCHEDULER_KV.get(`${CACHE_PREFIX}${key}`, 'text');
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

export async function cacheSet<T>(
	env: Env,
	key: string,
	data: T,
	ttl: number = DEFAULT_TTL,
): Promise<void> {
	try {
		await env.SCHEDULER_KV.put(`${CACHE_PREFIX}${key}`, JSON.stringify(data), {
			expirationTtl: ttl,
		});
	} catch {
		/* optional */
	}
}
