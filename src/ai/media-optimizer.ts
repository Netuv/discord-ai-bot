/**
 * media-optimizer.ts — AI Media Query Optimizer
 * v5.0 — Generates optimal image & video keywords from article content
 */

import type { OptimizedMediaQuery } from '../types/article';
import { AiRouter } from './router';

function buildQueryPrompt(articleTitle: string, sectionHeadings: string[], sectionBodies: string[]): string {
	return (
		`Kamu adalah asisten pencarian media anime. Tugasmu generate keyword TERBAIK\n` +
		`untuk mencari GAMBAR dan VIDEO dari judul artikel di bawah.\n` +
		`\n` +
		`## JUDUL ARTIKEL:\n${articleTitle}\n` +
		`\n` +
		`## KONTEN SECTION:\n${sectionHeadings.map((h, i) => `[${h}]: ${(sectionBodies[i] || '').slice(0, 200)}`).join('\n')}\n` +
		`\n` +
		`## TUGAS:\n` +
		`Generate keyword yang SPESIFIK dan AKURAT buat nyari gambar & video.\n` +
		`\n` +
		`## ⚠️ ATURAN PENTING — CARA KERJA SCRAPER:\n` +
		`\n` +
		`1. **ImageScraper** cuma bisa nyari berdasarkan JUDUL ANIME/MANGA!\n` +
		`   Dia pake API MyAnimeList, AniList, Kitsu — yang butuh EXACT TITLE.\n` +
		`   ❌ "Demon Slayer key visual 2026" → TIDAK KETEMU\n` +
		`   ✅ "Demon Slayer: Kimetsu no Yaiba" → KETEMU!\n` +
		`   ✅ "Kimetsu no Yaiba" → KETEMU!\n` +
		`\n` +
		`2. **VideoScraper** bisa nyari pake keyword DESKRIPTIF.\n` +
		`   ✅ "Demon Slayer Infinity Castle trailer" → KETEMU!\n` +
		`   ✅ "鬼滅の刃 無限城編 PV" → KETEMU!\n` +
		`\n` +
		`## FORMAT KEYWORD:\n` +
		`\n` +
		`### mal_title (PALING PENTING!):\n` +
		`Exact title anime/manga yang bisa dicari di MyAnimeList.\n` +
		`WAJIB: kosongkan ("") kalau topiknya BUKAN anime/manga spesifik.\n` +
		`\n` +
		`### image_keywords (cadangan):\n` +
		`3-5 JUDUL ANIME/MANGA alternatif.\n` +
		`\n` +
		`### video_keywords (YouTube search):\n` +
		`3-5 keyword DESKRIPTIF + tahun.\n` +
		`\n` +
		`## FORMAT JSON (WAJIB!):\n` +
		`{\n` +
		`  "mal_title": "Exact MAL Title atau kosong",\n` +
		`  "anilist_title": "Exact AniList Title atau kosong",\n` +
		`  "image_keywords": ["judul anime 1", "judul anime 2"],\n` +
		`  "video_keywords": ["keyword deskriptif 1", "keyword deskriptif 2"],\n` +
		`  "year_hint": 2026\n` +
		`}\n` +
		`\n` +
		`BALAS HANYA JSON, tanpa teks lain!`
	);
}

function parseQueryResponse(raw: string): OptimizedMediaQuery | null {
	if (!raw || raw.trim().length === 0) return null;
	try {
		const m = raw.match(/\{[\s\S]*\}/);
		if (m) return JSON.parse(m[0]);
	} catch { /* ignore */ }
	return null;
}

export async function optimizeMediaQuery(
	articleTitle: string,
	sectionHeadings: string[],
	sectionBodies: string[],
	env: any,
): Promise<OptimizedMediaQuery | null> {
	try {
		const router = new AiRouter(env);
		const prompt = buildQueryPrompt(articleTitle, sectionHeadings, sectionBodies);
		const raw = await router.chat([{ role: 'user', content: prompt }]);
		return parseQueryResponse(raw);
	} catch {
		return null;
	}
}
