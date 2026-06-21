/**
 * Image Scraper — Multi-source image search dengan validasi akurat
 *
 * Masalah lama: "Demon Slayer" → dapet gambar kupu-kupu (salah match)
 * Solusi: Multi-source PARALLEL fetch + scoring ketat + caching
 *
 * Sources (semua GRATIS tanpa API key):
 * 1. Kitsu API — poster art berkualitas (default)
 * 2. AniList GraphQL — exact match support
 * 3. Jikan API (MAL) — strict season/part rules
 * 4. Anime News Network (ANN) — encyclopedia
 * 5. Wikipedia — gambar + deskripsi artikel
 * 6. Reddit API — search dari subreddit anime
 * 7. RSS Feeds — Anime News Network RSS
 * 8. Google Custom Search — optional (butuh API key)
 *
 * Optimization:
 * - Parallel fetch via Promise.allSettled
 * - KV cache (1 jam TTL)
 * - Early exit kalau score 100 (exact match)
 */

// ─── Types ─────────────────────────────────────────────────

export interface ImageSearchResult {
  url: string;
  title: string;           // Judul resmi dari API
  source: string;          // "AniList" | "MyAnimeList"
  malId?: number;
  anilistId?: number;
  score: number;           // Match score 0-100
  type: "anime" | "manga";
  coverColor?: string;     // Warna dari cover (untuk embed color)
  description?: string;    // Deskripsi/synopsis untuk description bonus scoring
}

// ─── Title Matching (Rewrite v2 — Token-based + Season-aware + Description bonus) ──

/**
 * Tokenize string: lowercase, split by non-alphanumeric, remove empty
 */
function tokenize(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}

/**
 * Hitung overlap ratio: berapa banyak token query yang muncul di set target
 */
function tokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((qt) =>
    targetTokens.some((tt) => tt === qt || qt.includes(tt) || tt.includes(qt))
  ).length;
  return matched / queryTokens.length;
}

/**
 * Hitung length ratio: seberapa mirip panjang query vs title
 * Title yang sangat panjang dari query = penalty
 */
function lengthRatio(q: string, t: string): number {
  if (!q || !t) return 0;
  const shorter = Math.min(q.length, t.length);
  const longer = Math.max(q.length, t.length);
  return shorter / longer;
}

// Kata kunci season/part/movie yang harus match dua-duanya
const SPECIFIC_KEYWORDS = /\b(season|part|episode|movie|film|arc|cour|special|ova|oad|sequel|prequel|remake|reboot|final|2nd|3rd|4th|5th|second|third|fourth|fifth)\b/i;

/**
 * Scoring v2 — Token-based matching + Season awareness + Description bonus
 *
 * baseScore (0-80):
 *   80 = exact match
 *   70 = semua kata query ada di title + length ratio >= 0.6
 *   60 = semua kata query ada di title + length ratio < 0.6
 *   50 = >= 80% kata match + length ratio >= 0.5
 *   40 = >= 60% kata match
 *   20 = >= 40% kata match
 *   0  = < 40% match
 *
 * seasonBonus (-20 to +15):
 *   +15 = query DAN title keduanya punya keyword season/part/movie
 *   -20 = query punya keyword tapi title TIDAK punya (generic match)
 *
 * descBonus (0 to +10):
 *   +10 = deskripsi mengandung semua kata query (untuk Wikipedia)
 *   +5  = deskripsi mengandung sebagian besar kata query
 *
 * Cap: 0-100
 */
