/**
 * imagescraper.ts — Multi-source anime image search
 * v6.2 — Title verification + AI vision validation
 *
 * Priority:
 *   1. Jikan MAL (title-verified)
 *   2. AniList banner/character/cover (title-verified)
 *   3. Brave (AI-validated)
 *   4. Google (AI-validated)
 *   5. DDG (AI-validated)
 *
 * Each result must pass:
 *   a) Title match score >= 40% (text overlap check)
 *   b) AI vision relevance >= 6/10 (if AI binding available & budget allows)
 */

import type { Env } from '../../types/env';
import { logger } from '../../core/logger';

function fn(title: string): string {
	return `${title.replace(/[^a-z0-9]/gi, '_').slice(0, 50)}.jpg`;
}

// ─── Title Verification ──────────────────────────────────
// Returns 0-100 how well query matches the result title.
// Filters out wrong MAL/AL matches.

function titleScore(query: string, resultTitle: string): number {
	const q = query.toLowerCase().trim();
	const t = resultTitle.toLowerCase().trim();
	if (!q || !t) return 0;
	const qWords = q.split(/\s+/).filter(w => w.length > 2);
	const tWords = t.split(/\s+/).filter(w => w.length > 2);
	if (qWords.length === 0 || tWords.length === 0) return 0;
	// Exact match = 100
	if (q === t || t.includes(q) || q.includes(t)) return 100;
	// Count shared words
	let shared = 0;
	for (const qw of qWords) {
		if (tWords.some(tw => tw === qw || tw.includes(qw) || qw.includes(tw))) shared++;
	}
	// Also check if ALL query words appear in title (even as substrings)
	const allWordsMatch = qWords.every(qw => t.includes(qw));
	const base = (shared / Math.max(qWords.length, 1)) * 80;
	return allWordsMatch ? Math.max(base + 20, 70) : Math.round(base);
}

// ─── AI Vision Validator ──────────────────────────────────
// Uses CF Workers AI to check image relevance.

async function aiCheckRelevance(env: Env, imageUrl: string, query: string, articleContext: string): Promise<number> {
	try {
		// Download image first (1 subrequest)
		const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(3000) });
		if (!imgRes.ok) return 5; // can't check, assume pass
		const imgBuffer = await imgRes.arrayBuffer();
		const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
		const mime = imgRes.headers.get('content-type') || 'image/jpeg';
		const dataUri = `data:${mime};base64,${base64}`;

		const response = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: `Rate relevance 1-10: Does this image match the topic "${query}"? Context: "${articleContext}". Only respond with a number 1-10.` },
						{ type: 'image_url', image_url: { url: dataUri } },
					],
				},
			],
			max_tokens: 10,
		});

		const text = (response as any).response?.trim() || '';
		const num = parseInt(text, 10);
		return isNaN(num) ? 5 : Math.max(1, Math.min(10, num));
	} catch (e) {
		logger.debug('Img', `AI check failed: "${(e as Error).message?.slice(0, 50)}"`);
		return 5; // assume pass on error
	}
}

// ─── Source 1: Jikan (MyAnimeList) — OFFICIAL IMAGES ────

async function jikanResolveAnime(query: string): Promise<{ malId: number; title: string; imageUrl: string; score: number } | null> {
	try {
		const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=3&sfw=true`, {
			headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return null;
		const d: any = await res.json();
		if (!d?.data?.length) return null;
		// Score each result and pick best match
		let best: any = null;
		let bestScore = 0;
		for (const item of d.data) {
			const titles = [item.title, item.title_english, item.title_japanese, item.title_synonyms].filter(Boolean).flat();
			for (const t of titles) {
				const s = titleScore(query, t || '');
				if (s > bestScore) { bestScore = s; best = item; }
			}
		}
		if (!best || bestScore < 40) return null; // GATE: skip if poor match
		return {
			malId: best.mal_id, title: best.title || best.title_english || query,
			imageUrl: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url,
			score: bestScore,
		};
	} catch { return null; }
}

async function jikanPictures(malId: number): Promise<string[]> {
	try {
		const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}/pictures`, {
			headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return [];
		const d: any = await res.json();
		return d.data?.map((p: any) => p.jpg?.large_image_url || p.jpg?.image_url).filter(Boolean) || [];
	} catch { return []; }
}

// ─── Source 2: AniList (banner + cover + characters) ───

const AL_QUERY = `query($s:String){Page(page:1,perPage:3){media(search:$s,type:ANIME){id title{romaji english native}bannerImage coverImage{extraLarge large color}characters(page:1,perPage:5,role:MAIN){nodes{name{full}image{large}}}}}}`;

interface ALMedia {
	id: number; title: { romaji?: string; english?: string; native?: string };
	bannerImage?: string; coverImage: { extraLarge?: string; large?: string; color?: string };
	characters?: { nodes: Array<{ name: { full: string }; image: { large: string } }> };
}

async function searchAL(query: string): Promise<{ media: ALMedia; score: number } | null> {
	try {
		const res = await fetch('https://graphql.anilist.co', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: AL_QUERY, variables: { s: query } }),
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return null;
		const d: any = await res.json();
		const list: ALMedia[] = d.data?.Page?.media || [];
		if (!list.length) return null;
		// Pick best-scored
		let best: ALMedia | null = null;
		let bestScore = 0;
		for (const m of list) {
			const titles = [m.title.romaji, m.title.english, m.title.native].filter(Boolean) as string[];
			for (const t of titles) {
				const s = titleScore(query, t);
				if (s > bestScore) { bestScore = s; best = m; }
			}
		}
		if (!best || bestScore < 40) return null; // GATE
		return { media: best, score: bestScore };
	} catch { return null; }
}

