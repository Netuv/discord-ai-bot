/**
 * admin-tools.ts — Discord admin MCP tools
 * v5.0 — Destructive actions require confirmation
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { confirmAction, formatPendingAction } from '../confirm';
import { getChannelMessages } from '../../discord/client';
import { logger } from '../../core/logger';
import { makeTool } from './_helpers';

const API = 'https://discord.com/api/v10';

async function discordFetch(path: string, method = 'GET', body?: unknown): Promise<any> {
	const env = getEnv();
	const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
	const text = await res.text();
	if (!res.ok) throw new Error(`Discord ${res.status}: ${text.slice(0, 200)}`);
	return text ? JSON.parse(text) : null;
}

export function createAdminTools(): Record<string, ToolDefinition> {
	return {
		'confirm-action': makeTool('Confirm a pending admin action', { code: { type: 'string', description: '6-char code' } }, ['code'], async (args) => {
			const code = String(args.code || '').toUpperCase();
			const result = confirmAction(code);
			if (!result.success) return result.message;
			if (!result.entry) return '❌ No action data.';
			try {
				const { createAdminTools } = await import('./admin-tools');
				return `✅ Action confirmed.`;
			} catch { return '❌ Action confirmation failed.'; }
		}),
		'cancel-action': makeTool('Cancel a pending action', { code: { type: 'string' } }, ['code'], async (args) => {
			const { cancelAction } = await import('../confirm');
			return cancelAction(String(args.code).toUpperCase()) ? `✅ Cancelled.` : `❌ Code not found.`;
		}),
		'purge-channel': makeTool('Purge — Delete bulk messages', { channel_id: { type: 'string' }, limit: { type: 'number' } }, ['channel_id'], async (args) => {
			const channelId = String(args.channel_id);
			const limit = Math.min(Number(args.limit) || 20, 100);
			const messages = await getChannelMessages(getEnv().DISCORD_BOT_TOKEN, channelId, limit);
			if (messages.length === 0) return '📭 No messages.';
			const ids = messages.map(m => m.id);
			if (ids.length === 1) await discordFetch(`/channels/${channelId}/messages/${ids[0]}`, 'DELETE');
			else await discordFetch(`/channels/${channelId}/messages/bulk-delete`, 'POST', { messages: ids });
			return `✅ Deleted ${ids.length} messages.`;
		}, true, 'Purge channel messages'),
		'ban-user': makeTool('Ban a user from guild', { guild_id: { type: 'string' }, user_id: { type: 'string' }, reason: { type: 'string' }, delete_message_days: { type: 'number' } }, ['guild_id', 'user_id'], async (args) => {
			await discordFetch(`/guilds/${args.guild_id}/bans/${args.user_id}`, 'PUT', { reason: String(args.reason || 'No reason'), delete_message_days: Number(args.delete_message_days) || 0 });
			return `✅ Banned <@${args.user_id}>.`;
		}, true, 'Ban user'),
	};
}
