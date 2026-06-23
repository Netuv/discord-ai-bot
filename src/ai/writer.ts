/**
 * writer.ts — AI Article Content Generator
 * v5.0 — Modular, research + generate + parse pipeline
 *
 * Flow:
 * 1. Research topic via WebScout (multi-source)
 * 2. Build prompt for AI
 * 3. Call AI via AiRouter
 * 4. Parse & validate JSON response
 * 5. Fallback chain on failure
 */

import type { Env } from '../types/env';
import type { Article, ArticleResearch, ArticleCategory } from '../types/article';
import { ARTICLE_COLORS } from '../config/discord';
import { WebScout } from '../services/web/webscout';
import { AiRouter } from './router';

// ─── Research Module ───────────────────────────────────────

async function researchNews(topic: string, env: Env): Promise<string> {
	try {
		const webScout = new WebScout(env);
		const results = await webScout.search(topic, { maxResults: 5, useCache: false });

		if (results.length === 0) return '📰 Gunakan pengetahuan umum.';

		const lines = results.map(
			(r, i) =>
				`${i + 1}. [${r.source}] ${r.title}${r.snippet ? ` — ${r.snippet.slice(0, 120)}` : ''}`,
		);

		return `📰 **BERITA TERKINI:**\n${lines.join('\n')}`;
	} catch {
		return '📰 Gunakan pengetahuan umum.';
	}
}

async function researchReviews(topic: string, env: Env): Promise<string> {
	try {
		const webScout = new WebScout(env);
		// Single search — save subrequests
		const reviewRes = await webScout.search(`${topic} review`, { maxResults: 3, useCache: false }).catch(() => []);

		const allReviews: Array<{ title: string; url: string; snippet: string; source: string }> = [];
		const seen = new Set<string>();

		for (const item of reviewRes) {
			const key = item.url || item.title;
			if (!seen.has(key)) {
				seen.add(key);
				allReviews.push(item);
			}
		}

		const reviewLines = allReviews.slice(0, 8).map(
			(r, i) => `${i + 1}. [${r.source}] ${r.title} — ${r.snippet.slice(0, 150)}`,
		);

		if (reviewLines.length === 0) return '';
		return `💬 **REVIEWS & OPINIONS DARI INTERNET:**\n${reviewLines.join('\n')}`;
	} catch {
		return '';
	}
}

export async function researchArticle(topic: string, env: Env): Promise<ArticleResearch> {
	const [newsSummary, reviewSummary] = await Promise.all([
		researchNews(topic, env),
		researchReviews(topic, env),
	]);

	return {
		summary: newsSummary + (reviewSummary ? `\n\n${reviewSummary}` : ''),
		reviewSummary,
	};
}

// ─── Prompt Builder ────────────────────────────────────────

export function buildArticlePrompt(topic: string, summary: string, reviewSummary?: string): string {
	return [
		`**ROLE**`,
		``,
		`Lo jurnalis anime yang nulis kayak ngobrol santai di Discord. Natural, pake "gue/lo/kita", reaktif, kadang pake elipsis buat efek mikir. Bukan wartawan, bukan blog formal.`,
		``,
		`**HARUS PAKAI DATA INI — JANGAN KARANG FAKTA SENDIRI**`,
		`Topik WAJIB: ${topic}`,
		``,
		`Data/fakta WAJIB dipakai (ini hasil search real-time, bukan contoh):`,
		`${summary}`,
		...(reviewSummary ? `\nOpini publik:\n${reviewSummary}` : []),
		``,
		`**ATURAN KETAT:**`,
		`1. Kalo data research kosong, tulis opini pribadi yang relate based on knowledge. Tapi jangan bikin berita palsu.`,
		`2. JANGAN nulis tentang MAPPA, Kaguya-sama, Jujutsu Kaisen, Attack on Titan, Chainsaw Man, atau anime manapun yang contohnya ada di prompt ini. KECUALI itu topik yang dikasih di INPUT.`,
		`3. Cari angle yang fresh. Jangan copy-paste narasi dari contoh. Karena itu cuma contoh gaya, bukan konten.`,
		``,
		`**OUTPUT: JSON — WAJIB properti ini:**`,
		`{`,
		`  "title": "🎯 [Emoji] Judul (berdasarkan ${topic})",`,
		`  "intro": "Hook 2-3 kalimat bikin penasaran",`,
		`  "sections": [`,
		`    {`,
		`      "heading": "Sub-topik dari berita aktual",`,
		`      "body": "3-5 paragraf narasi natural",`,
		`      "image_query": "NAMA ANIME/MANGA/GAME EXACT — paling 3 kata",`,
		`      "video_query": "[nama exact] trailer"`,
		`    }`,
		`  ],`,
		`  "category": "anime/manga/game/breaking/announcement/general"`,
		`}`,
		``,
		`**JUMLAH SECTION: 3-5.** Masing-masing 3-5 paragraf. Minimal 2000 karakter total. No closing section, no kesimpulan.`,
		``,
		`**GAYA NULIS:**`,
		`- Awalan natural kayak "Oke jadi...", "Nah gini...", "Gue baru tau..."`,
		`- Variasi kalimat: pendek buat emphasis, panjang buat narasi`,
		`- Reaksi dulu baru jelasin fakta`,
		`- Boleh spill opini pribadi, tapi bedain mana fakta mana opini`,
		`- JANGAN pake: "dapat disimpulkan", "oleh karena itu", "dengan demikian"`,
		`- JANGAN pake bullet poin — semua prosa`,
		`- JANGAN karang fakta di luar research`,
		`- NO watermark/footer/AI label/closing`,
		``,
		`BALAS HANYA JSON, tanpa teks lain!`,
	].filter(Boolean).join('\n');
}

