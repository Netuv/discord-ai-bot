import type { ContentBrief, FinalContent } from '../content/types/content';

export interface PipelineResult {
  success: boolean;
  contentId?: string;
  discordMessageId?: string;
  traceId: string;
  totalMs: number;
  error?: {
    code: string;
    message: string;
    phase: PipelinePhase;
  };
  metrics: {
    strategistMs: number;
    researchMs: number;
    mediaMs: number;
    generatorMs: number;
    publishMs: number;
    subrequestsUsed: number;
  };
}

export type PipelinePhase =
  | 'strategist'
  | 'research'
  | 'media'
  | 'generator'
  | 'publisher'
  | 'history'
  | 'metrics';

export interface PipelineContext {
  traceId: string;
  brief: ContentBrief;
  channelId: string;
  startTime: number;
  phaseTimings: Partial<Record<PipelinePhase, number>>;
}

export interface PipelineOverrides extends Partial<Pick<ContentBrief, 'category' | 'format' | 'topic'>> {
  // Re-declare to satisfy exactOptionalPropertyTypes
}
