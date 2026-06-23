/**
 * index.ts — Discord AI Bot v6.0 Main Entry Point
 * Thin routing + Queue producer + MCP + Discord interactions
 */
import { InteractionResponseType } from 'discord-interactions';
import type { Env } from './types/env';
import type { DiscordInteraction } from './types/discord';
import type { MessageBatch } from '@cloudflare/workers-types';
import { setEnv } from './core/env';
import { logger } from './core/logger';
import { handleMcpRequest } from './mcp/server';
import { registerTools } from './mcp/registry';
import { createAiTools } from './mcp/tools/ai-tools';
import { createDiscordTools } from './mcp/tools/discord-tools';
import { createAdminTools } from './mcp/tools/admin-tools';
import { createSchedulerTools } from './mcp/tools/scheduler-tools';
import { createWebTools } from './mcp/tools/web-tools';
import { createMediaTools } from './mcp/tools/media-tools';
import { createGithubTools } from './mcp/tools/github-tools';
import { handleScheduled, handleTestCron } from './services/scheduler/executors';
import { getTasks, getTask, addTask, updateTask, deleteTask, clearAllTasks } from './services/scheduler/storage';
import type { QueueMessage } from './queue/handler';
import { handleQueue } from './queue/handler';
import { AiRouter } from './ai/router';
import { getUserConfig } from './user/config';
import { WebScout } from './services/web/webscout';
import { turboChat, discordFollowupDirect } from './turbo/client';
import { searchAnimeImage } from './services/media/imagescraper';
import { findYouTubeVideo } from './services/media/videoscraper';

registerTools(createAiTools());
registerTools(createDiscordTools());
registerTools(createAdminTools());
registerTools(createSchedulerTools());
registerTools(createWebTools());
registerTools(createMediaTools());
registerTools(createGithubTools());

