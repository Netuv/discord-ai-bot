/**
 * webscout.ts — Web intelligence module for Discord AI Bot
 * v5.0 — Multi-source search, HTML scraping, deep search, KV cache
 */

import type { Env } from '../types/env';
import { logger } from '../core/logger';

// ─── Types ─────────────────────────────────────────────────

export interface SearchResult { title: string; url: string; snippet: string; source: string; }
export interface ScrapedPage { url: string; title: string; description: string; text: string; wordCount: number; snippet: string; links: string[]; fetchedAt: string; }
export interface DeepSearchOptions { maxSubQueries?: number; resultsPerQuery?: number; }
export interface DeepSearchResult { query: string; subQueries: string[]; results: SearchResult[]; scrapedPages: ScrapedPage[]; summary: string; sources: string[]; }
export interface SearchOptions { maxResults?: number; sources?: string[]; useCache?: boolean; }

// ─── Cache ─────────────────────────────────────────────────

const CACHE_PREFIX = 'webscout:';
const CACHE_TTL = 3600;

async function cacheGet(env: Env, key: string): Promise<any | null> {
	try { const raw = await env.SCHEDULER_KV.get(`${CACHE_PREFIX}${key}`, 'text'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function cacheSet(env: Env, key: string, data: any): Promise<void> {
	try { await env.SCHEDULER_KV.put(`${CACHE_PREFIX}${key}`, JSON.stringify(data), { expirationTtl: CACHE_TTL }); } catch { /* optional */ }
}

// ─── HTML Utils ────────────────────────────────────────────

function stripHtml(html: string): string {
	return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').replace(/\s+/g, ' ').trim();
}
function extractTitle(html: string): string { const m = html.match(/<title[^>]*>(.*?)<\/title>/i); return m ? stripHtml(m[1]) : ''; }
function extractMetaDesc(html: string): string { const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i); return m ? m[1] : ''; }
function extractLinks(html: string, baseUrl: string): string[] {
	const links: string[] = []; const re = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi; let match;
	while ((match = re.exec(html)) !== null) links.push(match[1]);
	return [...new Set(links)].slice(0, 30);
}
function extractReadableText(html: string): string {
	const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
	const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
	const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	const content = article?.[1] || main?.[1] || body?.[1] || html;
	return stripHtml(content).slice(0, 8000);
}

// ─── Search Sources ────────────────────────────────────────

async function searchDuckDuckGo(query: string, max: number = 5): Promise<SearchResult[]> {
	const results: SearchResult[] = [];
	try {
		const ia = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (ia.ok) {
			const d: any = await ia.json();
			if (d.AbstractText) results.push({ title: d.Headline || 'DuckDuckGo', url: d.AbstractURL || '', snippet: d.AbstractText.slice(0, 300), source: 'duckduckgo' });
			if (d.RelatedTopics) for (const t of d.RelatedTopics) { if (results.length >= max) break; if (t.Text) results.push({ title: t.Text.split(' - ')[0] || t.Text, url: t.FirstURL || '', snippet: t.Text.slice(0, 200), source: 'duckduckgo' }); }
		}
	} catch { /* fallback */ }
	if (results.length < max) {
		try {
			const html = await (await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } })).text();
			const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
			let stage = 'none';
			for (const row of rows) {
				if (results.length >= max) break;
				if (row.includes('class="result-snippet"')) { stage = 'result'; continue; }
				if (stage === 'result') {
					const link = row.match(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
					const snip = row.match(/<td[^>]*class=["']result-snippet["'][^>]*>(.*?)<\/td>/is);
					if (link) {
						const title = stripHtml(link[2]); const url = link[1].startsWith('http') ? link[1] : `https://lite.duckduckgo.com${link[1]}`;
						if (title && url && !title.includes('Next') && !title.includes('Previous')) results.push({ title: title.slice(0, 200), url, snippet: snip ? stripHtml(snip[1]).slice(0, 200) : '', source: 'duckduckgo' });
					}
				}
			}
		} catch { /* skip */ }
	}
	return results;
}

async function searchWikipedia(query: string, max: number = 3): Promise<SearchResult[]> {
	const results: SearchResult[] = [];
	try {
		const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(query)}&srlimit=${max}&srprop=snippet`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (res.ok) { const d: any = await res.json(); for (const p of (d.query?.search || []).slice(0, max)) results.push({ title: p.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`, snippet: stripHtml(p.snippet || '').slice(0, 300), source: 'wikipedia' }); }
	} catch { /* skip */ }
	return results;
}