function titleMatchScore(
  query: string,
  title: string | null | undefined,
  description?: string | null
): number {
  if (!title) return 0;
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();
  if (!q || !t) return 0;

  // ── Step 1: Tokenize ──
  const qTokens = tokenize(q);
  const tTokens = tokenize(t);

  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  // ── Step 2: Base Score ──
  let baseScore = 0;

  // Exact match
  if (q === t) {
    baseScore = 80;
  } else {
    // Token overlap
    const overlap = tokenOverlap(qTokens, tTokens);
    const lr = lengthRatio(q, t);

    if (overlap >= 1.0 && lr >= 0.6) {
      // Semua kata query ada di title + length mirip
      baseScore = 70;
    } else if (overlap >= 1.0) {
      // Semua kata ada tapi title jauh lebih panjang
      baseScore = 60;
    } else if (overlap >= 0.8 && lr >= 0.5) {
      baseScore = 50;
    } else if (overlap >= 0.6) {
      baseScore = 40;
    } else if (overlap >= 0.4) {
      baseScore = 20;
    } else {
      baseScore = 0;
    }
  }

  // ── Step 3: Season/Part/Movie Bonus ──
  const queryHasSpecific = SPECIFIC_KEYWORDS.test(q);
  const titleHasSpecific = SPECIFIC_KEYWORDS.test(t);

  let seasonBonus = 0;
  if (queryHasSpecific && titleHasSpecific) {
    // Keduanya punya keyword → match bagus
    seasonBonus = 15;
  } else if (queryHasSpecific && !titleHasSpecific) {
    // Query spesifik tapi title generik → penalty
    seasonBonus = -20;
  }

  // ── Step 4: Description Bonus (untuk Wikipedia, dll) ──
  let descBonus = 0;
  if (description) {
    const dTokens = tokenize(description);
    const descOverlap = tokenOverlap(qTokens, dTokens);
    if (descOverlap >= 0.8) {
      descBonus = 10;
    } else if (descOverlap >= 0.6) {
      descBonus = 5;
    }
  }

  // ── Step 5: Final Score ──
  const final = Math.max(0, Math.min(100, baseScore + seasonBonus + descBonus));

  return final;
}

// ─── AniList GraphQL ───────────────────────────────────────

interface AniListSearchResult {
  id: number;
  title: { romaji: string; english: string; native: string };
  coverImage: { large: string; color: string | null };
  type: "ANIME" | "MANGA";
  description?: string;    // synopsis dari AniList
}

async function searchAniList(
  query: string,
  type: "ANIME" | "MANGA" = "ANIME"
): Promise<AniListSearchResult[]> {
  const graphql = JSON.stringify({
    query: `
      query ($search: String, $type: MediaType) {
        Page(perPage: 5) {
          media(search: $search, type: $type, sort: POPULARITY_DESC) {
            id
            title { romaji english native }
            coverImage { large color }
            type
          }
        }
      }
    `,
    variables: { search: query, type },
  });

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "discord-ai-bot/1.0",
      },
      body: graphql,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    return data.data?.Page?.media || [];
  } catch {
    return [];
  }
}

// ─── Jikan API (MyAnimeList) ───────────────────────────────

interface JikanSearchResult {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_synonyms: string[];
  images: {
    jpg: {
      large_image_url: string;
      image_url: string;
    };
  };
  score: number;
  type: string;
  synopsis?: string;       // synopsis dari MAL
}

