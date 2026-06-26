import type { Env } from '../../types/env';
import { safeFetch } from '../../core/safe-fetch';

/**
 * Send a simple message or embed to a Discord channel
 */
export async function sendDiscordMessage(args: { channelId: string; content?: string; embeds?: any[] }, env: Env) {
  if (!args.content && (!args.embeds || args.embeds.length === 0)) {
    throw new Error('Must provide either content or embeds');
  }

  const url = `https://discord.com/api/v10/channels/${args.channelId}/messages`;
  const res = await safeFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: args.content, embeds: args.embeds }),
  });

  if (!res || !res.ok) {
    const err = await res?.text().catch(() => 'unknown error');
    return { success: false, status: res?.status, error: err };
  }

  return { success: true, data: await res.json() };
}

/**
 * Execute arbitrary raw Discord API calls for full administrative control
 */
export async function executeDiscordApi(args: { endpoint: string; method?: string; body?: any }, env: Env) {
  const endpoint = args.endpoint.startsWith('/') ? args.endpoint : `/${args.endpoint}`;
  const url = `https://discord.com/api/v10${endpoint}`;
  
  const options: RequestInit = {
    method: args.method ?? 'GET',
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
  };

  if (args.body && args.method !== 'GET' && args.method !== 'HEAD') {
    options.body = JSON.stringify(args.body);
  }

  const res = await safeFetch(url, options);
  
  if (!res || !res.ok) {
    const err = await res?.text().catch(() => 'unknown error');
    return { success: false, status: res?.status, error: err };
  }

  return { 
    success: true, 
    status: res.status, 
    data: await res.json().catch(() => null) 
  };
}
