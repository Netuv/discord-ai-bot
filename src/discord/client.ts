/**
 * client.ts — Discord REST API Client
 * v5.0 — Rate-limited, typed, with error handling
 */

import { DiscordApiError } from '../core/errors';
import { logger } from '../core/logger';
import { DISCORD_LIMITS } from '../config/discord';
import type { DiscordMessage, DiscordEmbed } from '../types/discord';

const API_BASE = 'https://discord.com/api/v10';

class RateLimiter {
	private queue: Array<() => Promise<unknown>> = [];
	private processing = false;
	private lastRequest = 0;

	async add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try { resolve(await fn()); } catch (e) { reject(e); }
			});
			if (!this.processing) void this.process();
		});
	}

	private async process(): Promise<void> {
		this.processing = true;
		while (this.queue.length > 0) {
			const wait = Math.max(0, DISCORD_LIMITS.RATE_LIMIT_MS - (Date.now() - this.lastRequest));
			if (wait > 0) await new Promise(r => setTimeout(r, wait));
			const fn = this.queue.shift();
			if (fn) {
				this.lastRequest = Date.now();
				await fn().catch(() => {});
			}
		}
		this.processing = false;
	}
}

const rateLimiter = new RateLimiter();

async function request(token: string, path: string, method: string, body?: unknown): Promise<Response> {
	return rateLimiter.add(() =>
		fetch(`${API_BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bot ${token}`,
				'Content-Type': 'application/json',
			},
			body: body ? JSON.stringify(body) : undefined,
		}),
	);
}

async function handleResponse(res: Response): Promise<DiscordMessage> {
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new DiscordApiError(res.status, body);
	}
	return res.json();
}

export async function sendMessage(token: string, channelId: string, content: string): Promise<DiscordMessage | null> {
	try {
		const res = await request(token, `/channels/${channelId}/messages`, 'POST', {
			content: content.slice(0, DISCORD_LIMITS.MESSAGE_CONTENT),
		});
		return await handleResponse(res);
	} catch (e) {
		logger.error('DiscordClient', 'sendMessage failed', {
			channelId, error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}

export async function sendEmbed(token: string, channelId: string, embed: DiscordEmbed): Promise<DiscordMessage | null> {
	try {
		const res = await request(token, `/channels/${channelId}/messages`, 'POST', {
			embeds: [{
				title: embed.title?.slice(0, DISCORD_LIMITS.EMBED_TITLE),
				description: embed.description?.slice(0, DISCORD_LIMITS.EMBED_DESCRIPTION),
				color: embed.color,
				...('fields' in embed && embed.fields ? { fields: embed.fields } : {}),
				...('footer' in embed && embed.footer ? { footer: { text: embed.footer.text.slice(0, DISCORD_LIMITS.EMBED_FOOTER) } } : {}),
				...('timestamp' in embed && embed.timestamp ? { timestamp: embed.timestamp } : {}),
			}],
		});
		return await handleResponse(res);
	} catch (e) {
		logger.error('DiscordClient', 'sendEmbed failed', {
			channelId, error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}

export async function editMessage(token: string, channelId: string, messageId: string, content: string): Promise<DiscordMessage | null> {
	try {
		const res = await request(token, `/channels/${channelId}/messages/${messageId}`, 'PATCH', {
			content: content.slice(0, DISCORD_LIMITS.MESSAGE_CONTENT),
		});
		return await handleResponse(res);
	} catch (e) {
		logger.error('DiscordClient', 'editMessage failed', {
			channelId, messageId, error: e instanceof Error ? e.message : String(e),
		});
		return null;
	}
}

export async function sendFile(token: string, channelId: string, imageUrl: string, caption?: string): Promise<boolean> {
	const content = caption ? `${caption}\n${imageUrl}` : imageUrl;
	const result = await sendMessage(token, channelId, content);
	return result !== null;
}

export async function sendTyping(token: string, channelId: string): Promise<void> {
	await fetch(`${API_BASE}/channels/${channelId}/typing`, {
		method: 'POST',
		headers: { Authorization: `Bot ${token}` },
	}).catch(() => {});
}

export async function getChannelMessages(token: string, channelId: string, limit = 50): Promise<DiscordMessage[]> {
	try {
		const res = await request(token, `/channels/${channelId}/messages?limit=${limit}`, 'GET');
		if (!res.ok) throw new DiscordApiError(res.status, await res.text());
		return res.json();
	} catch (e) {
		logger.error('DiscordClient', 'getChannelMessages failed', {
			channelId, error: e instanceof Error ? e.message : String(e),
		});
		return [];
	}
}

export async function deleteMessages(token: string, channelId: string, messageIds: string[]): Promise<boolean> {
	try {
		const res = await request(token, `/channels/${channelId}/messages/bulk-delete`, 'POST', { messages: messageIds });
		return res.ok;
	} catch (e) {
		logger.warn('DiscordClient', 'deleteMessages failed', {
			channelId, count: messageIds.length, error: e instanceof Error ? e.message : String(e),
		});
		return false;
	}
}
