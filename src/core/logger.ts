/**
 * logger.ts — Structured logging for Cloudflare Workers
 * v5.0 — Consistent context-aware logging
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const EMOJI: Record<LogLevel, string> = {
	debug: '🔍',
	info: 'ℹ️',
	warn: '⚠️',
	error: '❌',
};

function fmt(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): string {
	const prefix = `${EMOJI[level]} [${module}]`;
	const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
	return `${prefix} ${message}${suffix}`;
}

export const logger = {
	debug: (module: string, message: string, meta?: Record<string, unknown>) =>
		console.debug(fmt('debug', module, message, meta)),
	info: (module: string, message: string, meta?: Record<string, unknown>) =>
		console.log(fmt('info', module, message, meta)),
	warn: (module: string, message: string, meta?: Record<string, unknown>) =>
		console.warn(fmt('warn', module, message, meta)),
	error: (module: string, message: string, meta?: Record<string, unknown>) =>
		console.error(fmt('error', module, message, meta)),
};