async function searchJikan(
  query: string,
  type: "anime" | "manga" = "anime"
): Promise<JikanSearchResult[]> {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(query)}&limit=5&sfw=true&order_by=score&sort=desc`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" } }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

// ─── Kitsu API (anime database, gratis) ────────────────────

interface KitsuSearchResult {
  id: string;
  attributes: {
    canonicalTitle: string;
    titles: Record<string, string>;
    posterImage: { large: string; medium: string; original: string } | null;
    coverImage: { large: string; original: string } | null;
    subtype: string;
    synopsis?: string;      // synopsis dari Kitsu
  };
}

async function searchKitsu(query: string): Promise<KitsuSearchResult[]> {
  try {
    const res = await fetch(
      `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=5&sort=-rating`,
      {
        headers: {
          "User-Agent": "discord-ai-bot/1.0",
          "Accept": "application/vnd.api+json",
        },
      }
    );
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

// ─── Anime News Network Encyclopedia API (gratis) ──────────

interface ANNSearchResult {
  id: string;
  title: string;
  type: string;
  image: string;
}

async function searchANN(query: string): Promise<ANNSearchResult[]> {
  try {
    const res = await fetch(
      `https://www.animenewsnetwork.com/encyclopedia/api.xml?title=${encodeURIComponent(query)}&type=anime`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" } }
    );
    if (!res.ok) return [];

    // ANN returns XML — parse sederhana
    const xml = await res.text();
    const results: ANNSearchResult[] = [];
    const itemRegex = /<info\s+id="(\d+)">([\s\S]*?)<\/info>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && results.length < 5) {
      const id = match[1];
      const content = match[2];
      const titleMatch = content.match(/<title>(.*?)<\/title>/);
      const imgMatch = content.match(/<img\s+src="([^"]+)"/);

      if (titleMatch && imgMatch) {
        results.push({
          id,
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ""),
          type: "anime",
          image: imgMatch[1],
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Google Custom Search API (optional, butuh API key) ────

/**
 * Search gambar via Google Custom Search.
 * Butuh 2 environment: GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_ENGINE_ID
 * Free tier: 100 queries/day
 */
async function searchGoogleImages(
  query: string,
  apiKey: string | undefined,
  engineId: string | undefined,
  limit: number = 5
): Promise<{ title: string; image: string; snippet: string }[]> {
  if (!apiKey || !engineId) return [];

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx: engineId,
      q: query,
      searchType: "image",
      safe: "active",
      num: String(Math.min(limit, 10)),
      imgType: "photo",
      imgSize: "large",
    });

    console.log(`🌐 Google API: GET customsearch/v1?q=${query}`);
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      console.warn(`⚠️ Google Search API error: ${res.status} - ${errText.slice(0, 200)}`);
      return [];
    }

    const data: any = await res.json();
    const items: any[] = data.items || [];
    console.log(`📊 Google API: ${items.length} items returned`);

    return items.map((item: any) => ({
      title: item.title || "",
      image: item.link || "",
      snippet: item.snippet || "",
    }));
  } catch (e: any) {
    console.warn(`⚠️ Google Search error: ${e.message}`);
    return [];
  }
}

// ─── DuckDuckGo Image Search (GRATIS! 🆓) ─────────────────
// DuckDuckGo punya image search endpoint yang GRATIS tanpa API key.
// Bisa cari keyword DESKRIPTIF kayak "key visual" atau "poster"!
//
// Flow:
// 1. GET main DuckDuckGo → extract VQD token
// 2. GET i.js dengan VQD → dapat array image URLs
// 3. Filter & validasi URL gambar
//
// Rate limit: longgar (lebih baik dari Google API)
// Cache: pake KV biar gak request berulang

interface DuckDuckGoImageResult {
  url: string;
  title: string;
  height: number;
  width: number;
  source: string;
}

