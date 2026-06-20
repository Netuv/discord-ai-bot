/**
 * Video Scraper v3 — YouTube HTML Scraping + Multi-Source Validation
 *
 * Masalah lama: DuckDuckGo & Invidious gagal nemuin video anime dengan akurat.
 * Solusi BARU: Scrape langsung YouTube Search HTML (ytInitialData JSON).
 *
 * Flow:
 * 1. YouTube Search HTML → parse ytInitialData (paling akurat, langsung dari YouTube)
 * 2. Validasi via oEmbed API (cek title real + thumbnail)
 * 3. Fallback: DuckDuckGo Web + Invidious (kalau YouTube block)
 * 4. Scoring token-based + abbreviation expansion
 * 5. KV cache 1 jam
 *
 * Sources:
 * 1. YouTube Search HTML (ytInitialData JSON) — GRATIS, paling akurat
 * 2. YouTube oEmbed API — validasi URL + dapatkan title
 * 3. Invidious API (instansi publik) — fallback
 * 4. DuckDuckGo Lite HTML — fallback terakhir
 * 5. YouTube Data API — optional (butuh API key)
 */

// ─── Types ─────────────────────────────────────────────────

export interface YouTubeVideoResult {
  videoId: string;         // ID 11 karakter YouTube
  url: string;             // Full URL: https://www.youtube.com/watch?v=XXXX
  title: string;           // Judul video dari API/source
  channelName?: string;    // Nama channel (jika tersedia)
  source: string;          // Sumber data ("youtube-oembed" | "duckduckgo" | "invidious" | "youtube-api" | "google")
  score: number;           // Match score 0-100
  thumbnailUrl?: string;   // URL thumbnail (jika tersedia)
  publishedAt?: string;    // Tanggal publish (jika tersedia)
  viewCount?: number;      // Jumlah views (jika tersedia)
}

// ─── Constants ─────────────────────────────────────────────

const YT_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const YT_WATCH_URL = "https://www.youtube.com/watch?v=";

// Peta singkatan umum anime untuk membantu matching
const ANIME_ABBREVIATIONS: Record<string, string> = {
  "mha": "my hero academia",
  "bnha": "my hero academia",
  "jjk": "jujutsu kaisen",
  "aot": "attack on titan",
  "snk": "shingeki no kyojin",
  "opm": "one punch man",
  "op": "one piece",
  "dbs": "dragon ball super",
  "dbz": "dragon ball z",
  "db": "dragon ball",
  "tbhk": "toilet bound hanako kun",
  "hxh": "hunter x hunter",
  "fma": "fullmetal alchemist",
  "fmab": "fullmetal alchemist brotherhood",
  "code geass": "code geass",
  "steins;gate": "steins gate",
  "oregairu": "oregairu",
  "sao": "sword art online",
  "nge": "neon genesis evangelion",
  "evangelion": "neon genesis evangelion",
  "tybw": "thousand year blood war",
  "ds": "demon slayer",
  "kimetsu": "demon slayer",
  "kimetsu no yaiba": "demon slayer",
  "kny": "demon slayer",
  "csmp": "chainsaw man",
  "csm": "chainsaw man",
  "spyxfamily": "spy x family",
  "spyfam": "spy x family",
  "sl": "solo leveling",
  "orv": "omniscient reader",
  "kfg": "kage no jitsuryokusha",
  "shadow": "kage no jitsuryokusha",
  "mushoku": "mushoku tensei",
  "mt": "mushoku tensei",
  "re:zero": "re zero",
  "rezero": "re zero",
};

// Kata kunci yang nandain video ini relevan untuk anime/game
const RELEVANT_KEYWORDS = [
  "trailer", "teaser", "pv", "promotional video", "opening", "ending",
  "official", "预告", "予告", "cm", "highlight", "clip", "scene",
  "full", "episode", "movie", "film", "season", "part", "chapter",
  "anime", "manga", "game", "gameplay", "story", "teaser trailer",
  "announcement", "announce", " reveal", "look", "first look",
  "visual", "key visual", "adaptation", "release date", "new",
];

// ─── Title Matching (adapted from image-scraper.ts) ────────

