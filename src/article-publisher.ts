/**
 * article-publisher.ts — Discord Article Publisher
 * 
 * Modul untuk publish artikel ke Discord.
 * Handle: embed headline, sections, gambar, video, separator.
 * 
 * OPTIMASI v4.2:
 * - Paralelisasi: semua media di-fetch BERSAMAAN (bukan sequential per section)
 * - Batch send: message independen dikirim parallel
 * - Rate limiter optimal (200ms = 5 req/s, sesuai batas Discord)
 * - Pre-fetch media: gambar & video dicari SEBELUM section loop dimulai
 * - Semua fitur utama dipertahankan: gambar, video, embed, section, separator
 */

import { searchAnimeImage } from "./image-scraper";
import { findYouTubeVideo } from "./video-scraper";
import { Article, getArticleColor } from "./article-writer";

// ─── Rate Limiter (Optimized) ──────────────────────────────

class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 200; // 200ms = 5 req/s (max Discord rate limit)

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
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
        await fn().catch(() => {});
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
        headers: { Authorization: `Bot ${token}` },
        body: formData,
      })
    );
  } catch (e: any) {
    console.warn(`⚠️ Discord FormData error: ${e.message}`);
    return null;
  }
}

// ─── Public Send Functions ─────────────────────────────────

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
    embeds: [{
      title: embed.title.slice(0, 256),
      description: embed.description.slice(0, 4096),
      color: embed.color,
      ...(embed.timestamp ? { timestamp: embed.timestamp } : {}),
      ...(embed.footer ? { footer: { text: embed.footer.slice(0, 50) } } : {}),
    }],
  });
}

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
 * Kirim gambar ke Discord sebagai attachment — download + upload via FormData
 */
export async function sendImageToDiscord(
  token: string,
  channelId: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  try {
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
    formData.append("files[0]", new Blob([buf], { type: contentType }), filename);

    const payload: any = {};
    if (caption) payload.content = caption.slice(0, 2000);
    formData.append("payload_json", JSON.stringify(payload));

    const result = await discordFetchFormData(token, channelId, formData);
    return result !== null && result.ok;
  } catch (e: any) {
    console.warn(`⚠️ Send image gagal: ${e.message}`);
    return false;
  }
}

// ─── Types ─────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  sectionsPublished: number;
  imagesPublished: number;
  videosPublished: number;
  error?: string;
}

interface MediaResult {
  type: "image" | "video";
  sectionIndex: number;
  url: string | null;
  caption?: string;
}

// ─── Main Publisher ────────────────────────────────────────

/**
 * Publish artikel ke Discord channel — OPTIMASI v4.2
 * 
 * Alur paralel:
 * 1. Kirim HEADLINE embed
 * 2. IN PARALLEL dengan langkah 1:
 *    - Cari semua gambar (parallel antar section)
 *    - Cari semua video (parallel antar section)
 * 3. Kirim per section: [Judul] → [Narasi] → [Video] → [Gambar] → [Separator]
 *    - Media sudah ready dari pre-fetch
 *    - Judul & body bisa dikirim parallel
 * 4. TIDAK ADA closing — berakhir natural
 */
