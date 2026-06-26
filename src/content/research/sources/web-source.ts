import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch } from '../../../core/safe-fetch';

// WebScout: free web search engine, no API key needed
const WEBSCOUT_BASE = 'https://ddg-api.herokuapp.com/search';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSource {
  constructor(private budget: BudgetTracker) {}

  async search(query: string, site?: string): Promise<WebSearchResult[]> {
    const q = site ? `site:${site} ${query}` : query;
    this.budget.consume(1, `WebSource:${site ?? 'general'}`);

    const res = await safeFetch(
      `${WEBSCOUT_BASE}?query=${encodeURIComponent(q)}&max_results=5`,
      { timeoutMs: 6000 }
    );

    if (!res || !res.ok) return [];

    try {
      const data = await res.json() as WebSearchResult[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async searchMultiple(query: string, sites: string[]): Promise<WebSearchResult[]> {
    const results = await Promise.allSettled(
      sites.map(s => this.search(query, s))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<WebSearchResult[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
