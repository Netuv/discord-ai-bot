import type { Env } from '../../types/env';
import type { ContentBrief } from '../../content/types/content';
import type { PipelineOverrides } from '../../agent/types';
import { D1Client } from '../../core/d1';
import { runArticlePipeline } from '../../agent/orchestrator';

/**
 * Content generation and history tools - user access
 */

export interface GenerateArticleArgs {
  channelId?: string;
  category?: 'anime' | 'manga' | 'game' | 'novel';
  format?: string;
  topic?: string;
}

export interface GetHistoryArgs {
  days?: number;
  format?: string;
  category?: string;
  limit?: number;
}

export interface GetMetricsArgs {
  days?: number;
}

/**
 * Trigger article generation pipeline
 */
export async function generateArticle(
  args: GenerateArticleArgs,
  env: Env,
  ctx: ExecutionContext
): Promise<{
  success: boolean;
  contentId?: string | undefined;
  messageId?: string | undefined;
  traceId: string;
  totalMs: number;
  error?: string | undefined;
}> {
  const channelId = args.channelId ?? env.DISCORD_DEFAULT_CHANNEL_ID;

  if (!channelId) {
    return {
      success: false,
      traceId: 'none',
      totalMs: 0,
      error: 'No channel ID provided and no default configured',
    };
  }

  const overrides = {
    category: args.category,
    format: args.format,
    topic: args.topic,
  } as PipelineOverrides;

  const result = await runArticlePipeline(channelId, 'manual', env, ctx, overrides);

  return {
    success: result.success,
    contentId: result.contentId,
    messageId: result.discordMessageId,
    traceId: result.traceId,
    totalMs: result.totalMs,
    error: result.error?.message,
  };
}

/**
 * Get content history with filters
 */
export async function getHistory(args: GetHistoryArgs, env: Env) {
  const db = new D1Client(env);
  const days = args.days ?? 7;
  const limit = args.limit ?? 50;

  // Use SELECT * to avoid column mismatch with remote DB
  // The DB may be from an older migration version
  let sql = `SELECT * FROM content_history
    WHERE published_at > datetime('now', '-' || ? || ' days')`;
  const bindings: unknown[] = [days];

  if (args.format) {
    sql += ' AND format = ?';
    bindings.push(args.format);
  }

  if (args.category) {
    sql += ' AND category = ?';
    bindings.push(args.category);
  }

  sql += ' ORDER BY published_at DESC LIMIT ?';
  bindings.push(limit);

  const history = await db.query(sql, ...bindings);

  return {
    count: history.length,
    days,
    filters: {
      format: args.format,
      category: args.category,
    },
    history,
  };
}

/**
 * Get pipeline metrics and statistics
 */
export async function getMetrics(args: GetMetricsArgs, env: Env) {
  const db = new D1Client(env);
  const days = args.days ?? 7;

  const [overview, formatDist, providerStats, recentRuns] = await Promise.all([
    // Overall success rate and timing
    db.first<{
      total: number;
      successes: number;
      failures: number;
      success_rate: number;
      avg_total_ms: number;
      avg_generator_ms: number;
    }>(`
      SELECT
        COUNT(*) as total,
        SUM(success) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        ROUND(100.0 * SUM(success) / COUNT(*), 1) as success_rate,
        ROUND(AVG(total_ms), 0) as avg_total_ms,
        ROUND(AVG(generator_ms), 0) as avg_generator_ms
      FROM pipeline_metrics
      WHERE created_at > datetime('now', '-' || ? || ' days')
    `, days),

    // Format distribution
    db.query<{ format: string; count: number }>(`
      SELECT format, COUNT(*) as count
      FROM content_history
      WHERE published_at > datetime('now', '-' || ? || ' days')
      GROUP BY format
      ORDER BY count DESC
    `, days),

    // Provider performance
    db.query<{ provider: string; calls: number; avg_latency: number }>(`
      SELECT
        provider_used as provider,
        COUNT(*) as calls,
        ROUND(AVG(generator_ms), 0) as avg_latency
      FROM pipeline_metrics
      WHERE created_at > datetime('now', '-' || ? || ' days')
        AND provider_used != 'multiple'
      GROUP BY provider_used
      ORDER BY calls DESC
    `, days),

    // Recent pipeline runs
    db.query<{
      trace_id: string;
      format: string;
      category: string;
      success: number;
      total_ms: number;
      created_at: string;
    }>(`
      SELECT trace_id, format, category, success, total_ms, created_at
      FROM pipeline_metrics
      ORDER BY created_at DESC
      LIMIT 10
    `),
  ]);

  return {
    period: `Last ${days} days`,
    overview: overview ?? {
      total: 0,
      successes: 0,
      failures: 0,
      success_rate: 0,
      avg_total_ms: 0,
      avg_generator_ms: 0,
    },
    formatDistribution: formatDist,
    providerStats: providerStats,
    recentRuns: recentRuns,
  };
}
