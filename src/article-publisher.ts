/**
 * article-publisher.ts — Discord Article Publisher
 * 
 * Modul terpisah untuk publish artikel ke Discord.
 * Handle: embed headline, sections, gambar, video, separator.
 * 
 * v4.1 — Modular, robust, reusable
 */

import { searchAnimeImage } from "./image-scraper";
import { findYouTubeVideo } from "./video-scraper";
import { Article, getArticleColor } from "./article-writer";

// ─── Rate Limiter ──────────────────────────────────────────

/**
 * Simple rate limiter untuk Discord API (max 5 req/s per bot)
 */
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 300; // ms antar request (≈3-4 req/s)

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      if (!this.processing) this.process();
    });
  }

  private async process() {
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      const waitTime = Math.max(0, this.minInterval - (now - this.lastRequestTime));
      if (waitTime > 0) await sleep(waitTime);

      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        await fn().catch(() => {}); // Silent catch — error handling di masing-masing
      }
    }
    this.processing = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const globalRateLimiter = new RateLimiter();

// ─── Discord API Helpers ───────────────────────────────────

async function discordFetch(
  token: string,
  channelId: string,
  body: any,
  method: string = "POST"
): Promise<Response | null> {
  try {
    return await globalRateLimiter.add(() =>
      fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    );
  } catch (e: any) {
    console.warn(`⚠️ Discord API error: ${e.message}`);
    return null;
  }
}

async function discordFetchFormData(
  token: string,
  channelId: string,
  formData: FormData
): Promise<Response | null> {
  try {
    return await globalRateLimiter.add(() =>
      fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
        },
        body: formData,
      })
    );
  } catch (e: any) {
    console.warn(`⚠️ Discord FormData error: ${e.message}`);
    return null;
  }
}

// ─── Send Functions ────────────────────────────────────────

/**
 * Kirim embed ke Discord
 */
export async function sendDiscordEmbed(
  token: string,
  channelId: string,
  embed: {
    title: string;
    description: string;
    color: number;
    timestamp?: string;
    footer?: string;
  }
): Promise<void> {
  await discordFetch(token, channelId, {
    embeds: [
      {
        title: embed.title.slice(0, 256),
        description: embed.description.slice(0, 4096),
        color: embed.color,
        ...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
        ...(embed.footer ? { footer: { text: embed.footer.slice(0, 50) } } : {}),
      },
    ],
  });
}

/**
 * Kirim pesan teks ke Discord
 */
export async function sendDiscordMessage(
  token: string,
  channelId: string,
  content: string
): Promise<void> {
  await discordFetch(token, channelId, {
    content: content.slice(0, 2000),
  });
}

/**
 * Kirim gambar ke Discord sebagai attachment
 */
export async function sendImageToDiscord(
  token: string,
  channelId: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  // Coba 2 pendekatan: kirim langsung via file URL atau download dulu
  return await sendImageViaUrl(token, channelId, imageUrl, caption);
}

/**
 * Kirim gambar via URL — Discord auto-fetch dari URL
 */
async function sendImageViaUrl(
  token: string,
  channelId: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    // Coba download dulu biar bisa validasi
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("image")) throw new Error(`Bukan gambar: ${contentType}`);

    const buf = await res.arrayBuffer();
    const ext = contentType.split("/")[1] || "jpg";
    const filename = `anime-${Date.now()}.${ext}`;

    const formData = new FormData();
    
    // Attachment payload
    const blob = new Blob([buf], { type: contentType });
    formData.append("files[0]", blob, filename);

    // Payload JSON dengan attachment reference
    const payload: any = {};
    if (caption) {
      payload.content = caption.slice(0, 2000);
    }
    formData.append("payload_json", JSON.stringify(payload));

    const result = await discordFetchFormData(token, channelId, formData);
    return result !== null && result.ok;
  } catch (e: any) {
    console.warn(`⚠️ Send image gagal: ${e.message}`);
    return false;
  }
}

