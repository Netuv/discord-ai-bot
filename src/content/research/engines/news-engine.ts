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
 * Breaking News Research Engine
 * Focus: Recent announcements, updates, trending topics
 * Sources: Web search (news sites), Jikan basic info, seasonal data
 */
class NewsEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'NewsEngine', `Researching breaking news: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Get basic info from Jikan (if anime/manga)
      if (category === 'anime' || category === 'manga') {
        const searchResults = await jikan.searchAnime(topic);
        if (searchResults.length > 0) {
          const entry = searchResults[0]!;
          context.basic = {
            title: entry.title,
            score: entry.score,
            popularity: entry.popularity,
            synopsis: entry.synopsis?.slice(0, 200),
            aired: entry.aired,
            status: entry.status,
          };
          sources.push(`MyAnimeList (${entry.mal_id})`);
        }
      }

      // 2. Web search for recent news
      const newsQuery = category === 'anime' 
        ? `${topic} anime announcement news`
        : `${topic} ${category} news update`;
      
      const newsResults = await web.searchMultiple(newsQuery, [
        'animenewsnetwork.com',
        'crunchyroll.com',
        'myanimelist.net',
      ]);

      if (newsResults.length > 0) {
        context.news = newsResults.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...newsResults.slice(0, 3).map(r => r.url));
      }

      // 3. Check if currently airing/seasonal
      if (category === 'anime') {
        const seasonal = await jikan.getSeasonNow();
        const isCurrentSeason = seasonal.some(s => 
          s.title.toLowerCase().includes(topic.toLowerCase())
        );
        context.seasonal = { isCurrentSeason, seasonalCount: seasonal.length };
      }

    } catch (e) {
      traceLog('warn', 'NewsEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'breaking-news',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: topic,
        videoQuery: `${topic} ${category} trailer announcement`,
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
      `Breaking news about ${topic} (${category})`,
    ];

    if (context['basic']) {
      const basic = context['basic'] as Record<string, unknown>;
      parts.push(`- Title: ${basic['title']}`);
      parts.push(`- Status: ${basic['status']}`);
      if (basic['score']) parts.push(`- MAL Score: ${basic['score']}/10`);
    }

    if (context['news'] && Array.isArray(context['news'])) {
      parts.push(`\nRecent news (${context['news'].length} articles found):`);
      context['news'].slice(0, 3).forEach((item: unknown) => {
        const newsItem = item as Record<string, unknown>;
        parts.push(`- ${newsItem['title']}`);
      });
    }

    if (context['seasonal']) {
      const seasonal = context['seasonal'] as Record<string, unknown>;
      if (seasonal['isCurrentSeason']) {
        parts.push('\n⚡ Currently airing this season');
      }
    }

    return parts.join('\n');
  }
}

const engine = new NewsEngine();
export default engine;
