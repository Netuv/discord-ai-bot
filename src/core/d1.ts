import type { Env } from '../types/env';
import { traceLog } from './trace-logger';
import { AppError, ErrorCode } from './errors';

export class D1Client {
  private db: D1Database;

  constructor(env: Env) {
    this.db = env.CONTENT_DB;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T[]> {
    try {
      const result = await this.db.prepare(sql).bind(...bindings).all<T>();
      return result.results;
    } catch (e) {
      traceLog('error', 'D1Client', `Query failed: ${sql.slice(0, 80)}`, {
        error: (e as Error).message,
      });
      throw new AppError(ErrorCode.DATABASE_ERROR, (e as Error).message);
    }
  }

  async execute(sql: string, ...bindings: unknown[]): Promise<{ changes: number }> {
    try {
      const result = await this.db.prepare(sql).bind(...bindings).run();
      return { changes: result.meta.changes };
    } catch (e) {
      traceLog('error', 'D1Client', `Execute failed: ${sql.slice(0, 80)}`, {
        error: (e as Error).message,
      });
      throw new AppError(ErrorCode.DATABASE_ERROR, (e as Error).message);
    }
  }

  async first<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T | null> {
    const results = await this.query<T>(sql, ...bindings);
    return results.length > 0 ? (results[0] ?? null) : null;
  }

  async batch(
    statements: Array<{ sql: string; bindings?: unknown[] }>
  ): Promise<void> {
    const stmts = statements.map((s) =>
      this.db.prepare(s.sql).bind(...(s.bindings ?? []))
    );
    await this.db.batch(stmts);
  }

  // Cleanup expired cache entries
  async cleanupCache(): Promise<number> {
    const result = await this.execute(
      "DELETE FROM content_cache WHERE expires_at < datetime('now')"
    );
    return result.changes;
  }
}
