/**
 * WebScout — Sistem Web Intelligence untuk Discord AI Bot
 *
 * Fitur:
 * 1. webSearch() — Multi-source search (DuckDuckGo, Wikipedia, HackerNews, Reddit)
 * 2. scrapePage() — Ekstrak konten readable dari URL
 * 3. deepSearch() — AI generates sub-queries → search all → scrape → AI summarize
 * 4. browseUrls() — Batch fetch multiple URLs
 * 5. Cache otomatis via KV (1 jam TTL)
 *
 * Semua GRATIS — tanpa API key (kecuali Reddit yang udah ada).
 */

// ─── Types ─────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string; // "duckduckgo" | "wikipedia" | "hackernews" | "reddit" | "googlenews"
}

export interface ScrapedPage {
  url: string;
  title: string;
  description: string;
  text: string;        // Clean text content
  wordCount: number;
  snippet: string;     // First ~500 chars
  links: string[];     // Internal links found
  fetchedAt: string;
}

export interface DeepSearchResult {
  query: string;
  subQueries: string[];
  results: SearchResult[];
  scrapedPages: ScrapedPage[];
  summary: string;       // AI-generated summary
  sources: string[];
}

// ─── Cache ─────────────────────────────────────────────────

const CACHE_PREFIX = "webscout:";
const CACHE_TTL_SECONDS = 3600; // 1 jam

/**
 * Ambil data dari cache KV
 */
async function cacheGet(env: any, key: string): Promise<any | null> {
  try {
    const raw = await env.SCHEDULER_KV.get(`${CACHE_PREFIX}${key}`, "text");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Simpan data ke cache KV
 */
async function cacheSet(env: any, key: string, data: any): Promise<void> {
  try {
    await env.SCHEDULER_KV.put(`${CACHE_PREFIX}${key}`, JSON.stringify(data), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // Cache optional — skip kalau gagal
  }
}

// ─── HTML Utils ────────────────────────────────────────────

/**
 * Strip HTML tags dan normalize whitespace
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract title dari HTML
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

/**
 * Extract meta description dari HTML
 */
function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  return match ? match[1] : "";
}

/**
 * Extract all internal links from HTML
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return [...new Set(links)].slice(0, 30); // Max 30 link
}

/**
 * Get readable text content from HTML (article/main content focused)
 */
function extractReadableText(html: string): string {
  let text = "";

  // Priority: <article> → <main> → <body>
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const content = article?.[1] || main?.[1] || body?.[1] || html;

  // Strip HTML
  text = stripHtml(content);

  // Ambil max 8000 karakter (biar ga overload context window)
  return text.slice(0, 8000);
}

// ─── Search Engines ───────────────────────────────────────

/**
 * Search via DuckDuckGo API (gratis, tanpa API key)
 * Menggunakan DDG Instant Answer API + HTML fallback
 */
async function searchDuckDuckGo(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    // Metode 1: Instant Answer API (JSON)
    const iaRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" } }
    );

    if (iaRes.ok) {
      const iaData: any = await iaRes.json();

      // Abstract / Definition
      if (iaData.AbstractText) {
        results.push({
          title: iaData.Headline || iaData.AbstractSource || "DuckDuckGo",
          url: iaData.AbstractURL || "",
          snippet: iaData.AbstractText.slice(0, 300),
          source: "duckduckgo",
        });
      }

      // Related topics
      if (iaData.RelatedTopics && Array.isArray(iaData.RelatedTopics)) {
        for (const topic of iaData.RelatedTopics) {
          if (results.length >= maxResults) break;
          if (topic.Text) {
            results.push({
              title: topic.Text.split(" - ")[0] || topic.Text,
              url: topic.FirstURL || "",
              snippet: topic.Text.slice(0, 200),
              source: "duckduckgo",
            });
          }
        }
      }
    }
  } catch {
    // Fallback ke metode HTML
  }

  // Metode 2: DuckDuckGo Lite HTML (hasil lebih lengkap)
  if (results.length < maxResults) {
    try {
      const htmlRes = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "discord-ai-bot/1.0" } }
      );

      if (htmlRes.ok) {
        const html = await htmlRes.text();

        // Parse hasil dari HTML table DDG Lite
        const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
        let stage = "none";

        for (const row of rows) {
          if (results.length >= maxResults) break;

          // Deteksi header tabel hasil
          if (row.includes('class="result-snippet"')) {
            stage = "result";
            continue;
          }

          if (stage === "result") {
            const linkMatch = row.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
            const snippetMatch = row.match(/<td[^>]*class=["']result-snippet["'][^>]*>(.*?)<\/td>/is);

            if (linkMatch) {
              const title = stripHtml(linkMatch[2]);
              const url = linkMatch[1].startsWith("http")
                ? linkMatch[1]
                : `https://lite.duckduckgo.com${linkMatch[1]}`;

              if (title && url && !title.includes("Next") && !title.includes("Previous")) {
                results.push({
                  title: title.slice(0, 200),
                  url: url,
                  snippet: snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 200) : "",
                  source: "duckduckgo",
                });
              }
            }
          }
        }
      }
    } catch {
      // Skip
    }
  }

  return results;
}

