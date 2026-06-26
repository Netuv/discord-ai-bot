import type { Env } from '../../types/env';
import { D1Client } from '../../core/d1';

export class DedupChecker {
  private db: D1Client;

  constructor(env: Env) {
    this.db = new D1Client(env);
  }

  async isDuplicate(topic: string, windowDays = 14): Promise<{
    isDuplicate: boolean;
    similarTopics: string[];
    similarityScore: number;
  }> {
    const normalized = topic.toLowerCase().trim();

    // Exact + substring match
    const exactMatches = await this.db.query<{ topic: string; published_at: string }>(
      `SELECT topic, published_at FROM content_history
       WHERE published_at > datetime('now', '-' || ? || ' days')
         AND (topic_normalized LIKE '%' || ? || '%' OR ? LIKE '%' || topic_normalized || '%')
       ORDER BY published_at DESC LIMIT 5`,
      windowDays,
      normalized,
      normalized
    );

    if (exactMatches.length > 0) {
      return {
        isDuplicate: true,
        similarTopics: exactMatches.map((m) => m.topic),
        similarityScore: 1.0,
      };
    }

    // Word-level fuzzy match
    const words = normalized.split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) {
      return { isDuplicate: false, similarTopics: [], similarityScore: 0 };
    }

    const recent = await this.db.query<{ topic: string; topic_normalized: string }>(
      `SELECT topic, topic_normalized FROM content_history
       WHERE published_at > datetime('now', '-' || ? || ' days')
       LIMIT 100`,
      windowDays
    );

    const fuzzyMatches = recent.filter((r) => {
      const rWords = new Set(r.topic_normalized.split(/\s+/));
      const overlap = words.filter((w) => rWords.has(w)).length;
      return overlap / Math.max(words.length, rWords.size) >= 0.7;
    });

    return {
      isDuplicate: fuzzyMatches.length > 0,
      similarTopics: fuzzyMatches.map((m) => m.topic),
      similarityScore: fuzzyMatches.length > 0 ? 0.7 : 0,
    };
  }
}