// ─── Source 3: Brave Search API ───────────────────────────

async function searchBrave(query: string, key: string): Promise<{ url: string; title: string } | null> {
	try {
		const res = await fetch(`https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=3&safe=moderate`, {
			headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return null;
		const d: any = await res.json();
		const results = d?.results || [];
		// Pick result with best title match
		let best: { url: string; title: string } | null = null;
		let bestScore = 0;
		for (const r of results) {
			if (!r.url) continue;
			const s = titleScore(query, r.title || '');
			if (s > bestScore) { bestScore = s; best = { url: r.url, title: r.title || '' }; }
		}
		return best;
	} catch { return null; }
}

// ─── Source 4: Google Custom Search ─────────────────────

async function searchGoogle(query: string, key: string, cx: string): Promise<{ url: string; title: string } | null> {
	try {
		const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(query + ' anime')}&searchType=image&num=3&safe=active`, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		const d: any = await res.json();
		const items = d?.items || [];
		let best: { url: string; title: string } | null = null;
		let bestScore = 0;
		for (const item of items) {
			if (!item.link) continue;
			const s = titleScore(query, item.title || '');
			if (s > bestScore) { bestScore = s; best = { url: item.link, title: item.title || '' }; }
		}
		return best;
	} catch { return null; }
}

// ─── Source 5: DDG (last resort) ─────────────────────────

async function searchDDG(query: string): Promise<{ url: string; title: string } | null> {
	try {
		const res = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(query + ' anime')}&o=json`, {
			headers: { 'User-Agent': 'discord-ai-bot/1.0' }, signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return null;
		const d: any = await res.json();
		const results = d?.results || [];
		let best: { url: string; title: string } | null = null;
		let bestScore = 0;
		for (const r of results) {
			if (!r.image) continue;
			const s = titleScore(query, r.title || '');
			if (s > bestScore) { bestScore = s; best = { url: r.image, title: r.title || '' }; }
		}
		return best;
	} catch { return null; }
}

// ─── Main Search ──────────────────────────────────────────

export async function searchAnimeImage(
	query: string,
	options?: { env?: Env; skipCache?: boolean; articleContext?: string },
): Promise<{ url: string; filename: string; source: string } | null> {
	if (!query || query.length < 2) return null;

	const env = options?.env;
	const ckey = `isv3:${query.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_')}`;
	const q = query.replace(/[🎯📰📖🎬🎮🔥👾🕹️]/g, '').trim();

	if (!options?.skipCache) {
		try { const c = await env?.SCHEDULER_KV?.get(ckey, 'text'); if (c) { const r = JSON.parse(c); logger.debug('Img', `Cache: "${q.slice(0, 40)}"`); return r; } } catch {}
	}

	// Collect ALL candidates with scores
	const candidates: Array<{ url: string; title: string; source: string; score: number }> = [];

	// ── 1. Jikan MAL ──
	try {
		const mal = await jikanResolveAnime(q);
		if (mal?.malId) {
			const pics = await jikanPictures(mal.malId);
			for (const url of pics) {
				candidates.push({ url, title: mal.title, source: 'MAL', score: mal.score + 10 }); // +10 priority bonus
			}
			// Also use MAL search result image
			if (mal.imageUrl && candidates.length === 0) {
				candidates.push({ url: mal.imageUrl, title: mal.title, source: 'MAL', score: mal.score + 10 });
			}
		}
	} catch {}

	// ── 2. AniList ──
	try {
		const al = await searchAL(q);
		if (al) {
			const m = al.media;
			const t = m.title.romaji || m.title.english || q;
			if (m.bannerImage) candidates.push({ url: m.bannerImage, title: t, source: 'AL Banner', score: al.score + 5 });
			const chars = m.characters?.nodes?.filter(c => c.image?.large) || [];
			for (const ch of chars) candidates.push({ url: ch.image.large, title: ch.name.full, source: 'AL Char', score: al.score });
			if (m.coverImage?.extraLarge || m.coverImage?.large) {
				candidates.push({ url: m.coverImage.extraLarge || m.coverImage.large!, title: t, source: 'AL Cover', score: al.score });
			}
		}
	} catch {}

	// ── 3. Brave ──
	if (env?.BRAVE_API_KEY) {
		try {
			const b = await searchBrave(q, env.BRAVE_API_KEY);
			if (b) candidates.push({ url: b.url, title: b.title, source: 'Brave', score: titleScore(q, b.title) });
		} catch {}
	}

	// ── 4. Google ──
	if (env?.GOOGLE_SEARCH_API_KEY && env?.GOOGLE_SEARCH_ENGINE_ID) {
		try {
			const g = await searchGoogle(q, env.GOOGLE_SEARCH_API_KEY, env.GOOGLE_SEARCH_ENGINE_ID);
			if (g) candidates.push({ url: g.url, title: g.title, source: 'Google', score: titleScore(q, g.title) });
		} catch {}
	}

	// ── 5. DDG ──
	try {
		const d = await searchDDG(q);
		if (d) candidates.push({ url: d.url, title: d.title, source: 'DDG', score: titleScore(q, d.title) });
	} catch {}

	// ── Score & Validate ──
	if (candidates.length === 0) {
		logger.warn('Img', `No candidates: "${q.slice(0, 40)}"`);
		return null;
	}

	// Sort by score descending
	candidates.sort((a, b) => b.score - a.score);

	const ctx = options?.articleContext || q;

	// Try AI vision validation on top candidate (1 max, only if score is borderline)
	const top = candidates[0];
	if (top.score >= 60) {
		const r = { url: top.url, filename: fn(top.title), source: top.source };
		logger.info('Img', `${top.source} accept (${top.score}): "${q.slice(0, 40)}"`);
		if (!options?.skipCache) try { await env?.SCHEDULER_KV?.put(ckey, JSON.stringify(r), { expirationTtl: 3600 }); } catch {}
		return r;
	}

	// Borderline scores: try AI vision on first candidate only
	if (env?.AI && top.score >= 40) {
		const relevance = await aiCheckRelevance(env, top.url, q, ctx);
		if (relevance >= 6) {
			const r = { url: top.url, filename: fn(top.title), source: `${top.source}(AI:${relevance})` };
			logger.info('Img', `${top.source} AI validated (${relevance}/10): "${q.slice(0, 40)}"`);
			if (!options?.skipCache) try { await env?.SCHEDULER_KV?.put(ckey, JSON.stringify(r), { expirationTtl: 3600 }); } catch {}
			return r;
		}
		logger.debug('Img', `${top.source} rejected by AI (${relevance}/10): "${q.slice(0, 40)}"`);
		// Try next candidate if available
		if (candidates.length > 1) {
			const next = candidates[1];
			const r = { url: next.url, filename: fn(next.title), source: next.source };
			logger.info('Img', `${next.source} fallback (${next.score}): "${q.slice(0, 40)}"`);
			if (!options?.skipCache) try { await env?.SCHEDULER_KV?.put(ckey, JSON.stringify(r), { expirationTtl: 3600 }); } catch {}
			return r;
		}
	}

	logger.warn('Img', `All candidates rejected: "${q.slice(0, 40)}"`);
	return null;
}

// ─── Download ──────────────────────────────────────────────

export async function downloadImage(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
	try {
		const res = await fetch(url, { headers: { 'User-Agent': 'discord-ai-bot/1.0' } });
		if (!res.ok) return null;
		return { buffer: await res.arrayBuffer(), mimeType: res.headers.get('content-type') || 'image/jpeg' };
	} catch { return null; }
}
