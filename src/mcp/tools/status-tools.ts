import type { Env } from '../../types/env';
import { D1Client } from '../../core/d1';

/**
 * Status and health check tools - public access
 */

export interface StatusResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: 'ok' | 'error';
    kv: 'ok' | 'error';
    ai: 'ok' | 'error';
  };
  stats?: {
    totalArticles: number;
    articlesLast24h: number;
    avgPipelineMs: number;
  };
}

/**
 * Get system status and health metrics
 */
export async function getStatus(env: Env): Promise<StatusResult> {
  const db = new D1Client(env);
  const result: StatusResult = {
    status: 'healthy',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: 'ok',
      kv: 'ok',
      ai: 'ok',
    },
  };

  try {
    // Test database connection
    const dbTest = await db.first<{ count: number }>(
      "SELECT COUNT(*) as count FROM scheduled_tasks"
    );
    result.services.database = dbTest ? 'ok' : 'error';

    // Test KV connection
    await env.BOT_KV.get('health-check-test');
    result.services.kv = 'ok';

    // Get stats
    const [totalArticles, recentArticles, avgPipeline] = await Promise.all([
      db.first<{ count: number }>(
        'SELECT COUNT(*) as count FROM content_history'
      ),
      db.first<{ count: number }>(
        "SELECT COUNT(*) as count FROM content_history WHERE published_at > datetime('now', '-1 day')"
      ),
      db.first<{ avg_ms: number }>(
        "SELECT AVG(total_ms) as avg_ms FROM pipeline_metrics WHERE created_at > datetime('now', '-1 day')"
      ),
    ]);

    result.stats = {
      totalArticles: totalArticles?.count ?? 0,
      articlesLast24h: recentArticles?.count ?? 0,
      avgPipelineMs: Math.round(avgPipeline?.avg_ms ?? 0),
    };

    // Determine overall status
    const hasErrors = Object.values(result.services).some((s) => s === 'error');
    result.status = hasErrors ? 'degraded' : 'healthy';
  } catch (e) {
    result.status = 'unhealthy';
    result.services.database = 'error';
  }

  return result;
}
