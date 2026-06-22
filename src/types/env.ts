/**
 * env.ts — Cloudflare Worker Environment Bindings
 * v5.0 — Strictly typed, zero `any`
 */

export interface Env {
	// Discord
	DISCORD_PUBLIC_KEY: string;
	DISCORD_APP_ID: string;
	DISCORD_BOT_TOKEN: string;
	DISCORD_TOKEN: string;

	// Access control
	ALLOWED_USER_ID?: string;

	// Cloudflare bindings
	SCHEDULER_KV: KVNamespace;
	AI: Ai;

	// AI Provider keys
	NVIDIA_API_KEY?: string;
	OPENROUTER_API_KEY?: string;
	OPENCODE_API_KEY?: string;
	CUSTOM_OPENAI_API_KEY?: string;
	CUSTOM_OPENAI_BASE_URL?: string;

	// YouTube
	YOUTUBE_API_KEY?: string;

	// Google Custom Search
	GOOGLE_SEARCH_API_KEY?: string;
	GOOGLE_SEARCH_ENGINE_ID?: string;

	// GitHub
	GITHUB_TOKEN?: string;

	// Turbo Layer
	TURBO_SERVICE_URL?: string;
}
