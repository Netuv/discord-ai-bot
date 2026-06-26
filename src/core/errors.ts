export enum ErrorCode {
  // Discord
  DISCORD_API_ERROR = 'DISCORD_API_ERR',
  DISCORD_RATE_LIMIT = 'DISCORD_RATE_LIMIT',
  DISCORD_SEND_FAILED = 'DISCORD_SEND_FAILED',

  // AI Providers
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERR',
  AI_PROVIDER_TIMEOUT = 'AI_PROVIDER_TIMEOUT',
  AI_PROVIDER_DISABLED = 'AI_PROVIDER_DISABLED',
  AI_ALL_FAILED = 'AI_ALL_FAILED',

  // Pipeline
  STRATEGIST_FAILED = 'STRATEGIST_FAILED',
  RESEARCH_FAILED = 'RESEARCH_FAILED',
  MEDIA_FAILED = 'MEDIA_FAILED',
  WRITER_FAILED = 'WRITER_FAILED',
  WRITER_LOW_QUALITY = 'WRITER_LOW_QUALITY',
  PUBLISH_FAILED = 'PUBLISH_FAILED',

  // System
  BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED',
  DATABASE_ERROR = 'DATABASE_ERR',
  VALIDATION_ERROR = 'VALIDATION_ERR',
  CONFIG_MISSING = 'CONFIG_MISSING',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable = false,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
