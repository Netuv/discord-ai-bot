/**
 * verify.ts — Discord interaction verification
 * v5.0 — Thin wrapper around discord-interactions
 */

import { verifyKey as discordVerifyKey } from 'discord-interactions';

export async function verifyKey(rawBody: string, signature: string | null, timestamp: string | null, publicKey: string): Promise<boolean> {
	if (!signature || !timestamp || !publicKey) return false;
	try {
		return await discordVerifyKey(rawBody, signature, timestamp, publicKey);
	} catch { return false; }
}