// ─── Main Publisher ────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  sectionsPublished: number;
  imagesPublished: number;
  videosPublished: number;
  error?: string;
}

/**
 * Publish artikel ke Discord channel
 * Flow:
 * 1. Kirim HEADLINE sebagai EMBED dengan warna kategori
 * 2. Kirim invisible spacer
 * 3. Per section: [Judul] → [Narasi] → [Video] → [Gambar] → [Separator]
 * 4. TIDAK ADA closing — berakhir natural
 */
export async function publishArticle(
  token: string,
  channelId: string,
  article: Article,
  options?: {
    faster?: boolean; // Skip image/video untuk response lebih cepat
  }
): Promise<PublishResult> {
  const result: PublishResult = {
    success: true,
    sectionsPublished: 0,
    imagesPublished: 0,
    videosPublished: 0,
  };

  try {
    const embedColor = getArticleColor(article.category);

    // ── STEP 1: HEADLINE EMBED ──
    await sendDiscordEmbed(token, channelId, {
      title: (article.title || "📰 Artikel Anime").slice(0, 256),
      description: (article.intro || "").slice(0, 4096),
      color: embedColor,
      timestamp: new Date().toISOString(),
      footer: "🤖 LuminaBot • Artikel Otomatis",
    });

    // ── STEP 2: Invisible spacer ──
    await sendDiscordMessage(token, channelId, "\u3161");

    // ── STEP 3: Per-section ──
    const sections = article.sections || [];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (!sec.heading && !sec.body) continue;

      const heading = sec.heading || "📖";
      const body = (sec.body || "").slice(0, 1900);

      // Kirim JUDUL sebagai message terpisah
      await sendDiscordMessage(token, channelId, `**${heading}**`);

      // Kirim BODY/NARASI sebagai message terpisah
      if (body) {
        await sendDiscordMessage(token, channelId, body);
      }

      // Kirim VIDEO (kalau ada query dan gak mode fast)
      let hasVideo = false;
      if (!options?.faster && sec.video_query && sec.video_query.length > 3) {
        try {
          const videoUrl = await findYouTubeVideo(sec.video_query, { env: (globalThis as any).__LUMINA_ENV__ });
          if (videoUrl) {
            await sendDiscordMessage(token, channelId, `🎬 **${sec.video_query}:** ${videoUrl}`);
            result.videosPublished++;
            hasVideo = true;
          }
        } catch (e: any) {
          console.warn(`⚠️ Video search gagal: ${e.message}`);
        }
      }

      // Kirim GAMBAR (kalau ada query dan gak mode fast)
      let hasImage = false;
      if (!options?.faster && sec.image_query && sec.image_query.length > 1) {
        try {
          const img = await searchAnimeImage(sec.image_query, { env: (globalThis as any).__LUMINA_ENV__ });
          if (img) {
            const caption = `${heading} — ${img.source}`;
            const ok = await sendImageToDiscord(token, channelId, img.url, caption);
            if (ok) {
              result.imagesPublished++;
              hasImage = true;
            }
          }
        } catch (e: any) {
          console.warn(`⚠️ Image search gagal: ${e.message}`);
        }
      }

      // Separator antar section (kecuali terakhir)
      if (i < sections.length - 1) {
        await sendDiscordMessage(token, channelId, "---");
      }

      result.sectionsPublished++;
    }

    return result;
  } catch (e: any) {
    result.success = false;
    result.error = e.message;
    return result;
  }
}

/**
 * Publish headline ONLY — versi minimal buat quick response
 */
export async function publishHeadlineOnly(
  token: string,
  channelId: string,
  article: Article
): Promise<boolean> {
  try {
    const embedColor = getArticleColor(article.category);
    await sendDiscordEmbed(token, channelId, {
      title: (article.title || "📰 Artikel Anime").slice(0, 256),
      description: (article.intro || "").slice(0, 4096),
      color: embedColor,
      footer: "🤖 LuminaBot • Artikel Otomatis",
    });
    return true;
  } catch {
    return false;
  }
}
