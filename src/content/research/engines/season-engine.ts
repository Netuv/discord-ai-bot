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
 * Season Preview Research Engine
 * Focus: Upcoming seasonal anime highlights and what to watch
 * Sources: Jikan seasonal API, AniList, web previews
 */
class SeasonEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'SeasonEngine', `Season preview: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Get current season anime list
      if (category === 'anime') {
        const seasonalAnime = await jikan.getSeasonNow();
        
        if (seasonalAnime.length > 0) {
          // Sort by popularity and score
          const sorted = seasonalAnime
            .filter(a => a.score && a.score > 6.5)
            .sort((a, b) => (b.score || 0) - (a.score || 0));

          context.seasonal = sorted.slice(0, 15).map(anime => ({
            title: anime.title,
            score: anime.score,
            popularity: anime.popularity,
            synopsis: anime.synopsis?.slice(0, 150),
            genres: anime.genres?.map(g => g.name) || [],
            studios: anime.studios?.map(s => s.name) || [],
            episodes: anime.episodes,
            type: anime.type,
          }));

          context.totalCount = seasonalAnime.length;
          sources.push('MyAnimeList Seasonal API');
        }
      }

      // 2. Search for season preview articles
      const previewSearch = await web.searchMultiple(
        `anime season preview ${new Date().getFullYear()} must watch`,
        ['myanimelist.net', 'crunchyroll.com', 'animenewsnetwork.com']
      );

      if (previewSearch.length > 0) {
        context.previews = previewSearch.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...previewSearch.slice(0, 2).map(r => r.url));
      }

      // 3. Identify top picks by genre
      if (context['seasonal'] && Array.isArray(context['seasonal'])) {
        const seasonal = context['seasonal'] as Array<Record<string, unknown>>;
        const genreMap = new Map<string, Array<Record<string, unknown>>>();

        seasonal.forEach(anime => {
          const genres = anime['genres'] as string[];
          genres.forEach(genre => {
            if (!genreMap.has(genre)) genreMap.set(genre, []);
            genreMap.get(genre)!.push(anime);
          });
        });

        // Get top 3 genres by anime count
        const topGenres = Array.from(genreMap.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 3);

        context.topGenres = topGenres.map(([genre, animes]) => ({
          genre,
          count: animes.length,
          topPick: animes[0]!['title'],
        }));
      }

    } catch (e) {
      traceLog('warn', 'SeasonEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'season-preview',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: 'anime season poster',
        videoQuery: `${new Date().getFullYear()} anime season preview`,
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
      `Season preview: ${topic} (${category})`,
    ];

    if (context['totalCount']) {
      parts.push(`\n${context['totalCount']} anime airing this season`);
    }

    if (context['seasonal'] && Array.isArray(context['seasonal'])) {
      const seasonal = context['seasonal'] as Array<Record<string, unknown>>;
      parts.push(`\nTop ${seasonal.length} highlighted:`);
      seasonal.slice(0, 5).forEach((anime, i) => {
        parts.push(`${i + 1}. ${anime['title']} (Score: ${anime['score']}/10)`);
      });
    }

    if (context['topGenres'] && Array.isArray(context['topGenres'])) {
      parts.push('\nTop genres this season:');
      (context['topGenres'] as Array<Record<string, unknown>>).forEach(g => {
        parts.push(`- ${g['genre']}: ${g['count']} shows (pick: ${g['topPick']})`);
      });
    }

    if (context['previews']) {
      const previews = context['previews'] as Array<unknown>;
      parts.push(`\n${previews.length} season preview articles found`);
    }

    return parts.join('\n');
  }
}

const engine = new SeasonEngine();
export default engine;
