/**
 * turbo-helper.ts — HTTP Client ke Turbo Layer (Koyeb)
 * 
 * Semua fungsi opsional: return null kalau gagal, TIDAK PERNAH throw.
 * Kalau env.TURBO_SERVICE_URL tidak diset → semua fungsi return null.
 * 
 * Fungsi:
 * - callTurbo()           — Generic POST ke endpoint Turbo
 * - turboChat()           — Chat AI via Turbo (heavy lifting)
 * - turboHeavyArticle()   — Generate artikel via Turbo
 * - turboDiscordFollowup()— Kirim follow-up ke Discord via Turbo
 * - isTurboAlive()        — Health check Turbo server
 * - discordFollowupDirect() — Kirim follow-up LANGSUNG (tanpa Turbo proxy)
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
      signal: AbortSignal.timeout(55000), // 55 detik — lebih dari cukup
    });

    if (!res.ok) {
      // Logging minimal — biar keliatan di Worker logs
      console.warn(`[Turbo] ${endpoint} HTTP ${res.status}`);
      return null;
    }

    return await res.json();
  } catch (e: any) {
    // Silent fallback — gak pernah throw
    console.warn(`[Turbo] ${endpoint} error: ${e.message}`);
    return null;
  }
}

// ─── Chat via Turbo ──────────────────────────────────────

/**
 * Chat dengan AI via Turbo Layer.
 * Return string response atau null.
 */
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
 * Generate artikel berat via Turbo Layer.
 * Return parsed Article object atau null.
 */
export async function turboHeavyArticle(
  env: any,
  topic: string,
  research: { summary?: string; reviewSummary?: string }
): Promise<any | null> {
  const result = await callTurbo(env, "/article/heavy", {
    topic,
    research: {
      summary: research.summary || "",
      reviewSummary: research.reviewSummary || "",
    },
  });

  // Validasi minimal — harus punya title & sections
  if (
    result &&
    !result.error &&
    typeof result.title === "string" &&
    Array.isArray(result.sections) &&
    result.sections.length > 0
  ) {
    return result;
  }

  return null;
}

// ─── Discord Follow-up via Turbo Proxy ──────────────────

/**
 * Kirim follow-up ke Discord via Turbo proxy.
 * Return true/false.
 */
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

/**
 * Kirim follow-up LANGSUNG ke Discord (tanpa proxy Turbo).
 * PATCH ke webhook: /webhooks/{appId}/{intToken}/messages/@original
 * Discord webhook URL sudah termasuk auth — gak perlu Bot token.
 * 
 * Return true kalau sukses.
 */
export async function discordFollowupDirect(
  applicationId: string,
  interactionToken: string,
  content: string
): Promise<boolean> {
  // Potong per 2000 karakter (Discord limit)
  const chunks = chunkTextForDiscord(content, 2000);

  try {
    // PATCH chunk pertama — edit pesan original
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

    // POST chunk sisanya sebagai follow-up messages
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

/**
 * Cek apakah Turbo server hidup.
 * Return boolean.
 */
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
