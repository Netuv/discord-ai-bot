/**
 * imagescraper.ts — Multi-source anime image search with token-based scoring
 * v5.0 — Kitsu, AniList, Jikan, DDG Images, KV cache
 */

import type { Env } from '../types/env';
import { logger } from '../core/logger';

export interface ImageSearchResult { url: string; title: string; source: string; malId?: number; anilistId?: number; score: number; type: 'anime' | 'manga'; description?: string; }

// ─── Token Scoring ────────────────────────────────────────

function tokenize(s: string): string[] { return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean); }
function tokenOverlap(qt: string[], tt: string[]): number { if (qt.length === 0) return 0; return qt.filter(q => tt.some(t => t === q || q.includes(t) || t.includes(q))).length / qt.length; }
function lengthRatio(q: string, t: string): number { if (!q || !t) return 0; return Math.min(q.length, t.length) / Math.max(q.length, t.length); }

const SPECIFIC_KW = /\b(season|part|episode|movie|film|arc|cour|special|ova|oad|sequel|prequel|remake|reboot|final)\b/i;

function titleMatchScore(query: string, title: string | null | undefined, description?: string | null): number {
	if (!title) return 0;
	const q = query.toLowerCase().trim(); const t = title.toLowerCase().trim();
	if (!q || !t) return 0;
	const qt = tokenize(q), tt = tokenize(t);
	if (qt.length === 0 || tt.length === 0) return 0;
	let base = 0;
	if (q === t) base = 80;
	else if (t.includes(q)) base = 65;
	else if (qt.every(w => t.includes(w))) base = 55;
	else if (qt.filter(w => t.includes(w)).length >= Math.ceil(qt.length * 0.5)) base = 40;
	if (base > 0) base += Math.round(20 * Math.min(1, tokenOverlap(qt, tt)));
	base = Math.round(base * lengthRatio(q, t));
	if (description) { const desc = description.toLowerCase(); const kwMatch = (q.match(SPECIFIC_KW) || []).filter(kw => desc.includes(kw.toLowerCase())); base += kwMatch.length * 5; }
	return Math.min(100, base);
}

// ─── Source Search Functions ──────────────────────────────

async function searchKitsu(query: string): Promise<any[]> {
	try {
		const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=5`, { headers: { Accept: 'application/vnd.api+json' } });
		if (!res.ok) return [];
		const d: any = await res.json(); return d.data || [];
	} catch { return []; }
}

async function searchAniList(query: string): Promise<any[]> {
	try {
		const res = await fetch('https://graphql.anilist.co', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: `query($s: String) { Page(page: 1, perPage: 5) { media(search: $s, type: ANIME) { id title { romaji english native } coverImage { large } description(type: Markdown, asHtml: false) } } }`, variables: { s: query } }),
		});
		if (!res.ok) return [];
		const d: any = await res.json(); return d.data?.Page?.media || [];
	} catch { return []; }
}

async function searchJikan(query: string, type: 'anime' | 'manga'): Promise<any[]> {
	try {
		const res = await fetch(`https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(query)}&limit=3&sfw=true`, { headers: { Accept: 'application/json' } });
		if (!res.ok) return [];
		const d: any = await res.json(); return d.data || [];
	} catch { return []; }
}

async function searchDDGImages(query: string, max: number = 5): Promise<{ url: string; title: string; }[]> {
	const results: { url: string; title: string; }[] = [];
	try {
		const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } })).text();
		// Extract image-like links
		const imgLinks = html.match(/<a[^>]+href=["']([^"']*\/images\/[^"']*)["'][^>]*>([^<]*)<\/a>/gi) || [];
		for (const a of imgLinks) {
			const m = a.match(/href=["']([^"']*)["'][^>]*>([^<]*)</);
			if (m && results.length < max) results.push({ url: m[1].startsWith('http') ? m[1] : `https:${m[1]}`, title: stripHtml(m[2]) });
		}
	} catch { /* skip */ }
	// Also try direct image search
	if (results.length < 2) {
		try {
			const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&iax=images&ia=images`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
			if (res.ok) {
				const d: any = await res.json();
				if (d.Image) results.push({ url: d.Image, title: d.Headline || '' });
				if (d.Results) for (const r of d.Results) { if (results.length >= max) break; if (r.Image) results.push({ url: r.Image, title: r.Text || '' }); }
			}
		} catch { /* skip */ }
	}
	return results;
}

