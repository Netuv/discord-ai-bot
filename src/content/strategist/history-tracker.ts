import type { Env } from '../../types/env';
import type { ContentBrief, Article } from '../types/content';
import { D1Client } from '../../core/d1';

export class HistoryTracker {
  private db: D1Client;

  constructor(env: Env) {
    this.db = new D1Client(env);
  }

  async log(params: {
    id: string;
    traceId: string;
    brief: ContentBrief;
    article: Article;
    providerUsed: string;
    modelUsed: string;
    totalMs: number;
    discordMessageId?: string;
    discordChannelId?: string;
  }): Promise<void> {
    const wordCount = [params.article.intro, ...params.article.sections.map((s) => s.body)]
      .join(' ')
      .split(/\s+/).length;

    await this.db.execute(
      `INSERT INTO content_history
       (id, trace_id, category, format, depth, topic, topic_normalized, angle, reason,
        trending_score, trigger_type, sections_count, word_count, provider_used, model_used, total_ms,
        discord_message_id, discord_channel_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params.id,
      params.traceId,
      params.brief.category,
      params.brief.format,
      params.brief.depth,
      params.brief.topic,
      params.brief.topic.toLowerCase().trim(),
      params.brief.angle ?? null,
      params.brief.reason,
      params.brief.trendingScore ?? null,
      params.brief.triggerType,
      params.article.sections.length,
      wordCount,
      params.providerUsed,
      params.modelUsed,
      params.totalMs,
      params.discordMessageId ?? null,
      params.discordChannelId ?? null
    );
  }

  async getRecent(days = 7) {
    return this.db.query<{
      id: string;
      format: string;
      category: string;
      topic: string;
      published_at: string;
    }>(
      `SELECT id, format, category, topic, published_at FROM content_history
       WHERE published_at > datetime('now', ?) ORDER BY published_at DESC`,
      `-${days} days`
    );
  }
}
