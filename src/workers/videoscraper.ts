/**
 * videoscraper.ts — Multi-source YouTube video search with token-based scoring
 * v5.0 — YouTube HTML, DuckDuckGo, oEmbed validation, KV cache
 */

import type { Env } from '../types/env';
import { logger } from '../core/logger';

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
		const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=CAISAhAB`, { headers: { 'User-Agent': 'discord-ai-bot/1.0', 'Accept-Language': 'en-US' }, signal: AbortSignal.timeout(5000) });
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

// ─── DuckDuckGo YouTube Search ───────────────────────────

async function searchDDGYouTube(query: string, max: number = 5): Promise<{ videoId: string; title: string; url: string }[]> {
	const results: { videoId: string; title: string; url: string }[] = [];
	try {
		const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (!res.ok) return [];
		const html = await res.text();
		const ytLinks = html.match(/<a[^>]+href=["'](https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11}))["'][^>]*>([^<]*)<\/a>/g) || [];
		for (const a of ytLinks) {
			const m = a.match(/href=["'](https?:\/\/[^"']*)["'][^>]*>([^<]*)</);
			if (m && m[2] && results.length < max) results.push({ videoId: m[2], title: stripHtml(m[3] || '').trim(), url: m[1] });
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

	// Try cache first
	const cacheKey = `videosearch:${query.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
	try {
		const cached = await env.SCHEDULER_KV.get(cacheKey, 'text');
		if (cached) { const p = JSON.parse(cached); if (p?.url) return p.url; }
	} catch { /* ok */ }

	const [ytHtml] = await Promise.allSettled([searchYouTubeHTML(query)]);

	const allResults: YouTubeVideoResult[] = [];
	for (const item of (ytHtml.status === 'fulfilled' ? ytHtml.value : [])) {
		const score = videoTitleScore(query, item.title);
		if (score >= 40) allResults.push({ videoId: item.videoId, url: `${YT_WATCH}${item.videoId}`, title: item.title, source: 'YouTube', score });
	}

	allResults.sort((a, b) => b.score - a.score);

	if (allResults.length === 0) return null;

	// Try oEmbed for top result
	const top = allResults[0];
	if (top.videoId) {
		const oembed = await validateOEmbed(top.videoId).catch(() => null);
		if (oembed) {
			await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: top.url, title: oembed.title }), { expirationTtl: 1800 }).catch(() => {});
			return top.url;
		}
		// Even without oEmbed, just try the URL
		await env.SCHEDULER_KV.put(cacheKey, JSON.stringify({ url: top.url, title: top.title }), { expirationTtl: 1800 }).catch(() => {});
		return top.url;
	}

	return null;
}

export async function searchYouTubeVideoDetailed(query: string, env: Env): Promise<YouTubeVideoResult | null> {
	if (!query || query.length < 3) return null;

	const [ytHtml] = await Promise.allSettled([searchYouTubeHTML(query)]);

	const allResults: YouTubeVideoResult[] = [];
	for (const item of (ytHtml.status === 'fulfilled' ? ytHtml.value : [])) {
		const score = videoTitleScore(query, item.title);
		if (score >= 40) {
			const oembed = await validateOEmbed(item.videoId).catch(() => null);
			allResults.push({ videoId: item.videoId, url: `${YT_WATCH}${item.videoId}`, title: oembed?.title || item.title, channelName: oembed?.authorName, source: 'YouTube', score, thumbnailUrl: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg` });
		}
	}

	allResults.sort((a, b) => b.score - a.score);
	return allResults[0] || null;
}
