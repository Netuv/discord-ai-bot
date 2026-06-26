import type { Env } from '../../types/env';
import type { ContentBrief } from '../types/content';
import type { ContentFormat } from '../types/content';
import type { ResearchEngine, ResearchBundle } from './types';
import { BudgetTracker } from '../../core/budget-tracker';
import { OllamaSource } from './sources/ollama-source';
import { TavilySource } from './sources/tavily-source';
import { AnimeNewsNetworkSource } from './sources/ann-source';
import { IGNSource } from './sources/ign-source';
import { traceLog } from '../../core/trace-logger';

const ENGINE_MAP: Record<ContentFormat, () => Promise<{ default: ResearchEngine }>> = {
  review: () => import('./engines/review-engine'),
  'breaking-news': () => import('./engines/news-engine'),
  recommendation: () => import('./engines/recommend-engine'),
  'deep-dive': () => import('./engines/deep-dive-engine'),
  'season-preview': () => import('./engines/season-engine'),
  comparison: () => import('./engines/compare-engine'),
  retrospective: () => import('./engines/retrospective-engine'),
  industry: () => import('./engines/industry-engine'),
  'top-list': () => import('./engines/top-list-engine'),
  discussion: () => import('./engines/discussion-engine'),
  'character-spotlight': () => import('./engines/character-engine'),
  'lore-explained': () => import('./engines/lore-engine'),
};

export async function getResearchEngine(format: ContentFormat): Promise<ResearchEngine> {
  const engineModule = await ENGINE_MAP[format]();
  return engineModule.default;
}

/**
 * Run research pipeline for a content brief
 * Enriches engine results with Ollama Web Search for accuracy & recency.
 */
export async function runResearch(
  brief: ContentBrief,
  env: Env,
  budget: BudgetTracker
): Promise<ResearchBundle> {
  const engine = await getResearchEngine(brief.format);
  const bundle = await engine.execute(brief.topic, brief.category, brief, env, budget);

  // Enrich with Ollama Web Search (free, real-time data)
  if (env.OLLAMA_WEB_SEARCH_KEY && budget.remaining > 0) {
    try {
      const ollama = new OllamaSource(env, budget);
      budget.consume(1, 'Research:OllamaEnrich');
      const webResults = await ollama.search(`${brief.topic} ${brief.category} 2026`);

      if (webResults.length > 0) {
        const webContext = webResults
          .slice(0, 3)
          .map((r) => `[${r.title}](${r.url}): ${r.content.slice(0, 500)}`)
          .join('\n\n');

        bundle.summary += `\n\n---\n\n**Real-time context (Ollama Web Search):**\n${webContext}`;
        bundle.sources.push(...webResults.slice(0, 3).map((r) => r.url));
        traceLog('info', 'Research', `Ollama enriched with ${webResults.length} results`);
      }
    } catch (e) {
      traceLog('warn', 'Research', 'Ollama enrichment failed', { error: (e as Error).message });
    }
  }

  // ANN RSS enrichment (free, no key — real-time industry news)
  if (budget.remaining > 0) {
    try {
      const ann = new AnimeNewsNetworkSource(budget);
      budget.consume(1, 'Research:ANN');
      const annItems = await ann.fetchLatest(5);

      if (annItems.length > 0) {
        const annContext = annItems
          .slice(0, 3)
          .map((item) => `📰 [${item.title}](${item.url}) — *${item.summary.slice(0, 200)}*`)
          .join('\n\n');

        bundle.summary += `\n\n---\n\n**Latest Anime News Network headlines:**\n${annContext}`;
        bundle.sources.push(...annItems.slice(0, 3).map((item) => item.url));
        traceLog('info', 'Research', `ANN enriched with ${annItems.length} news items`);
      }
    } catch (e) {
      traceLog('warn', 'Research', 'ANN enrichment failed', { error: (e as Error).message });
    }
  }

  // IGN RSS enrichment (free, no key — real-time gaming news)
  if (budget.remaining > 0) {
    try {
      const ign = new IGNSource(budget);
      budget.consume(1, 'Research:IGN');
      const ignItems = await ign.fetchLatest(5);

      if (ignItems.length > 0) {
        const ignContext = ignItems
          .slice(0, 3)
          .map((item) => `🎮 [${item.title}](${item.url})`)
          .join('\n\n');

        bundle.summary += `\n\n---\n\n**Latest IGN Gaming headlines:**\n${ignContext}`;
        bundle.sources.push(...ignItems.slice(0, 3).map((item) => item.url));
        traceLog('info', 'Research', `IGN enriched with ${ignItems.length} news items`);
      }
    } catch (e) {
      traceLog('warn', 'Research', 'IGN enrichment failed', { error: (e as Error).message });
    }
  }

  // 3rd layer fallback: Tavily Search (if Ollama returned <3 results and key available)
  if (env.TAVILY_API_KEY && budget.remaining > 0) {
    const hasEnoughContext = bundle.sources.length >= 3;
    if (!hasEnoughContext) {
      try {
        const tavily = new TavilySource(env, budget);
        budget.consume(1, 'Research:TavilyFallback');
        const tavilyResults = await tavily.search(`${brief.topic} ${brief.category} 2026`);

        if (tavilyResults.length > 0) {
          const tavilyContext = tavilyResults
            .slice(0, 3)
            .map((r) => `[${r.title}](${r.url}): ${r.content.slice(0, 500)}`)
            .join('\n\n');

          bundle.summary += `\n\n---\n\n**Fallback context (Tavily Search):**\n${tavilyContext}`;
          bundle.sources.push(...tavilyResults.slice(0, 3).map((r) => r.url));
          traceLog('info', 'Research', `Tavily fallback added ${tavilyResults.length} results`);
        }
      } catch (e) {
        traceLog('warn', 'Research', 'Tavily fallback failed', { error: (e as Error).message });
      }
    }
  }

  return bundle;
}
