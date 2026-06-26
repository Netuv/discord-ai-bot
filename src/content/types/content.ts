export type ContentCategory = 'anime' | 'manga' | 'game' | 'novel';

export type ContentFormat =
  | 'breaking-news'
  | 'review'
  | 'recommendation'
  | 'deep-dive'
  | 'season-preview'
  | 'comparison'
  | 'retrospective'
  | 'industry'
  | 'top-list'
  | 'discussion'
  | 'character-spotlight'
  | 'lore-explained';

export type ContentDepth = 'quick' | 'standard' | 'deep';

export type TriggerType = 'cron' | 'manual' | 'webhook' | 'api';

export interface ContentBrief {
  traceId: string;
  category: ContentCategory;
  format: ContentFormat;
  depth: ContentDepth;
  topic: string;
  alternativeTopics?: string[];
  angle?: string;
  reason: string;
  trendingScore?: number;
  timestamp: string;
  triggerType: TriggerType;
  maxSubrequests: number;
  pluginOverride?: string;
}

export interface ArticleSection {
  heading: string;
  body: string;
  imageDescription?: string | null; // descriptive text for 📸 display
  imageUrl?: string | null;         // real Image URL from search
  videoUrl?: string | null;         // real YouTube URL from API
  videoTitle?: string | null;       // YouTube video title
}

export interface Article {
  title: string;
  intro: string;
  sections: ArticleSection[];
  category: ContentCategory;
  format: ContentFormat;
  depth: ContentDepth;
  wordCount?: number;
}

export type FinalContent = Article & {
  metadata: {
    traceId: string;
    generatedAt: string;
    sources: string[];
    providerUsed: string;
    modelUsed: string;
    totalMs?: number;
  };
};
