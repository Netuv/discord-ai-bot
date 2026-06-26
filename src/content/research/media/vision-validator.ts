import type { Env } from '../../../types/env';
import type { ImageCandidate, ImageSource, FocalPoint } from './media-ranker';
import { scoreCandidate } from './media-ranker';
import { BudgetTracker } from '../../../core/budget-tracker';
import { callAiWithRouter } from '../../../ai/model-router';

const VISION_TTL: Record<ImageSource, number> = {
  mal: 86400,
  anilist: 86400,
  kitsu: 43200,
  brave: 3600,
  google: 3600,
  ddg: 1800,
};

export async function validateImages(
  candidates: ImageCandidate[],
  cleanQuery: string,
  contextDescription: string,
  env: Env,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  // Take top 3 by pre-vision score
  const top3 = candidates
    .filter((c) => c.titleScore >= 30)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    .slice(0, 3);

  if (top3.length === 0) return candidates.slice(0, 1);

  budget.consume(top3.length, 'VisionValidator');

  // Run AI Vision PARALLEL
  const validated = await Promise.allSettled(
    top3.map(async (candidate) => {
      // Check KV cache
      const cacheKey = `vision:${candidate.url.slice(-50)}`;
      const cached = await env.BOT_KV.get(cacheKey, 'json');

      if (cached) {
        const { score, focalPoint } = cached as { score: number; focalPoint: FocalPoint };
        return { ...candidate, aiScore: score, focalPoint };
      }

      const { score, focalPoint } = await runVisionCheck(
        candidate.url,
        cleanQuery,
        contextDescription,
        env
      );

      const ttl = VISION_TTL[candidate.source];
      await env.BOT_KV.put(cacheKey, JSON.stringify({ score, focalPoint }), {
        expirationTtl: ttl,
      });

      return { ...candidate, aiScore: score, focalPoint };
    })
  );

  const results = validated
    .filter((r) => r.status === 'fulfilled')
    .map((r) => {
      const candidate = (r as PromiseFulfilledResult<ImageCandidate>).value;
      return { ...candidate, finalScore: scoreCandidate(candidate) };
    })
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));

  // If vision validation passed for at least one candidate, return sorted results
  if (results.length > 0) return results;

  // All vision checks failed — fallback: pick best by source+title score only
  const fallback = candidates
    .filter((c) => c.titleScore >= 20)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    .slice(0, 1);

  return fallback.length > 0 ? fallback : candidates.slice(0, 1);
}

async function runVisionCheck(
  imageUrl: string,
  query: string,
  context: string,
  env: Env
): Promise<{ score: number; focalPoint: FocalPoint }> {
  try {
    const prompt = `Analyze this image for use as a header in an anime/manga/game article about "${query}".

Rate 1-10 based on:
1. Is it clearly anime/manga/game art style? (NOT live action, meme, or screenshot of text)
2. Does it visually represent "${query}"? (character, scene, or official art)
3. Is image quality acceptable? (no watermark >30%, not blurry, not NSFW)
4. Context match: "${context}"

Respond with EXACTLY TWO lines:
Line 1: Single number 1-10
Line 2: Focal point - one of: center top bottom left right top-left top-right bottom-left bottom-right`;

  const raw = await callAiWithRouter(
    'vision',
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    env
  );

  return parseVisionResponse(raw);
  } catch {
    // Vision AI failed (model incompatibility, timeout, etc)
    // Return neutral score — the candidate will still be evaluated by title+source score
    return { score: 5, focalPoint: 'center' };
  }
}

function parseVisionResponse(raw: string): { score: number; focalPoint: FocalPoint } {
  const lines = raw.trim().split('\n').map((l) => l.trim());
  const score = parseInt(lines[0] ?? '', 10);
  const validPoints: FocalPoint[] = [
    'center',
    'top',
    'bottom',
    'left',
    'right',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];
  const focalPoint = validPoints.includes(lines[1] as FocalPoint)
    ? (lines[1] as FocalPoint)
    : 'center';
  return {
    score: isNaN(score) ? 5 : Math.max(1, Math.min(10, score)),
    focalPoint,
  };
}
