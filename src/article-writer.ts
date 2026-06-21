/**
 * article-writer.ts — AI Article Content Generator
 * 
 * Modul terpisah untuk generate konten artikel menggunakan AI.
 * Dipisah dari scheduler.ts biar gak monolitik dan gampang di-debug.
 * 
 * Flow:
 * 1. Research topic via WebScout (multi-source)
 * 2. Build prompt untuk AI
 * 3. Call AI via AiRouter
 * 4. Parse & validasi JSON response
 * 
 * v4.1 — Modular & Robust
 */

import { AiRouter } from "./ai-router";
import { WebScout } from "./web-scout";

// ─── Types ─────────────────────────────────────────────────

export interface ArticleSection {
  heading: string;
  body: string;
  image_query: string;
  video_query: string;
}

export interface Article {
  title: string;
  intro: string;
  sections: ArticleSection[];
  category: string;
}

export interface ArticleResearch {
  summary: string;
  reviewSummary: string;
}

// ─── Research Module ───────────────────────────────────────

/**
 * Riset berita dari berbagai sumber (web search)
 */
async function researchNews(topic: string, env: any): Promise<string> {
  try {
    const webScout = new WebScout(env);
    const results = await webScout.search(topic, { maxResults: 8, useCache: true });

    if (results.length === 0) return "📰 Gunakan pengetahuan umum.";

    const lines = results.map((r, i) =>
      `${i + 1}. [${r.source}] ${r.title}${r.snippet ? ` — ${r.snippet.slice(0, 120)}` : ""}`
    );

    return `📰 **BERITA TERKINI:**\n${lines.join("\n")}`;
  } catch (e: any) {
    console.warn(`⚠️ Research news gagal: ${e.message}`);
    return "📰 Gunakan pengetahuan umum.";
  }
}

/**
 * Riset review & opini dari berbagai sumber (Reddit, forum, ANN, dll)
 */
async function researchReviews(topic: string, env: any): Promise<string> {
  try {
    const webScout = new WebScout(env);

    const reviewQueries = [
      `${topic} review opinion`,
      `${topic} community reaction`,
      `${topic} reddit discussion`,
      `${topic} anime review site`,
      `${topic} rating review`,
    ];

    const reviewResults = await Promise.allSettled(
      reviewQueries.map(q => webScout.search(q, { maxResults: 3, useCache: true }))
    );

    const allReviews: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const seen = new Set<string>();

    for (const result of reviewResults) {
      if (result.status === "fulfilled") {
        for (const item of result.value) {
          const key = item.url || item.title;
          if (!seen.has(key)) {
            seen.add(key);
            allReviews.push(item);
          }
        }
      }
    }

    const topReviews = allReviews.slice(0, 10);
    if (topReviews.length === 0) return "";

    // Scrape 4 review teratas untuk konten detail
    const topUrls = topReviews.slice(0, 4).map(r => r.url).filter(Boolean);
    let scrapedContent = "";
    if (topUrls.length > 0) {
      try {
        const pages = await webScout.browseUrls(topUrls, { maxLength: 1500 });
        scrapedContent = pages
          .map(p => `📄 Dari ${p.title} (${p.url}):\n${p.snippet.slice(0, 500)}`)
          .join("\n\n");
      } catch {}
    }

    const reviewLines = topReviews.map((r, i) =>
      `${i + 1}. [${r.source}] ${r.title} — ${r.snippet.slice(0, 150)}`
    );

    let reviewSummary = `💬 **REVIEWS & OPINIONS DARI INTERNET:**\n${reviewLines.join("\n")}`;
    if (scrapedContent) {
      reviewSummary += `\n\n📖 **ISI REVIEW (scraped):**\n${scrapedContent}`;
    }

    return reviewSummary;
  } catch (e: any) {
    console.warn(`⚠️ Research review gagal: ${e.message}`);
    return "";
  }
}

/**
 * Research lengkap: berita + review parallel
 */
export async function researchArticle(
  topic: string,
  env: any
): Promise<ArticleResearch> {
  const startTime = Date.now();

  const [newsSummary, reviewSummary] = await Promise.all([
    researchNews(topic, env),
    researchReviews(topic, env),
  ]);

  const elapsed = Date.now() - startTime;
  console.log(`✅ ArticleResearch selesai dalam ${elapsed}ms`);

  return {
    summary: newsSummary + (reviewSummary ? `\n\n${reviewSummary}` : ""),
    reviewSummary,
  };
}

// ─── Prompt Builder ────────────────────────────────────────

/**
 * Build prompt untuk AI — versi lebih pendek dan efisien
 * v4.1: Dipangkas biar gak kepanjangan, fokus ke esensial
 */
