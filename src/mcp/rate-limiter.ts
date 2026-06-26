import type { Env } from '../types/env';

/**
 * Rate limiter: 30 requests per minute per IP
 * Uses KV with TTL for tracking
 */
export async function checkRateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `ratelimit:mcp:${ip}`;
  const current = await env.BOT_KV.get(key, 'text');
  const count = current ? parseInt(current, 10) : 0;

  // Rate limit: 30 requests per minute
  if (count >= 30) {
    return false;
  }

  // Increment counter with 60 second TTL
  await env.BOT_KV.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}

/**
 * Get current rate limit status for an IP
 */
export async function getRateLimitStatus(
  ip: string,
  env: Env
): Promise<{ requests: number; limit: number; remaining: number }> {
  const key = `ratelimit:mcp:${ip}`;
  const current = await env.BOT_KV.get(key, 'text');
  const requests = current ? parseInt(current, 10) : 0;
  const limit = 30;

  return {
    requests,
    limit,
    remaining: Math.max(0, limit - requests),
  };
}
