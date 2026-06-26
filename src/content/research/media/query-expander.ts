import type { Env } from '../../../types/env';
import { callAiWithRouter } from '../../../ai/model-router';

export interface QueryExpansion {
  cleanQuery: string;
  originalQuery: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function expandQuery(
  rawQuery: string,
  category: string,
  env: Env
): Promise<QueryExpansion> {
  const cacheKey = `qexpand:${rawQuery.slice(0, 80)}`;
  const cached = await env.BOT_KV.get(cacheKey, 'json');
  if (cached) return cached as QueryExpansion;

  const prompt = `Extract the EXACT ${category} title from this text.
Return ONLY the title. No extra words. No punctuation at end.
If no clear title, return "GENERAL".
Text: "${rawQuery}"`;

  try {
    const result = await callAiWithRouter('query', [{ role: 'user', content: prompt }], env);
    const clean = result.trim();

    const output: QueryExpansion = {
      cleanQuery: clean === 'GENERAL' || !clean ? rawQuery : clean,
      originalQuery: rawQuery,
      confidence: clean === 'GENERAL' ? 'low' : 'high',
    };

    await env.BOT_KV.put(cacheKey, JSON.stringify(output), { expirationTtl: 86400 });
    return output;
  } catch {
    return { cleanQuery: rawQuery, originalQuery: rawQuery, confidence: 'low' };
  }
}
