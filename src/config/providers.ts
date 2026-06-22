/**
 * providers.ts — AI Provider definitions
 * v5.0 — Central config for all AI providers
 */

export interface AiProviderDef {
	name: string;
	priority: number;
	model: string;
	type: 'cloudflare' | 'openai';
	apiKeyEnv?: string;
	baseUrl?: string;
	extraHeaders?: Record<string, string>;
}

export interface ProviderModelInfo {
	name: string;
	emoji: string;
	secret?: string;
	note: string;
	models: { name: string; note: string }[];
}

// Chat providers (priority order — lower = tried first)
export const CHAT_PROVIDERS: AiProviderDef[] = [
	{
		name: 'OpenCode',
		priority: 1,
		model: 'deepseek-v4-flash-free',
		type: 'openai',
		apiKeyEnv: 'OPENCODE_API_KEY',
		baseUrl: 'https://opencode.ai/zen/v1',
	},
	{
		name: 'Cloudflare Workers AI',
		priority: 2,
		model: '@cf/meta/llama-3.1-8b-instruct-fp8',
		type: 'cloudflare',
	},
	{
		name: 'Step 3.7 Flash',
		priority: 3,
		model: 'stepfun-ai/step-3.7-flash',
		type: 'openai',
		apiKeyEnv: 'NVIDIA_API_KEY',
		baseUrl: 'https://integrate.api.nvidia.com/v1',
	},
	{
		name: 'OpenRouter',
		priority: 4,
		model: 'meta-llama/llama-3.3-70b-instruct:free',
		type: 'openai',
		apiKeyEnv: 'OPENROUTER_API_KEY',
		baseUrl: 'https://openrouter.ai/api/v1',
	},
];

// Vision providers (separate from chat)
export const VISION_PROVIDERS: AiProviderDef[] = [
	{
		name: 'Xiaomi MiMo V2.5',
		priority: 1,
		model: '@cf/xiaomimi/mimo-v2.5-vision',
		type: 'cloudflare',
	},
	{
		name: 'Cloudflare Llama 3.2 90B Vision',
		priority: 2,
		model: '@cf/meta/llama-3.2-90b-vision',
		type: 'cloudflare',
	},
	{
		name: 'OpenRouter Gemma 3',
		priority: 3,
		model: 'google/gemma-3-12b:free',
		type: 'openai',
		apiKeyEnv: 'OPENROUTER_API_KEY',
		baseUrl: 'https://openrouter.ai/api/v1',
	},
];

// Provider info for display (slash commands, MCP tools)
export const PROVIDER_MODELS: ProviderModelInfo[] = [
	{
		name: 'OpenCode',
		emoji: '🆓',
		secret: 'OPENCODE_API_KEY',
		note: 'deepseek-v4-flash-free — gratis! recommended untuk nulis artikel',
		models: [
			{ name: 'deepseek-v4-flash-free', note: 'Fast & free — recommended untuk article writer' },
		],
	},
	{
		name: 'Cloudflare Workers AI',
		emoji: '🌤️',
		note: 'Built-in, selalu available',
		models: [
			{ name: '@cf/meta/llama-3.1-8b-instruct-fp8', note: '8B parameter, fast & kreatif 🚀' },
		],
	},
	{
		name: 'Step 3.7 Flash',
		emoji: '🟢',
		secret: 'NVIDIA_API_KEY',
		note: '198B MoE via NVIDIA NIM (free tier)',
		models: [
			{ name: 'stepfun-ai/step-3.7-flash', note: '198B MoE, fast — NVIDIA NIM free tier' },
		],
	},
	{
		name: 'OpenRouter',
		emoji: '🟣',
		secret: 'OPENROUTER_API_KEY',
		note: 'Free tier — butuh API key',
		models: [
			{ name: 'meta-llama/llama-3.3-70b-instruct:free', note: 'Llama 3.3 70B — free tier' },
			{ name: 'google/gemma-3-12b:free', note: 'Gemma 3 12B — multimodal (vision)' },
		],
	},
];