export default {
  // ─── Queue Consumer ────────────────────────────────
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    setEnv(env);
    await handleQueue(batch, env, ctx);
  },

  // ─── Cron Producer ─────────────────────────────────
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    setEnv(env);
    logger.info('Worker', 'Cron triggered, sending to Queue', {
      time: new Date().toISOString(),
    });
    try {
      await env.SCHEDULER_QUEUE.send({
        type: 'scheduled-tick',
        timestamp: new Date().toISOString(),
      });
      logger.info('Worker', 'Queue message sent');
    } catch (error: any) {
      logger.error('Worker', 'Failed to send queue message, running directly', {
        error: error.message,
      });
      // Fallback: run directly if queue unavailable
      const r = await handleScheduled(env);
      logger.info('Scheduler', `Direct exec: ${r.executed}, Failed: ${r.failed}`);
    }
  },

  // ─── Fetch Router ──────────────────────────────────
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setEnv(env);
    const url = new URL(request.url);

    try {
      // MCP endpoint
      if (url.pathname === '/' || url.pathname === '/mcp') {
        return handleMcpRequest(request);
      }

      // Test cron (immediate execution)
      if (url.pathname === '/cron/test' && request.method === 'GET') {
        const r = await handleTestCron(
          env,
          url.searchParams.get('task_id') || undefined,
        );
        return new Response(JSON.stringify(r, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Debug: send message to channel
      if (url.pathname === '/debug/send' && request.method === 'GET') {
        const { sendMessage } = await import('./discord/client');
        const r = await sendMessage(
          env.DISCORD_TOKEN,
          url.searchParams.get('channel') || '1213728237243465728',
          url.searchParams.get('msg') || '🔧 Test',
        );
        return new Response(JSON.stringify({ sent: !!r, id: r?.id }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Web search
      if (url.pathname === '/web/search' && request.method === 'GET') {
        const q = url.searchParams.get('q');
        if (!q) return new Response('Missing ?q=', { status: 400 });
        const s = new WebScout(env);
        const results = await s.search(q, { maxResults: 5 });
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Web scrape
      if (url.pathname === '/web/scrape' && request.method === 'GET') {
        const target = url.searchParams.get('url');
        if (!target) return new Response('Missing ?url=', { status: 400 });
        const s = new WebScout(env);
        const p = await s.scrapePage(target);
        return new Response(JSON.stringify(p), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Debug media search
      if (url.pathname === '/debug/media' && request.method === 'GET') {
        const q = url.searchParams.get('q');
        if (!q) return new Response('Missing ?q=', { status: 400 });
        const t = url.searchParams.get('type') || 'both';
        const results: Record<string, unknown> = {
          query: q,
          type: t,
          timestamp: new Date().toISOString(),
        };
        if (t === 'image' || t === 'both')
          results.image = await searchAnimeImage(q, { env }).catch(() => null);
        if (t === 'video' || t === 'both')
          results.video = await findYouTubeVideo(q, env).catch(() => null);
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Task CRUD
      if (url.pathname === '/cron/tasks') {
        try {
          if (request.method === 'GET') {
            const id = url.searchParams.get('id');
            if (id) {
              const t = await getTask(env, id);
              return new Response(
                JSON.stringify(
                  t
                    ? { ok: true, task: t }
                    : { ok: false, error: 'Not found' },
                ),
                {
                  status: t ? 200 : 404,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }
            const tasks = await getTasks(env);
            return new Response(
              JSON.stringify({ ok: true, tasks, count: tasks.length }),
              { headers: { 'Content-Type': 'application/json' } },
            );
          }
          if (request.method === 'POST') {
            const body: Record<string, unknown> = await request.json();
            const t = await addTask(env, {
              name: String(body.name || ''),
              description: String(body.description || body.name || ''),
              cron: String(body.cron || ''),
              action: String(body.action || 'send-message') as any,
              params: (body.params as Record<string, unknown>) || {},
              enabled: body.enabled !== false,
              channel_id: String(body.channel_id || ''),
              guild_id: String(body.guild_id || ''),
            } as any);
            return new Response(JSON.stringify({ ok: true, task: t }), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (request.method === 'PUT') {
            const id = url.searchParams.get('id');
            if (!id)
              return new Response(
                JSON.stringify({ ok: false, error: '?id=' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
              );
            const u = await updateTask(env, id, await request.json());
            return new Response(
              JSON.stringify(
                u
                  ? { ok: true, task: u }
                  : { ok: false, error: 'Not found' },
              ),
              {
                status: u ? 200 : 404,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }
          if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            if (!id)
              return new Response(
                JSON.stringify({ ok: false, error: '?id=' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
              );
            return new Response(
              JSON.stringify({
                ok: true,
                message: `✅ ${id} deleted.`,
              }),
              {
                status: (await deleteTask(env, id)) ? 200 : 404,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }
          return new Response('Method not allowed', { status: 405 });
        } catch (e: any) {
          logger.error('CronTasks', 'error', { error: e.message });
          return new Response(
            JSON.stringify({ ok: false, error: 'Internal' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (url.pathname === '/cron/clear' && request.method === 'GET') {
        return new Response(
          JSON.stringify({ ok: true, cleared: await clearAllTasks(env) }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Discord interactions
      if (url.pathname === '/interactions' && request.method === 'POST') {
        const sig = request.headers.get('x-signature-ed25519');
        const ts = request.headers.get('x-signature-timestamp');
        if (!sig || !ts)
          return new Response('Bad request signature', { status: 401 });
        const { verifyKey } = await import('./discord/verify');
        if (
          !(await verifyKey(
            await request.clone().text(),
            sig,
            ts,
            env.DISCORD_PUBLIC_KEY,
          ))
        ) {
          logger.warn('Worker', 'Invalid signature');
          return new Response('Bad request signature', { status: 401 });
        }

        const interaction: DiscordInteraction = JSON.parse(
          await request.clone().text(),
        );
        if (interaction.type === 1)
          return new Response(
            JSON.stringify({ type: InteractionResponseType.PONG }),
            { headers: { 'Content-Type': 'application/json' } },
          );

        const uid =
          interaction.member?.user?.id || interaction.user?.id;
        if (!uid || (env.ALLOWED_USER_ID && uid !== env.ALLOWED_USER_ID)) {
          if (!uid) logger.warn('Worker', 'Missing user ID');
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: {
                content:
                  '⛔ Maaf, bot ini hanya bisa digunakan oleh owner. 🚫',
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (interaction.type === 2) {
          const cmd = interaction.data?.name;

          if (cmd === 'help')
            return new Response(
              JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content:
                    '**🤖 Discord AI Bot — Bantuan**\n\n• `/ask <prompt>` — Tanya AI\n• `/provider` — Lihat provider\n• `/help` — Bantuan ini',
                },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            );

          if (cmd === 'ask') {
            const prompt = String(
              interaction.data?.options?.[0]?.value || 'Halo',
            );
            ctx.waitUntil(
              (async () => {
                try {
                  const answer =
                    (await turboChat(env, [
                      { role: 'user', content: prompt },
                    ])) ||
                    (await new AiRouter(env).chat([
                      { role: 'user', content: prompt },
                    ]));
                  await discordFollowupDirect(
                    env.DISCORD_APP_ID,
                    interaction.token,
                    `**🧠 Jawaban:** ${answer}`,
                  );
                } catch (e: any) {
                  await discordFollowupDirect(
                    env.DISCORD_APP_ID,
                    interaction.token,
                    '❌ Error.',
                  );
                }
              })(),
            );
            return new Response(
              JSON.stringify({
                type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
              }),
              { headers: { 'Content-Type': 'application/json' } },
            );
          }

          if (cmd === 'provider') {
            const cfg = await getUserConfig(env, uid);
            const active = new AiRouter(env).getActiveProviders('chat');
            let c = '**🤖 AI Provider & Model**\n\n';
            if (cfg?.providerName)
              c += `📋 ${cfg.providerName}${
                cfg.modelName ? ` — \`${cfg.modelName}\`` : ''
              }\n\n`;
            c += `**Provider aktif (${active.length}):**\n`;
            for (const p of active)
              c += `• ${p.name} — \`${p.model}\`\n`;
            return new Response(
              JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: c },
              }),
              { headers: { 'Content-Type': 'application/json' } },
            );
          }
        }

        return new Response(
          JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ Unknown command.' },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    } catch (e: any) {
      logger.error('Worker', 'Global error', { error: e.message });
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
