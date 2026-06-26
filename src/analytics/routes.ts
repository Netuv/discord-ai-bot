import { Hono } from 'hono';
import type { Env } from '../types/env';
import { D1Client } from '../core/d1';

const analyticsRouter = new Hono<{ Bindings: Env }>();

analyticsRouter.get('/overview', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7', 10);
  const db = new D1Client(c.env);

  const [formatDist, successRate, avgDuration, topTopics] = await Promise.all([
    db.query(`SELECT format, COUNT(*) as count FROM content_history
              WHERE published_at > datetime('now', ?) GROUP BY format ORDER BY count DESC`,
              [`-${days} days`]),
    db.query(`SELECT
                COUNT(*) as total,
                SUM(success) as successes,
                ROUND(100.0 * SUM(success) / COUNT(*), 1) as rate
              FROM pipeline_metrics WHERE created_at > datetime('now', ?)`,
              [`-${days} days`]),
    db.query(`SELECT
                ROUND(AVG(total_ms), 0) as avg_ms,
                ROUND(AVG(generator_ms), 0) as avg_generator_ms
              FROM pipeline_metrics WHERE created_at > datetime('now', ?)`,
              [`-${days} days`]),
    db.query(`SELECT topic, reactions FROM content_history
              WHERE published_at > datetime('now', ?) ORDER BY reactions DESC LIMIT 5`,
              [`-${days} days`]),
  ]);

  return c.json({ 
    formatDistribution: formatDist, 
    successRate: successRate[0], 
    avgDuration: avgDuration[0], 
    topTopics 
  });
});

analyticsRouter.get('/providers', async (c) => {
  const db = new D1Client(c.env);
  const health = await db.query(`
    SELECT provider, consecutive_failures, total_calls, total_successes, total_failures,
           avg_latency_ms, last_success_at, disabled_until
    FROM provider_health ORDER BY total_calls DESC
  `);
  return c.json({ providers: health });
});

analyticsRouter.get('/traces/:traceId', async (c) => {
  const db = new D1Client(c.env);
  const traceId = c.req.param('traceId');

  const [metrics, history, logs] = await Promise.all([
    db.query(`SELECT * FROM pipeline_metrics WHERE trace_id = ?`, [traceId]),
    db.query(`SELECT * FROM content_history WHERE trace_id = ?`, [traceId]),
    db.query(`SELECT * FROM task_logs WHERE trace_id = ? ORDER BY timestamp`, [traceId]),
  ]);

  return c.json({ metrics: metrics[0], history: history[0], logs });
});

analyticsRouter.get('/content-history', async (c) => {
  const days = parseInt(c.req.query('days') ?? '14', 10);
  const format = c.req.query('format');
  const category = c.req.query('category');
  const db = new D1Client(c.env);

  let sql = `SELECT * FROM content_history WHERE published_at > datetime('now', ?)`;
  const bindings: unknown[] = [`-${days} days`];

  if (format) { 
    sql += ` AND format = ?`; 
    bindings.push(format); 
  }
  if (category) { 
    sql += ` AND category = ?`; 
    bindings.push(category); 
  }
  sql += ` ORDER BY published_at DESC LIMIT 50`;

  const history = await db.query(sql, bindings);
  return c.json({ history });
});

analyticsRouter.get('/dlq', async (c) => {
  const db = new D1Client(c.env);
  const dlq = await db.query(
    `SELECT * FROM dead_letter_queue WHERE resolved = 0 ORDER BY last_seen DESC LIMIT 20`
  );
  return c.json({ dlq });
});

export { analyticsRouter };
