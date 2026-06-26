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
 * Deep Dive Research Engine
 * Focus: In-depth analysis, themes, symbolism, production details
 * Sources: Analysis blogs, Wikipedia, detailed reviews, MAL
 */
class DeepDiveEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'DeepDiveEngine', `Deep dive research: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Get comprehensive entry data
      if (category === 'anime' || category === 'manga') {
        const searchResults = await jikan.searchAnime(topic);
        if (searchResults.length > 0) {
          const entry = searchResults[0]!;
          context.entry = {
            title: entry.title,
            titleEnglish: entry.title_english,
            titleJapanese: entry.title_japanese,
            type: entry.type,
            episodes: entry.episodes,
            status: entry.status,
            aired: entry.aired,
            score: entry.score,
            scored_by: entry.scored_by,
            rank: entry.rank,
            popularity: entry.popularity,
            synopsis: entry.synopsis,
            background: entry.background,
            genres: entry.genres?.map(g => g.name) || [],
            themes: entry.themes?.map(t => t.name) || [],
            demographics: entry.demographics?.map(d => d.name) || [],
            studios: entry.studios?.map(s => s.name) || [],
            producers: entry.producers?.map(p => p.name) || [],
          };
          sources.push(`MyAnimeList (${entry.mal_id})`);

          // Get reviews for deeper insight
          if (entry.mal_id) {
            const reviews = await jikan.getAnimeReviews(entry.mal_id);
            if (reviews.length > 0) {
              context.reviews = reviews.slice(0, 5).map(r => ({
                score: r.score,
                review: r.review?.slice(0, 500),
                tags: r.tags || [],
              }));
            }
          }
        }
      }

      // 2. Search for analysis content
      const analysisResults = await web.searchMultiple(
        `${topic} ${category} analysis themes symbolism`,
        ['reddit.com', 'medium.com', 'animenewsnetwork.com']
      );

      if (analysisResults.length > 0) {
        context.analysis = analysisResults.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...analysisResults.slice(0, 3).map(r => r.url));
      }

      // 3. Search for production/behind-the-scenes info
      const productionResults = await web.search(
        `${topic} ${category} production staff director animation`,
      );

      if (productionResults.length > 0) {
        context.production = productionResults.slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 4. Identify deep dive angles
      context.angles = this.identifyAngles(context);

    } catch (e) {
      traceLog('warn', 'DeepDiveEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'deep-dive',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: topic,
        videoQuery: `${topic} ${category} analysis breakdown`,
        preferredSource: 'mal',
      },
    };
  }

  private identifyAngles(context: Record<string, unknown>): string[] {
    const angles: string[] = [];

    if (context['entry']) {
      const entry = context['entry'] as Record<string, unknown>;
      
      // Theme analysis
      if (entry['themes'] && Array.isArray(entry['themes']) && entry['themes'].length > 0) {
        angles.push(`Theme exploration: ${entry['themes'].slice(0, 3).join(', ')}`);
      }

      // Production quality
      if (entry['studios'] && Array.isArray(entry['studios'])) {
        angles.push('Production quality and studio analysis');
      }

      // Character development
      angles.push('Character development and arcs');

      // Narrative structure
      angles.push('Narrative structure and storytelling');
    }

    // Critical reception
    if (context['reviews']) {
      angles.push('Critical reception and community discourse');
    }

    return angles;
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Deep dive analysis: ${topic} (${category})`,
    ];

    if (context['entry']) {
      const entry = context['entry'] as Record<string, unknown>;
      parts.push(`\nTitle: ${entry['title']}`);
      parts.push(`Type: ${entry['type']}, Episodes: ${entry['episodes']}`);
      parts.push(`MAL Score: ${entry['score']}/10 (${entry['scored_by']} users)`);
      parts.push(`Rank: #${entry['rank']}, Popularity: #${entry['popularity']}`);
      
      if (entry['genres'] && Array.isArray(entry['genres'])) {
        parts.push(`\nGenres: ${entry['genres'].join(', ')}`);
      }
      if (entry['themes'] && Array.isArray(entry['themes'])) {
        parts.push(`Themes: ${entry['themes'].join(', ')}`);
      }
      if (entry['studios'] && Array.isArray(entry['studios'])) {
        parts.push(`Studios: ${entry['studios'].join(', ')}`);
      }
    }

    if (context['angles'] && Array.isArray(context['angles'])) {
      parts.push(`\nAnalysis angles (${context['angles'].length}):`);
      context['angles'].forEach((angle: unknown) => {
        parts.push(`- ${angle}`);
      });
    }

    if (context['reviews']) {
      const reviews = context['reviews'] as Array<Record<string, unknown>>;
      parts.push(`\n${reviews.length} detailed reviews analyzed`);
    }

    if (context['analysis']) {
      const analysis = context['analysis'] as Array<unknown>;
      parts.push(`${analysis.length} analysis articles found`);
    }

    return parts.join('\n');
  }
}

const engine = new DeepDiveEngine();
export default engine;
