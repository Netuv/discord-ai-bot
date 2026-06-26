import type { Env } from '../../types/env';
import { D1Client } from '../../core/d1';
import { resolveDLQ, getUnresolvedDLQ } from '../../queue/dead-letter';

/**
 * Admin tools - admin access only
 */

/**
 * Get AI provider health status
 */
export async function getProviderHealth(env: Env) {
  const db = new D1Client(env);

  const providers = await db.query<{
    provider: string;
    consecutive_failures: number;
    total_calls: number;
    total_successes: number;
    total_failures: number;
    avg_latency_ms: number | null;
    last_failure_at: string | null;
    last_success_at: string | null;
    disabled_until: string | null;
    disabled_reason: string | null;
  }>(`
    SELECT * FROM provider_health
    ORDER BY total_calls DESC
  `);

  const summary = {
    totalProviders: providers.length,
    healthyProviders: providers.filter(
      (p) => !p.disabled_until || new Date(p.disabled_until) < new Date()
    ).length,
    disabledProviders: providers.filter(
      (p) => p.disabled_until && new Date(p.disabled_until) > new Date()
    ).length,
  };

  return {
    summary,
    providers,
  };
}

/**
 * Get dead letter queue entries
 */
export async function getDLQEntries(
  limit: number,
  env: Env
) {
  const entries = await getUnresolvedDLQ(env, limit);

  return {
    count: entries.length,
    entries,
  };
}

/**
 * Resolve (mark as handled) DLQ entries
 */
export async function clearDLQEntries(
  args: { ids: string[]; resolution: string },
  env: Env
): Promise<{ success: boolean; resolved: number; error?: string }> {
  try {
    const resolved = await resolveDLQ(args.ids, args.resolution, env);

    return {
      success: true,
      resolved,
    };
  } catch (e) {
    return {
      success: false,
      resolved: 0,
      error: (e as Error).message,
    };
  }
}

/**
 * Get analytics overview
 */
export async function getAnalyticsOverview(
  days: number,
  env: Env
) {
  const db = new D1Client(env);

  const [contentStats, pipelineStats, formatDist, categoryDist] = await Promise.all([
    // Content statistics
    db.first<{
      total_articles: number;
      avg_word_count: number;
      avg_sections: number;
      total_reactions: number;
    }>(`
      SELECT
        COUNT(*) as total_articles,
        ROUND(AVG(word_count), 0) as avg_word_count,
        ROUND(AVG(sections_count), 1) as avg_sections,
        SUM(reactions) as total_reactions
      FROM content_history
      WHERE published_at > datetime('now', '-' || ? || ' days')
    `, days),

    // Pipeline performance
    db.first<{
      total_runs: number;
      success_rate: number;
      avg_total_ms: number;
      avg_strategist_ms: number;
      avg_research_ms: number;
      avg_generator_ms: number;
    }>(`
      SELECT
        COUNT(*) as total_runs,
        ROUND(100.0 * SUM(success) / COUNT(*), 1) as success_rate,
        ROUND(AVG(total_ms), 0) as avg_total_ms,
        ROUND(AVG(strategist_ms), 0) as avg_strategist_ms,
        ROUND(AVG(research_ms), 0) as avg_research_ms,
        ROUND(AVG(generator_ms), 0) as avg_generator_ms
      FROM pipeline_metrics
      WHERE created_at > datetime('now', '-' || ? || ' days')
    `, days),

    // Format distribution
    db.query<{ format: string; count: number; avg_reactions: number }>(`
      SELECT
        format,
        COUNT(*) as count,
        ROUND(AVG(reactions), 1) as avg_reactions
      FROM content_history
      WHERE published_at > datetime('now', '-' || ? || ' days')
      GROUP BY format
      ORDER BY count DESC
    `, days),

    // Category distribution
    db.query<{ category: string; count: number; avg_word_count: number }>(`
      SELECT
        category,
        COUNT(*) as count,
        ROUND(AVG(word_count), 0) as avg_word_count
      FROM content_history
      WHERE published_at > datetime('now', '-' || ? || ' days')
      GROUP BY category
      ORDER BY count DESC
    `, days),
  ]);

  return {
    period: `Last ${days} days`,
    contentStats: contentStats ?? {
      total_articles: 0,
      avg_word_count: 0,
      avg_sections: 0,
      total_reactions: 0,
    },
    pipelineStats: pipelineStats ?? {
      total_runs: 0,
      success_rate: 0,
      avg_total_ms: 0,
      avg_strategist_ms: 0,
      avg_research_ms: 0,
      avg_generator_ms: 0,
    },
    formatDistribution: formatDist,
    categoryDistribution: categoryDist,
  };
}

/**
 * DESTRUCTIVE/RAW DATABASE TOOLS
 */

export async function executeDbQuery(args: { sql: string; bindings?: unknown[] }, env: Env) {
  const db = new D1Client(env);
  const results = await db.query(args.sql, ...(args.bindings ?? []));
  return { success: true, count: results.length, results };
}

export async function executeDbWrite(args: { sql: string; bindings?: unknown[] }, env: Env) {
  const db = new D1Client(env);
  const result = await db.execute(args.sql, ...(args.bindings ?? []));
  return { success: true, changes: result.changes };
}

/**
 * KV STORAGE TOOLS
 */

export async function listKvKeys(args: { prefix?: string; limit?: number }, env: Env) {
  const options: KVNamespaceListOptions = { limit: args.limit ?? 1000 };
  if (args.prefix) {
    options.prefix = args.prefix;
  }
  const result = await env.BOT_KV.list(options);
  return { success: true, keys: result.keys, list_complete: result.list_complete };
}

export async function getKvValue(args: { key: string; type?: 'text' | 'json' }, env: Env) {
  const type = args.type ?? 'text';
  const value = type === 'json' ? await env.BOT_KV.get(args.key, 'json') : await env.BOT_KV.get(args.key);
  return { success: true, key: args.key, value };
}

export async function putKvValue(args: { key: string; value: string; expirationTtl?: number }, env: Env) {
  const options = args.expirationTtl ? { expirationTtl: args.expirationTtl } : {};
  await env.BOT_KV.put(args.key, args.value, options);
  return { success: true, key: args.key };
}

export async function deleteKvValue(args: { key: string }, env: Env) {
  await env.BOT_KV.delete(args.key);
  return { success: true, key: args.key };
}
