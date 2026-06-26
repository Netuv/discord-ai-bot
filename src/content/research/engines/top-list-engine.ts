import type { Env } from '../../../types/env';
import type { ContentBrief, ContentCategory } from '../../types/content';
import type { ResearchEngine, ResearchBundle } from '../types';
import { BudgetTracker } from '../../../core/budget-tracker';
import { D1Cache } from '../../../core/d1-cache';
import { D1Client } from '../../../core/d1';
import { JikanSource } from '../sources/jikan-source';
import { WebSource } from '../sources/web-source';
import { traceLog } from '../../../core/trace-logger';

/**
 * Top List Research Engine
 * Focus: Ranking-based articles (top 10, best of, etc.)
 * Sources: MAL rankings, community polls, curated lists
 */
class TopListEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'TopListEngine', `Top list research: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Parse list criteria (e.g., "top 10 action anime", "best isekai")
      const criteria = this.parseListCriteria(topic);
      context.criteria = criteria;

      // 2. Get MAL top anime (if anime category)
      if (category === 'anime') {
        const seasonal = await jikan.getSeasonNow();
        const topAnime = seasonal
          .filter(a => a.score && a.score > 7.0)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, 20);

        context.malTop = topAnime.map(a => ({
          title: a.title,
          score: a.score,
          popularity: a.popularity,
          genres: a.genres?.map(g => g.name) || [],
          synopsis: a.synopsis?.slice(0, 100),
        }));
        sources.push('MyAnimeList Rankings');
      }

      // 3. Search for existing top lists
      const listSearch = await web.searchMultiple(
        `${topic} top best ranking list`,
        ['myanimelist.net', 'reddit.com', 'ranker.com']
      );

      if (listSearch.length > 0) {
        context.existingLists = listSearch.slice(0, 6).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...listSearch.slice(0, 3).map(r => r.url));
      }

      // 4. Search for community recommendations
      const communitySearch = await web.search(
        `${topic} ${category} must watch recommended community`
      );

      if (communitySearch.length > 0) {
        context.community = communitySearch.slice(0, 4).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 5. Identify ranking criteria
      context.rankingCriteria = [
        'Overall quality and execution',
        'Popularity and cultural impact',
        'Critical acclaim and reviews',
        'Uniqueness and innovation',
        'Entertainment value',
      ];

    } catch (e) {
      traceLog('warn', 'TopListEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'top-list',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: topic,
        videoQuery: `${topic} compilation`,
        preferredSource: 'mal',
      },
    };
  }

  private parseListCriteria(topic: string): Record<string, unknown> {
    const lower = topic.toLowerCase();
    return {
      count: this.extractCount(lower),
      genre: this.extractGenre(lower),
      timeframe: this.extractTimeframe(lower),
      isHidden: lower.includes('hidden') || lower.includes('underrated'),
    };
  }

  private extractCount(topic: string): number {
    const match = topic.match(/top\s+(\d+)|best\s+(\d+)|(\d+)\s+best/);
    if (match) {
      return parseInt(match[1] || match[2] || match[3] || '10', 10);
    }
    return 10; // default
  }

  private extractGenre(topic: string): string | null {
    const genres = ['action', 'comedy', 'drama', 'romance', 'horror', 'isekai', 'slice of life'];
    for (const genre of genres) {
      if (topic.includes(genre)) return genre;
    }
    return null;
  }

  private extractTimeframe(topic: string): string | null {
    if (topic.includes('all time')) return 'all-time';
    if (topic.includes('2024')) return '2024';
    if (topic.includes('2023')) return '2023';
    if (topic.includes('decade')) return 'decade';
    return null;
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Top list compilation: ${topic} (${category})`,
    ];

    if (context['criteria']) {
      const crit = context['criteria'] as Record<string, unknown>;
      parts.push(`\nList size: Top ${crit['count']}`);
      if (crit['genre']) parts.push(`Genre focus: ${crit['genre']}`);
      if (crit['timeframe']) parts.push(`Timeframe: ${crit['timeframe']}`);
    }

    if (context['malTop'] && Array.isArray(context['malTop'])) {
      parts.push(`\n${context['malTop'].length} MAL top entries analyzed`);
    }

    if (context['existingLists']) {
      const lists = context['existingLists'] as Array<unknown>;
      parts.push(`${lists.length} existing top lists found for reference`);
    }

    if (context['rankingCriteria'] && Array.isArray(context['rankingCriteria'])) {
      parts.push(`\nRanking criteria: ${context['rankingCriteria'].length} dimensions`);
    }

    return parts.join('\n');
  }
}

const engine = new TopListEngine();
export default engine;
