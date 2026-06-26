import type { Env } from '../types/env';
import type { UserRole } from './auth';

export interface AuditLogEntry {
  timestamp: string;
  ip: string;
  role: UserRole;
  tool: string;
  params?: Record<string, unknown> | undefined;
  success: boolean;
  error?: string | undefined;
}

/**
 * Log MCP tool invocation to KV (short TTL - last 1000 entries)
 */
export async function logAudit(
  entry: AuditLogEntry,
  env: Env
): Promise<void> {
  const key = `audit:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;

  await env.BOT_KV.put(
    key,
    JSON.stringify(entry),
    {
      expirationTtl: 86400, // 24 hours
      metadata: { tool: entry.tool, role: entry.role, success: entry.success },
    }
  );
}

/**
 * Get recent audit logs (uses KV list with prefix)
 */
export async function getRecentAuditLogs(
  env: Env,
  limit = 50
): Promise<AuditLogEntry[]> {
  const list = await env.BOT_KV.list({
    prefix: 'audit:',
    limit,
  });

  const entries = await Promise.all(
    list.keys.map(async (key) => {
      const value = await env.BOT_KV.get(key.name, 'text');
      return value ? (JSON.parse(value) as AuditLogEntry) : null;
    })
  );

  return entries.filter((e): e is AuditLogEntry => e !== null);
}
