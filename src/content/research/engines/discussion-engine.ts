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
 * Discussion Research Engine
 * Focus: Controversial topics, unpopular opinions, debates
 * Sources: Reddit discussions, forum debates, community polls
 */
class DiscussionEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    _brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'DiscussionEngine', `Discussion research: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const jikan = new JikanSource(env, cache, budget);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Get base entry info if specific title mentioned
      if (!topic.toLowerCase().includes('unpopular') && !topic.toLowerCase().includes('controversial')) {
        if (category === 'anime' || category === 'manga') {
          const searchResults = await jikan.searchAnime(topic);
          if (searchResults.length > 0) {
            const entry = searchResults[0]!;
            context.entry = {
              title: entry.title,
              score: entry.score,
              scored_by: entry.scored_by,
              popularity: entry.popularity,
              synopsis: entry.synopsis?.slice(0, 200),
            };
            sources.push(`MyAnimeList (${entry.mal_id})`);
          }
        }
      }

      // 2. Search for discussion threads
      const discussionSearch = await web.searchMultiple(
        `${topic} ${category} discussion opinion debate unpopular`,
        ['reddit.com', 'myanimelist.net', 'quora.com']
      );

      if (discussionSearch.length > 0) {
        context.discussions = discussionSearch.slice(0, 8).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...discussionSearch.slice(0, 3).map(r => r.url));
      }

      // 3. Search for controversial opinions
      const controversySearch = await web.search(
        `${topic} controversial unpopular opinion hot take`
      );

      if (controversySearch.length > 0) {
        context.controversy = controversySearch.slice(0, 5).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 4. Identify discussion angles
      context.angles = [
        'Common criticisms and defenses',
        'Divisive aspects and why',
        'Community split perspectives',
        'Unpopular opinions worth considering',
        'Where the debate misses the point',
        'Finding common ground',
      ];

    } catch (e) {
      traceLog('warn', 'DiscussionEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'discussion',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: context['entry'] 
          ? (context['entry'] as Record<string, unknown>)['title'] as string
          : topic,
        videoQuery: `${topic} discussion debate`,
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
      `Discussion topic: ${topic} (${category})`,
    ];

    if (context['entry']) {
      const entry = context['entry'] as Record<string, unknown>;
      parts.push(`\nSubject: ${entry['title']}`);
      parts.push(`MAL Score: ${entry['score']}/10 (${entry['scored_by']} users)`);
    }

    if (context['discussions'] && Array.isArray(context['discussions'])) {
      parts.push(`\n${context['discussions'].length} discussion threads found`);
    }

    if (context['controversy']) {
      const contro = context['controversy'] as Array<unknown>;
      parts.push(`${contro.length} controversial opinion sources`);
    }

    if (context['angles'] && Array.isArray(context['angles'])) {
      parts.push(`\nDiscussion angles: ${context['angles'].length}`);
    }

    return parts.join('\n');
  }
}

const engine = new DiscussionEngine();
export default engine;
