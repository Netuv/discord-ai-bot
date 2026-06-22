/**
 * discord.ts — Discord configuration constants
 * v5.0
 */

export const ARTICLE_COLORS: Record<string, number> = {
	anime: 0xFF6B6B,
	manga: 0x9B59B6,
	game: 0x3498DB,
	breaking: 0xE74C3C,
	announcement: 0xF39C12,
	general: 0x5865F2,
};

export const DISCORD_LIMITS = {
	MESSAGE_CONTENT: 2000,
	EMBED_TITLE: 256,
	EMBED_DESCRIPTION: 4096,
	EMBED_FIELD_NAME: 256,
	EMBED_FIELD_VALUE: 1024,
	EMBED_FOOTER: 2048,
	RATE_LIMIT_MS: 200, // 5 req/s
} as const;

export const CRON_SCHEDULE = '*/5 * * * *';
