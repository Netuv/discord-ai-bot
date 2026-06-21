/**
 * media-query-optimizer.ts — Llama Web Search Query Optimizer 🦙
 * 
 * Modul ini generate keyword GAMBAR & VIDEO yang OPTIMAL dari judul artikel
 * dan konten section menggunakan AI (multi-provider).
 * 
 * Masalah sebelumnya: ImageScraper & VideoScraper sering gagal karena
 * query dari AI writer jelek/terlalu generik.
 * 
 * Solusi: Layer AI kedua yang khusus generate keyword TERBAIK buat
 * pencarian media — beda prompt, beda fokus!
 * 
 * Flow:
 *   [Judul Artikel + Section Content]
 *        ↓
 *   AiRouter.chat() → prompt spesifik keyword
 *        ↓
 *   Output JSON: { image_keywords, video_keywords, mal_title, ... }
 *        ↓
 *   Dikirim ke ImageScraper & VideoScraper
 * 
 * Provider: Ikut AI Router (OpenCode → Step 3.7 Flash → Cloudflare → OpenRouter)
 * Biaya: 🆓 Gratis (pake model free yang udah ada)
 */

import { AiRouter } from "./ai-router";

// ─── Types ─────────────────────────────────────────────────

export interface OptimizedMediaQuery {
  /** 3-5 keyword terbaik buat cari GAMBAR (spesifik, pake tahun) */
  image_keywords: string[];
  /** 3-5 keyword terbaik buat cari VIDEO (trailer/PV/official) */
  video_keywords: string[];
  /** Exact title buat MyAnimeList / Jikan API (biar akurat) */
  mal_title?: string;
  /** Exact title buat AniList */
  anilist_title?: string;
  /** Tahun rilis (bantu filter hasil) */
  year_hint?: number;
  /** Sumber yang direkomendasikan */
  preferred_source?: "youtube" | "mal" | "anilist" | "kitsu";
}

// ─── Prompt Builder ────────────────────────────────────────

function buildQueryPrompt(
  articleTitle: string,
  sectionHeadings: string[],
  sectionBodies: string[]
): string {
  return (
    `Kamu adalah asisten pencarian media anime. Tugasmu generate keyword TERBAIK\n` +
    `untuk mencari GAMBAR dan VIDEO dari judul artikel di bawah.\n` +
    `\n` +
    `## JUDUL ARTIKEL:\n${articleTitle}\n` +
    `\n` +
    `## KONTEN SECTION:\n${sectionHeadings.map((h, i) => `[${h}]: ${(sectionBodies[i] || "").slice(0, 200)}`).join("\n")}\n` +
    `\n` +
    `## TUGAS:\n` +
    `Generate keyword yang SPESIFIK dan AKURAT buat nyari gambar & video.\n` +
    `\n` +
    `## ⚠️ ATURAN PENTING — CARA KERJA SCRAPER:\n` +
    `\n` +
    `1. **ImageScraper** cuma bisa nyari berdasarkan JUDUL ANIME/MANGA!\n` +
    `   Dia pake API MyAnimeList, AniList, Kitsu — yang butuh EXACT TITLE.\n` +
    `   ❌ \"Demon Slayer key visual 2026\" → TIDAK KETEMU\n` +
    `   ✅ \"Demon Slayer: Kimetsu no Yaiba\" → KETEMU!\n` +
    `   ✅ \"Kimetsu no Yaiba\" → KETEMU!\n` +
    `\n` +
    `2. **VideoScraper** bisa nyari pake keyword DESKRIPTIF.\n` +
    `   Dia pake YouTube HTML Search + Invidious + DuckDuckGo.\n` +
    `   ✅ \"Demon Slayer Infinity Castle trailer\" → KETEMU!\n` +
    `   ✅ \"鬼滅の刃 無限城編 PV\" → KETEMU!\n` +
    `\n` +
    `## FORMAT KEYWORD:\n` +
    `\n` +
    `### mal_title (PALING PENTING!):\n` +
    `Exact title anime/manga yang bisa dicari di MyAnimeList.\n` +
    `Contoh: \"Kimetsu no Yaiba: Infinity Castle\", \"Jujutsu Kaisen 2nd Season\"\n` +
    `WAJIB: kosongkan (\\"\\") kalau topiknya BUKAN anime/manga spesifik.\n` +
    `\n` +
    `### image_keywords (cadangan):\n` +
    `3-5 JUDUL ANIME/MANGA alternatif (bukan keyword deskriptif!).\n` +
    `Contoh: [\"Demon Slayer: Kimetsu no Yaiba\", \"Kimetsu no Yaiba\", \"鬼滅の刃\"]\n` +
    `\n` +
    `### video_keywords (YouTube search):\n` +
    `3-5 keyword DESKRIPTIF + tahun (ini buat YouTube, bukan MAL).\n` +
    `Contoh: [\"Demon Slayer Infinity Castle trailer 2026\", \"鬼滅の刃 無限城編 PV\"]\n` +
    `\n` +
    `## FORMAT JSON (WAJIB!):\n` +
    `{\n` +
    `  \"mal_title\": \"Exact MAL Title atau kosong\",\n` +
    `  \"anilist_title\": \"Exact AniList Title atau kosong\",\n` +
    `  \"image_keywords\": [\"judul anime 1\", \"judul anime 2\"],\n` +
    `  \"video_keywords\": [\"keyword deskriptif 1\", \"keyword deskriptif 2\"],\n` +
    `  \"year_hint\": 2026\n` +
    `}\n` +
    `\n` +
    `BALAS HANYA JSON, tanpa teks lain!`
  );
}