function stripHtml(html: string): string { return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }

// ─── Main Search Function ──────────────────────────────────

export async function searchAnimeImage(query: string, options?: { env?: Env; skipCache?: boolean }): Promise<{ url: string; filename: string; source: string } | null> {
	if (!query || query.length < 2) return null;

	const env = options?.env;
	const cacheKey = `imgsearch:${query.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_')}`;

	// Skip cache when called from publisher (save subrequests)
	if (!options?.skipCache) {
		try {
			const cached = await env?.SCHEDULER_KV?.get(cacheKey, 'text');
			if (cached) { const r = JSON.parse(cached); logger.debug('ImageScraper', `Cache hit: "${query}"`); return r; }
		} catch { /* optional */ }
	}

	const allResults: ImageSearchResult[] = [];
	const t0 = Date.now();

	const [kitsu, anilist] = await Promise.allSettled([
		searchKitsu(query),
		searchAniList(query),
	]);

	logger.debug('ImageScraper', `Parallel fetch: ${Date.now() - t0}ms`);

	const kitsuData = kitsu.status === 'fulfilled' ? kitsu.value : [];
	for (const item of kitsuData) {
		const titles = [item.attributes.canonicalTitle, ...Object.values(item.attributes.titles || {})].filter(Boolean);
		let best = 0;
		for (const t of titles) best = Math.max(best, titleMatchScore(query, t, item.attributes.synopsis));
		if (best >= 60) {
			const img = item.attributes.posterImage?.large || item.attributes.posterImage?.medium;
			if (img) allResults.push({ url: img, title: item.attributes.canonicalTitle, source: 'Kitsu', score: best, type: 'anime' });
		}
	}

	const anilistData = anilist.status === 'fulfilled' ? anilist.value : [];
	for (const item of anilistData) {
		const titles = [item.title?.romaji, item.title?.english, item.title?.native].filter(Boolean) as string[];
		let best = 0;
		for (const t of titles) best = Math.max(best, titleMatchScore(query, t, item.description));
		if (best >= 60 && item.coverImage?.large) allResults.push({ url: item.coverImage.large, title: titles[0] || '', source: 'AniList', anilistId: item.id, score: best, type: (item.type?.toLowerCase() || 'anime') as 'anime' | 'manga' });
	}

	allResults.sort((a, b) => b.score - a.score);
	if (allResults.length === 0) {
		// Fallback: try simpler query
		const simpler = query.replace(/season\s+\d+|part\s+\d+|cour\s+\d+|sequel|prequel|remake|\bfinal\b/i, '').trim();
		if (simpler && simpler !== query && simpler.length >= 3) return searchAnimeImage(simpler, options);
		return null;
	}

	const best = allResults[0];
	const result = { url: best.url, filename: `${best.title.replace(/[^a-z0-9]/gi, '_').slice(0, 50)}.jpg`, source: best.source };
	if (!options?.skipCache) {
		try { await env?.SCHEDULER_KV?.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 }); } catch { /* ok */ }
	}
	return result;
}

// ─── Download Image ────────────────────────────────────────

export async function downloadImage(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
	try {
		const res = await fetch(url, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (!res.ok) return null;
		const buffer = await res.arrayBuffer();
		const mimeType = res.headers.get('content-type') || 'image/jpeg';
		return { buffer, mimeType };
	} catch { return null; }
}
