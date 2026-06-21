/**
 * turbo-helper.ts — HTTP Client ke Turbo Layer (Vercel/Koyeb)
 * 
 * Semua fungsi opsional: return null kalau gagal, TIDAK PERNAH throw.
 * Kalau env.TURBO_SERVICE_URL tidak diset → semua fungsi return null.
 * 
 * Fungsi:
 * - callTurbo()           — Generic POST ke endpoint Turbo
 * - turboChat()           — Chat AI via Turbo (heavy lifting)
 * - turboHeavyArticle()   — Generate artikel via Turbo (build prompt lokal)
 * - turboDiscordFollowup()— Kirim follow-up ke Discord via Turbo
 * - isTurboAlive()        — Health check Turbo server
 * - discordFollowupDirect() — Kirim follow-up LANGSUNG (tanpa Turbo proxy)
 *
 * H1 (2026-06-21): Prompt building & JSON parsing di Worker (src/article-writer.ts).
 * Turbo Layer jadi simple AI proxy tanpa duplikasi article logic.
 */

// ─── Generic Call ─────────────────────────────────────────

/**
 * Panggil endpoint Turbo dengan silent fallback.
 * Return parsed JSON atau null.
 */
async function callTurbo(env: any, endpoint: string, payload: any): Promise<any | null> {
  const baseUrl = env.TURBO_SERVICE_URL;
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000), // 120 detik — Vercel kadang slow
    });

    if (!res.ok) {
      console.warn(`[Turbo] ${endpoint} HTTP ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (e: any) {
    console.warn(`[Turbo] ${endpoint} error: ${e.message}`);
    return null;
  }
}

// ─── Chat via Turbo ──────────────────────────────────────

export async function turboChat(
  env: any,
  messages: Array<{ role: string; content: string }>,
  model?: string
): Promise<string | null> {
  const result = await callTurbo(env, "/ai/chat", { messages, model });
  if (result && typeof result.content === "string" && result.content.length > 0) {
    return result.content;
  }
  return null;
}

// ─── Heavy Article via Turbo ─────────────────────────────

/**
 * Generate artikel via Turbo Layer.
 * H1: Build prompt LOKAL (src/article-writer.ts), kirim prompt ke Turbo proxy.
 * Turbo hanya call AI + return raw content. Worker yang parse JSON.
 */
export async function turboHeavyArticle(
  env: any,
  topic: string,
  research: { summary?: string; reviewSummary?: string }
): Promise<any | null> {
  // Import dari article-writer.ts (singleton — Workers bundle at deploy time)
  const mod = await import("./article-writer");
  const buildArticlePrompt = mod.buildArticlePrompt;
  const parseArticleJSON = mod.parseArticleJSON;

  try {
    // Build prompt local — no duplication!
    const prompt = buildArticlePrompt(
      topic,
      research.summary || "Gunakan pengetahuan umum.",
      research.reviewSummary || ""
    );

    // Kirim prompt ke Turbo's /article/heavy sebagai messages[]
    const result = await callTurbo(env, "/article/heavy", {
      messages: [{ role: "user", content: prompt }],
    });

    if (!result || !result.content) return null;

    // Parse response LOCAL — Worker yang handle, bukan Turbo
    try {
      const article = parseArticleJSON(result.content);
      if (
        article &&
        article.title &&
        Array.isArray(article.sections) &&
        article.sections.length > 0
      ) {
        return article;
      }
    } catch (e: any) {
      console.warn(`[Turbo] Parse artikel gagal: ${e.message}`);
    }

    return null;
  } catch (e: any) {
    console.warn(`[Turbo] HeavyArticle error: ${e.message}`);
    return null;
  }
}

// ─── Discord Follow-up via Turbo ─────────────────────────

export async function turboDiscordFollowup(
  env: any,
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<boolean> {
  const result = await callTurbo(env, "/discord/followup", {
    applicationId,
    interactionToken,
    content,
  });
  return result?.ok === true;
}

// ─── Direct Discord Follow-up ─────────────────────────────

export async function discordFollowupDirect(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<boolean> {
  const chunks = chunkTextForDiscord(content, 2000);

  try {
    const res = await fetch(
      `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chunks[0] }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return false;

    for (let i = 1; i < chunks.length; i++) {
      await fetch(
        `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: chunks[i] }),
          signal: AbortSignal.timeout(10000),
        }
      );
    }

    return true;
  } catch {
    return false;
  }
}

// ─── Health Check ─────────────────────────────────────────

export async function isTurboAlive(env: any): Promise<boolean> {
  const baseUrl = env.TURBO_SERVICE_URL;
  if (!baseUrl) return false;

  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Helper: Chunk Text ──────────────────────────────────

function chunkTextForDiscord(text: string, maxLength: number): string[] {
  if (!text || text.length === 0) return [""];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength);
    if (cut === -1) cut = remaining.lastIndexOf(". ", maxLength);
    if (cut === -1 || cut < maxLength / 2) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
