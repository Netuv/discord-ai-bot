/**
 * env.ts — Environment accessor
 * v5.0 — Singleton pattern for Workers (per-request scoped)
 */

import type { Env } from '../types/env';

let _env: Env | null = null;

export function setEnv(env: Env): void {
	_env = env;
}

export function getEnv(): Env {
	if (!_env) throw new Error('Env not set. Call setEnv() first.');
	return _env;
}

export function withEnv<T>(env: Env, fn: () => T): T {
	const prev = _env;
	setEnv(env);
	try {
		return fn();
	} finally {
		_env = prev;
	}
}
