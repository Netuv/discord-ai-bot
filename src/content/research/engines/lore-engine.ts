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
 * Lore Explained Research Engine (NEW)
 * Focus: Worldbuilding, power systems, hidden details, lore breakdown
 * Sources: Fandom wikis, analysis articles, community discussions
 */
class LoreEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'LoreEngine', `Lore explanation: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    // 1. Parse lore topic (e.g., "One Piece Devil Fruits", "Naruto chakra system")
    const parsed = this.parseLoreTopic(topic);
    context.parsed = parsed;

    try {
      // 2. Get series info
      if (category === 'anime' || category === 'manga') {
        const seriesResults = await jikan.searchAnime(parsed.series);
        if (seriesResults.length > 0) {
          const series = seriesResults[0]!;
          context.series = {
            title: series.title,
            mal_id: series.mal_id,
            synopsis: series.synopsis?.slice(0, 200),
            genres: series.genres?.map(g => g.name) || [],
            themes: series.themes?.map(t => t.name) || [],
          };
          sources.push(`MyAnimeList (${series.mal_id})`);
        }
      }

      // 3. Search for lore explanations and wikis
      const loreSearch = await web.searchMultiple(
        `${topic} explained lore system mechanics`,
        ['fandom.com', 'reddit.com', 'animenewsnetwork.com']
      );

      if (loreSearch.length > 0) {
        context.loreExplanations = loreSearch.slice(0, 6).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...loreSearch.slice(0, 3).map(r => r.url));
      }

      // 4. Search for detailed breakdowns
      const detailSearch = await web.search(
        `${topic} detailed breakdown rules mechanics how it works`
      );

      if (detailSearch.length > 0) {
        context.detailedBreakdown = detailSearch.slice(0, 4).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 5. Search for hidden details and theories
      const theorySearch = await web.search(
        `${topic} hidden details secrets explained theory`
      );

      if (theorySearch.length > 0) {
        context.theories = theorySearch.slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 6. Identify lore angles
      context.angles = [
        'Core mechanics and rules',
        'Historical context within the world',
        'How the system evolved',
        'Notable examples and applications',
        'Hidden details and secrets',
        'Fan theories and interpretations',
        'Connections to broader themes',
      ];

    } catch (e) {
      traceLog('warn', 'LoreEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'lore-explained',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: `${parsed.series} ${parsed.loreTopic}`,
        videoQuery: `${topic} explained breakdown`,
        preferredSource: 'mal',
      },
    };
  }

  private parseLoreTopic(topic: string): { series: string; loreTopic: string } {
    // Try to extract "Series Name - Lore Topic" or "Lore Topic from Series"
    const dashMatch = topic.match(/(.+?)\s*[-:—]\s*(.+)/);
    if (dashMatch) {
      return {
        series: dashMatch[1]!.trim(),
        loreTopic: dashMatch[2]!.trim(),
      };
    }

    const fromMatch = topic.match(/(.+?)\s+(?:from|in|of)\s+(.+)/i);
    if (fromMatch) {
      return {
        loreTopic: fromMatch[1]!.trim(),
        series: fromMatch[2]!.trim(),
      };
    }

    // Fallback: try to extract series name from common patterns
    const words = topic.split(' ');
    return {
      series: words.slice(0, 2).join(' '),
      loreTopic: topic,
    };
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Lore explanation: ${topic} (${category})`,
    ];

    if (context['parsed']) {
      const parsed = context['parsed'] as Record<string, unknown>;
      parts.push(`\nSeries: ${parsed['series']}`);
      parts.push(`Lore topic: ${parsed['loreTopic']}`);
    }

    if (context['series']) {
      const series = context['series'] as Record<string, unknown>;
      if (series['genres'] && Array.isArray(series['genres'])) {
        parts.push(`\nGenres: ${series['genres'].join(', ')}`);
      }
    }

    if (context['loreExplanations']) {
      const expl = context['loreExplanations'] as Array<unknown>;
      parts.push(`\n${expl.length} lore explanation sources found`);
    }

    if (context['detailedBreakdown']) {
      const detail = context['detailedBreakdown'] as Array<unknown>;
      parts.push(`${detail.length} detailed breakdown articles`);
    }

    if (context['theories']) {
      const theories = context['theories'] as Array<unknown>;
      parts.push(`${theories.length} theory/analysis sources`);
    }

    parts.push('\nKey angles: mechanics, history, evolution, examples, secrets, theories');

    return parts.join('\n');
  }
}

const engine = new LoreEngine();
export default engine;
