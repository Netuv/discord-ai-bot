/**
 * router.ts — Multi-provider AI router with auto-failover
 * v5.0 — Providers defined in config/providers, failover on each call
 */

import type { Env } from '../types/env';
import { CHAT_PROVIDERS, VISION_PROVIDERS, type AiProviderDef } from '../config/providers';
import { logger } from '../core/logger';
import { AiProviderError } from '../core/errors';

export class AiRouter {
	private env: Env;
	private config: { timeoutMs: number; maxRetriesPerProvider: number };

	constructor(env: Env, config?: Partial<{ timeoutMs: number; maxRetries: number }>) {
		this.env = env;
		this.config = { timeoutMs: 30000, maxRetriesPerProvider: 1, ...config };
	}

	getActiveProviders(type: 'chat' | 'vision' = 'chat'): AiProviderDef[] {
		const providers = type === 'chat' ? CHAT_PROVIDERS : VISION_PROVIDERS;
		return providers.filter(p => {
			if (p.type === 'cloudflare') return true;
			if (p.apiKeyEnv) return !!this.env[p.apiKeyEnv as keyof Env];
			return false;
		});
	}

	async creativeChat(messages: { role: string; content: string }[]): Promise<string> {
		const providers = this.getActiveProviders('chat');
		const cfProvider = providers.find(p => p.type === 'cloudflare');
		if (cfProvider) {
			try {
				const response = await this.callCloudflare(cfProvider, messages, true);
				if (response) return response;
			} catch (e) {
				logger.warn('AiRouter', `CF creative failed, fallback`, {
					error: e instanceof Error ? e.message : String(e),
				});
			}
		}
		return this.chat(messages);
	}

	async chat(messages: { role: string; content: string }[]): Promise<string> {
		const providers = this.getActiveProviders('chat');
		for (const provider of providers) {
			try {
				const response = await this.callProvider(provider, messages);
				if (response) return response;
			} catch (e) {
				logger.warn('AiRouter', `Provider ${provider.name} failed`, {
					error: e instanceof Error ? e.message : String(e),
				});
			}
		}
		throw new Error('All AI providers failed');
	}

	async visionChat(messages: { role: string; content: string | { type: string; text?: string; image?: string }[] }[]): Promise<string> {
		const providers = this.getActiveProviders('vision');
		for (const provider of providers) {
			try {
				if (provider.type === 'cloudflare') {
					const result = (await this.env.AI.run(provider.model as any, {
						messages: messages.map(m => ({
							role: m.role,
							content: Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }],
						})),
					})) as any;
					return result?.response || result?.choices?.[0]?.message?.content || '';
				}
				const apiKey = this.env[provider.apiKeyEnv as keyof Env] as string;
				const result = await this.callOpenAI(provider, messages as any, apiKey);
				return result || '';
			} catch (e) {
				logger.warn('AiRouter', `Vision provider ${provider.name} failed`, {
					error: e instanceof Error ? e.message : String(e),
				});
			}
		}
		throw new Error('All vision providers failed');
	}

	private async callProvider(provider: AiProviderDef, messages: { role: string; content: string }[]): Promise<string | null> {
		if (provider.type === 'cloudflare') {
			return this.callCloudflare(provider, messages);
		}
		const apiKey = this.env[provider.apiKeyEnv as keyof Env] as string;
		if (!apiKey) return null;
		return this.callOpenAI(provider, messages, apiKey);
	}

	private async callCloudflare(provider: AiProviderDef, messages: { role: string; content: string }[], isCreative = false): Promise<string | null> {
		const result = (await this.env.AI.run(provider.model as any, {
			messages,
			...(isCreative ? { temperature: 0.85, max_tokens: 4096 } : {}),
		})) as any;
		if (!result) return null;
		return result.response || result.choices?.[0]?.message?.content || null;
	}

	private async callOpenAI(provider: AiProviderDef, messages: { role: string; content: string }[], apiKey: string): Promise<string | null> {
		const baseUrl = provider.baseUrl || 'https://api.openai.com/v1';
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
		try {
			const res = await fetch(`${baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`,
					...(provider.extraHeaders || {}),
				},
				body: JSON.stringify({
					model: provider.model,
					messages,
					max_tokens: 4096,
				}),
				signal: controller.signal,
			});
			if (!res.ok) {
				await res.text().catch(() => {});
				throw new AiProviderError(provider.name, res.status);
			}
			const data: any = await res.json();
			return data.choices?.[0]?.message?.content || null;
		} finally {
			clearTimeout(timeout);
		}
	}
}