/**
 * Search via Wikipedia API (gratis, tanpa API key)
 */
async function searchWikipedia(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(query)}&srlimit=${maxResults}&srprop=snippet`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" } }
    );

    if (res.ok) {
      const data: any = await res.json();
      const pages = data.query?.search || [];

      for (const page of pages.slice(0, maxResults)) {
        results.push({
          title: page.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
          snippet: stripHtml(page.snippet || "").slice(0, 300),
          source: "wikipedia",
        });
      }
    }
  } catch {
    // Skip
  }

  return results;
}

/**
 * Search via HackerNews Algolia API (gratis, unlimited)
 */
async function searchHackerNews(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${maxResults}&tags=story`,
      { headers: { "User-Agent": "discord-ai-bot/1.0" } }
    );

    if (res.ok) {
      const data: any = await res.json();
      const hits = data.hits || [];

      for (const hit of hits.slice(0, maxResults)) {
        results.push({
          title: hit.title || "",
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          snippet: (hit.points ? `${hit.points} points | ` : "") + (hit.author ? `by ${hit.author}` : "") + (hit.comment_count ? ` | ${hit.comment_count} comments` : ""),
          source: "hackernews",
        });
      }
    }
  } catch {
    // Skip
  }

  return results;
}

// ─── Main WebScout Class ─────────────────────────────────

export class WebScout {
  private env: any;

  constructor(env: any) {
    this.env = env;
  }

  /**
   * Multi-source search — gabung hasil dari DuckDuckGo, Wikipedia, HackerNews
   * Hasil di-deduplicate dan diurutkan relevansi.
   */
  async search(query: string, options?: {
    maxResults?: number;
    sources?: string[];       // Filter: "duckduckgo" | "wikipedia" | "hackernews"
    useCache?: boolean;
  }): Promise<SearchResult[]> {
    const maxResults = options?.maxResults || 8;
    const useCache = options?.useCache !== false;
    const sources = options?.sources || ["duckduckgo", "wikipedia", "hackernews"];
    const cacheKey = `search:${query.toLowerCase().trim()}`;

    // Cek cache
    if (useCache) {
      const cached = await cacheGet(this.env, cacheKey);
      if (cached && Array.isArray(cached)) {
        console.log(`📦 WebScout cache hit: "${query}"`);
        return cached.slice(0, maxResults);
      }
    }

    // Search dari semua source parallel
    const searchPromises: Promise<SearchResult[]>[] = [];

    if (sources.includes("duckduckgo")) {
      searchPromises.push(searchDuckDuckGo(query, Math.ceil(maxResults * 0.5)));
    }
    if (sources.includes("wikipedia")) {
      searchPromises.push(searchWikipedia(query, Math.ceil(maxResults * 0.25)));
    }
    if (sources.includes("hackernews")) {
      searchPromises.push(searchHackerNews(query, Math.ceil(maxResults * 0.25)));
    }

    const resultsArrays = await Promise.allSettled(searchPromises);
    const allResults: SearchResult[] = [];

    for (const arr of resultsArrays) {
      if (arr.status === "fulfilled") {
        allResults.push(...arr.value);
      }
    }

    // Deduplikasi berdasarkan URL
    const seen = new Set<string>();
    const unique = allResults.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    const finalResults = unique.slice(0, maxResults);

    // Simpan cache
    if (useCache && finalResults.length > 0) {
      await cacheSet(this.env, cacheKey, finalResults);
    }

    return finalResults;
  }

