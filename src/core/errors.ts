/**
 * errors.ts — Typed error classes
 * v5.0
 */

export class DiscordApiError extends Error {
	constructor(
		public status: number,
		public body: string,
		message?: string,
	) {
		super(message || `Discord API error ${status}`);
		this.name = 'DiscordApiError';
	}
}

export class AiProviderError extends Error {
	constructor(
		public provider: string,
		public status: number,
		message?: string,
	) {
		super(message || `${provider} error (${status})`);
		this.name = 'AiProviderError';
	}
}

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

export class ConfigError extends Error {
	constructor(key: string) {
		super(`Missing config: ${key}`);
		this.name = 'ConfigError';
	}
}
