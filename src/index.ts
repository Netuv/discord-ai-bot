import { InteractionType, InteractionResponseType, verifyKey } from "discord-interactions";
import { handleMcpRequest, setEnv } from "./mcp-handler";

const AI_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

// ─── WORKER HANDLER ─────────────────────────────────────────

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // FEATURE 2026-06-19: Set env untuk dipakai tools di mcp-handler
    setEnv(env);

    try {
      // Jalur A: MCP untuk AI Desktop (GET SSE / POST JSON-RPC)
      if (url.pathname === "/" || url.pathname === "/mcp") {
        return handleMcpRequest(request);
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

        if (interaction.type === InteractionType.APPLICATION_COMMAND) {
          if (interaction.data.name === "ask") {
            const promptUser = interaction.data.options?.[0]?.value || "Halo";
            let balasanAI = "AI binding tidak tersedia.";
            if (env.AI) {
              const hasilAI = await env.AI.run(AI_MODEL, {
                messages: [{ role: "user", content: promptUser }],
              });
              balasanAI = hasilAI.response;
            }
            return new Response(
              JSON.stringify({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                  content: `**🧠 Pertanyaan:** ${promptUser}\n\n**🤖 Jawaban:** ${balasanAI}`,
                },
              }),
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
