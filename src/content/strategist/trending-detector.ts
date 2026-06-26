import type { Env } from '../../types/env';
import { safeFetchJson } from '../../core/safe-fetch';

interface MALItem {
  mal_id: number;
  title: string;
  score: number;
  members: number;
}

interface TrendingResult {
  topic: string;
  score: number;
  source: string;
}

export class TrendingDetector {
  constructor(private env: Env) {}

  async detect(): Promise<TrendingResult | null> {
    try {
      // Check Jikan top airing — quick trending signal
      const data = await safeFetchJson<{ data: MALItem[] }>(
        'https://api.jikan.moe/v4/top/anime?filter=airing&limit=5',
        { timeoutMs: 5000 },
        { data: [] }
      );

      if (data.data.length === 0) return null;

      const top = data.data[0];
      if (!top) return null;

      return {
        topic: top.title,
        score: top.score ?? 7.5,
        source: 'jikan-airing',
      };
    } catch {
      return null;
    }
  }
}
