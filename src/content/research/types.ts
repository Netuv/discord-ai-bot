import type { ContentCategory, ContentBrief } from '../types/content';
import type { Env } from '../../types/env';
import { BudgetTracker } from '../../core/budget-tracker';

export interface ResearchEngine {
  execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle>;
}

export interface ResearchBundle {
  topic: string;
  format: string;
  category: ContentCategory;
  summary: string;
  context: Record<string, unknown>;
  sources: string[];
  mediaPlan?: MediaPlan;
}

export interface MediaPlan {
  imageQuery: string;
  videoQuery?: string;
  preferredSource?: 'mal' | 'anilist';
}