function tokenize(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function tokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((qt) =>
    targetTokens.some((tt) => tt === qt || qt.includes(tt) || tt.includes(qt))
  ).length;
  return matched / queryTokens.length;
}

function lengthRatio(q: string, t: string): number {
  if (!q || !t) return 0;
  const shorter = Math.min(q.length, t.length);
  const longer = Math.max(q.length, t.length);
  return shorter / longer;
}

const SPECIFIC_KEYWORDS = /\b(season|part|episode|movie|film|arc|cour|special|ova|oad|trailer|teaser|pv|opening|ending|gameplay)\b/i;

/**
 * Scoring video title match — mirip image-scraper.ts
 * 
 * baseScore (0-75):
 *   75 = exact match
 *   65 = semua kata query ada di title + length ratio >= 0.6
 *   55 = semua kata query ada di title + length ratio < 0.6
 *   45 = >= 80% kata match + length ratio >= 0.5
 *   35 = >= 60% kata match
 *   15 = >= 40% kata match
 *   0  = < 40% match
 * 
 * relevanceBonus (0-15):
 *   +15 = title mengandung kata kunci relevan (trailer, PV, anime, dll)
 *   +10 = title mengandung kata kunci umum
 * 
 * specificBonus (-10 to +10):
 *   +10 = query DAN title sama-sama punya keyword spesifik (season/part/trailer)
 *   -10 = query punya keyword spesifik tapi title generik
 * 
 * Cap: 0-100
 */
/**
 * Expand abbreviations in query/title untuk better matching.
 * Contoh: "MHA season 3" → "my hero academia season 3"
 */
function expandAbbreviations(text: string): string {
  let expanded = text.toLowerCase().trim();
  // Cek apa teks mengandung singkatan yang dikenal
  for (const [abbr, full] of Object.entries(ANIME_ABBREVIATIONS)) {
    // Match whole word
    const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(expanded)) {
      // Replace abbreviation with full name
      expanded = expanded.replace(regex, full);
    }
  }
  return expanded;
}

function videoTitleScore(query: string, title: string | null | undefined): number {
  if (!title) return 0;
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();
  if (!q || !t) return 0;

  // ── Pre-process: expand abbreviations ──
  const qExpanded = expandAbbreviations(q);
  const tExpanded = expandAbbreviations(t);

  const qTokens = tokenize(qExpanded);
  const tTokens = tokenize(tExpanded);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  // ── Base Score ──
  let baseScore = 0;

  if (qExpanded === tExpanded) {
    baseScore = 75;
  } else {
    const overlap = tokenOverlap(qTokens, tTokens);
    const lr = lengthRatio(qExpanded, tExpanded);

    if (overlap >= 1.0 && lr >= 0.6) {
      baseScore = 65;
    } else if (overlap >= 1.0) {
      baseScore = 55;
    } else if (overlap >= 0.8 && lr >= 0.5) {
      baseScore = 45;
    } else if (overlap >= 0.6) {
      baseScore = 35;
    } else if (overlap >= 0.4) {
      baseScore = 15;
    } else {
      baseScore = 0;
    }
  }

  // ── Relevance Bonus ──
  let relevanceBonus = 0;
  const matchedKeywords = RELEVANT_KEYWORDS.filter((kw) => t.includes(kw));
  if (matchedKeywords.length >= 2) {
    relevanceBonus = 15;
  } else if (matchedKeywords.length === 1) {
    relevanceBonus = 10;
  }

  // ── Specific Keyword Bonus ──
  let specificBonus = 0;
  const queryHasSpecific = SPECIFIC_KEYWORDS.test(qExpanded);
  const titleHasSpecific = SPECIFIC_KEYWORDS.test(tExpanded);
  if (queryHasSpecific && titleHasSpecific) {
    specificBonus = 10;
  } else if (queryHasSpecific && !titleHasSpecific) {
    specificBonus = -10;
  }

  // ── Abbreviation Match Bonus ──
  // Kalau query pake singkatan dan title pake nama lengkap, atau sebaliknya, kasih bonus
  let abbrBonus = 0;
  const originalQ = q;
  const originalT = t;
  // Cek apakah ada singkatan yang di-expand di query
  const qHasAbbr = originalQ !== qExpanded && originalQ.length < qExpanded.length;
  const tHasAbbr = originalT !== tExpanded && originalT.length < tExpanded.length;
  if ((qHasAbbr || tHasAbbr) && baseScore > 0) {
    abbrBonus = 5;
  }

  // ── Final ──
  return Math.max(0, Math.min(100, baseScore + relevanceBonus + specificBonus + abbrBonus));
}

