/**
 * discord-tools.ts — Discord core MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { sendMessage, sendEmbed, sendFile, getChannelMessages } from '../../discord/client';
import type { DiscordEmbed } from '../../types/discord';
import { makeTool } from './_helpers';

export function createDiscordTools(): Record<string, ToolDefinition> {
	return {
		'send-discord': makeTool('Send text message to a Discord channel', { channel_id: { type: 'string' }, content: { type: 'string' } }, ['channel_id', 'content'], async (args) => {
			const env = getEnv();
			const r = await sendMessage(env.DISCORD_BOT_TOKEN, String(args.channel_id), String(args.content));
			return r ? `✅ Sent to <#${args.channel_id}>` : `❌ Failed`;
		}),
		'send-embed': makeTool('Send rich embed to Discord', { channel_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, color: { type: 'number' } }, ['channel_id'], async (args) => {
			const env = getEnv();
			const r = await sendEmbed(env.DISCORD_BOT_TOKEN, String(args.channel_id), { title: String(args.title || ''), description: String(args.description || ''), color: Number(args.color) || 0x5865F2 });
			return r ? `✅ Embed sent` : `❌ Failed`;
		}),
		'send-file': makeTool('Send image/file via URL to Discord', { channel_id: { type: 'string' }, url: { type: 'string' }, caption: { type: 'string' } }, ['channel_id', 'url'], async (args) => {
			const env = getEnv(); const ok = await sendFile(env.DISCORD_BOT_TOKEN, String(args.channel_id), String(args.url), args.caption ? String(args.caption) : undefined);
			return ok ? `✅ File sent` : `❌ Failed`;
		}),
	};
}
