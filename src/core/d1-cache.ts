import type { D1Client } from './d1';
import type { Env } from '../types/env';
import { safeJsonParse } from './safe-fetch';

export class D1Cache {
  constructor(private db: D1Client) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.first<{ value: string }>(
      "SELECT value FROM content_cache WHERE cache_key = ? AND expires_at > datetime('now')",
      key
    );
    if (!row) return null;
    return safeJsonParse<T>(row.value, null as unknown as T);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    source?: string
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.db.execute(
      `INSERT OR REPLACE INTO content_cache (cache_key, value, expires_at, source)
       VALUES (?, ?, datetime('now', ?), ?)`,
      key,
      serialized,
      `+${ttlSeconds} seconds`,
      source ?? null
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.execute('DELETE FROM content_cache WHERE cache_key = ?', key);
  }
}
