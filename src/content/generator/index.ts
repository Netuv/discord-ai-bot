import type { Env } from '../../types/env';
import type { ContentBrief, Article, ContentDepth } from '../types/content';
import type { ResearchBundle } from '../research/types';
import { BudgetTracker } from '../../core/budget-tracker';
import { AppError, ErrorCode } from '../../core/errors';
import { traceLog } from '../../core/trace-logger';
import { callAiWithRouter } from '../../ai/model-router';
import { buildPrompt, getSystemPrompt } from './prompts/base-prompt';
import { parseArticleResponse } from './parser';
import { auditArticleFromEnv, autoFixArticle } from './auditor';

function getMinSections(depth: ContentDepth): number {
  return { quick: 2, standard: 3, deep: 5 }[depth];
}

export async function generateContent(
  brief: ContentBrief,
  research: ResearchBundle,
  env: Env,
  budget: BudgetTracker
): Promise<Article> {
  // 1. Build format-specific prompt
  const prompt = buildPrompt(brief, research);

  // 2. Pick task type based on depth
  const taskId = brief.depth === 'deep' ? 'writer-heavy' : 'writer';

  let article: Article | null = null;
  let lastError = '';

  // 3. Try up to 3 times
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      budget.consume(1, `Generator:attempt${attempt + 1}`);

      const raw = await callAiWithRouter(
        taskId,
        [
          { role: 'system', content: getSystemPrompt(brief) },
          { role: 'user', content: prompt },
        ],
        env
      );

      article = parseArticleResponse(raw, brief);

      // 4. Quality check
      const minSections = getMinSections(brief.depth);
      if (!article || article.sections.length < minSections) {
        lastError = `Sections: ${article?.sections.length ?? 0} < ${minSections}`;
        article = null;
        continue;
      }

      break; // success
    } catch (e) {
      lastError = (e as Error).message;
      traceLog('warn', 'Generator', `Attempt ${attempt + 1} failed`, {
        error: lastError,
      });
    }
  }

  if (!article) {
    throw new AppError(
      ErrorCode.WRITER_FAILED,
      `Generator failed after 3 attempts: ${lastError}`
    );
  }

  // 5. Quality audit + auto-fix with web search verification
  const validArticle: Article = article;
  const audit = await auditArticleFromEnv(validArticle, brief, env, budget);
  if (!audit.passed) {
    traceLog('warn', 'Generator', 'Audit issues', { issues: audit.issues });
    return autoFixArticle(validArticle, audit);
  }

  return validArticle;
}
