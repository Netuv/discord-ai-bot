import type { Env } from '../../../types/env';
import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch } from '../../../core/safe-fetch';

const TAVILY_API_URL = 'https://api.tavily.com/search';

export interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

/**
 * Tavily Search API — 3rd layer fallback research source.
 * Free tier: 1000 req/month. High-quality, AI-optimized search results.
 *
 * Used as tertiary source when Ollama + WebScout fail to return enough context.
 */
export class TavilySource {
  constructor(
    private env: Env,
    private budget: BudgetTracker
  ) {}

  async search(
    query: string,
    opts?: { depth?: 'basic' | 'advanced'; maxResults?: number }
  ): Promise<TavilySearchResult[]> {
    const apiKey = this.env.TAVILY_API_KEY;
    if (!apiKey) {
      console.warn('TavilySource: TAVILY_API_KEY not set');
      return [];
    }

    this.budget.consume(1, 'TavilySource');

    const res = await safeFetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: opts?.depth ?? 'basic',
        max_results: opts?.maxResults ?? 5,
      }),
      timeoutMs: 10_000,
    });

    if (!res || !res.ok) {
      console.warn('TavilySource: fetch failed', res?.status);
      return [];
    }

    try {
      const data = (await res.json()) as {
        results: TavilySearchResult[];
        response_time: number;
      };
      if (data?.results && Array.isArray(data.results)) {
        return data.results;
      }
    } catch {
      // fallthrough
    }

    return [];
  }

  /**
   * Deep search with full raw content (advanced depth)
   */
  async searchDeep(query: string): Promise<TavilySearchResult[]> {
    return this.search(query, { depth: 'advanced', maxResults: 3 });
  }

  /**
   * Search across multiple queries, flatten & deduplicate by URL
   */
  async searchMultiple(queries: string[]): Promise<TavilySearchResult[]> {
    const seen = new Set<string>();
    const results = await Promise.allSettled(
      queries.map((q) => this.search(q))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<TavilySearchResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .filter((r) => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
  }
}