// ─── Default Fallback ──────────────────────────────────────

/**
 * Fallback kalau AI gagal generate keyword.
 * Pake judul artikel sebagai keyword dasar.
 */
function fallbackQuery(articleTitle: string, year?: number): OptimizedMediaQuery {
  // Bersihin judul dari emoji & karakter khusus
  const cleanTitle = articleTitle.replace(/[^\w\s]/g, "").trim();
  const currentYear = year || new Date().getFullYear();
  
  // Ekstrak anime name: ambil kata pertama yang bukan kata umum
  // Contoh: "Dandadan Siap Guncang Layar Adaptasi Anime Resmi Diumumkan" → "Dandadan"
  const stopWords = ["breaking", "new", "latest", "upcoming", "announced", "revealed", 
    "siap", "guncang", "layar", "adaptasi", "resmi", "diumumkan", "datang",
    "review", "opinion", "discussion", "reaction", "best", "top"];
  const words = cleanTitle.split(/\s+/).filter(w => w.length > 2);
  let animeName = words[0] || cleanTitle;
  // Cari kata proper (capitalized) — biasanya nama anime
  for (const w of words) {
    if (w[0] >= 'A' && w[0] <= 'Z' && !stopWords.includes(w.toLowerCase())) {
      animeName = w;
      break;
    }
  }
  // Fallback: pake 1-2 kata pertama kalo gak ada proper noun
  if (animeName === words[0] && words.length > 1) {
    animeName = words.slice(0, 2).join(' ');
  }

  return {
    image_keywords: [
      `${animeName} key visual ${currentYear}`,
      `${animeName} anime poster`,
      `${animeName} official art`,
      cleanTitle,
    ],
    video_keywords: [
      `${animeName} trailer ${currentYear}`,
      `${animeName} PV`,
      `${animeName} official trailer`,
    ],
    mal_title: animeName,
    year_hint: currentYear,
  };
}

// ─── JSON Parser (Robust) ──────────────────────────────────

function parseQueryResponse(raw: string): OptimizedMediaQuery | null {
  if (!raw || raw.trim().length === 0) return null;

  let cleaned = raw
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

  let parsed: any = null;

  // Strategy 1: Extract JSON object
  try {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}

  // Strategy 2: Fix broken JSON
  if (!parsed) {
    try {
      const fixed = cleaned
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*)'/g, ':"$1"')
        .replace(/,\s*}/g, "}")
        .replace(/,\s*\]/g, "]");
      const m = fixed.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  if (!parsed) return null;

  return {
    image_keywords: Array.isArray(parsed.image_keywords) ? parsed.image_keywords.slice(0, 5) : [],
    video_keywords: Array.isArray(parsed.video_keywords) ? parsed.video_keywords.slice(0, 5) : [],
    mal_title: typeof parsed.mal_title === "string" ? parsed.mal_title : undefined,
    anilist_title: typeof parsed.anilist_title === "string" ? parsed.anilist_title : undefined,
    year_hint: typeof parsed.year_hint === "number" ? parsed.year_hint : undefined,
    preferred_source: parsed.preferred_source || undefined,
  };
}

// ─── Main Function ─────────────────────────────────────────

/**
 * Generate keyword GAMBAR & VIDEO optimal dari judul artikel.
 * 
 * @param articleTitle - Judul artikel (dari AI writer)
 * @param sectionHeadings - Array sub-judul section
 * @param sectionBodies - Array body narasi section
 * @param env - Cloudflare Workers env (untuk AiRouter)
 * @returns OptimizedMediaQuery dengan keyword terbaik
 * 
 * Contoh:
 * ```ts
 * const query = await optimizeMediaQuery(
 *   "🔥 Demon Slayer Season 4",
 *   ["Detail", "Tanggal Rilis"],
 *   ["Body...", "Body..."],
 *   env
 * );
 * // → { image_keywords: [...], video_keywords: [...], mal_title: "..." }
 * ```
 */
export async function optimizeMediaQuery(
  articleTitle: string,
  sectionHeadings: string[],
  sectionBodies: string[],
  env: any
): Promise<OptimizedMediaQuery> {
  const startTime = Date.now();

  try {
    // Round 1: Pake AI generate keyword
    const router = new AiRouter(env);
    const prompt = buildQueryPrompt(articleTitle, sectionHeadings, sectionBodies);
    const response = await router.chat([{ role: "user", content: prompt }]);
    const responseStr = typeof response === "string" ? response : JSON.stringify(response);

    const parsed = parseQueryResponse(responseStr);
    if (parsed && parsed.image_keywords.length > 0 && parsed.video_keywords.length > 0) {
      const elapsed = Date.now() - startTime;
      console.log(`🦙 QueryOptimizer: ${elapsed}ms — ${parsed.image_keywords.length} img, ${parsed.video_keywords.length} vid keywords`);
      return parsed;
    }

    console.warn("⚠️ QueryOptimizer: AI response valid tapi keyword kosong, pake fallback");
    return fallbackQuery(articleTitle);
  } catch (e: any) {
    console.warn(`⚠️ QueryOptimizer gagal (${e.message}), pake fallback`);
    return fallbackQuery(articleTitle);
  }
}


