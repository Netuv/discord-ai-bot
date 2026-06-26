import type { Env } from '../../../types/env';
import type { ContentBrief } from '../../types/content';
import type { ImageCandidate } from './media-ranker';
import { BudgetTracker } from '../../../core/budget-tracker';
import { expandQuery } from './query-expander';
import { searchImages } from './image-searcher';
import { searchVideos } from './video-searcher';
import { validateImages } from './vision-validator';

export interface MediaPlan {
  imageQuery: string;
  videoQuery?: string;
  preferredSource?: 'mal' | 'anilist';
}

export interface MediaResult {
  images: ImageCandidate[];
  videos: Array<{ url: string; title: string }>;
  query: string;
}

export async function runMediaSearch(
  brief: ContentBrief,
  env: Env,
  budget: BudgetTracker
): Promise<MediaResult> {
  // 1. Query expansion
  const expansion = await expandQuery(brief.topic, brief.category, env);
  budget.consume(1, 'MediaEngine:queryExpand');

  // 2. Image search (multi-source)
  const imageCandidates = await searchImages(brief.topic, expansion.cleanQuery, brief.category, budget, env);

  // 3. AI Vision validation (top 3 parallel)
  const validatedImages = await validateImages(
    imageCandidates,
    expansion.cleanQuery,
    `${brief.format} article about ${brief.category}`,
    env,
    budget
  );

  // 4. Video search (optional)
  const videos = await searchVideos(brief.topic, expansion.cleanQuery, brief.category, budget, env);

  return {
    images: validatedImages,
    videos: videos.map((v) => ({ url: v.url, title: v.title })),
    query: expansion.cleanQuery,
  };
}