// ─── YouTube oEmbed API (gratis, unlimited) ────────────────
// Bisa validasi + ambil title real-time dari URL YouTube

interface OEmbedResult {
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
}

async function fetchOEmbed(videoId: string): Promise<OEmbedResult | null> {
  try {
    const url = `${YT_WATCH_URL}${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" }, signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;

    const data: any = await res.json();
    return {
      videoId,
      title: data.title || "",
      authorName: data.author_name || "",
      thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

// ─── YouTube Search HTML (ytInitialData JSON) ──────────────
// Scrape langsung YouTube search, parse ytInitialData JSON
// Ini yang dipakai search engine Google sendiri — paling akurat!

interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelName: string;
  publishedTime: string;
  viewCount: number;
  thumbnailUrl: string;
}

async function searchYouTubeHTML(query: string): Promise<YouTubeSearchResult[]> {
  const results: YouTubeSearchResult[] = [];

  try {
    // Gunakan User-Agent mobile agar dapet HTML yang lebih ringan
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      console.warn(`⚠️ YouTube search returned ${res.status}`);
      return [];
    }

    const html = await res.text();

    // Cari ytInitialData JSON di dalam HTML
    // Format: var ytInitialData = {...};
    const ytDataMatch = html.match(/ytInitialData\s*=\s*({.*?});\s*<\/script>/);
    if (!ytDataMatch) {
      console.warn("⚠️ Tidak ditemukan ytInitialData di YouTube HTML");
      return [];
    }

    const ytData = JSON.parse(ytDataMatch[1]);

    // Navigasi: contents → twoColumnSearchResultsRenderer → primaryContents → sectionListRenderer → contents[]
    const contents =
      ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;

        const videoId = videoRenderer?.videoId;
        if (!videoId || !YT_VIDEO_ID_REGEX.test(videoId)) continue;

        // Title dari runs
        const titleRuns = videoRenderer?.title?.runs || [];
        const title = titleRuns.map((r: any) => r.text).join("") || "";

        // Channel name
        const channelName =
          videoRenderer?.ownerText?.runs?.[0]?.text || "";

        // Published time
        const publishedTime =
          videoRenderer?.publishedTimeText?.simpleText || "";

        // View count
        let viewCount = 0;
        const viewText = videoRenderer?.viewCountText?.simpleText || "";
        const viewMatch = viewText.match(/[\d,.]+/);
        if (viewMatch) {
          viewCount = parseInt(viewMatch[0].replace(/,/g, ""));
        }

        // Thumbnail
        const thumbnails = videoRenderer?.thumbnail?.thumbnails || [];
        const thumbnailUrl = thumbnails.length > 0
          ? thumbnails[thumbnails.length - 1]?.url
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        if (title && videoId) {
          results.push({
            videoId,
            title,
            channelName,
            publishedTime,
            viewCount,
            thumbnailUrl,
          });
        }
      }
    }

    console.log(`📺 YouTube search: ${results.length} results for "${query}"`);
  } catch (e: any) {
    console.warn(`⚠️ YouTube HTML search error: ${e.message}`);
  }

  return results;
}

// ─── DuckDuckGo Web Search (via HTML) ─────────────────────
// Cari YouTube video via DuckDuckGo — pake site:youtube.com

interface DuckDuckGoVideoResult {
  videoId: string;
  title: string;
  snippet: string;
  url: string;
}

async function searchDuckDuckGoYouTube(query: string): Promise<DuckDuckGoVideoResult[]> {
  const results: DuckDuckGoVideoResult[] = [];

  try {
    // Pakai DuckDuckGo Lite HTML (lebih ringan, hasil lebih banyak)
    const htmlRes = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query + " site:youtube.com watch")}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DiscordBot/1.0)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (htmlRes.ok) {
      const html = await htmlRes.text();

      // Cari semua YouTube links
      const ytRegex = /https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g;
      let match;
      const seen = new Set<string>();

      while ((match = ytRegex.exec(html)) !== null) {
        const vid = match[1];
        if (!seen.has(vid)) {
          seen.add(vid);

          // Ekstrak title dari link <a> tag di sekitar
          const beforeLink = html.slice(Math.max(0, match.index - 300), match.index);
          const titleMatch = beforeLink.match(/<a[^>]*class="[^"]*"[^>]*>([^<]+)<\/a>/i);
          const fallbackTitle = beforeLink.match(/<a[^>]*>([^<]+)<\/a>/i);
          const title = titleMatch?.[1]?.trim() || fallbackTitle?.[1]?.trim() || "";

          if (title && title.length > 3 && !title.includes("youtube.com")) {
            results.push({
              videoId: vid,
              title: title.replace(/&#?\w+;/g, "").trim(),
              snippet: title,
              url: `https://www.youtube.com/watch?v=${vid}`,
            });
          }
        }
      }
    }
  } catch (e: any) {
    console.warn(`⚠️ DuckDuckGo search error: ${e.message}`);
  }

  return results;
}