// ─── JSON Parser — Robust ──────────────────────────────────

export function parseArticleJSON(raw: string): Article {
	if (!raw || raw.trim().length === 0) {
		throw new Error('Response AI kosong');
	}

	let cleaned = raw
		.replace(/!\[.*?\]\(.*?\)/g, '')
		.replace(/\[.*?\]\(.*?\)/g, '')
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.trim();

	let parsed: any = null;

	// Strategy 1: Extract JSON object from text
	try {
		const m = cleaned.match(/\{[\s\S]*\}/);
		if (m) parsed = JSON.parse(m[0]);
	} catch { /* fall through */ }

	// Strategy 2: Remove URLs then retry
	if (!parsed) {
		try {
			const r = cleaned.replace(/https?:\/\/[^\s,"}\]]+/g, '[link]');
			const m = r.match(/\{[\s\S]*\}/);
			if (m) parsed = JSON.parse(m[0]);
		} catch { /* fall through */ }
	}

	// Strategy 3: Fix broken JSON
	if (!parsed) {
		try {
			const fixed = cleaned
				.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
				.replace(/:\s*'([^']*)'/g, ':"$1"')
				.replace(/,\s*}/g, '}')
				.replace(/,\s*]/g, ']');
			const m = fixed.match(/\{[\s\S]*\}/);
			if (m) parsed = JSON.parse(m[0]);
		} catch { /* fall through */ }
	}

	if (!parsed) {
		throw new Error('AI gagal generate artikel valid — response bukan JSON');
	}

	// Validate sections
	if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
		if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
			parsed.sections = parsed.topics;
			delete parsed.topics;
		} else {
			parsed.sections = [
				{
					heading: '📖 Lanjutan',
					body: parsed.intro || 'Topik ini lagi hangat dibicarakan di komunitas.',
					image_query: '',
					video_query: '',
				},
			];
		}
	}

	// Normalize each section
	parsed.sections = parsed.sections.map((s: any) => ({
		heading: s.heading || '📖',
		body: s.body || s.text || s.content || '',
		image_query: s.image_query || '',
		video_query: s.video_query || '',
	}));

	return parsed as Article;
}

// ─── Color Mapping ─────────────────────────────────────────

export function getArticleColor(category: string): number {
	return ARTICLE_COLORS[category] || ARTICLE_COLORS.general;
}

// ─── AI Article Generator ──────────────────────────────────

export async function generateArticle(topic: string, research: ArticleResearch, env: Env): Promise<Article> {
	const router = new AiRouter(env);

	// Attempt 1: Full prompt with research data
	try {
		const prompt = buildArticlePrompt(topic, research.summary, research.reviewSummary);
		const raw = await router.creativeChat([{ role: 'user', content: prompt }]);
		const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
		return parseArticleJSON(rawStr);
	} catch { /* fall through */ }

	// Attempt 2: Simplified prompt, no review
	try {
		const simplePrompt = buildArticlePrompt(topic, research.summary, '');
		const raw = await router.creativeChat([{ role: 'user', content: simplePrompt }]);
		const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
		return parseArticleJSON(rawStr);
	} catch { /* fall through */ }

	// Attempt 3: Minimal prompt
	try {
		const minimalPrompt =
			`Buat artikel anime tentang: ${topic}\n` +
			`WAJIB: 3-5 section, tiap section 3-5 paragraf. Gaya ngobrol santai.\n` +
			`BALAS HANYA JSON ini:\n` +
			`{\n` +
			`  "title": "[Emoji] Judul",\n` +
			`  "intro": "Hook 2-3 kalimat",\n` +
			`  "sections": [{"heading":"📖 Sub-judul","body":"3-5 paragraf","image_query":"NAMA EXACT JUDUL ANIME","video_query":"[nama exact] trailer"}],\n` +
			`  "category": "anime"\n` +
			`}\n` +
			`Gaya santai, tanpa kesimpulan. JANGAN tambah teks lain!`;
		const raw = await router.chat([{ role: 'user', content: minimalPrompt }]);
		const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
		return parseArticleJSON(rawStr);
	} catch {
		throw new Error('3x percobaan artikel gagal');
	}
}

export function generateFallbackArticle(topic: string): Article {
	return {
		title: `🎯 ${topic.slice(0, 80)}`,
		intro: `Halo! ${topic} lagi jadi perbincangan hangat di komunitas anime. Yuk kita bahas lebih dalem apa aja yang terjadi dan gimana reaksi fans!`,
		sections: [
			{
				heading: '📖 Yang Perlu Kamu Tahu',
				body: `${topic} adalah salah satu topik yang lagi hangat dibicarakan di komunitas anime. Banyak yang ngomongin di berbagai forum dan media sosial. Mulai dari Twitter, Reddit, sampe Discord server-server anime.
Yang bikin ini menarik, bukan cuma soal beritanya sendiri, tapi juga gimana reaksi komunitas. Ada yang excited banget, ada yang biasa aja, dan pastinya ada yang skeptis. Tapi satu hal yang pasti — topik ini berhasil bikin orang ngomong.`,
				image_query: topic.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40),
				video_query: `${topic.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40)} trailer`,
			},
			{
				heading: '💬 Reaksi Komunitas',
				body: `Yang seru dari berita kayak gini adalah liat reaksi komunitas yang vary. Ada yang udah siap sambut dengan tangan terbuka, ada yang masih wait and see.

Beberapa fans veteran bilang ini pola yang sering terjadi — antisipasi tinggi, kadang kebukti, kadang enggak. Tapi menurut gue, justru diskusi kayak gini yang bikin komunitas anime seru.`,
				image_query: topic.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40),
				video_query: `${topic.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40)} trailer`,
			},
		],
		category: 'anime',
	};
}