export function buildArticlePrompt(
  topic: string,
  summary: string,
  reviewSummary?: string
): string {
  return (
    `Kamu adalah jurnalis anime yang asik dan santai. Buat artikel singkat dari data di bawah.\n` +
    `\n` +
    `## TOPIK: ${topic}\n` +
    `## DATA BERITA:\n${summary}\n` +
    (reviewSummary ? `\n## OPINI PUBLIK:\n${reviewSummary}\n` : "") +
    `\n` +
    `## TUGAS:\n` +
    `Buat artikel JSON dengan 1-3 section. TIDAK ADA closing.\n` +
    `\n` +
    `FORMAT JSON:\n` +
    `{\n` +
    `  "title": "[Emoji] Headline max 100 karakter",\n` +
    `  "intro": "Hook 2 kalimat — bikin penasaran!",\n` +
    `  "sections": [{\n` +
    `    "heading": "🔍 Sub-judul",\n` +
    `    "body": "Narasi 4-6 kalimat. Santai, mengalir, bukan poin-poin!",\n` +
    `    "image_query": "WAJIB DIISI! Keyword gambar: judul anime + key visual/poster + tahun",\n` +
    `    "video_query": "WAJIB DIISI! Keyword video: judul anime + trailer/PV/teaser + tahun"\n` +
    `  }],\n` +
    `  "category": "anime/manga/game/breaking/announcement/general"\n` +
    `}\n` +
    `\n` +
    `## ATURAN DISCORD (WAJIB DIINGAT!):\n` +
    `- 🔴 HEADLINE dikirim sebagai EMBED (title + intro + warna kategori)\n` +
    `- 🔴 BREAK LINE: Setiap JUDUL/HEADING WAJIB punya break line setelahnya!\n` +
    `- 🔴 Judul dikirim sebagai MESSAGE TERPISAH dari body narasi (JANGAN digabung!)\n` +
    `- 🔴 Tiap section format: [Judul message] → [Narasi body message] → [Video link] → [Gambar]\n` +
    `- 🔴 Antar section dipisah separator "---"\n` +
    `- 🔴 TIDAK ADA closing/kesimpulan — artikel berakhir natural\n` +
    `\n` +
    `## ATURAN GAYA BAHASA:\n` +
    `- Gaya santai kayak ngobrol di Discord ("aku-kamu")\n` +
    `- Paragraf pendek 2-3 kalimat, mengalir alami\n` +
    `- Hook kuat di intro — bikin penasaran!\n` +
    `- Sertakan opini dari berbagai sumber (Reddit, forum, ANN) — kutip sumbernya!\n` +
    `- Cari konsensus publik: "Mayoritas setuju...", "Yang bikin ramai adalah..."\n` +
    `- TIDAK ADA bullet list di body — semua narasi!\n` +
    `- TIDAK ADA "Kesimpulannya" atau kata penutup formal\n` +
    `- JANGAN ngarang fakta — pake data real dari berita\n` +
    `- JANGAN tambah teks lain di luar JSON\n` +
    `\n` +
    `- ⛔ DILARANG KERAS: Tambahkan watermark\, footer\, "generated by AI"\, "Scheduled content"\, atau teks promosi APAPUN!\n` +
    `BALAS HANYA JSON, tanpa teks lain!`
  );
}

// ─── JSON Parser — Robust ──────────────────────────────────

/**
 * Parse JSON dari response AI — tahan banting
 * v4.1: Multiple fallback strategy
 */
