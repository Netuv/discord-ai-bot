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
 * Character Spotlight Research Engine (NEW)
 * Focus: Deep dive into one character - backstory, development, symbolism
 * Sources: Fandom wikis, character analysis, MAL character data
 */
class CharacterEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'CharacterEngine', `Character spotlight: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Parse character name and series
      const parsed = this.parseCharacterQuery(topic);
      context.parsed = parsed;

      // 2. Get series info first
      if (category === 'anime' || category === 'manga') {
        const seriesResults = await jikan.searchAnime(parsed.series);
        if (seriesResults.length > 0) {
          const series = seriesResults[0]!;
          context.series = {
            title: series.title,
            mal_id: series.mal_id,
            synopsis: series.synopsis?.slice(0, 200),
            score: series.score,
          };
          sources.push(`MyAnimeList series (${series.mal_id})`);
        }
      }

      // 3. Search for character-specific content
      const characterSearch = await web.searchMultiple(
        `${parsed.character} ${parsed.series} character analysis personality`,
        ['reddit.com', 'fandom.com', 'myanimelist.net']
      );

      if (characterSearch.length > 0) {
        context.characterInfo = characterSearch.slice(0, 6).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...characterSearch.slice(0, 3).map(r => r.url));
      }

      // 4. Search for character development/arc discussion
      const arcSearch = await web.search(
        `${parsed.character} ${parsed.series} character development arc backstory`
      );

      if (arcSearch.length > 0) {
        context.development = arcSearch.slice(0, 4).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 5. Search for fan discussions and analysis
      const fandomSearch = await web.search(
        `${parsed.character} ${parsed.series} symbolism meaning analysis`
      );

      if (fandomSearch.length > 0) {
        context.symbolism = fandomSearch.slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 6. Identify spotlight angles
      context.angles = [
        'Character backstory and origins',
        'Personality traits and motivations',
        'Character development through series',
        'Relationships with other characters',
        'Symbolism and deeper meaning',
        'Impact on story and themes',
        'Fan reception and legacy',
      ];

    } catch (e) {
      traceLog('warn', 'CharacterEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'character-spotlight',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: `${context['parsed'] ? (context['parsed'] as Record<string, unknown>)['character'] : topic} character`,
        videoQuery: `${topic} character moments compilation`,
        preferredSource: 'mal',
      },
    };
  }

  private parseCharacterQuery(topic: string): { character: string; series: string } {
    // Try to extract "Character Name from Series"
    const fromMatch = topic.match(/(.+?)\s+(?:from|in|of|\-)\s+(.+)/i);
    if (fromMatch) {
      return {
        character: fromMatch[1]!.trim(),
        series: fromMatch[2]!.trim(),
      };
    }

    // Fallback: use full topic as character name
    return {
      character: topic,
      series: topic.split(' ')[0] || topic,
    };
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Character spotlight: ${topic} (${category})`,
    ];

    if (context['parsed']) {
      const parsed = context['parsed'] as Record<string, unknown>;
      parts.push(`\nCharacter: ${parsed['character']}`);
      parts.push(`Series: ${parsed['series']}`);
    }

    if (context['series']) {
      const series = context['series'] as Record<string, unknown>;
      parts.push(`\nSeries MAL Score: ${series['score']}/10`);
    }

    if (context['characterInfo']) {
      const info = context['characterInfo'] as Array<unknown>;
      parts.push(`\n${info.length} character analysis sources found`);
    }

    if (context['development']) {
      const dev = context['development'] as Array<unknown>;
      parts.push(`${dev.length} character development articles`);
    }

    if (context['symbolism']) {
      const sym = context['symbolism'] as Array<unknown>;
      parts.push(`${sym.length} symbolism analysis sources`);
    }

    parts.push('\nKey angles: backstory, personality, development, relationships, symbolism, legacy');

    return parts.join('\n');
  }
}

const engine = new CharacterEngine();
export default engine;