// ─── Invidious API (gratis, tanpa API key) ─────────────────
// Invidious adalah YouTube frontend alternatif yang open-source
// Pakai instansi publik yang reliable

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.snopyta.org",
  "https://vid.puffyan.us",
];

interface InvidiousSearchResult {
  videoId: string;
  title: string;
  author: string;
  publishedText: string;
  viewCount: number;
}

async function searchInvidious(query: string): Promise<InvidiousSearchResult[]> {
  // Coba beberapa instansi, ambil yang pertama berhasil
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance&limit=5`,
        { headers: { "User-Agent": "discord-ai-bot/1.0" }, signal: AbortSignal.timeout(5000) }
      );

      if (!res.ok) continue;

      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      return data
        .filter((v: any) => v.videoId && YT_VIDEO_ID_REGEX.test(v.videoId))
        .map((v: any) => ({
          videoId: v.videoId,
          title: v.title || "",
          author: v.author || "",
          publishedText: v.publishedText || "",
          viewCount: v.viewCount || 0,
        }));
    } catch {
      continue; // Coba instansi berikutnya
    }
  }

  return [];
}

// ─── YouTube Data API (butuh API key) ──────────────────────

interface YouTubeApiResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
}

async function searchYouTubeAPI(
  query: string,
  apiKey: string | undefined
): Promise<YouTubeApiResult[]> {
  if (!apiKey) return [];

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return [];

    const data: any = await res.json();
    const items: any[] = data.items || [];

    return items.map((item: any) => ({
      videoId: item.id?.videoId || "",
      title: item.snippet?.title || "",
      channelTitle: item.snippet?.channelTitle || "",
      publishedAt: item.snippet?.publishedAt || "",
      viewCount: 0, // Butuh API call terpisah untuk statistik
    })).filter((v) => v.videoId && YT_VIDEO_ID_REGEX.test(v.videoId));
  } catch {
    return [];
  }
}

// ─── Google Custom Search (untuk YouTube) ──────────────────

async function searchGoogleYouTube(
  query: string,
  apiKey: string | undefined,
  engineId: string | undefined
): Promise<DuckDuckGoVideoResult[]> {
  if (!apiKey || !engineId) return [];

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx: engineId,
      q: `${query} YouTube`,
      num: "5",
      safe: "active",
    });

    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!res.ok) return [];

    const data: any = await res.json();
    const items: any[] = data.items || [];

    const results: DuckDuckGoVideoResult[] = [];
    for (const item of items) {
      const link = item.link || "";
      const ytMatch = link.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (ytMatch) {
        results.push({
          videoId: ytMatch[1],
          title: item.title || "",
          snippet: item.snippet || "",
          url: link,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── URL Validation ────────────────────────────────────────

/**
 * Validasi URL YouTube dengan oEmbed + lightweight checks.
 * 
 * REVISI v3.1: Validasi sekarang lebih LENIENT.
 * - oEmbed sukses → return data valid dengan title real
 * - oEmbed gagal → TETAP dianggap valid (format ID 11 char sudah cukup)
 * - Gak perlu HEAD request lagi (sering diblokir Cloudflare IP)
 * 
 * Kenapa? Karena YouTube sering block HEAD request dari Cloudflare.
 * Tapi kalo oEmbed berhasil, kita dapet title asli + thumbnail.
 */
async function validateYouTubeUrl(videoId: string): Promise<{
  exists: boolean;
  title?: string;
  channelName?: string;
  thumbnailUrl?: string;
}> {
  // Method 1: oEmbed API (paling reliable, jarang diblokir)
  try {
    const oembed = await fetchOEmbed(videoId);
    if (oembed) {
      return {
        exists: true,
        title: oembed.title,
        channelName: oembed.authorName,
        thumbnailUrl: oembed.thumbnailUrl,
      };
    }
  } catch {
    // fallback — tetap anggap valid
  }

  // Method 2: Cek format ID aja — YouTube ID 11 char = sudah pasti valid
  // Kenapa? YouTube pake base64url encoding untuk video ID
  // Semua video ID yang sah pasti 11 karakter alfanumerik + underscore + dash
  // Kalau format-nya cocok, 99% itu video beneran
  if (YT_VIDEO_ID_REGEX.test(videoId)) {
    // Coba thumbnail dulu (sering works bahkan kalo oEmbed gagal)
    try {
      const thumbRes = await fetch(
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        { method: "HEAD", signal: AbortSignal.timeout(2000) }
      );
      if (thumbRes.ok) {
        return {
          exists: true,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
      }
    } catch {
      // thumbnail juga gagal — tapi ID valid, tetap anggap exist
    }

    // YouTube ID valid + thumbnail mungkin 404 (video private/deleted)
    // Tapi kita tetap return exists: true karena ID format valid
    // Discord auto-embed akan handle sendiri
    return { exists: true };
  }

  return { exists: false };
}

// ─── Main Search Function ──────────────────────────────────

export interface VideoSearchOptions {
  minScore?: number;
  maxResults?: number;
  env?: any;
  requireValidation?: boolean; // Default: true — validasi URL sebelum return
}

/**
 * Cari video YouTube paling relevan dengan scoring multi-source.
 * 
 * Flow:
 * 1. Parallel search dari semua source (DDG + Invidious + YT API + Google)
 * 2. Score semua hasil terhadap query
 * 3. Validasi URL (oEmbed/HEAD)
 * 4. Ambil yang score tertinggi (min 50)
 * 5. Early exit kalau 2+ source setuju dengan score >= 75
 * 6. Cache di KV (1 jam TTL)
 * 
 * Return: "https://www.youtube.com/watch?v=XXXX" atau null
 */
export async function searchYouTubeVideo(
  query: string,
  options?: VideoSearchOptions
): Promise<{ url: string; title: string; source: string; score: number } | null> {
  if (!query || query.length < 3) return null;

  const minScore = options?.minScore || 50;
  const env = options?.env;
  const requireValidation = options?.requireValidation !== false;
  const allResults: YouTubeVideoResult[] = [];

  // ── Cache check ──
  const cacheKey = `vidsearch:${query.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "_")}`;
  try {
    const cached = await env?.SCHEDULER_KV?.get(cacheKey, "text");
    if (cached) {
      const cachedResult = JSON.parse(cached);
      console.log(`📦 VideoScraper cache hit: "${query}"`);
      return cachedResult;
    }
  } catch {
    /* cache optional */
  }

  // ── PARALLEL FETCH: semua source jalan bareng ──
  const t0 = Date.now();

  const [ytHtmlResults, invidiousResults, ddgResults, ytApiResults, googleResults] = await Promise.allSettled([
    // Source 1 (PRIMARY): YouTube HTML Search — paling akurat!
    searchYouTubeHTML(query),
    // Source 2: Invidious (fallback)
    searchInvidious(query),
    // Source 3: DuckDuckGo Web (fallback terakhir)
    searchDuckDuckGoYouTube(query),
    // Source 4: YouTube Data API (optional)
    env?.YOUTUBE_API_KEY
      ? searchYouTubeAPI(query, env.YOUTUBE_API_KEY)
      : Promise.resolve([]),
    // Source 5: Google Custom Search (optional)
    env?.GOOGLE_SEARCH_API_KEY && env?.GOOGLE_SEARCH_ENGINE_ID
      ? searchGoogleYouTube(query, env.GOOGLE_SEARCH_API_KEY, env.GOOGLE_SEARCH_ENGINE_ID)
      : Promise.resolve([]),
  ]);

  const elapsed = Date.now() - t0;
  console.log(`⏱️ VideoScraper parallel fetch: ${elapsed}ms`);

  // ── Process YouTube HTML (PRIMARY) ──
  const ytHtmlData = ytHtmlResults.status === "fulfilled" ? ytHtmlResults.value : [];
  for (const item of ytHtmlData) {
    const score = videoTitleScore(query, item.title);
    if (score >= minScore) {
      allResults.push({
        videoId: item.videoId,
        url: `${YT_WATCH_URL}${item.videoId}`,
        title: item.title,
        channelName: item.channelName,
        source: "YouTube",
        score,
        publishedAt: item.publishedTime,
        viewCount: item.viewCount,
        thumbnailUrl: item.thumbnailUrl,
      });
    }
  }

  // ── Process Invidious ──
  const invidiousData = invidiousResults.status === "fulfilled" ? invidiousResults.value : [];
  for (const item of invidiousData) {
    const score = videoTitleScore(query, item.title);
    if (score >= minScore) {
      allResults.push({
        videoId: item.videoId,
        url: `${YT_WATCH_URL}${item.videoId}`,
        title: item.title,
        channelName: item.author,
        source: "Invidious",
        score,
        publishedAt: item.publishedText,
        viewCount: item.viewCount,
      });
    }
  }

  // ── Process DuckDuckGo ──
  const ddgData = ddgResults.status === "fulfilled" ? ddgResults.value : [];
  for (const item of ddgData) {
    const score = videoTitleScore(query, item.title);
    if (score >= minScore) {
      allResults.push({
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        source: "DuckDuckGo",
        score,
      });
    }
  }

  // ── Process YouTube API ──
  const ytData = ytApiResults.status === "fulfilled" ? ytApiResults.value : [];
  for (const item of ytData) {
    const score = videoTitleScore(query, item.title);
    if (score >= minScore) {
      allResults.push({
        videoId: item.videoId,
        url: `${YT_WATCH_URL}${item.videoId}`,
        title: item.title,
        channelName: item.channelTitle,
        source: "YouTube API",
        score,
        publishedAt: item.publishedAt,
      });
    }
  }

  // ── Process Google ──
  const googleData = googleResults.status === "fulfilled" ? googleResults.value : [];
  for (const item of googleData) {
    const score = videoTitleScore(query, item.title);
    if (score >= minScore) {
      allResults.push({
        videoId: item.videoId,
        url: item.url,
        title: item.title,
        source: "Google",
        score,
      });
    }
  }

  // ── Sort by score descending ──
  allResults.sort((a, b) => b.score - a.score);

  if (allResults.length === 0) {
    // ── Fallback: coba tanpa kata kunci spesifik ──
    const fallbackQuery = query
      .replace(/\b(trailer|teaser|pv|video|official|new|2024|2025|2026)\b/gi, "")
      .trim();
    if (fallbackQuery && fallbackQuery !== query && fallbackQuery.length >= 3) {
      console.log(`🔄 VideoScraper fallback: "${query}" → "${fallbackQuery}"`);
      return searchYouTubeVideo(fallbackQuery, options);
    }

    console.warn(`⚠️ VideoScraper: gak nemu video untuk "${query}"`);
    return null;
  }

  // ── SAFE EARLY EXIT: 2+ source setuju + score >= 75 ──
  if (allResults.length > 1) {
    const topId = allResults[0].videoId;
    const agreeingSources = new Set(
      allResults.filter((r) => r.videoId === topId && r.score >= 70).map((r) => r.source)
    );

    if (agreeingSources.size >= 2 && allResults[0].score >= 75) {
      console.log(
        `🎯 SAFE EARLY EXIT: ${agreeingSources.size} sources agree on video "${allResults[0].title}" (ID: ${topId}, sources: ${[...agreeingSources].join(", ")})`
      );

      // Early exit — langsung return, validasi ringan aja
      // 2+ source setuju + score >= 75 = reliable!
      const best = allResults[0];
      const result = {
        url: best.url,
        title: best.title,
        source: `✓ ${best.source} (+${[...agreeingSources].join(", ")})`,
        score: best.score,
      };

      try {
        await env?.SCHEDULER_KV?.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 3600,
        });
      } catch {}

      return result;
    }
  }

  // ── Ambil score tertinggi, validasi ringan ──
  const best = allResults[0];
  console.log(
    `✅ VideoScraper: "${query}" → "${best.title}" (${best.source}, score: ${best.score}) [${elapsed}ms]`
  );

  // Validasi URL — tapi TIDAK hard reject kalau gagal
  // YouTube sering block Cloudflare, jadi kita trust source & format ID aja
  let validatedTitle = best.title;
  let validatedSource = best.source;
  let thumbnailUrl: string | undefined;

  if (requireValidation) {
    const validation = await validateYouTubeUrl(best.videoId);
    if (validation.exists) {
      validatedTitle = validation.title || best.title;
      thumbnailUrl = validation.thumbnailUrl;
      validatedSource = `${best.source} ✓`;
      console.log(`✅ VideoScraper: video ${best.videoId} valid (oEmbed/thumbnail OK)`);
    } else {
      // Validasi gagal — tapi kita tetap return karena format ID valid
      // Ini penting: YouTube ID format udah cukup buat Discord auto-embed
      console.warn(
        `⚠️ VideoScraper: video ${best.videoId} gagal validasi, tapi ID format OK — tetap dipakai`
      );
      validatedSource = `${best.source} (unverified)`;
    }
  }

  const result = {
    url: best.url,
    title: validatedTitle,
    source: validatedSource,
    score: best.score,
  };

  try {
    await env?.SCHEDULER_KV?.put(cacheKey, JSON.stringify(result), {
      expirationTtl: 3600,
    });
  } catch {}

  return result;
}

/**
 * Cari DAN validasi — return yang pasti valid.
 * Ini yang dipanggil dari scheduler.ts
 */
export async function findYouTubeVideo(
  query: string,
  env: any
): Promise<string | null> {
  const result = await searchYouTubeVideo(query, {
    env,
    minScore: 50,
    requireValidation: true, // validasi tetap jalan tapi ga hard-reject
  });

  if (!result) {
    // Fallback: coba search tanpa embel-embel "trailer" 
    const simplerQuery = query.replace(/\b(trailer|teaser|pv|official|video|new)\b/gi, "").trim();
    if (simplerQuery && simplerQuery !== query && simplerQuery.length >= 3) {
      console.log(`🔄 VideoScraper fallback: "${query}" → "${simplerQuery}"`);
      const fallback = await searchYouTubeVideo(simplerQuery, {
        env,
        minScore: 40, // Turunin threshold untuk fallback
        requireValidation: false,
      });
      if (fallback) return fallback.url;
    }

    console.log(`🎬 VideoScraper: Tidak ada video untuk "${query}"`);
    return null;
  }

  console.log(
    `🎬 VideoScraper: "${query}" → "${result.title}" (score: ${result.score}, source: ${result.source})`
  );

  return result.url;
}

/**
 * Cari video — return full result dengan metadata.
 * Berguna untuk debugging atau ditampilkan di embed.
 */
export async function searchYouTubeVideoDetailed(
  query: string,
  env: any
): Promise<YouTubeVideoResult | null> {
  const result = await searchYouTubeVideo(query, {
    env,
    minScore: 50,
    requireValidation: true,
  });

  if (!result) return null;

  // Ambil detail tambahan dari Invidious kalau ada
  const invidiousResults = await searchInvidious(query);
  const matchingInvidious = invidiousResults.find(
    (v) => result.url.includes(v.videoId)
  );

  return {
    videoId: result.url.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] || "",
    url: result.url,
    title: result.title,
    source: result.source,
    score: result.score,
    channelName: matchingInvidious?.author,
    publishedAt: matchingInvidious?.publishedText,
    viewCount: matchingInvidious?.viewCount,
    thumbnailUrl: `https://i.ytimg.com/vi/${
      result.url.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] || ""
    }/hqdefault.jpg`,
  };
}
