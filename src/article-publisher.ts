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
import { auditBeforePublish } from "./article-auditor";
import { optimizeMediaQuery, OptimizedMediaQuery } from "./media-query-optimizer";

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
 * Kirim gambar ke Discord — URL langsung (Discord auto-embed).
 * Fix v4.3: Ganti download+upload (FormData) ke URL direct.
 * Approach lama rawan timeout/memory di Cloudflare Workers.
 */
export async function sendImageToDiscord(
  token: string,
  channelId: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    // Kirim URL langsung — Discord akan auto-embed gambar
    const content = caption ? `${caption}\n${imageUrl}` : imageUrl;
    await sendDiscordMessage(token, channelId, content.slice(0, 2000));
    return true;
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
  article: Article,
  env: any
): Promise<PublishResult> {
  // ═══ AUDIT: Quality gate sebelum publish ═══
  // Fix C1: Integrasi article-auditor ke publish flow
  const { article: auditedArticle, report: auditReport } = auditBeforePublish(article);
  if (!auditReport.passed) {
    console.warn(`⚠️ Audit warning: ${auditReport.summary}`);
  }
  // Pakai auditedArticle (sudah di-fix) untuk publish
  article = auditedArticle;

  // ═══ OPTIMIZE: Generate keyword optimal untuk media search ═══
  // Fix C2: Integrasi media-query-optimizer ke publish flow
  let optimizedQuery: OptimizedMediaQuery | null = null;
  try {
    optimizedQuery = await optimizeMediaQuery(
      article.title || "",
      (article.sections || []).map(s => s.heading || ""),
      (article.sections || []).map(s => (s.body || "").slice(0, 200)),
      env
    );
  } catch (e: any) {
    console.warn(`⚠️ QueryOptimizer gagal: ${e.message} — pakai query lama`);
  }

  let sections = article.sections || [];
  const result: PublishResult = {
    success: true,
    sectionsPublished: 0,
    imagesPublished: 0,
    videosPublished: 0,
  };

  try {
    if (sections.length === 0) {
      // Kirim headline sebagai bold message (konsisten, tanpa embed)
      await sendDiscordMessage(token, channelId, `**${(article.title || "📰 Artikel Anime").slice(0, 256)}**`);
      if (article.intro) {
        await sendDiscordMessage(token, channelId, article.intro.slice(0, 2000));
      }
      return result;
    }

    // env passed directly from scheduler.ts

    // ═══ PHASE 1: PARALLEL — Kirim HEADLINE + Pre-fetch semua media ═══
    // HEADLINE dikirim sebagai bold MESSAGE (bukan embed) biar gak ada 2 header!
    // Intro langsung masuk ke section 1 sebagai body tambahan
    const mediaPromises: Promise<MediaResult | null>[] = [];

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];

      // Video search — use optimized keywords (C2) + fallback to AI query
      const videoQueries: string[] = [];
      // Priority 1: Optimized video keywords dari media-query-optimizer
      if (optimizedQuery?.video_keywords) {
        for (const kw of optimizedQuery.video_keywords) {
          if (kw && kw.length > 3 && !videoQueries.includes(kw)) videoQueries.push(kw);
        }
      }
      // Priority 2: Original AI query sebagai fallback
      if (sec.video_query && sec.video_query.length > 3 && !videoQueries.includes(sec.video_query)) {
        videoQueries.push(sec.video_query);
      }
      // ALWAYS add catch-all query as backup (try all!)
      if (article.title) {
        const words = article.title.replace(/[^\w\s]/g,' ').trim().split(/\s+/).filter(w=>w.length>2);
        const skip = ['baru','resmi','diumumkan','datang','rilis','tayang','film','movie','season','episode',
          'new','announced','coming','release','latest','breaking','update','first','official','confirm',
          'kabar','berita','trailer','teaser','pv','video'];
        let name = words.find(w => !skip.includes(w.toLowerCase())) || words[0] || '';
        name = name.slice(0, 30);
        if (name.length > 2) {
          const fallbackQuery = `${name} trailer`;
          if (!videoQueries.includes(fallbackQuery)) videoQueries.push(fallbackQuery);
        }
      }
      // Start video search — try each query until one works
      if (videoQueries.length > 0) {
        mediaPromises.push(
          (async () => {
            for (const q of videoQueries) {
              try {
                const url = await findYouTubeVideo(q, env);
                if (url) {
                  console.log(`🎬 Video found via: "${q}"`);
                  return { type: "video" as const, sectionIndex: i, url };
                }
              } catch { continue; }
            }
            return null;
          })()
        );
      }

      // Image search — use optimized keywords (C2) + fallback to AI query
      const imageQueries: string[] = [];
      // Priority 1: Optimized mal_title dari media-query-optimizer (exact match untuk MAL/AniList)
      if (optimizedQuery?.mal_title && optimizedQuery.mal_title.length > 2) {
        if (!imageQueries.includes(optimizedQuery.mal_title)) imageQueries.push(optimizedQuery.mal_title);
      }
      // Priority 2: Optimized image_keywords (alternatif judul)
      if (optimizedQuery?.image_keywords) {
        for (const kw of optimizedQuery.image_keywords) {
          if (kw && kw.length > 2 && !imageQueries.includes(kw)) imageQueries.push(kw);
        }
      }
      // Priority 3: Original AI query sebagai fallback
      if (sec.image_query && sec.image_query.length > 1 && !imageQueries.includes(sec.image_query)) {
        imageQueries.push(sec.image_query);
      }
      // ALWAYS add catch-all query as backup (try all!)
      if (article.title) {
        const words = article.title.replace(/[^\w\s]/g,' ').trim().split(/\s+/).filter(w=>w.length>2);
        const skip = ['baru','resmi','diumumkan','datang','rilis','tayang','film','movie','season','episode',
          'new','announced','coming','release','latest','breaking','update','first','official','confirm',
          'kabar','berita','trailer','teaser','pv','video'];
        let name = words.find(w => !skip.includes(w.toLowerCase())) || words[0] || '';
        name = name.slice(0, 30);
        if (name.length > 2) {
          if (!imageQueries.includes(name)) imageQueries.push(name);
          const kv = `${name} key visual`;
          if (!imageQueries.includes(kv)) imageQueries.push(kv);
        }
      }
      // Start image search — try each query until one works
      if (imageQueries.length > 0) {
        mediaPromises.push(
          (async () => {
            for (const q of imageQueries) {
              try {
                const img = await searchAnimeImage(q, { env });
                if (img) {
                  console.log(`📸 Image found via: "${q}" → ${img.source}`);
                  return {
                    type: "image" as const,
                    sectionIndex: i,
                    url: img.url,
                    caption: `${sec.heading || "📖"} — ${img.source}`,
                  };
                }
              } catch { continue; }
            }
            return null;
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
