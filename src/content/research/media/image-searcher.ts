import type { Env } from '../../../types/env';
import type { ImageCandidate } from './media-ranker';
import { buildCandidate } from './media-ranker';
import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch, safeFetchJson } from '../../../core/safe-fetch';
import { traceLog } from '../../../core/trace-logger';

/**
 * Strip low-res query params from known CDN URLs.
 * Ensures Discord embed receives the highest available resolution.
 */
function optimizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove CDN resize/crop params that downgrade resolution
    const removeParams = ['resize', 'fit', 'crop', 'thumb', 'w', 'h', 'width', 'height', 'quality', 'q', 'scale'];
    for (const param of removeParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
      }
    }
    return parsed.toString();
  } catch {
    return url; // URL parse failed, return as-is
  }
}

export async function searchImages(
  topic: string,
  specificQuery: string,
  category: string,
  budget: BudgetTracker,
  env: Env
): Promise<ImageCandidate[]> {
  const candidates: ImageCandidate[] = [];

  try {
    // 1. Jikan pictures (MAL official) and AniList artwork (only if anime/manga)
    if (category === 'anime' || category === 'manga') {
      const jikanImages = await fetchJikanPictures(topic, budget);
      candidates.push(...jikanImages);

      const anilistImages = await fetchAniListArtwork(topic, budget);
      candidates.push(...anilistImages);
    }

    // 3. Brave Search images (optional, if API key available)
    const combinedQuery = `${topic} ${specificQuery}`.trim();
    if (env.BRAVE_SEARCH_API_KEY) {
      const braveImages = await fetchBraveImages(combinedQuery, env.BRAVE_SEARCH_API_KEY, budget);
      candidates.push(...braveImages);
    }

    // 4. Google Images (optional, if API key available)
    if (env.GOOGLE_API_KEY && env.GOOGLE_CX) {
      const googleImages = await fetchGoogleImages(
        combinedQuery,
        env.GOOGLE_API_KEY,
        env.GOOGLE_CX,
        budget
      );
      candidates.push(...googleImages);
    }

    // 5. DuckDuckGo images (last resort, no API key needed)
    if (candidates.length < 5) {
      const ddgImages = await fetchDDGImages(combinedQuery, budget);
      candidates.push(...ddgImages);
    }

  } catch (e) {
    traceLog('warn', 'ImageSearcher', 'Image search failed', {
      error: (e as Error).message,
    });
  }

  // Filter to only direct image URLs with high-res indicators
  const validCandidates = candidates.filter(c => {
    const url = c.url.toLowerCase();
    const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)(\?.*)?$/) || 
                    url.includes('anilist.co/') ||
                    url.includes('myanimelist.net/');
    // Reject known low-res thumbnails
    const isThumbnail = url.includes('/thumb/') || 
                        url.includes('/thumbnail/') ||
                        url.includes('avatar') ||
                        url.includes('badge');
    return isImage && !isThumbnail;
  }).map(c => ({
    ...c,
    url: optimizeImageUrl(c.url), // Strip low-res query params
  }));

  // Fallback: if no valid images found, return placeholder
  if (validCandidates.length === 0 && candidates.length > 0) {
    // If we have candidates that don't match extension filter, return top ones anyway
    validCandidates.push(...candidates.slice(0, 3).map(c => ({
      ...c,
      url: optimizeImageUrl(c.url),
    })));
  }

  return validCandidates;
}

