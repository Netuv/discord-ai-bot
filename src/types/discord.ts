/**
 * discord.ts — Discord API types
 * v5.0 — Minimal, focused, reusable
 */

export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: { name: string; value: string; inline?: boolean }[];
	footer?: { text: string };
	timestamp?: string;
}

export interface DiscordInteraction {
	type: number;
	data?: {
		name?: string;
		type?: number;
		options?: { name: string; value: unknown }[];
		resolved?: { messages?: Record<string, { content?: string }> };
		target_id?: string;
	};
	member?: { user?: { id: string } };
	user?: { id: string };
	token: string;
	application_id: string;
}

export interface DiscordMessage {
	id: string;
	content: string;
	channel_id: string;
	author: { id: string; username: string };
	timestamp: string;
	embeds?: DiscordEmbed[];
	attachments?: { url: string; filename: string }[];
}

export type InteractionResponseType = 1 | 4 | 5 | 6 | 7;
export const InteractionResponseType = {
	PONG: 1,
	CHANNEL_MESSAGE_WITH_SOURCE: 4,
	DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
	DEFERRED_UPDATE_MESSAGE: 6,
	UPDATE_MESSAGE: 7,
} as const;
