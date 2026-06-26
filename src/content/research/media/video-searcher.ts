import type { Env } from '../../../types/env';
import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetchJson } from '../../../core/safe-fetch';
import { traceLog } from '../../../core/trace-logger';

/**
 * YouTube video search using YouTube Data API v3
 */

export interface VideoCandidate {
  url: string;
  title: string;
  thumbnailUrl: string;
  duration?: string;
  viewCount?: number;
}

export async function searchVideos(
  topic: string,
  specificQuery: string,
  category: string,
  budget: BudgetTracker,
  env: Env
): Promise<VideoCandidate[]> {
  // Prefer dedicated YOUTUBE_API_KEY, fallback to GOOGLE_API_KEY (same key works for both)
  const apiKey = env.YOUTUBE_API_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    traceLog('debug', 'VideoSearcher', 'YouTube API key not configured, skipping video search');
    return [];
  }

  try {
    budget.consume(1, 'YouTube:search');

    const searchQuery = `${topic} ${specificQuery} ${category} trailer PV`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=3&key=${apiKey}`;

    const data = await safeFetchJson<{
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          thumbnails: {
            high?: { url: string };
            medium?: { url: string };
            default: { url: string };
          };
        };
      }>
    }>(url, { timeoutMs: 5000 }, {});

    if (!data.items || data.items.length === 0) return [];

    const videos: VideoCandidate[] = data.items.map(item => ({
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      title: item.snippet.title,
      thumbnailUrl:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default.url,
    }));

    // Optionally fetch video details (duration, view count) - costs 1 more quota
    // For now, return basic info only to save quota

    return videos;
  } catch (e) {
    traceLog('warn', 'VideoSearcher', 'YouTube search failed', {
      error: (e as Error).message,
    });
    return [];
  }
}
