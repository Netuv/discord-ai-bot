import type { Env } from '../types/env';
import type { ModelRoute } from './model-routes';
import { PROVIDERS, Provider } from './providers';
import { safeFetch, safeAiResponse } from '../core/safe-fetch';
import { AppError, ErrorCode } from '../core/errors';

export async function callProvider(
  providerName: string,
  messages: Array<{ role: string; content: string | unknown[] }>,
  route: ModelRoute,
  env: Env
): Promise<string> {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `Unknown provider: ${providerName}`);
  }

  switch (provider.type) {
    case 'cf-ai':
      return callCloudflareAI(provider, messages, route, env);
    case 'openai-compat':
      return callOpenAICompatible(provider, messages, route, env);
    default:
      throw new AppError(
        ErrorCode.AI_PROVIDER_ERROR,
        `Unsupported provider type: ${provider.type}`
      );
  }
}

async function callCloudflareAI(
  provider: Provider,
  messages: Array<{ role: string; content: string | unknown[] }>,
  route: ModelRoute,
  env: Env
): Promise<string> {
  // Deep clone to avoid mutating original
  const processedMessages = JSON.parse(JSON.stringify(messages));
  
  // Cloudflare Vision requires image as an array of bytes, not image_url
  for (const msg of processedMessages) {
    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'image_url' && item.image_url?.url) {
          try {
            const imgRes = await fetch(item.image_url.url);
            const arrayBuffer = await imgRes.arrayBuffer();
            // Replace image_url with Cloudflare's expected image bytes
            item.image = [...new Uint8Array(arrayBuffer)];
            delete item.image_url;
            // The type must be 'image' for CF? No, CF usually just expects image property
          } catch (e) {
            console.warn('Failed to fetch image for CF vision', e);
          }
        }
      }
    }
  }

  const result = await env.AI.run(provider.model, {
    messages: processedMessages,
    max_tokens: route.maxTokens,
  });
  return safeAiResponse(result);
}

async function callOpenAICompatible(
  provider: Provider,
  messages: Array<{ role: string; content: string | unknown[] }>,
  route: ModelRoute,
  env: Env
): Promise<string> {
  if (!provider.baseUrl) {
    throw new AppError(ErrorCode.CONFIG_MISSING, `Provider ${provider.name} missing baseUrl`);
  }

  const apiKey = provider.envKey ? (env[provider.envKey] as string) : undefined;
  if (!apiKey) {
    throw new AppError(
      ErrorCode.CONFIG_MISSING,
      `Provider ${provider.name} missing API key: ${provider.envKey}`
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...(provider.headers || {}),
  };

  const body = {
    model: provider.model,
    messages,
    max_tokens: route.maxTokens,
  };

  const res = await safeFetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeoutMs: route.timeoutMs,
  });

  if (!res || !res.ok) {
    const errText = await res?.text().catch(() => 'unknown');
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      `Provider ${provider.name} error: ${res?.status} ${(errText ?? 'unknown').slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError(
      ErrorCode.AI_PROVIDER_ERROR,
      `Provider ${provider.name} returned no content`
    );
  }

  return content;
}
