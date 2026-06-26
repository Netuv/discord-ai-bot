import { Hono } from 'hono';
import type { Env } from './types/env';
import { mcpRouter } from './mcp/server';
import { analyticsRouter } from './analytics/routes';
import { webhookRouter } from './webhooks/router';
import { interactionsRouter } from './bot/interactions';
import { handleCron } from './cron/handler';
import { handleQueue } from './queue/handler';

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
  });
});

// Test Cron endpoint
app.get('/test-cron', async (c) => {
  const event = {
    cron: "0 */6 * * *",
    scheduledTime: Date.now(),
    noMicrotasks: false,
  } as unknown as ScheduledEvent;
  
  await handleCron(event, c.env, c.executionCtx as unknown as ExecutionContext);
  return c.json({ success: true, message: "Cron triggered successfully" });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'Discord AI Bot',
    version: '4.0.0',
    endpoints: {
      health: '/health',
      terms: '/terms',
      privacy: '/privacy',
      mcp: '/mcp',
      analytics: '/analytics',
      webhooks: '/webhooks',
      interactions: '/interactions',
    },
  });
});

// Terms of Service
app.get('/terms', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Terms of Service — Discord AI Bot</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#e0e0e0;background:#1a1a2e}h1{color:#58a6ff}h2{color:#8b949e;margin-top:32px}hr{border:0;border-top:1px solid #30363d}footer{margin-top:48px;font-size:.85em;color:#6e7681}</style></head><body>
<h1>Terms of Service</h1>
<p><em>Discord AI Bot — Hermes</em></p>
<hr>
<h2>1. Acceptance</h2>
<p>By inviting or using this bot, you agree to these terms. If you do not agree, remove the bot from your server immediately.</p>
<h2>2. Service</h2>
<p>This bot generates AI-powered content (anime/manga/game/novel articles) and responds to user commands. It runs on Cloudflare Workers and may use external AI providers to fulfill requests.</p>
<h2>3. Data</h2>
<p>The bot stores minimal data: content history, pipeline metrics, and provider health stats. Message content is only processed ephemerally to generate responses and is not permanently stored. We do not sell or share your data.</p>
<h2>4. Fair Use</h2>
<p>Excessive or abusive API calls may result in rate limiting or removal. Automated spam, harassment, or illegal content via the bot is prohibited.</p>
<h2>5. Availability</h2>
<p>Service is provided "as is" without guarantees. Downtime may occur due to Cloudflare maintenance or provider outages.</p>
<h2>6. Changes</h2>
<p>These terms may be updated at any time. Continued use after changes constitutes acceptance.</p>
<hr>
<footer>Contact: developer of the application on Discord | Last updated: June 26, 2026</footer>
</body></html>`);
});

// Privacy Policy
app.get('/privacy', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Privacy Policy — Discord AI Bot</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#e0e0e0;background:#1a1a2e}h1{color:#58a6ff}h2{color:#8b949e;margin-top:32px}hr{border:0;border-top:1px solid #30363d}footer{margin-top:48px;font-size:.85em;color:#6e7681}</style></head><body>
<h1>Privacy Policy</h1>
<hr>
<h2>What We Store</h2>
<ul>
<li>Content history (article ID, topic, category, format, word count, timestamps)</li>
<li>Pipeline metrics (success/failure, timing per phase)</li>
<li>Provider health stats (consecutive failures, latency)</li>
</ul>
<h2>What We DON'T Store</h2>
<ul>
<li>Discord user IDs or messages (processed ephemerally only)</li>
<li>IP addresses (Cloudflare handles this at edge)</li>
<li>Passwords or credentials</li>
</ul>
<h2>Third-Party Services</h2>
<p>We use Cloudflare Workers AI, OpenCode, NVIDIA NIM, and OpenRouter to fulfill AI requests. Each provider processes data under their own privacy policy.</p>
<h2>Data Deletion</h2>
<p>Contact the developer on Discord to request data deletion. Content history is automatically purged after 90 days.</p>
<hr>
<footer>Last updated: June 26, 2026</footer>
</body></html>`);
});

// MCP endpoint
app.post('/mcp', async (c) => {
  return mcpRouter(c.req.raw, c.env);
});

// Analytics API
app.route('/analytics', analyticsRouter);

// Webhook endpoints
app.route('/webhooks', webhookRouter);

// Discord HTTP Interactions
app.route('/interactions', interactionsRouter);

export default {
  // HTTP handler
  fetch: app.fetch,

  // Cron handler - runs every 6 hours
  scheduled: handleCron,

  // Queue consumer handler (Restored to prevent Cloudflare deploy error 11001)
  queue: handleQueue,
};
