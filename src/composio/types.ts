import type { FinalContent } from '../content/types/content';

export type PlatformType = 'twitter' | 'instagram' | 'linkedin' | 'reddit' | 'telegram';

export interface PlatformAdapter {
  platform: PlatformType;
  actionId: string;
  maxLength: number;
  format(content: FinalContent, discordMessageId?: string, images?: string[]): Record<string, unknown>;
}

export interface ComposioDistributionResult {
  platform: PlatformType;
  success: boolean;
  error?: string;
  durationMs: number;
  result?: unknown;
}
