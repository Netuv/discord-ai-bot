import type { Env } from '../../../types/env';
import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch } from '../../../core/safe-fetch';

const OLLAMA_WEB_SEARCH_URL = 'https://ollama.com/api/web_search';

export interface OllamaSearchResult {
  title: string;
  url: string;
  content: string;
}

/**
 * Ollama Web Search — free web search with API key, returns rich content snippets.
 * POST /api/web_search with Bearer token auth.
 */
export class OllamaSource {
  constructor(
    private env: Env,
    private budget: BudgetTracker
  ) {}

  async search(query: string): Promise<OllamaSearchResult[]> {
    const apiKey = this.env.OLLAMA_WEB_SEARCH_KEY;
    if (!apiKey) {
      console.warn('OllamaSource: OLLAMA_WEB_SEARCH_KEY not set');
      return [];
    }

    this.budget.consume(1, 'OllamaSource');

    const res = await safeFetch(OLLAMA_WEB_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query }),
      timeoutMs: 10_000,
    });

    if (!res || !res.ok) {
      console.warn('OllamaSource: fetch failed', res?.status);
      return [];
    }

    try {
      const data = (await res.json()) as { results: OllamaSearchResult[] };
      if (data?.results && Array.isArray(data.results)) {
        return data.results;
      }
    } catch {
      // fallthrough
    }

    return [];
  }

  /**
   * Search multiple queries in parallel, flatten results
   */
  async searchMultiple(queries: string[]): Promise<OllamaSearchResult[]> {
    const results = await Promise.allSettled(
      queries.map((q) => this.search(q))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<OllamaSearchResult[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value);
  }

  /**
   * Verify specific claims or facts by searching exact phrases
   */
  async verifyClaim(claim: string): Promise<{ verified: boolean; source?: OllamaSearchResult; confidence: 'high' | 'medium' | 'low' }> {
    const results = await this.search(claim);
    if (results.length === 0) {
      return { verified: false, confidence: 'low' };
    }

    // Check if any result content directly supports the claim
    const claimLower = claim.toLowerCase();
    for (const result of results) {
      const contentLower = result.content.toLowerCase();
      if (contentLower.includes(claimLower) && contentLower.length > 100) {
        return { verified: true, source: result, confidence: 'high' };
      }
    }

    // Partial match — topic mentioned but claim not directly confirmed
    const firstResult = results[0]!;
    return { verified: false, source: firstResult, confidence: 'medium' };
  }

  /**
   * Fetch current/recent news about a topic (for freshness audit)
   */
  async checkRecency(topic: string): Promise<{ isRecent: boolean; evidence: string; dateRef?: string }> {
    const results = await this.search(`"${topic}" 2026`);
    if (results.length === 0) {
      return { isRecent: false, evidence: 'No search results found' };
    }

    const allContent = results.map((r) => r.content).join(' ');
    const has2026 = /\b2026\b/.test(allContent);
    const hasRecentKeywords = /\b(?:June|July|Summer|Spring|new|latest|release|upcoming)\b/i.test(allContent);

    const firstResult = results[0]!;
    return {
      isRecent: has2026 || hasRecentKeywords,
      evidence: firstResult.content.slice(0, 300),
      ...(has2026 ? { dateRef: '2026' as const } : {}),
    };
  }
}