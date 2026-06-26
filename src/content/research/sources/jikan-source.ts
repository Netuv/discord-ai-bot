import type { Env } from '../../../types/env';
import { BudgetTracker } from '../../../core/budget-tracker';
import { D1Cache } from '../../../core/d1-cache';
import { safeFetchJson } from '../../../core/safe-fetch';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  type?: string;
  episodes?: number;
  status?: string;
  aired?: {
    from?: string;
    to?: string;
  };
  score?: number;
  scored_by?: number;
  rank?: number;
  popularity?: number;
  synopsis?: string;
  background?: string;
  year?: number;
  genres?: Array<{ mal_id: number; name: string }>;
  themes?: Array<{ mal_id: number; name: string }>;
  demographics?: Array<{ mal_id: number; name: string }>;
  studios?: Array<{ mal_id: number; name: string }>;
  producers?: Array<{ mal_id: number; name: string }>;
}

export interface JikanReview {
  mal_id: number;
  url: string;
  type: string;
  score: number;
  review?: string;
  tags?: string[];
}

export class JikanSource {
  constructor(
    private env: Env,
    private cache: D1Cache,
    private budget: BudgetTracker
  ) {}

  async searchAnime(query: string): Promise<JikanAnime[]> {
    const cacheKey = `jikan:search:${query.slice(0, 50)}`;
    const cached = await this.cache.get<JikanAnime[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:search');
    const data = await safeFetchJson<{ data: JikanAnime[] }>(
      `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 3600, 'jikan');
    return data.data;
  }

  async getAnimeReviews(malId: number): Promise<JikanReview[]> {
    const cacheKey = `jikan:reviews:${malId}`;
    const cached = await this.cache.get<JikanReview[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:reviews');
    const data = await safeFetchJson<{ data: JikanReview[] }>(
      `${JIKAN_BASE}/anime/${malId}/reviews?limit=10`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 7200, 'jikan');
    return data.data;
  }

  async getSeasonNow(): Promise<JikanAnime[]> {
    const cacheKey = 'jikan:season:now';
    const cached = await this.cache.get<JikanAnime[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:season');
    const data = await safeFetchJson<{ data: JikanAnime[] }>(
      `${JIKAN_BASE}/seasons/now?limit=25`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 3600, 'jikan');
    return data.data;
  }
}
