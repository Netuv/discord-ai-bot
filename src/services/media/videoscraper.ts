/**
 * videoscraper.ts — Multi-source YouTube video search with token-based scoring
 * v6.0 — YouTube HTML, DuckDuckGo, oEmbed validation, KV cache
 * Moved from workers/videoscraper.ts
 */

import type { Env } from '../../types/env';
import { logger } from '../../core/logger';

export interface YouTubeVideoResult { videoId: string; url: string; title: string; channelName?: string; source: string; score: number; thumbnailUrl?: string; publishedAt?: string; viewCount?: number; }
export interface VideoSearchOptions { minScore?: number; maxResults?: number; }

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const YT_WATCH = 'https://www.youtube.com/watch?v=';

const RELEVANT_KW = ['trailer', 'teaser', 'pv', 'promotional video', 'opening', 'ending', 'official',
	'予告', 'cm', 'highlight', 'movie', 'film', 'season', 'part', 'chapter', 'anime', 'manga',
	'announcement', 'announce', 'reveal', 'first look', 'key visual', 'adaptation'];

const NEGATIVE_KW = ['reaction', 'review', 'analysis', 'explained', 'amv', 'edit', 'compilation', 'meme', 'parody'];

function videoTitleScore(query: string, title: string): number {
	if (!query || !title) return 0;
	const q = query.toLowerCase().trim(); const t = title.toLowerCase().trim();
	const qt = q.split(/\s+/).filter(Boolean); const tt = t.split(/\s+/).filter(Boolean);
	if (qt.length === 0 || tt.length === 0) return 0;
	const matchCount = qt.filter(w => t.includes(w)).length;
	let base = Math.round((matchCount / Math.max(qt.length, 1)) * 75);
	const relevanceFound = RELEVANT_KW.filter(kw => t.includes(kw)).length;
	base += Math.min(15, relevanceFound * 5);
	const negativeFound = NEGATIVE_KW.filter(kw => t.includes(kw)).length;
	base -= negativeFound * 30;
	return Math.max(0, Math.min(100, base));
}

// ─── YouTube HTML Search ──────────────────────────────────

