import type { Env } from '../../types/env';
import type { ContentCategory, ContentFormat } from '../types/content';
import { D1Client } from '../../core/d1';
import { callAiWithRouter } from '../../ai/model-router';

/**
 * Current date used to enforce recency in topic generation.
 * Topics MUST be about something released/updated/trending within 30 days of this date.
 */
const CURRENT_DATE = '2026-06-26';

const TOPIC_POOLS: Record<string, Record<string, string[]>> = {
  anime: {
    review: ['Sakamoto Days (2026 adaptation)', 'Kaiju No.8 Season 2 (Summer 2026)', 'Dandadan Season 2 (2026)', 'The Eminence in Shadow S3', 'Demon Slayer Infinity Castle (2026)'],
    'breaking-news': ['Anime season Summer 2026 lineup', 'Pengumuman adaptasi baru Juni 2026', 'Industri anime 2026 update'],
    'deep-dive': ['Sakamoto Days manga vs anime', 'Kaiju No.8 power scaling', 'Dandadan lore explained'],
    recommendation: ['Underrated anime Summer 2026', 'Best anime 2026 sejauh ini', 'Anime hidden gems musim ini'],
    'character-spotlight': ['Sakamoto (Sakamoto Days)', 'Kafka Hibino S2', 'Momo Ayase (Dandadan)'],
    'lore-explained': ['Dandadan alien/yokai lore', 'Kaiju No.8 origins', 'Sakamoto Days organization'],
    'season-preview': ['Summer 2026 most anticipated', 'Spring 2026 best anime recap'],
    comparison: ['Sakamoto Days vs Spy x Family', 'Kaiju No.8 vs Godzilla anime'],
    retrospective: ['Best anime 2025 retrospective', 'Mappa 2025-2026 track record'],
    industry: ['Anime industry 2026 trends', 'Streaming wars 2026', 'AI in anime production'],
    'top-list': ['Top 10 anime Spring/Summer 2026', 'Best new anime 2026'],
    discussion: ['Is the 2026 anime golden age?', 'Remake culture in 2026'],
  },
  manga: {
    review: ['Sakamoto Days', 'Dandadan', 'Kaiju No.8', 'Gachiakuta', 'Centuria'],
    recommendation: ['New manga 2026 you must read', 'Hidden gem manga 2026'],
    'character-spotlight': ['Sakamoto', 'Okarun (Dandadan)', 'Kafka (Kaiju No.8)'],
    'lore-explained': ['Dandadan latest chapters explained', 'Kaiju No.8 latest arc'],
  },
  game: {
    review: ['Elden Ring Nightreign (2026)', 'GTA VI (2026)', 'Monster Hunter Wilds', 'Death Stranding 2', 'Xenoblade Chronicles X DE'],
    recommendation: ['Best games of 2026 so far', 'Hidden indie gems 2026', 'Most anticipated 2026 games'],
    industry: ['Gaming industry 2026', 'Nintendo Switch 2 (2026)', 'Summer Game Fest 2026'],
  },
  novel: {
    review: ['Classroom of the Elite Year 3', 'Mushoku Tensei LN volume terbaru', 'Re:Zero arc 9'],
    recommendation: ['Best light novels 2026', 'New LN series 2026', 'Hidden gem LNs 2026'],
    'character-spotlight': ['Ayanokouji Kiyotaka (COTE)', 'Subaru Natsuki arc 9'],
    'lore-explained': ['Classroom of the Elite Year 3 analysis', 'Re:Zero latest volume breakdown'],
  },
};

export class TopicGenerator {
  constructor(
    private env: Env,
    private db: D1Client
  ) {}

  async generate(
    category: ContentCategory,
    format: ContentFormat,
    recentTopics: string[]
  ): Promise<string> {
    // 1. Try AI generation — strictly enforces ≤30 day recency
    try {
      const aiTopic = await this.generateWithAI(category, format, recentTopics);
      if (aiTopic && !(await this.isRecentlyUsed(aiTopic))) {
        return aiTopic;
      }
    } catch {
      // fallback
    }

    // 2. Fallback: pick from pool, skip used topics
    const pool = TOPIC_POOLS[category]?.[format] ?? TOPIC_POOLS[category]?.['review'] ?? [];
    const available = pool.filter(
      (t) => !recentTopics.some((r) => r.toLowerCase().includes(t.toLowerCase()))
    );
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)]!;
    }

    // 3. Last resort: random from full pool
    return pool[Math.floor(Math.random() * pool.length)] ?? 'New anime release Summer 2026';
  }

  private async generateWithAI(
    category: ContentCategory,
    format: ContentFormat,
    recentTopics: string[]
  ): Promise<string> {
    const prompt = `Generate ONE specific ${category} topic for a "${format}" article.

CURRENT DATE: ${CURRENT_DATE}

RECENCY REQUIREMENT — CRITICAL:
- The topic MUST be about something that was RELEASED, UPDATED, or TRENDING within the last 30 days before ${CURRENT_DATE}.
- Examples of ACCEPTABLE topics: anime season Summer 2026, game released 2026, ongoing series latest chapter/episode, 2026 industry news
- Examples of UNACCEPTABLE topics: old shows from 2020-2025, long-finished series unless they have 2026 sequel, generic evergreen topics
- If you cannot find a current/recent topic, generate a fresh topic about the latest season or ongoing series in ${category}

Other requirements:
- Must be specific (title, character name, or event — NOT generic)
- MUST NOT be similar to any of these recent topics: ${recentTopics.slice(0, 10).join(', ')}
- Return ONLY the topic, nothing else, no punctuation at end

Examples of good topics for ${CURRENT_DATE}: "Sakamoto Days Season 1 analysis", "Kaiju No.8 Season 2 Summer 2026", "Dandadan manga latest arc", "Elden Ring Nightreign preview"`;

    const result = await callAiWithRouter(
      'strategist',
      [{ role: 'user', content: prompt }],
      this.env
    );
    return result.trim().slice(0, 100);
  }

  private async isRecentlyUsed(topic: string, days = 14): Promise<boolean> {
    const normalized = topic.toLowerCase().trim();
    const row = await this.db.first<{ count: number }>(
      `SELECT COUNT(*) as count FROM content_history
       WHERE published_at > datetime('now', ?)
         AND (topic_normalized LIKE '%' || ? || '%' OR ? LIKE '%' || topic_normalized || '%')`,
      `-${days} days`,
      normalized,
      normalized
    );
    return (row?.count ?? 0) > 0;
  }
}