async function searchDuckDuckGoImages(
  query: string,
  maxResults: number = 5
): Promise<DuckDuckGoImageResult[]> {
  const results: DuckDuckGoImageResult[] = [];
  const encodedQuery = encodeURIComponent(query);

  try {
    // Step 1: Dapetin VQD token dari halaman utama DuckDuckGo
    console.log(`🦆 DuckDuckGo: dapatkan VQD token untuk "${query}"`);
    const vqdRes = await fetch(
      `https://duckduckgo.com/?q=${encodedQuery}&t=h_&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!vqdRes.ok) {
      console.warn(`⚠️ DuckDuckGo VQD HTTP ${vqdRes.status}`);
      return [];
    }

    const html = await vqdRes.text();

    // Extract VQD token dari HTML — bentuknya: vqd=('|")xxxxx('|")
    let vqd = "";
    const vqdMatch = html.match(/vqd=([\d-]+)&/);
    if (vqdMatch && vqdMatch[1]) {
      vqd = vqdMatch[1];
    } else {
      // Fallback: coba regex lain
      const vqdMatch2 = html.match(/"vqd":"([^"]+)"/);
      if (vqdMatch2 && vqdMatch2[1]) {
        vqd = vqdMatch2[1];
      } else {
        console.warn(`⚠️ DuckDuckGo: VQD token tidak ditemukan di HTML`);
        return [];
      }
    }

    console.log(`🦆 DuckDuckGo: VQD token didapat (${vqd.length} chars)`);

    // Step 2: Fetch image JSON results pake VQD
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodedQuery}&o=json&vqd=${vqd}&p=1&f=,,,&l=us-en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!imgRes.ok) {
      const errText = await imgRes.text().catch(() => "unknown");
      console.warn(`⚠️ DuckDuckGo Images HTTP ${imgRes.status}: ${errText.slice(0, 200)}`);
      return [];
    }

    const data: any = await imgRes.json();
    const items: any[] = data.results || [];

    console.log(`🦆 DuckDuckGo: ${items.length} image results for "${query}"`);

    for (const item of items.slice(0, maxResults)) {
      const imageUrl = item.image || item.thumbnail;
      if (!imageUrl) continue;

      // Validasi: harus URL http/https
      if (!imageUrl.startsWith("http")) continue;

      // Validasi: harus ekstensi gambar
      const ext = imageUrl.split("?").shift()?.split(".").pop()?.toLowerCase() || "";
      if (!["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"].includes(ext)) {
        // Beberapa URL gak pake ekstensi — tetap coba
      }

      results.push({
        url: imageUrl,
        title: item.title || query,
        height: item.height || 0,
        width: item.width || 0,
        source: item.source || "DuckDuckGo",
      });
    }

    // Sort by image size (prefer larger images)
    results.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  } catch (e: any) {
    console.warn(`⚠️ DuckDuckGo Images error: ${e.message}`);
  }

  if (results.length > 0) {
    console.log(`🦆 DuckDuckGo: ${results.length} valid images untuk "${query}"`);
  }

  return results;
}

// ─── Wikipedia API (gratis, tanpa API key) ────────────────

interface WikipediaSearchResult {
  title: string;
  pageid: number;
  thumbnail?: { source: string; width: number; height: number };
  description?: string;
}

async function searchWikipedia(query: string): Promise<WikipediaSearchResult[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      format: "json",
      srsearch: `${query} anime manga`,
      srlimit: "5",
      origin: "*",
    });
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?${params}`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" }, signal: AbortSignal.timeout(6000) }
    );
    if (!searchRes.ok) return [];
    const searchData: any = await searchRes.json();
    const pages: any[] = searchData.query?.search || [];
    if (pages.length === 0) return [];

    // Ambil thumbnail dari tiap halaman
    const pageIds = pages.map((p: any) => p.pageid).join("|");
    const thumbParams = new URLSearchParams({
      action: "query",
      pageids: pageIds,
      format: "json",
      prop: "pageimages|extracts",
      piprop: "thumbnail",
      pithumbsize: "600",
      exintro: "true",
      exsentences: "1",
      origin: "*",
    });
    const thumbRes = await fetch(
      `https://en.wikipedia.org/w/api.php?${thumbParams}`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" }, signal: AbortSignal.timeout(6000) }
    );
    if (!thumbRes.ok) return [];
    const thumbData: any = await thumbRes.json();
    const pageData: Record<string, any> = thumbData.query?.pages || {};

    return pages.map((p: any) => ({
      title: p.title,
      pageid: p.pageid,
      thumbnail: pageData[String(p.pageid)]?.thumbnail,
      description: pageData[String(p.pageid)]?.extract?.slice(0, 200),
    }));
  } catch {
    return [];
  }
}

// ─── Reddit API (gratis, JSON tanpa auth) ─────────────────

