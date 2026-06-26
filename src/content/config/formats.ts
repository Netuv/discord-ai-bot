import type { ContentCategory, ContentFormat } from '../types/content';

export interface FormatWeightConfig {
  baseWeight: number;
  trendingBoost: number;
  cooldownDays: number;
  weekendMultiplier: number;
  seasonalMultiplier: number;
  minIntervalHours: number;
}

export const FORMAT_WEIGHTS: Record<ContentFormat, FormatWeightConfig> = {
  'breaking-news':       { baseWeight: 15, trendingBoost: 150, cooldownDays: 1,  weekendMultiplier: 0.5, seasonalMultiplier: 1.0, minIntervalHours: 6 },
  'review':              { baseWeight: 25, trendingBoost: 50,  cooldownDays: 2,  weekendMultiplier: 1.2, seasonalMultiplier: 1.0, minIntervalHours: 12 },
  'recommendation':      { baseWeight: 20, trendingBoost: 30,  cooldownDays: 2,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 12 },
  'deep-dive':           { baseWeight: 10, trendingBoost: 80,  cooldownDays: 4,  weekendMultiplier: 2.0, seasonalMultiplier: 1.0, minIntervalHours: 24 },
  'season-preview':      { baseWeight: 8,  trendingBoost: 40,  cooldownDays: 14, weekendMultiplier: 1.0, seasonalMultiplier: 4.0, minIntervalHours: 72 },
  'comparison':          { baseWeight: 8,  trendingBoost: 60,  cooldownDays: 3,  weekendMultiplier: 1.3, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'retrospective':       { baseWeight: 6,  trendingBoost: 40,  cooldownDays: 5,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 36 },
  'industry':            { baseWeight: 5,  trendingBoost: 100, cooldownDays: 3,  weekendMultiplier: 0.5, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'top-list':            { baseWeight: 5,  trendingBoost: 40,  cooldownDays: 5,  weekendMultiplier: 1.3, seasonalMultiplier: 1.0, minIntervalHours: 36 },
  'discussion':          { baseWeight: 5,  trendingBoost: 80,  cooldownDays: 3,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'character-spotlight': { baseWeight: 7,  trendingBoost: 60,  cooldownDays: 3,  weekendMultiplier: 1.8, seasonalMultiplier: 1.0, minIntervalHours: 24 },
  'lore-explained':      { baseWeight: 6,  trendingBoost: 70,  cooldownDays: 4,  weekendMultiplier: 2.0, seasonalMultiplier: 1.0, minIntervalHours: 30 },
};

export const CATEGORY_WEIGHTS: Record<ContentCategory, number> = {
  anime: 50,
  manga: 20,
  game:  20,
  novel: 10,
};