  /**
   * Scrape satu URL — ambil konten readable + metadata
   */
  async scrapePage(url: string, options?: {
    maxLength?: number;
    useCache?: boolean;
  }): Promise<ScrapedPage> {
    const maxLength = options?.maxLength || 8000;
    const useCache = options?.useCache !== false;
    const cacheKey = `scrape:${url}`;

    // Cek cache
    if (useCache) {
      const cached = await cacheGet(this.env, cacheKey);
      if (cached && cached.url === url) {
        console.log(`📦 WebScout cache hit: "${url.slice(0, 80)}"`);
        return cached;
      }
    }

    // Fetch URL
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000), // 15 detik timeout
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const title = extractTitle(html);
    const description = extractMetaDescription(html);
    const text = extractReadableText(html).slice(0, maxLength);
    const links = extractLinks(html, url);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    const page: ScrapedPage = {
      url,
      title,
      description,
      text,
      wordCount,
      snippet: text.slice(0, 500),
      links,
      fetchedAt: new Date().toISOString(),
    };

    // Simpan cache
    if (useCache && text.length > 100) {
      await cacheSet(this.env, cacheKey, page);
    }

    return page;
  }

  /**
   * AI Deep Search — penelitian mendalam dengan multi-query
   *
   * Cara kerja:
   * 1. AI generates sub-queries dari topik
   * 2. Search + scrape tiap sub-query
   * 3. AI summary dari semua hasil
   */
  async deepSearch(
    topic: string,
    aiRouter: any, // Instance AiRouter
    options?: {
      maxSubQueries?: number;
      resultsPerQuery?: number;
    }
  ): Promise<DeepSearchResult> {
    const maxSubQueries = options?.maxSubQueries || 3;
    const resultsPerQuery = options?.resultsPerQuery || 3;

    // Langkah 1: AI generate sub-queries
    const subQueriesPrompt = (
      `Kamu adalah peneliti web. Dari topik utama: "${topic}",\n` +
      `buat ${maxSubQueries} sub-query pencarian untuk mencari informasi mendalam.\n` +
      `Sub-query harus spesifik dan mencakup aspek berbeda dari topik.\n` +
      `BALAS HANYA FORMAT JSON:\n` +
      `{"queries": ["query1", "query2", "query3"]}\n` +
      `JANGAN tambahkan teks lain.`
    );

    let subQueries: string[] = [topic];
    try {
      const aiResponse = await aiRouter.chat([{ role: "user", content: subQueriesPrompt }]);
      const parsed = JSON.parse(aiResponse.match(/\{[\s\S]*\}/)?.[0] || "{}");
      if (parsed.queries && Array.isArray(parsed.queries)) {
        subQueries = parsed.queries.slice(0, maxSubQueries);
      }
    } catch {
      // Fallback: pake topik asli sebagai single query
      subQueries = [topic];
    }

    // Langkah 2: Search tiap sub-query
    const allResults: SearchResult[] = [];
    const allPages: ScrapedPage[] = [];

    for (const q of subQueries) {
      try {
        const results = await this.search(q, { maxResults: resultsPerQuery + 2 });
        allResults.push(...results);

        // Scrape top 2 hasil
        const topResults = results.slice(0, 2);
        const scrapePromises = topResults.map((r) =>
          this.scrapePage(r.url, { maxLength: 3000 }).catch(() => null)
        );
        const pages = await Promise.allSettled(scrapePromises);
        for (const p of pages) {
          if (p.status === "fulfilled" && p.value) {
            allPages.push(p.value);
          }
        }
      } catch {
        // Skip sub-query yang gagal
      }
    }

    // Deduplikasi
    const uniqueResults = this.deduplicateResults(allResults);
    const uniquePages = this.deduplicatePages(allPages);

    // Langkah 3: AI summary dari semua data
    const sourcesText = uniquePages
      .map((p) => `--- ${p.title} (${p.url}) ---\n${p.text.slice(0, 1000)}`)
      .join("\n\n");

    const summaryPrompt = (
      `Kamu adalah peneliti AI. Berdasarkan data berikut tentang "${topic}",\n` +
      `buat ringkasan informatif 3-5 paragraf. Fokus pada fakta dan insight penting.\n` +
      `Gunakan bahasa Indonesia. Jangan tambahkan disclaimer.\n\n` +
      `## DATA PENELITIAN:\n${sourcesText.slice(0, 6000)}`
    );

    let summary = "Tidak ada data yang cukup untuk ringkasan.";
    try {
      summary = await aiRouter.chat([{ role: "user", content: summaryPrompt }]);
    } catch {
      summary = "Gagal generate ringkasan AI.";
    }

    const sources = [...new Set([...uniqueResults.map((r) => r.url), ...uniquePages.map((p) => p.url)])];

    return {
      query: topic,
      subQueries,
      results: uniqueResults,
      scrapedPages: uniquePages,
      summary,
      sources,
    };
  }

  /**
   * Browse multiple URLs sekaligus — untuk research batch
   */
  async browseUrls(urls: string[], options?: {
    maxLength?: number;
    maxPages?: number;
  }): Promise<ScrapedPage[]> {
    const maxPages = options?.maxPages || 5;
    const targetUrls = urls.slice(0, maxPages);

    const promises = targetUrls.map((url) =>
      this.scrapePage(url, { maxLength: options?.maxLength })
        .catch((e) => null as ScrapedPage | null)
    );

    const results = await Promise.allSettled(promises);
    const pages: ScrapedPage[] = [];

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        pages.push(r.value);
      }
    }

    return this.deduplicatePages(pages);
  }

  /**
   * Cari berita terkini + scrape untuk artikel — pengganti webResearch() lama
   * Return format kompatibel dengan `executeAiArticle()`
   */
  async researchForArticle(topic: string): Promise<{
    news: SearchResult[];
    summary: string;
  }> {
    const results = await this.search(topic, {
      maxResults: 10,
      useCache: true,
    });

    if (results.length === 0) {
      return {
        news: [],
        summary: "📰 Tidak ada berita spesifik ditemukan, gunakan pengetahuan yang ada.",
      };
    }

    // Scrape top 3 hasil untuk dapetin konten lebih detail
    const topUrls = results.slice(0, 3).map((r) => r.url).filter(Boolean);
    const pages = await this.browseUrls(topUrls, { maxLength: 2000 });

    // Format summary untuk prompt AI
    const summaryLines: string[] = [];

    for (const r of results.slice(0, 8)) {
      const pageInfo = pages.find((p) => p.url === r.url);
      const extraInfo = pageInfo ? ` — ${pageInfo.snippet.slice(0, 150)}` : "";
      summaryLines.push(`• [${r.source}] ${r.title}${extraInfo}`);
    }

    return {
      news: results,
      summary: `📰 **Hasil Riset Web:**\n${summaryLines.join("\n")}`,
    };
  }

  // ─── Private Helpers ─────────────────────────────────

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      const key = r.url || r.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private deduplicatePages(pages: ScrapedPage[]): ScrapedPage[] {
    const seen = new Set<string>();
    return pages.filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  }
}
