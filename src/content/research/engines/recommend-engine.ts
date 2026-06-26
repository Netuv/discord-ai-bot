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
 * Recommendation Research Engine
 * Focus: Finding similar titles, hidden gems, curated lists
 * Sources: MAL rankings, genre searches, community recommendations
 */
class RecommendEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'RecommendEngine', `Researching recommendations: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Parse the recommendation theme (e.g., "best isekai", "hidden gem slice of life")
      const themeMatch = topic.toLowerCase();
      const isHiddenGem = themeMatch.includes('hidden') || themeMatch.includes('underrated');
      const isBest = themeMatch.includes('best') || themeMatch.includes('top');

      // 2. Search for the base entry if specific title mentioned
      if (!isBest && !isHiddenGem && category === 'anime') {
        const searchResults = await jikan.searchAnime(topic);
        if (searchResults.length > 0) {
          const entry = searchResults[0]!;
          context.baseEntry = {
            title: entry.title,
            genres: entry.genres?.map(g => g.name) || [],
            themes: entry.themes?.map(t => t.name) || [],
            score: entry.score,
            synopsis: entry.synopsis?.slice(0, 300),
          };
          sources.push(`MyAnimeList (${entry.mal_id})`);
        }
      }

      // 3. Search for similar recommendations via web
      const searchQuery = category === 'anime'
        ? `${topic} anime recommendation similar`
        : `${topic} ${category} recommendation`;

      const webResults = await web.searchMultiple(searchQuery, [
        'myanimelist.net',
        'reddit.com',
        'animenewsnetwork.com',
      ]);

      if (webResults.length > 0) {
        context.recommendations = webResults.slice(0, 8).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...webResults.slice(0, 3).map(r => r.url));
      }

      // 4. Extract criteria for recommendations
      context.criteria = {
        isHiddenGem,
        isBest,
        targetAudience: themeMatch.includes('beginner') ? 'beginners' : 'general',
        mood: this.detectMood(themeMatch),
      };

    } catch (e) {
      traceLog('warn', 'RecommendEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'recommendation',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: context['baseEntry'] 
          ? (context['baseEntry'] as Record<string, unknown>)['title'] as string
          : topic,
        videoQuery: `${topic} ${category} recommendation`,
        preferredSource: 'mal',
      },
    };
  }

  private detectMood(query: string): string {
    if (query.includes('action') || query.includes('intense')) return 'action-packed';
    if (query.includes('chill') || query.includes('relaxing')) return 'relaxing';
    if (query.includes('emotional') || query.includes('sad')) return 'emotional';
    if (query.includes('funny') || query.includes('comedy')) return 'comedy';
    return 'balanced';
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Recommendation research for: ${topic} (${category})`,
    ];

    if (context['baseEntry']) {
      const base = context['baseEntry'] as Record<string, unknown>;
      parts.push(`\nBase entry: ${base['title']}`);
      if (base['genres'] && Array.isArray(base['genres'])) {
        parts.push(`Genres: ${base['genres'].join(', ')}`);
      }
      if (base['score']) parts.push(`MAL Score: ${base['score']}/10`);
    }

    if (context['criteria']) {
      const criteria = context['criteria'] as Record<string, unknown>;
      parts.push(`\nRecommendation type: ${criteria['isHiddenGem'] ? 'Hidden Gems' : 'Popular Picks'}`);
      parts.push(`Target audience: ${criteria['targetAudience']}`);
      parts.push(`Mood: ${criteria['mood']}`);
    }

    if (context['recommendations'] && Array.isArray(context['recommendations'])) {
      parts.push(`\nFound ${context['recommendations'].length} recommendation sources`);
    }

    return parts.join('\n');
  }
}

const engine = new RecommendEngine();
export default engine;
