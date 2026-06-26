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
 * Retrospective Research Engine
 * Focus: Looking back at older titles, their impact and legacy
 * Sources: Historical MAL data, retrospective articles, impact analysis
 */
class RetrospectiveEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'RetrospectiveEngine', `Retrospective: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Get entry data with focus on historical context
      if (category === 'anime' || category === 'manga') {
        const searchResults = await jikan.searchAnime(topic);
        if (searchResults.length > 0) {
          const entry = searchResults[0]!;
          context.entry = {
            title: entry.title,
            aired: entry.aired,
            score: entry.score,
            scored_by: entry.scored_by,
            rank: entry.rank,
            popularity: entry.popularity,
            synopsis: entry.synopsis?.slice(0, 300),
            genres: entry.genres?.map(g => g.name) || [],
            studios: entry.studios?.map(s => s.name) || [],
            year: entry.year,
          };
          sources.push(`MyAnimeList (${entry.mal_id})`);

          // Get reviews for historical perspective
          if (entry.mal_id) {
            const reviews = await jikan.getAnimeReviews(entry.mal_id);
            if (reviews.length > 0) {
              context.reviews = reviews.slice(0, 3).map(r => ({
                score: r.score,
                tags: r.tags || [],
              }));
            }
          }
        }
      }

      // 2. Search for retrospective analysis
      const retroSearch = await web.searchMultiple(
        `${topic} ${category} retrospective years later legacy impact`,
        ['reddit.com', 'animenewsnetwork.com', 'myanimelist.net']
      );

      if (retroSearch.length > 0) {
        context.retrospectives = retroSearch.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...retroSearch.slice(0, 2).map(r => r.url));
      }

      // 3. Search for influence and impact articles
      const impactSearch = await web.search(
        `${topic} influence impact changed ${category}`
      );

      if (impactSearch.length > 0) {
        context.impact = impactSearch.slice(0, 4).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 4. Identify retrospective angles
      context.angles = [
        'Historical context and era',
        'Initial reception vs modern perspective',
        'Cultural impact and influence',
        'How it aged over time',
        'Legacy and lasting contributions',
        'Influence on later works',
      ];

    } catch (e) {
      traceLog('warn', 'RetrospectiveEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'retrospective',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: topic,
        videoQuery: `${topic} retrospective analysis`,
        preferredSource: 'mal',
      },
    };
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Retrospective analysis: ${topic} (${category})`,
    ];

    if (context['entry']) {
      const entry = context['entry'] as Record<string, unknown>;
      parts.push(`\nTitle: ${entry['title']}`);
      parts.push(`Year: ${entry['year'] || 'N/A'}`);
      parts.push(`Current MAL Score: ${entry['score']}/10 (${entry['scored_by']} users)`);
      parts.push(`Rank: #${entry['rank']}, Popularity: #${entry['popularity']}`);
    }

    if (context['retrospectives']) {
      const retro = context['retrospectives'] as Array<unknown>;
      parts.push(`\n${retro.length} retrospective articles found`);
    }

    if (context['impact']) {
      const impact = context['impact'] as Array<unknown>;
      parts.push(`${impact.length} impact analysis sources`);
    }

    if (context['angles'] && Array.isArray(context['angles'])) {
      parts.push(`\nRetrospective angles: ${context['angles'].length}`);
    }

    return parts.join('\n');
  }
}

const engine = new RetrospectiveEngine();
export default engine;
