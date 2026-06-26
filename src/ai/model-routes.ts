export interface ModelRoute {
  taskId: string;
  preferred: string[];
  fallback: string;
  timeoutMs: number;
  maxTokens?: number;
}

export const MODEL_ROUTES: Record<string, ModelRoute> = {
  writer: {
    taskId: 'writer',
    preferred: ['opencode', 'cf-70b', 'nvidia', 'openrouter-70b', 'opencode-heavy'],
    fallback: 'cf-70b',
    timeoutMs: 60_000,
    maxTokens: 4096,
  },
  'writer-heavy': {
    taskId: 'writer-heavy',
    preferred: ['opencode-heavy', 'openrouter-70b', 'opencode', 'cf-70b'],
    fallback: 'cf-70b',
    timeoutMs: 120_000,
    maxTokens: 8192,
  },
  vision: {
    taskId: 'vision',
    preferred: ['opencode-vision', 'openrouter-vision', 'openrouter-gemini-lite'],
    fallback: 'openrouter-gemini-lite',
    timeoutMs: 25_000,
    maxTokens: 2048,
  },
  query: {
    taskId: 'query',
    preferred: ['cf-8b', 'opencode', 'openrouter-gemini-lite'],
    fallback: 'cf-8b',
    timeoutMs: 10_000,
    maxTokens: 512,
  },
  strategist: {
    taskId: 'strategist',
    preferred: ['opencode', 'cf-70b', 'openrouter-70b'],
    fallback: 'cf-70b',
    timeoutMs: 30_000,
    maxTokens: 512,
  },
  synthesis: {
    taskId: 'synthesis',
    preferred: ['opencode', 'cf-70b', 'opencode-heavy'],
    fallback: 'cf-70b',
    timeoutMs: 45_000,
    maxTokens: 2048,
  },
};
