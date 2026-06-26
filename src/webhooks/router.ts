import { Hono } from 'hono';
import type { Env } from '../types/env';
import { verifyDiscordSignature } from './verifiers/discord';
import { D1Client } from '../core/d1';
import type { ContentCategory, ContentFormat } from '../content/types/content';
import { traceLog } from '../core/trace-logger';

const webhookRouter = new Hono<{ Bindings: Env }>();

webhookRouter.post('/discord', async (c) => {
  const isValid = await verifyDiscordSignature(c.req.raw, c.env);
  if (!isValid) return c.json({ error: 'Invalid signature' }, 401);

  const body = await c.req.json<any>();

  // Log event ke D1
  const db = new D1Client(c.env);
  await db.execute(
    `INSERT INTO webhook_events (source, event_type, payload) VALUES (?, ?, ?)`,
    ['discord', body.type.toString(), JSON.stringify(body)]
  ).catch(() => {});

  // Handle specific events
  if (body.type === 1) {
    // PING — Discord verifikasi endpoint
    return c.json({ type: 1 });
  }

  if (body.type === 3 && body.data?.custom_id?.startsWith('generate_')) {
    // Button interaction: trigger article generation
    const category = body.data.custom_id.replace('generate_', '') as ContentCategory;
    // c.executionCtx?.waitUntil(triggerArticleFromWebhook(body.channel_id, category, c.env));
    traceLog('info', 'Webhook', `Received generate request for ${category}`);
    return c.json({ type: 5 }); // Deferred message update
  }

  return c.json({ ok: true });
});

webhookRouter.post('/trigger', async (c) => {
  const apiKey = c.req.header('x-api-key');
  if (apiKey !== c.env.MCP_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    channelId?: string;
    category?: ContentCategory;
    format?: ContentFormat;
    topic?: string;
  }>();

  traceLog('info', 'Webhook', `Received custom trigger for ${body.topic || body.category}`);

  // In a full integration, this calls the agent orchestrator
  // c.executionCtx?.waitUntil(runArticlePipeline(...));

  return c.json({ ok: true, message: 'Article generation triggered' });
});

export { webhookRouter };
