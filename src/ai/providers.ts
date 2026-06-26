import type { Env } from '../types/env';

export interface Provider {
  name: string;
  type: 'cf-ai' | 'openai-compat' | 'custom';
  model: string;
  baseUrl?: string;
  envKey?: keyof Env;
  headers?: Record<string, string>;
  maxTokens?: number;
}

export const PROVIDERS: Record<string, Provider> = {
  // ── Cloudflare Workers AI (built-in, zero cost) ──
  'cf-70b': {
    name: 'cf-70b',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  },
  'cf-8b': {
    name: 'cf-8b',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8',
  },

  // ── OpenCode (free, fast, no key needed) ──
  opencode: {
    name: 'opencode',
    type: 'openai-compat',
    model: 'deepseek-v4-flash-free',
    baseUrl: 'https://opencode.ai/zen/v1',
    envKey: 'OPENCODE_API_KEY',
  },
  'opencode-vision': {
    name: 'opencode-vision',
    type: 'openai-compat',
    model: 'mimo-v2.5-free',
    baseUrl: 'https://opencode.ai/zen/v1',
    envKey: 'OPENCODE_API_KEY',
  },
  'opencode-heavy': {
    name: 'opencode-heavy',
    type: 'openai-compat',
    model: 'qwen3.6-plus-free',
    baseUrl: 'https://opencode.ai/zen/v1',
    envKey: 'OPENCODE_API_KEY',
  },

  // ── NVIDIA NIM (needs API key) ──
  nvidia: {
    name: 'nvidia',
    type: 'openai-compat',
    model: 'stepfun-ai/step-3.7-flash',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envKey: 'NVIDIA_API_KEY',
  },

  // ── OpenRouter — free models ──
  'openrouter-70b': {
    name: 'openrouter-70b',
    type: 'openai-compat',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    headers: { 'HTTP-Referer': 'https://discord-ai-bot.workers.dev' },
  },
  'openrouter-gemini-lite': {
    name: 'openrouter-gemini-lite',
    type: 'openai-compat',
    model: 'google/gemini-2.5-flash-lite',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },
  'openrouter-gemma': {
    name: 'openrouter-gemma',
    type: 'openai-compat',
    model: 'google/gemma-4-31b-it:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },
  'openrouter-vision': {
    name: 'openrouter-vision',
    type: 'openai-compat',
    model: 'nvidia/nemotron-nano-12b-v2-vl:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },
};