export async function publishArticle(
  token: string,
  channelId: string,
  article: Article
): Promise<PublishResult> {
  const result: PublishResult = {
    success: true,
    sectionsPublished: 0,
    imagesPublished: 0,
    videosPublished: 0,
  };

  try {
    const sections = article.sections || [];
    if (sections.length === 0) {
      // Kirim headline sebagai bold message (konsisten, tanpa embed)
      await sendDiscordMessage(token, channelId, `**${(article.title || "📰 Artikel Anime").slice(0, 256)}**`);
      if (article.intro) {
        await sendDiscordMessage(token, channelId, article.intro.slice(0, 2000));
      }
      return result;
    }

    const env = (globalThis as any).__LUMINA_ENV__;

    // ═══ PHASE 1: PARALLEL — Kirim HEADLINE + Pre-fetch semua media ═══
    // HEADLINE dikirim sebagai bold MESSAGE (bukan embed) biar gak ada 2 header!
    // Intro langsung masuk ke section 1 sebagai body tambahan
    const mediaPromises: Promise<MediaResult | null>[] = [];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];

      // Start video search
      if (sec.video_query && sec.video_query.length > 3) {
        mediaPromises.push(
          (async () => {
            try {
              const url = await findYouTubeVideo(sec.video_query, env);
              return url ? { type: "video" as const, sectionIndex: i, url } : null;
            } catch {
              return null;
            }
          })()
        );
      }

      // Start image search
      if (sec.image_query && sec.image_query.length > 1) {
        mediaPromises.push(
          (async () => {
            try {
              const img = await searchAnimeImage(sec.image_query, { env });
              if (img) {
                return {
                  type: "image" as const,
                  sectionIndex: i,
                  url: img.url,
                  caption: `${sec.heading || "📖"} — ${img.source}`,
                };
              }
              return null;
            } catch {
              return null;
            }
          })()
        );
      }
    }

    // Kirim HEADLINE sebagai bold message (1 header aja!) + pre-fetch media parallel
    const [_, mediaResults] = await Promise.all([
      // Kirim headline sebagai bold message + spacer
      (async () => {
        await sendDiscordMessage(token, channelId, `**${(article.title || "📰 Artikel Anime").slice(0, 256)}**`);
      })(),

      // Pre-fetch semua media PARALLEL
      Promise.all(mediaPromises),
    ]);

    // Gabung intro ke section pertama biar gak ada header terpisah
    if (sections.length > 0 && article.intro) {
      const firstSec = sections[0];
      firstSec.body = article.intro + "\n\n" + (firstSec.body || "");
    }

    // Organize media results per section
    const mediaBySection: Map<number, { videos: string[]; images: { url: string; caption: string }[] }> = new Map();
    for (const mr of mediaResults) {
      if (!mr) continue;
      if (!mediaBySection.has(mr.sectionIndex)) {
        mediaBySection.set(mr.sectionIndex, { videos: [], images: [] });
      }
      const sectionMedia = mediaBySection.get(mr.sectionIndex)!;
      if (mr.type === "video" && mr.url) {
        sectionMedia.videos.push(mr.url);
      } else if (mr.type === "image" && mr.url) {
        sectionMedia.images.push({ url: mr.url, caption: mr.caption || "" });
      }
    }

    // ═══ PHASE 2: Kirim per-section (sequential — menjaga urutan) ═══
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (!sec.heading && !sec.body) continue;

      const heading = sec.heading || "📖";
      const body = (sec.body || "").slice(0, 1900);
      const sectionMedia = mediaBySection.get(i);

      // Kirim JUDUL sebagai message TERPISAH (break line setelah judul!)
      await sendDiscordMessage(token, channelId, `**${heading}**`);

      // Kirim BODY/NARASI sebagai message terpisah setelah heading
      if (body) {
        await sendDiscordMessage(token, channelId, body);
      }

      // Kirim VIDEO (kalau ada hasil dari pre-fetch)
      if (sectionMedia?.videos && sectionMedia.videos.length > 0) {
        for (const videoUrl of sectionMedia.videos) {
          await sendDiscordMessage(token, channelId, `🎬 **${sec.video_query}:** ${videoUrl}`);
          result.videosPublished++;
        }
      }

      // Kirim GAMBAR (kalau ada hasil dari pre-fetch)
      if (sectionMedia?.images && sectionMedia.images.length > 0) {
        for (const img of sectionMedia.images) {
          const ok = await sendImageToDiscord(token, channelId, img.url, img.caption);
          if (ok) result.imagesPublished++;
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
 * Publish headline ONLY — untuk preview / notifikasi cepat
 */
export async function publishHeadlineOnly(
  token: string,
  channelId: string,
  article: Article
): Promise<boolean> {
  try {
    await sendDiscordEmbed(token, channelId, {
      title: (article.title || "📰 Artikel Anime").slice(0, 256),
      description: (article.intro || "").slice(0, 4096),
      color: getArticleColor(article.category),
    });
    return true;
  } catch {
    return false;
  }
}
