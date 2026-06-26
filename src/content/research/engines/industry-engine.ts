import type { Env } from '../../../types/env';
import type { ContentBrief, ContentCategory } from '../../types/content';
import type { ResearchEngine, ResearchBundle } from '../types';
import { BudgetTracker } from '../../../core/budget-tracker';
import { D1Cache } from '../../../core/d1-cache';
import { D1Client } from '../../../core/d1';
import { WebSource } from '../sources/web-source';
import { traceLog } from '../../../core/trace-logger';

/**
 * Industry Insight Research Engine
 * Focus: Industry trends, business news, market analysis
 * Sources: ANN, industry news sites, business analysis
 */
class IndustryEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    traceLog('info', 'IndustryEngine', `Industry research: ${topic}`);

    const db = new D1Client(env);
    const cache = new D1Cache(db);
    const web = new WebSource(budget);

    let context: Record<string, unknown> = {};
    const sources: string[] = [];

    try {
      // 1. Search for industry news and trends
      const newsSearch = await web.searchMultiple(
        `${topic} ${category} industry news trend business`,
        ['animenewsnetwork.com', 'crunchyroll.com', 'variety.com']
      );

      if (newsSearch.length > 0) {
        context.news = newsSearch.slice(0, 6).map(r => ({
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        }));
        sources.push(...newsSearch.slice(0, 3).map(r => r.url));
      }

      // 2. Search for market analysis
      const marketSearch = await web.search(
        `${category} industry market analysis streaming revenue`
      );

      if (marketSearch.length > 0) {
        context.market = marketSearch.slice(0, 4).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 3. Search for production/studio news
      const productionSearch = await web.search(
        `${category} production studio announcement merger acquisition`
      );

      if (productionSearch.length > 0) {
        context.production = productionSearch.slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet,
        }));
      }

      // 4. Identify industry angles
      context.angles = this.identifyAngles(topic);

    } catch (e) {
      traceLog('warn', 'IndustryEngine', 'Research failed, using fallback', {
        error: (e as Error).message,
      });
    }

    const summary = this.synthesize(topic, category, context);

    return {
      topic,
      format: 'industry',
      category,
      summary,
      context,
      sources,
      mediaPlan: {
        imageQuery: `${category} industry`,
        videoQuery: `${topic} industry news`,
        preferredSource: 'mal',
      },
    };
  }

  private identifyAngles(topic: string): string[] {
    const angles: string[] = [
      'Current market trends',
      'Streaming and distribution shifts',
      'Production challenges and innovations',
      'International expansion',
      'Revenue and business models',
    ];

    // Add topic-specific angles
    if (topic.toLowerCase().includes('streaming')) {
      angles.push('Platform competition and exclusives');
    }
    if (topic.toLowerCase().includes('studio')) {
      angles.push('Studio economics and sustainability');
    }

    return angles;
  }

  private synthesize(
    topic: string,
    category: ContentCategory,
    context: Record<string, unknown>
  ): string {
    const parts: string[] = [
      `Industry insight: ${topic} (${category})`,
    ];

    if (context['news'] && Array.isArray(context['news'])) {
      parts.push(`\n${context['news'].length} industry news articles found`);
      const news = context['news'] as Array<Record<string, unknown>>;
      news.slice(0, 3).forEach((item, i) => {
        parts.push(`${i + 1}. ${item['title']}`);
      });
    }

    if (context['market']) {
      const market = context['market'] as Array<unknown>;
      parts.push(`\n${market.length} market analysis sources`);
    }

    if (context['production']) {
      const prod = context['production'] as Array<unknown>;
      parts.push(`${prod.length} production news sources`);
    }

    if (context['angles'] && Array.isArray(context['angles'])) {
      parts.push(`\nIndustry angles (${context['angles'].length}):`);
      context['angles'].forEach((angle: unknown) => {
        parts.push(`- ${angle}`);
      });
    }

    return parts.join('\n');
  }
}

const engine = new IndustryEngine();
export default engine;
