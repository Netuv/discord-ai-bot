/**
 * publisher.ts — Article publishing pipeline to Discord
 * v5.0 — Audit → Optimize → Send Headline → Pre-fetch Media → Send Sections
 */

import type { Article, PublishResult, OptimizedMediaQuery, AuditReport } from '../types/article';
import type { Env } from '../types/env';
import { sendMessage, sendEmbed } from './client';
import { ARTICLE_COLORS, DISCORD_LIMITS } from '../config/discord';
import { logger } from '../core/logger';
import { auditArticle } from '../ai/auditor';
import { optimizeMediaQuery } from '../ai/media-optimizer';
import { searchAnimeImage } from '../workers/imagescraper';
import { findYouTubeVideo } from '../workers/videoscraper';
import { SPACER } from './formatter';

// ─── Types ─────────────────────────────────────────────────

interface SectionMedia {
	sectionIndex: number;
	imageUrl: string | null;
	videoUrl: string | null;
	imageSource?: string;
	videoSource?: string;
}

// ─── Helpers ───────────────────────────────────────────────

function getColor(category: string): number {
	return ARTICLE_COLORS[category] || ARTICLE_COLORS.general;
}

function buildKeywords(articleTitle: string, sectionQuery: string | undefined, optimized: OptimizedMediaQuery | null, type: 'image' | 'video'): string[] {
	const queries: string[] = [];
	if (type === 'image') {
		if (optimized?.mal_title && optimized.mal_title.length > 2) queries.push(optimized.mal_title);
		if (optimized?.image_keywords) queries.push(...optimized.image_keywords);
	} else {
		if (optimized?.video_keywords) queries.push(...optimized.video_keywords);
	}
	if (sectionQuery && sectionQuery.length > 2 && !queries.includes(sectionQuery)) queries.push(sectionQuery);
	return queries;
}

// Track used media URLs to avoid duplicates across sections
const usedImageUrls = new Set<string>();
const usedVideoUrls = new Set<string>();

// ─── Main Publisher ────────────────────────────────────────

export async function publishArticle(token: string, channelId: string, article: Article, env: Env): Promise<PublishResult> {
	// Reset dup tracker per article
	usedImageUrls.clear();
	usedVideoUrls.clear();

	const result: PublishResult = {
		success: true, sectionsPublished: 0, sectionsFailed: 0,
		imagesPublished: 0, videosPublished: 0, errors: [],
	};

	try {
		// ── PHASE 0: Audit + Optimize media queries ──
		const audit: AuditReport = auditArticle(article);
		if (!audit.passed) logger.warn('Publisher', 'Audit issues found', { critical: audit.criticalCount, warnings: audit.warningCount });
		const auditedArticle = audit.article;

		let optimized: OptimizedMediaQuery | null = null;
		try {
			optimized = await optimizeMediaQuery(auditedArticle.title, auditedArticle.sections.map(s => s.heading), auditedArticle.sections.map(s => s.body.slice(0, 200)), env);
		} catch (e) {
			logger.warn('Publisher', 'Media query optimizer failed', { error: e instanceof Error ? e.message : String(e) });
		}

		const sections = auditedArticle.sections;
		if (!sections || sections.length === 0) {
			if (auditedArticle.title) await sendMessage(token, channelId, `**${auditedArticle.title}**`);
			if (auditedArticle.intro) await sendMessage(token, channelId, auditedArticle.intro);
			return result;
		}

		// ── PHASE 1: Send HEADLINE embed + spacer ──
		await sendEmbed(token, channelId, {
			title: auditedArticle.title, description: auditedArticle.intro, color: getColor(auditedArticle.category),
		}).catch(() => result.errors.push('Headline embed failed'));
		await sendMessage(token, channelId, SPACER).catch(() => {});

		// ── PHASE 2: Send per-section with lazy media fetch ──
		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];

			// Fetch media LAZY — sequential per section
			const [imgResult, vidResult] = await Promise.all([
				(async () => {
					for (const q of buildKeywords(auditedArticle.title, sec.image_query, optimized, 'image')) {
						try {
							const img = await searchAnimeImage(q, { env, skipCache: true });
							if (img && !usedImageUrls.has(img.url)) { usedImageUrls.add(img.url); return { url: img.url, source: img.source }; }
						} catch { continue; }
					}
					return null;
				})(),
				(async () => {
					for (const q of buildKeywords(auditedArticle.title, sec.video_query, optimized, 'video')) {
						try {
							const url = await findYouTubeVideo(q, env);
							if (url && !usedVideoUrls.has(url)) { usedVideoUrls.add(url); return { url, source: 'YouTube' }; }
						} catch { continue; }
					}
					return null;
				})(),
			]);

			const media: SectionMedia = { sectionIndex: i, imageUrl: imgResult?.url ?? null, videoUrl: vidResult?.url ?? null, imageSource: imgResult?.source, videoSource: vidResult?.source };

			try {
				let lines: string[] = [];
				lines.push(`**${sec.heading || '📖'}**`);
				if (sec.body) { lines.push(''); lines.push(sec.body.slice(0, 1800)); }
				if (media?.imageUrl) {
					lines.push('');
					const cap = media.imageSource ? `${sec.heading || '📖'} — ${media.imageSource}` : sec.heading || '';
					if (cap) lines.push(cap);
					lines.push(media.imageUrl);
					result.imagesPublished++;
				}
				if (media?.videoUrl) {
					lines.push(''); lines.push(`🎬 **${sec.video_query || sec.heading || 'Video'}**`); lines.push(media.videoUrl);
					result.videosPublished++;
				}
				if (i < sections.length - 1) { lines.push(''); lines.push('---'); }

				const fullContent = lines.join('\n').slice(0, 2000);
				let finalContent = fullContent;
				if (fullContent.length >= 1950 && sec.body) {
					const prefix = `**${sec.heading || '📖'}**\n\n`;
					const mediaLines = lines.filter(l => l.startsWith('🎬') || l.startsWith('http') || l === '---' || l.trim() === '').join('\n');
					const bodyRoom = 1900 - prefix.length - mediaLines.length;
					finalContent = (prefix + (sec.body || '').slice(0, Math.max(0, bodyRoom)) + '\n\n' + mediaLines).slice(0, 2000);
				}

				try {
					const body = JSON.stringify({ content: finalContent.slice(0, DISCORD_LIMITS.MESSAGE_CONTENT) });
					const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
						method: 'POST', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body,
					});
					if (res.ok) result.sectionsPublished++;
					else {
						const errBody = await res.text().catch(() => 'unknown');
						result.sectionsFailed++;
						result.errors.push(`Section[${i}] Discord ${res.status}: ${errBody.slice(0, 200)}`);
						logger.warn('Publisher', 'Section send failed', { status: res.status, body: errBody.slice(0, 200) });
					}
				} catch (e) {
					result.sectionsFailed++;
					result.errors.push(`Section[${i}] fetch error: ${e instanceof Error ? e.message : String(e)}`);
				}
			} catch (e) {
				result.sectionsFailed++;
				result.errors.push(`Section[${i}] error: ${e instanceof Error ? e.message : String(e)}`);
			}
		}

		result.success = result.sectionsFailed === 0;
		if (!result.success) result.error = `${result.sectionsFailed} section(s) gagal dikirim`;
		return result;
	} catch (e) {
		result.success = false;
		const msg = e instanceof Error ? e.message : String(e);
		result.error = msg; result.errors.push(msg);
		return result;
	}
}
