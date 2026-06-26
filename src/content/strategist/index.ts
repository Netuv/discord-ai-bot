import type { Env } from '../../types/env';
import type { ContentBrief, ContentCategory, ContentDepth, ContentFormat, TriggerType } from '../types/content';
import { D1Client } from '../../core/d1';
import { D1Cache } from '../../core/d1-cache';
import { setTraceId, traceLog } from '../../core/trace-logger';
import { FORMAT_WEIGHTS, CATEGORY_WEIGHTS, type FormatWeightConfig } from '../config/formats';

export class ContentStrategist {
  private db: D1Client;
  private cache: D1Cache;

  constructor(private env: Env) {
    this.db = new D1Client(env);
    this.cache = new D1Cache(this.db);
  }

  async decide(
    triggerType: TriggerType,
    overrides?: Partial<Pick<ContentBrief, 'category' | 'format' | 'topic'>>
  ): Promise<ContentBrief> {
    const traceId = crypto.randomUUID().slice(0, 8);
    setTraceId(traceId);

    // 1. Load recent history
    const history = await this.loadRecentHistory(14);

    // 2. Check trending (optional, 0-1 subrequest)
    const trending = await this.detectTrending().catch(() => null);

    // 3. Determine category
    const category = overrides?.category ?? this.selectCategory();

    // 4. Calculate format weights
    const weights = this.calculateWeights(history, trending, category);

    // 5. Select format
    const format = overrides?.format ?? this.selectWeighted(weights);

    // 6. Determine depth
    const depth = this.determineDepth(format);

    // 7. Generate unique topic
    const topic = overrides?.topic ?? (await this.generateUniqueTopic(category, format, history));

    return {
      traceId,
      category,
      format,
      depth,
      topic,
      reason: `[${traceId}] ${format}/${category} selected. Trending: ${trending?.topic ?? 'none'}.`,
      ...(trending ? { trendingScore: trending.score } : {}),
      timestamp: new Date().toISOString(),
      triggerType,
      maxSubrequests: 50,
    };
  }

  private calculateWeights(
    history: Array<{ format: string; published_at: string }>,
    trending: { topic: string; score: number } | null,
    _category: ContentCategory
  ): Record<ContentFormat, number> {
    const now = new Date();
    const isWeekend = [0, 6].includes(now.getDay());
    const isSeasonStart = now.getDate() <= 7;

    const weights = {} as Record<ContentFormat, number>;

    for (const [fmt, cfg] of Object.entries(FORMAT_WEIGHTS) as [ContentFormat, FormatWeightConfig][]) {
      let w = cfg.baseWeight;

      if (isWeekend) w *= cfg.weekendMultiplier;
      if (isSeasonStart && fmt === 'season-preview') w *= cfg.seasonalMultiplier;

      const lastUsed = history.find((h) => h.format === fmt);
      if (lastUsed) {
        const hoursSince =
          (Date.now() - new Date(lastUsed.published_at).getTime()) / 3_600_000;
        if (hoursSince < cfg.minIntervalHours) {
          w *= 0.1;
        } else if (hoursSince < cfg.cooldownDays * 24) {
          w *= 0.3;
        }
      }

      if (trending && fmt === 'breaking-news') {
        w *= 1 + cfg.trendingBoost / 100;
      }

      weights[fmt] = Math.max(0, w);
    }

    return weights;
  }

  private selectWeighted(weights: Record<ContentFormat, number>): ContentFormat {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [fmt, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) return fmt as ContentFormat;
    }
    return 'review';
  }

  private selectCategory(): ContentCategory {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      roll -= weight;
      if (roll <= 0) return cat as ContentCategory;
    }
    return 'anime';
  }

  private determineDepth(format: ContentFormat): ContentDepth {
    const deepFormats: ContentFormat[] = ['deep-dive', 'retrospective', 'lore-explained'];
    const quickFormats: ContentFormat[] = ['breaking-news', 'top-list'];
    if (deepFormats.includes(format)) return 'deep';
    if (quickFormats.includes(format)) return 'quick';
    return 'standard';
  }

  private async loadRecentHistory(days: number) {
    return this.db.query<{ format: string; topic: string; published_at: string }>(
      `SELECT format, topic, published_at FROM content_history
       WHERE published_at > datetime('now', ?)
       ORDER BY published_at DESC LIMIT 50`,
      `-${days} days`
    );
  }

  private async generateUniqueTopic(
    category: ContentCategory,
    format: ContentFormat,
    history: Array<{ topic: string }>
  ): Promise<string> {
    const { TopicGenerator } = await import('./topic-generator');
    const generator = new TopicGenerator(this.env, this.db);
    return generator.generate(category, format, history.map((h) => h.topic));
  }

  private async detectTrending() {
    const { TrendingDetector } = await import('./trending-detector');
    const detector = new TrendingDetector(this.env);
    return detector.detect();
  }
}

// Re-export FormatWeightConfig for other modules
export type { FormatWeightConfig } from '../config/formats';