async function searchReddit(
  query: string,
  subreddits: string[] = ["anime", "manga", "Animenews"]
): Promise<{ title: string; image: string; subreddit: string }[]> {
  const results: { title: string; image: string; subreddit: string }[] = [];

  // Search Reddit via .json endpoint (tanpa auth)
  const searchPromises = subreddits.map(async (sub) => {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=5&t=year&restrict_sr=1`,
        { headers: { "User-Agent": "discord-ai-bot/1.0" }, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return [];
      const data: any = await res.json();
      const posts: any[] = data.data?.children || [];
      return posts
        .filter((p: any) => {
          const d = p.data;
          // Hanya ambil post dengan gambar
          if (!d.url_overridden_by_dest && !d.thumbnail?.startsWith("http")) return false;
          return true;
        })
        .map((p: any) => {
          const d = p.data;
          const imageUrl = d.url_overridden_by_dest || d.thumbnail || "";
          return {
            title: d.title || "",
            image: imageUrl,
            subreddit: d.subreddit || sub,
          };
        })
        .filter((r: any) => r.image && r.image.startsWith("http"));
    } catch {
      return [];
    }
  });

  const allArrays = await Promise.allSettled(searchPromises);
  for (const arr of allArrays) {
    if (arr.status === "fulfilled") results.push(...arr.value);
  }

  return results.slice(0, 8);
}

// ─── RSS Feed Parser (Anime News Network + Crunchyroll) ───

interface RSSImageItem {
  title: string;
  image: string;
  source: string;
  description: string;
}

/**
 * Parse RSS/Atom feed untuk ambil gambar + title
 * Support: ANN RSS, Crunchyroll RSS, MyAnimeList RSS
 */
async function fetchRSSFeed(
  feedUrl: string,
  sourceName: string
): Promise<RSSImageItem[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "discord-ai-bot/1.0", "Accept": "application/rss+xml, application/atom+xml, text/xml" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const items: RSSImageItem[] = [];

    // Match <item> atau <entry> (Atom)
    const itemRegex = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const content = match[1];
      const title = content.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || "";
      const description = content.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";

      // Cari gambar dari <media:content>, <enclosure>, atau <img> di description
      let image = "";
      const mediaContent = content.match(/<media:content[^>]+url="([^"]+)"/);
      const enclosure = content.match(/<enclosure[^>]+url="([^"]+)"/);
      const imgInDesc = description.match(/<img[^>]+src="([^"]+)"/);
      const imgFromContent = content.match(/<content[^>]*>(?:<!\[CDATA\[)?[\s\S]*?<img[^>]+src="([^"]+)"/);

      if (mediaContent) image = mediaContent[1];
      else if (enclosure) image = enclosure[1];
      else if (imgInDesc) image = imgInDesc[1];
      else if (imgFromContent) image = imgFromContent[1];

      if (title && image && image.startsWith("http")) {
        items.push({
          title: title.replace(/<!\[CDATA\[|\]\]>/g, ""),
          image,
          source: sourceName,
          description: description.replace(/<!\[CDATA\[|\]\]>/g, "").slice(0, 200),
        });
      }
    }

    return items;
  } catch {
    return [];
  }
}

// ─── MAL Strict Rule ──────────────────────────────────────

/**
 * Cek apakah query butuh spesifik season/part/movie.
 * Contoh: "Jujutsu Kaisen Season 3" → true
 *         "Jujutsu Kaisen" → false (query base)
 */
function queryNeedsExactMAL(query: string): boolean {
  const specificKeywords = /\b(season|part|episode|movie|film|arc|cour|special|ova|oad|sequel|prequel)\b/i;
  return specificKeywords.test(query);
}

// ─── Main Search Function ──────────────────────────────────

/**
 * Cari gambar anime/manga dengan akurasi tinggi
 *
 * Flow:
 * 1. Search AniList GraphQL (paling akurat)
 * 2. Kalau AniList gagal → fallback Jikan
 * 3. Score semua result terhadap query
 * 4. Ambil yang score tertinggi (min 60)
 *
 * Optimization:
 * - Parallel fetch (semua source jalan bareng)
 * - KV cache 1 jam TTL (query yang sama gak fetch ulang)
 * - Safe early exit: hanya kalau 2+ source setuju dengan title SAMA + score ≥70
 */
export async function searchAnimeImage(
  query: string,
  options?: { minScore?: number; maxResults?: number; env?: any }
): Promise<{ url: string; filename: string; source: string } | null> {
  if (!query || query.length < 2) return null;

  const minScore = options?.minScore || 60;
  const env = options?.env;
  const allResults: ImageSearchResult[] = [];

  // ── Cache check ──
  const cacheKey = `imgsearch:${query.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().replace(/\s+/g, "_")}`;
  try {
    const cached = await env?.SCHEDULER_KV?.get(cacheKey, "text");
    if (cached) {
      const cachedResult = JSON.parse(cached);
      console.log(`📦 ImageScraper cache hit: "${query}"`);
      return cachedResult;
    }
  } catch { /* cache optional */ }

  // ── PARALLEL FETCH: semua source jalan bareng ──
  const t0 = Date.now();
  const malStrict = queryNeedsExactMAL(query);

  const [
    kitsuResults,
    anilistResults,
    jikanAnimeResults,
    jikanMangaResults,
    annResults,
    wikiResults,
    redditResults,
    rssResults,
    googleResults,
    duckduckgoResults,
  ] = await Promise.allSettled([
    // Source 1: Kitsu
    searchKitsu(query),
    // Source 2: AniList
    searchAniList(query),
    // Source 3: Jikan (anime + manga)
    searchJikan(query, "anime"),
    searchJikan(query, "manga"),
    // Source 4: ANN
    searchANN(query),
    // Source 5: Wikipedia
    searchWikipedia(query),
    // Source 6: Reddit (anime subreddits)
    searchReddit(query, ["anime", "manga", "Animenews"]),
    // Source 7: RSS (ANN + Crunchyroll)
    Promise.allSettled([
      fetchRSSFeed("https://www.animenewsnetwork.com/encyclopedia/rss.xml?type=anime", "ANN RSS"),
      fetchRSSFeed("https://www.crunchyroll.com/feeds/latest", "Crunchyroll RSS"),
    ]).then((results) => results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))),
    // Source 8: Google (optional)
    env?.GOOGLE_SEARCH_API_KEY && env?.GOOGLE_SEARCH_ENGINE_ID
      ? searchGoogleImages(query, env.GOOGLE_SEARCH_API_KEY, env.GOOGLE_SEARCH_ENGINE_ID)
      : Promise.resolve([]),
    // Source 9: DuckDuckGo Images (GRATIS! 🆓)
    searchDuckDuckGoImages(query, 5),
  ]);

  const elapsed = Date.now() - t0;
  console.log(`⏱️ ImageScraper parallel fetch: ${elapsed}ms`);

  // ── Process Kitsu ──
  const kitsuData = kitsuResults.status === "fulfilled" ? kitsuResults.value : [];
  for (const item of kitsuData) {
    const titles = [
      item.attributes.canonicalTitle,
      ...Object.values(item.attributes.titles || {}),
    ].filter(Boolean);
    let bestScore = 0;
    for (const t of titles) {
      bestScore = Math.max(bestScore, titleMatchScore(query, t, item.attributes.synopsis || undefined));
    }
    if (bestScore >= minScore) {
      const img = item.attributes.posterImage?.large || item.attributes.posterImage?.medium;
      if (img) {
        allResults.push({ url: img, title: item.attributes.canonicalTitle, source: "Kitsu", anilistId: undefined, score: bestScore, description: item.attributes.synopsis || undefined, type: "anime" });
      }
    }
  }

  // ── Process AniList ──
  const anilistData = anilistResults.status === "fulfilled" ? anilistResults.value : [];
  for (const item of anilistData) {
    const titles = [item.title.romaji, item.title.english, item.title.native].filter(Boolean);
    let bestScore = 0;
    for (const t of titles) {
      bestScore = Math.max(bestScore, titleMatchScore(query, t, item.description || undefined));
    }
    if (bestScore >= minScore) {
      allResults.push({ url: item.coverImage.large, title: item.title.english || item.title.romaji, source: "AniList", anilistId: item.id, description: item.description, score: bestScore, type: item.type === "ANIME" ? "anime" : "manga", coverColor: item.coverImage.color || undefined });
    }
  }

  // ── Process Jikan (MAL) ──
  const jikanAnimeData = jikanAnimeResults.status === "fulfilled" ? jikanAnimeResults.value : [];
  for (const item of jikanAnimeData) {
    const titles = [item.title, item.title_english, ...(item.title_synonyms || [])].filter(Boolean);
    let bestScore = 0;
    for (const t of titles) {
      bestScore = Math.max(bestScore, titleMatchScore(query, t, item.synopsis || undefined));
    }
    if (malStrict && bestScore < 80) {
      const hasSpecific = (titles.filter(Boolean) as string[]).some((t) => {
        const tLower = t.toLowerCase();
        return tLower.includes("season") || tLower.includes("part") || tLower.includes("movie") || tLower.includes("film") || tLower.includes("arc");
      });
      if (!hasSpecific) continue;
    }
    if (bestScore >= minScore) {
      const img = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
      if (img) {
        allResults.push({ url: img, title: item.title_english || item.title, source: "MyAnimeList", malId: item.mal_id, score: bestScore, description: item.synopsis || undefined, type: "anime" });
      }
    }
  }

  const jikanMangaData = jikanMangaResults.status === "fulfilled" ? jikanMangaResults.value : [];
  for (const item of jikanMangaData) {
    const titles = [item.title, item.title_english, ...(item.title_synonyms || [])].filter(Boolean);
    let bestScore = 0;
    for (const t of titles) {
      bestScore = Math.max(bestScore, titleMatchScore(query, t, item.synopsis || undefined));
    }
    if (bestScore >= minScore) {
      const img = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
      if (img) {
        allResults.push({ url: img, title: item.title_english || item.title, source: "MyAnimeList", malId: item.mal_id, score: bestScore, description: item.synopsis || undefined, type: "manga" });
      }
    }
  }

  // ── Process ANN ──
  const annData = annResults.status === "fulfilled" ? annResults.value : [];
  for (const item of annData) {
    const score = titleMatchScore(query, item.title);
    if (score >= minScore && item.image) {
      allResults.push({ url: item.image, title: item.title, source: "ANN", score, type: "anime" });
    }
  }

  // ── Process Wikipedia ──
  const wikiData = wikiResults.status === "fulfilled" ? wikiResults.value : [];
  for (const item of wikiData) {
    const score = titleMatchScore(query, item.title, item.description);
    if (score >= minScore && item.thumbnail?.source) {
      allResults.push({ url: item.thumbnail.source, title: item.title, source: "Wikipedia", score, description: item.description, type: "anime" });
    }
  }

  // ── Process Reddit ──
  const redditData = redditResults.status === "fulfilled" ? redditResults.value : [];
  for (const item of redditData) {
    const score = titleMatchScore(query, item.title);
    if (score >= minScore && item.image) {
      allResults.push({ url: item.image, title: item.title, source: `Reddit r/${item.subreddit}`, score, type: "anime" });
    }
  }

  // ── Process RSS ──
  const rssData = rssResults.status === "fulfilled" ? rssResults.value : [];
  for (const item of rssData) {
    const score = titleMatchScore(query, item.title, item.description);
    if (score >= minScore && item.image) {
      allResults.push({ url: item.image, title: item.title, source: item.source, score, description: item.description, type: "anime" });
    }
  }

  // ── Process Google ──
  const googleData = googleResults.status === "fulfilled" ? googleResults.value : [];
  for (const item of googleData) {
    const score = titleMatchScore(query, item.title, item.snippet || undefined);
    if (score >= minScore && item.image) {
      allResults.push({ url: item.image, title: item.title, source: "Google Images", score, type: "anime" });
    }
  }

  // ── Process DuckDuckGo Images (SEARCH ENGINE PRIORITY! 🔥) ──
  // DuckDuckGo bisa cari keyword DESKRIPTIF — gak perlu judul anime exact!
  // Contoh: "Demon Slayer key visual" → dapet gambar padahal bukan judul anime.
  //
  // PRIORITAS: DuckDuckGo SELALU ditambahkan (gak peduli MAL/AniList ada atau tidak).
  // Score 75 — cukup tinggi buat bersaing, akurasi gambar dari search engine.
  const duckduckgoData = duckduckgoResults.status === "fulfilled" ? duckduckgoResults.value : [];
  if (duckduckgoData.length > 0) {
    for (const item of duckduckgoData) {
      allResults.push({
        url: item.url,
        title: item.title || query,
        source: `DuckDuckGo — ${item.source || "images"}`,
        score: 75,
        type: "anime",
        description: `DuckDuckGo result: ${item.width}x${item.height}`,
      });
    }
    console.log(`🦆 DuckDuckGo: ${duckduckgoData.length} images added (score:75, search engine priority)`);
  }

  // ── SAFE EARLY EXIT: 2+ source setuju + title sama + score ≥70 ──
  if (allResults.length > 0) {
    allResults.sort((a, b) => b.score - a.score);

    // Hitung berapa source setuju dengan top result
    const topTitle = allResults[0].title.toLowerCase().trim();
    const agreeingSources = new Set(
      allResults.filter((r) => r.score >= 70 && r.title.toLowerCase().trim() === topTitle).map((r) => r.source)
    );

    if (agreeingSources.size >= 2 && allResults[0].score >= 70) {
      console.log(`🎯 SAFE EARLY EXIT: ${agreeingSources.size} sources agree on "${topTitle}" (sources: ${[...agreeingSources].join(", ")})`);
      const best = allResults[0];
      const result = { url: best.url, filename: `${best.type}-${best.malId || best.anilistId || Date.now()}.jpg`, source: `${best.source} — ${best.title}` };
      try { await env?.SCHEDULER_KV?.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }); } catch {}
      return result;
    }
  }

  // ── Ambil score tertinggi ──
  if (allResults.length === 0) {
    const fallbackQuery = query
      .replace(/\b(season|part|episode|movie|film| new| latest| upcoming| release| 2024|2025|2026)\b/gi, "")
      .trim();
    if (fallbackQuery && fallbackQuery !== query && fallbackQuery.length >= 2) {
      return searchAnimeImage(fallbackQuery, options);
    }
    console.warn(`⚠️ ImageScraper: gak nemu gambar cocok untuk "${query}"`);
    return null;
  }

  allResults.sort((a, b) => b.score - a.score);
  const best = allResults[0];
  console.log(`✅ ImageScraper: "${query}" → "${best.title}" (${best.source}, score: ${best.score}) [${elapsed}ms]`);

  const result = { url: best.url, filename: `${best.type}-${best.malId || best.anilistId || Date.now()}.jpg`, source: `${best.source} — ${best.title}` };

  // Cache hasil
  try { await env?.SCHEDULER_KV?.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }); } catch {}

  return result;
}

// ─── Image Download (reused from scheduler.ts) ─────────────

const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

/**
 * Download gambar dengan anti-CDN-block headers
 * Validasi: content-type + magic bytes
 */
export async function downloadImage(
  url: string
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
  };

  try {
    // Attempt 1: dengan full browser headers
    const res = await fetch(url, {
      headers: browserHeaders,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // Attempt 2: minimal headers
      const retry = await fetch(url, {
        headers: {
          "User-Agent": browserHeaders["User-Agent"],
          Accept: browserHeaders.Accept,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!retry.ok) return null;
      return validateAndReadImage(retry);
    }

    return validateAndReadImage(res);
  } catch (e: any) {
    console.warn(`⚠️ ImageScraper download error: ${e.message}`);
    return null;
  }
}

async function validateAndReadImage(
  res: Response
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const contentType = res.headers.get("content-type") || "";
  const buf = await res.arrayBuffer();

  if (VALID_IMAGE_TYPES.some((t) => contentType.includes(t))) {
    return { buffer: buf, mimeType: contentType };
  }

  // Validate magic bytes
  const header = new Uint8Array(buf.slice(0, 4));
  const isJPEG = header[0] === 0xff && header[1] === 0xd8;
  const isPNG = header[0] === 0x89 && header[1] === 0x50;
  const isGIF =
    header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  const isWEBP =
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;

  if (!isJPEG && !isPNG && !isGIF && !isWEBP) {
    console.warn(`⚠️ Bukan file gambar (${contentType}), skip`);
    return null;
  }

  const detectedType = isJPEG
    ? "image/jpeg"
    : isPNG
      ? "image/png"
      : isGIF
        ? "image/gif"
        : "image/webp";
  return { buffer: buf, mimeType: detectedType };
}