// Jikan Pictures API
async function fetchJikanPictures(
  query: string,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  try {
    budget.consume(1, 'Jikan:search');
    const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1&sfw=true`;
    const searchData = await safeFetchJson<{ data: Array<{ mal_id: number; title: string }> }>(
      searchUrl,
      { timeoutMs: 5000 },
      { data: [] }
    );

    if (searchData.data.length === 0) return [];

    const malId = searchData.data[0]!.mal_id;
    const title = searchData.data[0]!.title;

    budget.consume(1, 'Jikan:pictures');
    const picturesUrl = `https://api.jikan.moe/v4/anime/${malId}/pictures`;
    const picturesData = await safeFetchJson<{
      data: Array<{ jpg: { image_url: string; large_image_url: string } }>
    }>(picturesUrl, { timeoutMs: 5000 }, { data: [] });

    return picturesData.data.slice(0, 5).map(pic =>
      buildCandidate(pic.jpg.large_image_url || pic.jpg.image_url, 'mal', title, query)
    );
  } catch {
    return [];
  }
}

// AniList Artwork
async function fetchAniListArtwork(
  query: string,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  try {
    budget.consume(1, 'AniList:search');
    const gqlQuery = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji }
          coverImage { extraLarge large }
          bannerImage
        }
      }
    `;

    const res = await safeFetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gqlQuery, variables: { search: query } }),
      timeoutMs: 5000,
    });

    if (!res || !res.ok) return [];

    const data = await res.json() as {
      data?: {
        Media?: {
          title: { romaji: string };
          coverImage: { extraLarge: string; large: string };
          bannerImage?: string;
        }
      }
    };

    const media = data?.data?.Media;
    if (!media) return [];

    const candidates: ImageCandidate[] = [];
    if (media.coverImage?.extraLarge) {
      candidates.push(
        buildCandidate(media.coverImage.extraLarge, 'anilist', media.title.romaji, query)
      );
    }
    if (media.bannerImage) {
      candidates.push(buildCandidate(media.bannerImage, 'anilist', media.title.romaji, query));
    }

    return candidates;
  } catch {
    return [];
  }
}

// Brave Search Images
async function fetchBraveImages(
  query: string,
  apiKey: string,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  try {
    budget.consume(1, 'Brave:images');
    // Request large images only
    const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query + ' official art high resolution')}&count=5&img_size=large`;
    const res = await safeFetch(url, {
      headers: { 'X-Subscription-Token': apiKey },
      timeoutMs: 5000,
    });

    if (!res || !res.ok) return [];

    const data = await res.json() as {
      results?: Array<{ url: string; title: string; properties?: { url: string }; thumbnail?: { src: string } }>
    };

    return (data.results || []).slice(0, 5).map(img => {
      // Prefer properties.url (full res) over url field, never use thumbnail
      const bestUrl = img.properties?.url || img.url;
      return buildCandidate(bestUrl, 'brave', img.title, query);
    });
  } catch {
    return [];
  }
}

// Google Custom Search Images
async function fetchGoogleImages(
  query: string,
  apiKey: string,
  cx: string,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  try {
    budget.consume(1, 'Google:images');
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query + ' anime official art hd wallpaper')}&searchType=image&imgSize=large&num=5`;
    const data = await safeFetchJson<{ items?: Array<{ link: string; title: string }> }>(
      url,
      { timeoutMs: 5000 },
      {}
    );

    return (data.items || []).slice(0, 5).map(img =>
      buildCandidate(img.link, 'google', img.title, query)
    );
  } catch {
    return [];
  }
}

// DuckDuckGo Images (scraping-based, last resort)
async function fetchDDGImages(
  query: string,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  try {
    budget.consume(1, 'DDG:images');
    // Use DuckDuckGo's image proxy API (unofficial)
    const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query + ' anime hd wallpaper')}&l=us-en&p=1`;
    const res = await safeFetch(url, { timeoutMs: 5000 });

    if (!res || !res.ok) return [];

    const text = await res.text();
    // Parse JSON response (DDG returns JSONP-like format)
    const match = text.match(/\{"results":\[(.+?)\]\}/);
    if (!match) return [];

    const results = JSON.parse(`[${match[1]}]`) as Array<{ image: string; title: string }>;
    return results.slice(0, 3).map(img =>
      buildCandidate(img.image, 'ddg', img.title, query)
    );
  } catch {
    return [];
  }
}
