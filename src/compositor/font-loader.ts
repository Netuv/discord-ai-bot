import type { Env } from '../types/env';
import { safeFetch } from '../core/safe-fetch';

const FONT_CACHE_KEY = 'font:inter_700';

export async function loadFont(env: Env): Promise<ArrayBuffer> {
  // Try to load from KV first
  try {
    const cached = await env.BOT_KV.get(FONT_CACHE_KEY, 'arrayBuffer');
    if (cached) {
      return cached;
    }
  } catch (e) {
    // KV not available or failed
  }

  // Fetch from Google Fonts or similar CDN
  // Using jsDelivr for stable font binary
  const url = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/inter-latin-700-normal.woff';
  
  const res = await safeFetch(url);
  if (!res || !res.ok) {
    throw new Error(`Failed to load font from ${url}`);
  }

  const fontBuffer = await res.arrayBuffer();

  // Cache in KV for 24 hours
  try {
    await env.BOT_KV.put(FONT_CACHE_KEY, fontBuffer, { expirationTtl: 86400 });
  } catch (e) {
    // Ignore cache write errors
  }

  return fontBuffer;
}
