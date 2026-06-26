import { traceLog } from './trace-logger';

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response | null> {
  const { timeoutMs = 8000, ...fetchOptions } = options;

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, { ...fetchOptions, signal });
    return res;
  } catch (e) {
    traceLog('warn', 'SafeFetch', `Failed: ${url.slice(0, 100)}`, {
      error: (e as Error).message,
    });
    return null;
  }
}

export async function safeFetchJson<T>(
  url: string,
  options: SafeFetchOptions = {},
  fallback: T
): Promise<T> {
  const res = await safeFetch(url, options);
  if (!res || !res.ok) return fallback;
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function safeAiResponse(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return (
      (obj['response'] as string) ||
      (obj['content'] as string) ||
      (obj['text'] as string) ||
      ''
    );
  }
  return String(raw);
}