async function searchYouTubeHTML(query: string): Promise<{ videoId: string; title: string; channelName?: string; publishedTime?: string; viewCount?: number; thumbnailUrl?: string }[]> {
	const results: { videoId: string; title: string; channelName?: string; publishedTime?: string; viewCount?: number; thumbnailUrl?: string }[] = [];
	try {
		const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'discord-ai-bot/1.0', 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(5000) });
		if (!res.ok) return [];
		const html = await res.text();
		const matches = html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
		const seen = new Set<string>();
		for (const m of matches) {
			if (results.length >= 5) break;
			const vid = m[1];
			if (seen.has(vid)) continue; seen.add(vid);
			const before = html.slice(Math.max(0, (m as any).index - 300), (m as any).index);
			const tm = before.match(/<a[^>]*>([^<]+)<\/a>/i);
			const title = tm?.[1]?.trim() || '';
			if (title && title.length > 3 && !title.includes('youtube.com')) results.push({ videoId: vid, title: title.replace(/&#?\w+;/g, '').trim() });
		}
	} catch { /* skip */ }
	return results;
}

// ─── YouTube Data API v3 Search (works from CF Workers) ────

async function searchYouTubeAPI(query: string, apiKey: string, max: number = 5): Promise<{ videoId: string; title: string; channelName?: string }[]> {
	try {
		const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${max}&key=${apiKey}`, {
			headers: { 'User-Agent': 'discord-ai-bot/1.0' },
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) { logger.debug('VideoScraper', `YT API ${res.status}`); return []; }
		const d: any = await res.json();
		if (!d?.items || !Array.isArray(d.items)) return [];
		return d.items.filter((i: any) => i.id?.videoId).map((i: any) => ({
			videoId: i.id.videoId,
			title: i.snippet?.title || '',
			channelName: i.snippet?.channelTitle || '',
		}));
	} catch {
		logger.debug('VideoScraper', 'YT API failed');
		return [];
	}
}

// ─── Invidious YouTube Search ─────────────────────────────

async function searchInvidious(query: string, max: number = 5): Promise<{ videoId: string; title: string; channelName?: string }[]> {
	try {
		const base = 'https://inv.nadeko.net';
		const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance`, {
			headers: { 'User-Agent': 'discord-ai-bot/1.0' },
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return [];
		const d: any = await res.json();
		if (!Array.isArray(d)) return [];
		return d.slice(0, max).filter((v: any) => v.videoId).map((v: any) => ({
			videoId: v.videoId,
			title: v.title || '',
			channelName: v.author || '',
		}));
	} catch {
		logger.debug('VideoScraper', 'Invidious search failed, trying DDG');
		return [];
	}
}

// ─── DuckDuckGo YouTube Search ───────────────────────────

async function searchDDGYouTube(query: string, max: number = 5): Promise<{ videoId: string; title: string; url: string }[]> {
	const results: { videoId: string; title: string; url: string }[] = [];
	try {
		const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (!res.ok) return [];
		const html = await res.text();
		// Match any YouTube watch link in DDG results
		const ytRegex = /(?:https?:)?\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/gi;
		let match;
		while ((match = ytRegex.exec(html)) !== null) {
			if (results.length >= max) break;
			const vid = match[1];
			if (!results.some(r => r.videoId === vid)) {
				// Extract nearby title
				const ctx = html.slice(Math.max(0, match.index - 200), match.index + 50);
				const titleMatch = ctx.match(/<a[^>]+>(.*?)<\/a>/i);
				const title = titleMatch ? stripHtml(titleMatch[1]) : '';
				results.push({ videoId: vid, title, url: `${YT_WATCH}${vid}` });
			}
		}
	} catch { /* skip */ }
	return results;
}

function stripHtml(html: string): string { return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }

// ─── oEmbed Validator ─────────────────────────────────────

async function validateOEmbed(videoId: string): Promise<{ title: string; authorName: string } | null> {
	try {
		const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`${YT_WATCH}${videoId}`)}&format=json`, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return null;
		const d: any = await res.json();
		return d?.title ? { title: d.title, authorName: d.author_name || '' } : null;
	} catch { return null; }
}

// ─── Main Search Function ─────────────────────────────────

export async function findYouTubeVideo(query: string, env: Env): Promise<string | null> {
	if (!query || query.length < 3) return null;

	const cacheKey = `videosearch:${query.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

	// Try cache first (saves 1 subrequest if hit)
	try {
		const cached = await env.SCHEDULER_KV.get(cacheKey, 'text');
		if (cached) { const p = JSON.parse(cached); if (p?.url) { logger.debug('VideoScraper', `Cache hit: "${query}"`); return p.url; } }
	} catch { }

	// Step 1: YouTube Data API v3 (if key available)
	if (env.YOUTUBE_API_KEY) {
		const ytApiItems = await searchYouTubeAPI(query, env.YOUTUBE_API_KEY);
		for (const item of ytApiItems) {
			const score = videoTitleScore(query, item.title);
			if (score >= 20) {
				logger.info('VideoScraper', `YT API found`, { query: query.slice(0, 40), title: item.title.slice(0, 60), score });
				try { await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: `${YT_WATCH}${item.videoId}`, title: item.title }), { expirationTtl: 1800 }); } catch {}
				return `${YT_WATCH}${item.videoId}`;
			}
		}
	}

	// Step 2: DDG search — 1 subrequest
	logger.debug('VideoScraper', `Trying DDG: "${query}"`);
	const ddgItems = await searchDDGYouTube(query);
	for (const item of ddgItems) {
		const oembed = await validateOEmbed(item.videoId);
		if (oembed) {
			logger.info('VideoScraper', `DDG+oEmbed found`, { query: query.slice(0, 40), title: oembed.title.slice(0, 60) });
			try { await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: item.url, title: oembed.title }), { expirationTtl: 1800 }); } catch {}
			return item.url;
		}
	}

	// Step 3: Invidious — 1 instance only (save subrequest budget)
	try {
		const invRes = await fetch(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance`, {
			headers: { 'User-Agent': 'discord-ai-bot/1.0' }, signal: AbortSignal.timeout(4000),
		});
		if (invRes.ok) {
			const d: any = await invRes.json();
			if (Array.isArray(d)) {
				for (const v of d) {
					if (!v.videoId) continue;
					const score = videoTitleScore(query, v.title || '');
					if (score >= 20) {
						logger.info('VideoScraper', `Invidious found`, { query: query.slice(0, 40), title: (v.title || '').slice(0, 60), score });
						try { await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: `${YT_WATCH}${v.videoId}`, title: v.title || '' }), { expirationTtl: 1800 }); } catch {}
						return `${YT_WATCH}${v.videoId}`;
					}
				}
			}
		}
	} catch { /* skip */ }

	// Step 4: Final fallback — direct YouTube HTML search (1 subrequest)
	logger.debug('VideoScraper', `Trying YT HTML: "${query}"`);
	const ytHtmlItems = await searchYouTubeHTML(query);
	for (const item of ytHtmlItems) {
		const oembed = await validateOEmbed(item.videoId);
		if (oembed) {
			logger.info('VideoScraper', `YT HTML+oEmbed found`, { query: query.slice(0, 40), title: oembed.title.slice(0, 60) });
			try { await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: `${YT_WATCH}${item.videoId}`, title: oembed.title }), { expirationTtl: 1800 }); } catch {}
			return `${YT_WATCH}${item.videoId}`;
		}
	}

	logger.warn('VideoScraper', `No video for: "${query}"`);
	return null;
}
