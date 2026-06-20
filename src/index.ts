import { InteractionType, InteractionResponseType, verifyKey } from "discord-interactions";
import { handleMcpRequest, setEnv } from "./mcp-handler";
import { handleScheduled, handleTestCron } from "./scheduler";
import { AiRouter, defaultProviderModels } from "./ai-router";
import { getUserConfig, setUserConfig, clearUserConfig } from "./user-config";
import { WebScout } from "./web-scout";

// ─── WORKER HANDLER ─────────────────────────────────────────

export default {
  // FEATURE 2026-06-19: Scheduled tasks via Cron Triggers
  async scheduled(controller: any, env: any, ctx: any): Promise<void> {
    console.log(`⏰ Cron triggered at ${new Date().toISOString()}`);

    try {
      const result = await handleScheduled(env, ctx);
      console.log(`📊 Scheduler: ${result.executed} executed, ${result.failed} failed`);
      for (const log of result.logs) {
        console.log(`  ${log}`);
      }

      // Kalau ada yang gagal, retry lain kali
      if (result.failed > 0) {
        // Biarkan cron job berikutnya yang menangani
        console.warn(`⚠️ ${result.failed} task(s) gagal. Akan dicoba ulang di cron berikutnya.`);
      }
    } catch (e: any) {
      console.error("❌ Scheduler error:", e.message);
    }
  },

  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // FEATURE 2026-06-19: Set env untuk dipakai tools di mcp-handler
    setEnv(env);

    try {
      // Jalur A: MCP untuk AI Desktop (GET SSE / POST JSON-RPC)
      if (url.pathname === "/" || url.pathname === "/mcp") {
        return handleMcpRequest(request);
      }

      // Jalur C: Test Cron — trigger manual task scheduling
      if (url.pathname === "/cron/test" && request.method === "GET") {
        const taskId = url.searchParams.get("task_id") || undefined;
        const result = await handleTestCron(env, taskId);
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Jalur E: WebScout API — search & scrape via HTTP (untuk testing / external)
      if (url.pathname === "/web/search" && request.method === "GET") {
        const query = url.searchParams.get("q");
        if (!query) return new Response("Missing ?q= parameter", { status: 400 });

        try {
          const scout = new WebScout(env);
          const results = await scout.search(query, { maxResults: 5 });
          return new Response(JSON.stringify(results, null, 2), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.pathname === "/web/scrape" && request.method === "GET") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) return new Response("Missing ?url= parameter", { status: 400 });

        try {
          const scout = new WebScout(env);
          const page = await scout.scrapePage(targetUrl);
          return new Response(JSON.stringify(page, null, 2), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // Jalur D: Webhook untuk notifikasi scheduler (dipanggil dari cron)
      if (url.pathname === "/cron/notify" && request.method === "POST") {
        const body: any = await request.json();
        const token = env.DISCORD_TOKEN;
        const channelId = body.channel_id;
        if (!token || !channelId) {
          return new Response("Missing DISCORD_TOKEN or channel_id", { status: 400 });
        }
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `⏰ **Scheduler Report**\n${body.executed} ✅ executed, ${body.failed} ❌ failed\n\n${(body.logs || []).slice(0, 5).join("\n")}`,
            }),
          }
        );
        const msg = res.ok ? "Notified" : await res.text();
        return new Response(JSON.stringify({ ok: res.ok, message: msg }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Jalur B: Discord Interactions
      if (url.pathname === "/interactions" && request.method === "POST") {
        const signature = request.headers.get("x-signature-ed25519");
        const timestamp = request.headers.get("x-signature-timestamp");
        const rawBody = await request.clone().text();

        if (!signature || !timestamp) {
          return new Response("Bad request signature", { status: 401 });
        }

        const isValidRequest = await verifyKey(
          rawBody,
          signature,
          timestamp,
          env.DISCORD_PUBLIC_KEY
        );

        if (!isValidRequest) {
          console.error("Invalid Discord signature");
          return new Response("Bad request signature", { status: 401 });
        }

        const interaction = JSON.parse(rawBody);

        // BUGFIX 2026-06-19: Batasi interaksi hanya untuk user ID tertentu
        const userId = interaction.member?.user?.id || interaction.user?.id;
        if (userId && env.ALLOWED_USER_ID && userId !== env.ALLOWED_USER_ID) {
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: "⛔ Maaf, bot ini hanya bisa digunakan oleh owner. 🚫" },
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (interaction.type === InteractionType.PING) {
          return new Response(
            JSON.stringify({ type: InteractionResponseType.PONG }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        // Handler: MESSAGE CONTEXT MENU ("Ask AI" — klik kanan pesan)
        // interaction.data.type === 3 untuk MESSAGE context menu
        if (interaction.type === InteractionType.APPLICATION_COMMAND && interaction.data?.type === 3) {
          const cmdName = interaction.data.name;
          const targetMessage = interaction.data.resolved?.messages?.[interaction.data.target_id];
          const promptUser = targetMessage?.content || "(tidak ada teks)";
          const userId = interaction.member?.user?.id || interaction.user?.id;

          let balasanAI = "AI tidak tersedia.";
          let usedConfig: { providerName?: string; modelName?: string } | null = null;

          try {
            const router = new AiRouter(env);
            const userConfig = await getUserConfig(env, userId);
            if (userConfig?.providerName) {
              usedConfig = { providerName: userConfig.providerName ?? undefined, modelName: userConfig.modelName ?? undefined };
              balasanAI = await router.chatWithUserConfig(
                [{ role: "user", content: `Analisis atau tanggapi pesan ini:\n\n${promptUser}` }],
                { providerName: userConfig.providerName, modelName: userConfig.modelName }
              );
            } else {
              balasanAI = await router.chat([{ role: "user", content: `Analisis atau tanggapi pesan ini:\n\n${promptUser}` }]);
            }
          } catch (e: any) {
            balasanAI = `Error: ${e.message}`;
          }

          let responseContent = `**🧠 Analisis Pesan:**\n> ${promptUser.slice(0, 500)}\n\n**🤖 Jawaban:** ${balasanAI}`;
          if (usedConfig?.providerName) {
            responseContent += `\n\n_⚙️ Via: ${usedConfig.providerName} → \`${usedConfig.modelName || "Default"}\`_`;
          }

          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: responseContent },
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        if (interaction.type === InteractionType.APPLICATION_COMMAND) {
          const cmdName = interaction.data.name;

          // Handler /help
          if (cmdName === "help") {
            const helpText = (
              `**🤖 Discord AI Bot — Bantuan**\n\n` +
              `**Slash Commands:**\n` +
              `• \`/ask <prompt>\` — Tanya AI (Router otomatis)\n` +
              `• \`/provider\` — Lihat AI provider & model gratis\n` +
              `• \`/help\` — Lihat bantuan ini\n\n` +
              `**Akses:**\n` +
              `Bot ini hanya bisa digunakan oleh owner.\n\n` +
              `**Akses MCP (AI Agent):**\n` +
              `Endpoint: \`https://discord-ai-bot.luminary-bot.workers.dev/mcp\`\n` +
              `Total tools: ~105 tools\n\n` +
              `**Fitur:**\n` +
              `• 🛡️ Admin Discord (ban, kick, timeout, purge, role, dll)\n` +
              `• 🎨 Manajemen channel/thread/emoji/sticker/webhook\n` +
              `• 🧠 AI Chat + Router Multi-Provider\n` +
              `• 🐙 GitHub Runner (terminal via Actions)\n` +
              `• ⏰ Scheduler (tugas terjadwal otomatis)\n` +
              `• 📊 Polling, Crosspost, Audit Log\n\n` +
              `> Dibuat dengan Cloudflare Workers + Discord API`
            );
            return new Response(
              JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: helpText },
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // Handler /ask
          if (cmdName === "ask") {
            const promptUser = interaction.data.options?.[0]?.value || "Halo";
            const userId = interaction.member?.user?.id || interaction.user?.id;
            let balasanAI = "AI tidak tersedia.";
            let usedConfig: { providerName?: string; modelName?: string } | null = null;

            try {
              const router = new AiRouter(env);

              // Cek user config — apakah user sudah pilih provider/model tertentu
              const userConfig = await getUserConfig(env, userId);
              if (userConfig?.providerName) {
                usedConfig = { providerName: userConfig.providerName ?? undefined, modelName: userConfig.modelName ?? undefined };
                balasanAI = await router.chatWithUserConfig(
                  [{ role: "user", content: promptUser }],
                  { providerName: userConfig.providerName, modelName: userConfig.modelName }
                );
              } else {
                balasanAI = await router.chat([{ role: "user", content: promptUser }]);
              }
            } catch (e: any) {
              balasanAI = `Error: ${e.message}`;
            }

            let responseContent = `**🧠 Pertanyaan:** ${promptUser}\n\n**🤖 Jawaban:** ${balasanAI}`;
            if (usedConfig?.providerName) {
              responseContent += `\n\n_⚙️ Via: ${usedConfig.providerName} → \`${usedConfig.modelName || "Default"}\`_`;
            }

            return new Response(
              JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: responseContent },
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // Handler /provider
          if (cmdName === "provider") {
            const providerOption = interaction.data.options?.[0]?.value || null;
            const modelOption = interaction.data.options?.[1]?.value || null;
            const actionOption = interaction.data.options?.[2]?.value || null;
            const userId = interaction.member?.user?.id || interaction.user?.id;

            // Provider SET: user pilih provider & model
            if (providerOption && modelOption && actionOption !== "reset") {
              const prov = defaultProviderModels.find((p) => p.name === providerOption);
              if (!prov) {
                return new Response(
                  JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `❌ Provider "${providerOption}" tidak dikenal.` } }),
                  { headers: { "Content-Type": "application/json" } }
                );
              }

              const validModel = prov.models.find((m) => m.name === modelOption);
              if (!validModel) {
                return new Response(
                  JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `❌ Model "${modelOption}" tidak tersedia di ${providerOption}.` } }),
                  { headers: { "Content-Type": "application/json" } }
                );
              }

              // Cek apakah provider aktif (punya key)
              const router = new AiRouter(env);
              const activeProviders = router.getActiveProviders();
              const isActive = activeProviders.some((a) => a.name === prov.name);
              if (!isActive) {
                return new Response(
                  JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `⏸️ Provider **${prov.name}** tidak aktif. Set API key dulu via \`npx wrangler secret put ${prov.secret}\`` } }),
                  { headers: { "Content-Type": "application/json" } }
                );
              }

              // Simpan ke KV
              await setUserConfig(env, userId, {
                providerName: prov.name,
                modelName: modelOption,
              });

              const content = `✅ **Konfigurasi AI Diperbarui!**\n\n📌 **Provider:** ${prov.emoji} ${prov.name}\n📌 **Model:** \`${modelOption}\`\n\nSekarang semua \`/ask\` akan menggunakan provider & model ini.\nGunakan \`/provider reset\` untuk kembali ke auto-router.`;

              return new Response(
                JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } }),
                { headers: { "Content-Type": "application/json" } }
              );
            }

            // Provider RESET: kembali ke auto-router
            if (actionOption === "reset" || providerOption === "reset") {
              await clearUserConfig(env, userId);

              return new Response(
                JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `✅ **Konfigurasi AI Direset!**\n\nSekarang semua \`/ask\` akan menggunakan auto-router (priority-based failover).` } }),
                { headers: { "Content-Type": "application/json" } }
              );
            }

            // Provider STATUS: lihat konfigurasi saat ini + semua provider
            const userConfig = await getUserConfig(env, userId);
            const router = new AiRouter(env);
            const activeProviders = router.getActiveProviders();

            let statusLine = "";
            if (userConfig?.providerName) {
              const provInfo = defaultProviderModels.find((p) => p.name === userConfig.providerName);
              statusLine = `📌 **Konfigurasi Aktif:**\n${provInfo?.emoji || "⚙️"} **${userConfig.providerName}** → \`${userConfig.modelName || "Default"}\`\n\n`;
            }

            const lines = defaultProviderModels.map((p) => {
              const isActive = activeProviders.some((a) => a.name === p.name);
              const statusIcon = isActive ? "✅" : "⏸️";
              const keyRequired = p.secret ? " (butuh key)" : "";
              return `${statusIcon} ${p.emoji} **${p.name}**${keyRequired} — ${p.models.length} model gratis`;
            });

            const content = (
              `**🤖 AI Provider & Model**\n\n` +
              `${statusLine}` +
              `**Daftar Provider:**\n${lines.join("\n")}\n\n` +
              `🔧 **Cara pakai:**\n` +
              `• \`/provider <nama> <model>\` — Set provider & model\n` +
              `• \`/provider reset\` — Kembali ke auto-router\n` +
              `• \`/provider\` — Lihat status\n\n` +
              `💡 Router otomatis: coba priority 1, gagal → fallback.`
            );

            return new Response(
              JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content } }),
              { headers: { "Content-Type": "application/json" } }
            );
          }
        }
        return new Response("Perintah tidak dikenal", { status: 400 });
      }

      return new Response("Halaman Tidak Ditemukan", { status: 404 });
    } catch (err: any) {
      console.error("Unhandled error:", err);
      return new Response(`Internal Error: ${err.message}`, { status: 500 });
    }
  },
};