async function searchHackerNews(query: string, max: number = 3): Promise<SearchResult[]> {
	const results: SearchResult[] = [];
	try {
		const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${max}&tags=story`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (res.ok) { const d: any = await res.json(); for (const h of (d.hits || []).slice(0, max)) results.push({ title: h.title || '', url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, snippet: (h.points ? `${h.points} pts ` : '') + (h.author ? `by ${h.author}` : ''), source: 'hackernews' }); }
	} catch { /* skip */ }
	return results;
}

// ─── WebScout Class ────────────────────────────────────────

export class WebScout {
	constructor(private env: Env) {}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = options?.maxResults || 5;
		const useCache = options?.useCache !== false;
		const sources = options?.sources || ['duckduckgo'];
		const cacheKey = `search:${query.toLowerCase().trim()}`;

		if (useCache) {
			const cached = await cacheGet(this.env, cacheKey);
			if (cached && Array.isArray(cached)) { logger.debug('WebScout', `Cache hit: "${query}"`); return cached.slice(0, maxResults); }
		}

		const promises: Promise<SearchResult[]>[] = [];
		if (sources.includes('duckduckgo')) promises.push(searchDuckDuckGo(query, Math.ceil(maxResults * 0.5)));
		if (sources.includes('wikipedia')) promises.push(searchWikipedia(query, Math.ceil(maxResults * 0.25)));
		if (sources.includes('hackernews')) promises.push(searchHackerNews(query, Math.ceil(maxResults * 0.25)));

		const settled = await Promise.allSettled(promises);
		const allResults: SearchResult[] = [];
		const seen = new Set<string>();
		for (const result of settled) {
			if (result.status === 'fulfilled') { for (const item of result.value) { const key = item.url || item.title; if (!seen.has(key)) { seen.add(key); allResults.push(item); } } }
		}

		const final = allResults.slice(0, maxResults);
		if (useCache) await cacheSet(this.env, cacheKey, final);
		return final;
	}

	async scrapePage(url: string): Promise<ScrapedPage | null> {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': 'discord-ai-bot/1.0', Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(10000) });
			if (!res.ok) return null;
			const html = await res.text();
			const title = extractTitle(html);
			const description = extractMetaDesc(html);
			const text = extractReadableText(html);
			const links = extractLinks(html, url);
			return { url, title, description, text, wordCount: text.split(/\s+/).length, snippet: text.slice(0, 500), links, fetchedAt: new Date().toISOString() };
		} catch { return null; }
	}

	async browseUrls(urls: string[]): Promise<ScrapedPage[]> {
		const results = await Promise.allSettled(urls.map(url => this.scrapePage(url)));
		return results.filter((r): r is PromiseFulfilledResult<ScrapedPage> => r.status === 'fulfilled' && r.value !== null).map(r => r.value);
	}

	async deepSearch(topic: string, options?: DeepSearchOptions): Promise<DeepSearchResult> {
		const maxSub = options?.maxSubQueries || 3;
		const rpp = options?.resultsPerQuery || 5;
		// Generate sub-queries via simple splitting
		const subQueries = [topic, `${topic} 2024`, `${topic} 2025`, `${topic} 2026`].slice(0, maxSub);
		const resultPromises = subQueries.map(q => this.search(q, { maxResults: rpp }));
		const settled = await Promise.allSettled(resultPromises);
		const allResults: SearchResult[] = [];
		const seen = new Set<string>();
		for (const r of settled) { if (r.status === 'fulfilled') { for (const item of r.value) { const key = item.url || item.title; if (!seen.has(key)) { seen.add(key); allResults.push(item); } } } }

		const urlsToScrape = allResults.filter(r => r.url).slice(0, 5).map(r => r.url);
		const scraped = await this.browseUrls(urlsToScrape);

		return { query: topic, subQueries, results: allResults, scrapedPages: scraped, summary: `${allResults.length} results dari ${subQueries.length} sub-queries`, sources: [...new Set(allResults.map(r => r.source))] };
	}
}
