/**
 * article.ts — Article system types
 * v5.0 — Shared between AI writer, auditor, publisher
 */

export interface ArticleSection {
	heading: string;
	body: string;
	image_query: string;
	video_query: string;
}

export interface Article {
	title: string;
	intro: string;
	sections: ArticleSection[];
	category: ArticleCategory;
}

export type ArticleCategory = 'anime' | 'manga' | 'game' | 'breaking' | 'announcement' | 'general';

export interface ArticleResearch {
	summary: string;
	reviewSummary: string;
}

export interface PublishResult {
	success: boolean;
	sectionsPublished: number;
	sectionsFailed: number;
	imagesPublished: number;
	videosPublished: number;
	errors: string[];
	error?: string;
}

export interface OptimizedMediaQuery {
	image_keywords: string[];
	video_keywords: string[];
	mal_title?: string;
	anilist_title?: string;
	year_hint?: number;
	preferred_source?: 'youtube' | 'mal' | 'anilist' | 'kitsu';
}

export interface AuditIssue {
	type: 'error' | 'warning';
	category: 'format' | 'content' | 'media' | 'platform' | 'watermark' | 'duplicate';
	message: string;
	location?: string;
	autoFixable: boolean;
	autoFixed?: boolean;
}

export interface AuditReport {
	passed: boolean;
	issues: AuditIssue[];
	criticalCount: number;
	warningCount: number;
	autoFixedCount: number;
	article: Article;
	media: ValidatedMedia[];
	summary: string;
}

export interface ValidatedMedia {
	type: 'image' | 'video';
	sectionIndex: number;
	url: string | null;
	caption?: string;
	valid: boolean;
	reason?: string;
}
