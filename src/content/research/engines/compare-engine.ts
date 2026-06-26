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
 * Comparison Research Engine
 * Focus: Side-by-side comparison between two titles
 * Sources: MAL data for both, comparison articles, community debates
 */
class CompareEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'CompareEngine', `Comparison research: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    // 1. Parse comparison topic (e.g., "Attack on Titan vs Fullmetal Alchemist")
    const parsed = this.parseComparisonTopic(topic);
    context.parsed = parsed;

    try {
      // 2. Get data for both entries (parallel)
      if (category === 'anime' || category === 'manga') {
        const [resultsA, resultsB] = await Promise.all([
          jikan.searchAnime(parsed.titleA),
          jikan.searchAnime(parsed.titleB),
        ]);

        if (resultsA.length > 0) {
          const entryA = resultsA[0]!;
          context.entryA = {
            title: entryA.title,
            score: entryA.score,
            popularity: entryA.popularity,
            rank: entryA.rank,
            synopsis: entryA.synopsis?.slice(0, 200),
            genres: entryA.genres?.map(g => g.name) || [],
            themes: entryA.themes?.map(t => t.name) || [],
            studios: entryA.studios?.map(s => s.name) || [],
            episodes: entryA.episodes,
          };
          sources.push(`MAL (${entryA.mal_id}): ${entryA.title}`);
        }

        if (resultsB.length > 0) {
          const entryB = resultsB[0]!;
          context.entryB = {
            title: entryB.title,
            score: entryB.score,
            popularity: entryB.popularity,
            rank: entryB.rank,
            synopsis: entryB.synopsis?.slice(0, 200),
            genres: entryB.genres?.map(g => g.name) || [],
            themes: entryB.themes?.map(t => t.name) || [],
            studios: entryB.studios?.map(s => s.name) || [],
            episodes: entryB.episodes,
          };
          sources.push(`MAL (${entryB.mal_id}): ${entryB.title}`);
        }
      }

      // 3. Search for comparison articles
      const comparisonSearch = await web.searchMultiple(
        `${parsed.titleA} vs ${parsed.titleB} comparison which is better`,
        ['reddit.com', 'myanimelist.net', 'quora.com']
      );

      if (comparisonSearch.length > 0) {
        context.comparisons = comparisonSearch.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...comparisonSearch.slice(0, 2).map(r => r.url));
      }

      // 4. Identify comparison dimensions
      context.dimensions = this.identifyDimensions(context);

    } catch (e) {
      traceLog('warn', 'CompareEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'comparison',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: parsed.titleA,
        videoQuery: `${parsed.titleA} vs ${parsed.titleB}`,
        preferredSource: 'mal',
      },
    };
  }

  private parseComparisonTopic(topic: string): { titleA: string; titleB: string } {
    // Try to extract "Title A vs Title B" or "Title A or Title B"
    const vsMatch = topic.match(/(.+?)\s+(?:vs\.?|versus|or)\s+(.+)/i);
    if (vsMatch) {
      return {
        titleA: vsMatch[1]!.trim(),
        titleB: vsMatch[2]!.trim(),
      };
    }

    // Fallback: split by common separators
    const parts = topic.split(/[,&]/);
    if (parts.length >= 2) {
      return {
        titleA: parts[0]!.trim(),
        titleB: parts[1]!.trim(),
      };
    }

    // Last resort: just use the topic as both
    return {
      titleA: topic,
      titleB: topic,
    };
  }

  private identifyDimensions(context: Record<string, unknown>): string[] {
    const dimensions: string[] = [
      'Story and plot structure',
      'Character development',
      'Animation/art quality',
      'Pacing and execution',
      'Themes and messages',
      'Emotional impact',
    ];

    // Add score comparison if both entries exist
    if (context['entryA'] && context['entryB']) {
      dimensions.push('Critical reception and ratings');
    }

    return dimensions;
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Comparison analysis: ${topic} (${category})`,
    ];

    if (context['parsed']) {
      const parsed = context['parsed'] as Record<string, unknown>;
      parts.push(`\nComparing: ${parsed['titleA']} vs ${parsed['titleB']}`);
    }

    if (context['entryA'] && context['entryB']) {
      const a = context['entryA'] as Record<string, unknown>;
      const b = context['entryB'] as Record<string, unknown>;
      parts.push(`\n${a['title']}: Score ${a['score']}/10, Rank #${a['rank']}`);
      parts.push(`${b['title']}: Score ${b['score']}/10, Rank #${b['rank']}`);
    }

    if (context['dimensions'] && Array.isArray(context['dimensions'])) {
      parts.push(`\nComparison dimensions (${context['dimensions'].length}):`);
      context['dimensions'].forEach((dim: unknown) => {
        parts.push(`- ${dim}`);
      });
    }

    if (context['comparisons']) {
      const comps = context['comparisons'] as Array<unknown>;
      parts.push(`\n${comps.length} comparison articles/discussions found`);
    }

    return parts.join('\n');
  }
}

const engine = new CompareEngine();
export default engine;
