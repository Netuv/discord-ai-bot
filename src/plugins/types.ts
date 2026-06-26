import type { Env } from '../types/env';
import type { ContentCategory, ContentBrief, FinalContent } from '../content/types/content';
import type { BudgetTracker } from '../core/budget-tracker';
import type { ResearchBundle } from '../content/research/types';

export interface FormatWeightConfig {
  baseWeight: number;
  cooldownDays: number;
}

export interface FormatPlugin {
  id: string;
  name: string;
  version: string;
  // Research handler
  research(topic: string, category: ContentCategory, env: Env, budget: BudgetTracker): Promise<ResearchBundle>;
  // Prompt builder
  buildPrompt(brief: ContentBrief, research: ResearchBundle): string;
  // Weight config
  weightConfig: FormatWeightConfig;
}

export interface PlatformPlugin {
  id: string;
  name: string;
  version: string;
  // Format content untuk platform ini
  format(content: FinalContent, imageUrl?: string): Record<string, unknown>;
  // Composio action ID
  actionId: string;
  // Max character limit
  maxLength: number;
}

export interface SourcePlugin {
  id: string;
  name: string;
  version: string;
  // Search untuk topik tertentu
  search(query: string, budget: BudgetTracker): Promise<ResearchBundle>;
  // Kategori yang didukung
  supportedCategories: ContentCategory[];
}

export type AnyPlugin = FormatPlugin | PlatformPlugin | SourcePlugin;
