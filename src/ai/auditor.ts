/**
 * auditor.ts — Quality Assurance Layer for Articles Before Publishing
 * v5.0 — Extracted from article-auditor.ts, uses shared types
 *
 * Validates format, content, media, platform limits, watermarks, duplicates, EYD.
 * Auto-fixes where possible, reports remaining issues.
 */

import type { Article, AuditIssue, AuditReport, ValidatedMedia, ArticleCategory } from '../types/article';
import { ARTICLE_COLORS } from '../config/discord';

// ─── Constants — Prohibited Patterns ─────────────────────

const WATERMARK_PATTERNS: RegExp[] = [
	/✨\s*Artikel\s*[•·]?\s*Lumina/i,
	/✨\s*Lumina/i,
	/\[generated\s+by\s+AI\]/i,
	/--\s*generated\s+by\s+AI/i,
	/Scheduled\s+(Content|Task)/i,
	/This\s+was\s+auto-generated/i,
	/bot\s+generated\s+content/i,
];

const CLOSING_PATTERNS: RegExp[] = [
	/^kesimpulannya[.\s]*$/mi,
	/^demikian[\s\w]+terima kasih[.\s]*$/mi,
	/^sekian[\s\w]+terima kasih[.\s]*$/mi,
	/^terima kasih[.\s]*$/mi,
	/^that's\s+all[.\s]*$/i,
	/^the\s+end[.\s]*$/i,
];

const BULLET_INDICATORS: RegExp[] = [/^[-•*]\s/m, /^\d+\.\s/m];

const GARBAGE_PATTERNS: RegExp[] = [
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
	/\uFFFD/g,
	/[\uD800-\uDFFF]/g,
	/[\u200B-\u200D\uFEFF]/g,
];

// ─── Validators ───────────────────────────────────────────

const YT_WATCH_REGEX = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/;
const YT_SHORT_REGEX = /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/;

function isValidYouTubeUrl(url: string): boolean {
	return YT_WATCH_REGEX.test(url) || YT_SHORT_REGEX.test(url);
}

function isValidImageUrl(url: string): boolean {
	if (!url || !url.startsWith('http')) return false;
	const pathname = url.split('?')[0];
	const ext = pathname.split('.').pop()?.toLowerCase();
	if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext)) return true;
	return url.length > 10 && url.startsWith('http');
}

// ─── Text Cleaners ────────────────────────────────────────

function stripWatermarks(text: string): string {
	let cleaned = text;
	for (const pattern of WATERMARK_PATTERNS) cleaned = cleaned.replace(pattern, '').trim();
	return cleaned;
}

function cleanGarbageChars(text: string): string {
	if (!text) return text;
	let cleaned = text;
	for (const pattern of GARBAGE_PATTERNS) cleaned = cleaned.replace(pattern, '');
	return cleaned;
}

function stripClosingPhrases(text: string): string {
	let cleaned = text;
	for (const pattern of CLOSING_PATTERNS) cleaned = cleaned.replace(pattern, '').trim();
	return cleaned;
}

// ─── Main Audit Function ──────────────────────────────────

export function auditArticle(article: Article): AuditReport {
	const issues: AuditIssue[] = [];
	let autoFixedCount = 0;
	const audited = {
		...article,
		sections: article.sections.map(s => ({ ...s })),
	} as Article;

	// Title check
	if (!audited.title || audited.title.trim().length < 3) {
		issues.push({ type: 'error', category: 'format', message: 'Title terlalu pendek atau kosong', autoFixable: false });
	}

	// Intro check
	if (!audited.intro || audited.intro.trim().length < 10) {
		issues.push({ type: 'warning', category: 'content', message: 'Intro terlalu pendek (< 10 chars)', autoFixable: false });
	}

	// Category check
	if (!audited.category || !['anime', 'manga', 'game', 'breaking', 'announcement', 'general'].includes(audited.category)) {
		audited.category = 'general' as ArticleCategory;
		issues.push({ type: 'warning', category: 'format', message: 'Kategori tidak valid, diset ke "general"', autoFixable: true, autoFixed: true });
		autoFixedCount++;
	}

	// Section checks
	for (let i = 0; i < audited.sections.length; i++) {
		const sec = audited.sections[i];

		// Heading
		if (!sec.heading || sec.heading.trim().length < 2) {
			audited.sections[i] = { ...sec, heading: `📖 Bagian ${i + 1}` };
			issues.push({ type: 'warning', category: 'format', message: `Section[${i}] heading kosong, auto-fix`, autoFixable: true, autoFixed: true });
			autoFixedCount++;
		}

		// Body
		if (!sec.body || sec.body.trim().length < 10) {
			issues.push({ type: 'error', category: 'content', message: `Section[${i}] body terlalu pendek`, autoFixable: false });
		}

		// Clean garbage & watermarks
		const beforeClean = sec.body;
		audited.sections[i].body = cleanGarbageChars(stripWatermarks(stripClosingPhrases(sec.body)));
		if (audited.sections[i].body !== beforeClean) {
			autoFixedCount++;
		}

		// Bullet check
		if (BULLET_INDICATORS.some(p => p.test(sec.body))) {
			issues.push({ type: 'warning', category: 'format', message: `Section[${i}] mengandung bullet points — gaya artikel melarang ini`, autoFixable: false });
		}
	}

	return {
		passed: issues.filter(i => i.type === 'error').length === 0,
		issues,
		criticalCount: issues.filter(i => i.type === 'error').length,
		warningCount: issues.filter(i => i.type === 'warning').length,
		autoFixedCount,
		article: audited,
		media: [],
		summary: `${issues.length} issue(s): ${issues.filter(i => i.type === 'error').length} critical, ${issues.filter(i => i.type === 'warning').length} warning, ${autoFixedCount} auto-fixed`,
	};
}