export function parseArticleJSON(raw: string): Article {
  if (!raw || raw.trim().length === 0) {
    throw new Error("Response AI kosong");
  }

  let cleaned = raw
    .replace(/!\[.*?\]\(.*?\)/g, "")      // Hapus markdown image
    .replace(/\[.*?\]\(.*?\)/g, "")        // Hapus markdown link
    .replace(/[\u0000-\u001F\u007F]/g, "") // Hapus kontrol karakter
    .trim();

  let parsed: any = null;

  // Strategy 1: Extract JSON object dari text
  try {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}

  // Strategy 2: Hapus URLs dulu, lalu coba lagi
  if (!parsed) {
    try {
      const r = cleaned.replace(/https?:\/\/[^\s,\"}\]]+/g, "[link]");
      const m = r.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  // Strategy 3: Fix broken JSON (missing quotes on keys, single quotes, etc)
  if (!parsed) {
    try {
      const fixed = cleaned
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')  // Fix unquoted keys
        .replace(/:\s*'([^']*)'/g, ':"$1"')                       // Fix single quotes
        .replace(/,\s*}/g, "}")                                   // Fix trailing commas
        .replace(/,\s*]/g, "]");                                   // Fix trailing commas in arrays
      const m = fixed.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  if (!parsed) {
    throw new Error("AI gagal generate artikel valid — response bukan JSON");
  }

  // ── VALIDASI STRUKTUR ──
  // Pastikan sections ada — fallback kalau AI lupa generate section!
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    // Coba cek field 'topics' (kadang AI generate pake nama field beda)
    if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      parsed.sections = parsed.topics;
      delete parsed.topics;
    } else {
      // Fallback: bikin 1 section default biar artikel tetap terkirim!
      console.warn("⚠️ AI lupa generate sections — pake fallback section");
      parsed.sections = [{
        heading: "📖 Lanjutan",
        body: parsed.intro || "Topik ini lagi hangat dibicarakan di komunitas. Banyak yang ngomongin di berbagai forum dan media sosial.",
        image_query: "",
        video_query: "",
      }];
    }
  }

  // Pastikan setiap section punya heading & body
  parsed.sections = parsed.sections.map((s: any) => ({
    heading: s.heading || "📖",
    body: s.body || s.text || s.content || "",
    image_query: s.image_query || "",
    video_query: s.video_query || "",
  }));

  return parsed as Article;
}

// ─── Color Mapping ─────────────────────────────────────────

const ARTICLE_COLORS: Record<string, number> = {
  anime: 0xFF6B6B,
  manga: 0x9B59B6,
  game: 0x3498DB,
  breaking: 0xE74C3C,
  announcement: 0xF39C12,
  general: 0x5865F2,
};

export function getArticleColor(category: string): number {
  return ARTICLE_COLORS[category] || 0x5865F2;
}

// ─── AI Article Generator ──────────────────────────────────

/**
 * Generate artikel dari AI — dengan retry logic
 * v4.1: Modular, better error handling, retry on fail
 */
export async function generateArticle(
  topic: string,
  research: ArticleResearch,
  env: any
): Promise<Article> {
  const router = new AiRouter(env);

  // Attempt 1: Full prompt dengan research data
  try {
    const prompt = buildArticlePrompt(topic, research.summary, research.reviewSummary);
    const raw = await router.chat([{ role: "user", content: prompt }]);
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    return parseArticleJSON(rawStr);
  } catch (e1: any) {
    console.warn(`⚠️ Article gen attempt 1 gagal: ${e1.message}`);
    // Lanjut ke attempt 2
  }

  // Attempt 2: Simplified prompt tanpa review
  try {
    const simplePrompt = buildArticlePrompt(topic, research.summary, "");
    const raw = await router.chat([{ role: "user", content: simplePrompt }]);
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    return parseArticleJSON(rawStr);
  } catch (e2: any) {
    console.warn(`⚠️ Article gen attempt 2 gagal: ${e2.message}`);
    // Lanjut ke attempt 3
  }

  // Attempt 3: Minimal prompt — tanpa research, tanpa review
  try {
    const minimalPrompt = (
      `Buat artikel anime pendek tentang: ${topic}\n` +
      `BALAS HANYA JSON ini:\n` +
      `{\n` +
      `  "title": "[Emoji] Judul",\n` +
      `  "intro": "Hook 2 kalimat",\n` +
      `  "sections": [{"heading":"📖 Sub-judul","body":"Narasi singkat 3-4 kalimat","image_query":"judul anime key visual","video_query":"judul anime trailer"}],\n` +
      `  "category": "anime"\n` +
      `}\n` +
      `Gaya santai, tanpa kesimpulan. JANGAN tambah teks lain!`
    );
    const raw = await router.chat([{ role: "user", content: minimalPrompt }]);
    const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
    return parseArticleJSON(rawStr);
  } catch (e3: any) {
    throw new Error(`3x percobaan artikel gagal. Terakhir: ${e3.message}`);
  }
}

/**
 * Generate quick fallback article — tanpa AI, hardcoded
 * Digunakan kalau semua AI attempt gagal
 */
export function generateFallbackArticle(topic: string): Article {
  return {
    title: `📰 ${topic.slice(0, 80)}`,
    intro: `Halo! Berikut ini rangkuman singkat tentang ${topic} yang lagi ramai dibahas. Cek yuk!`,
    sections: [
      {
        heading: "📖 Yang Perlu Kamu Tahu",
        body: `${topic} adalah salah satu topik yang lagi hangat dibicarakan di komunitas anime. Banyak yang ngomongin di berbagai forum dan media sosial. Yuk cek update terbarunya!`,
        image_query: topic,
        video_query: topic,
      },
    ],
    category: "general",
  };
}
