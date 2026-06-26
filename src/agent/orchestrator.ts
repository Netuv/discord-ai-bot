import type { Env } from '../types/env';
import type {
  PipelineResult,
  PipelineContext,
  PipelineOverrides,
  PipelinePhase,
} from './types';
import type { ContentBrief } from '../content/types/content';
import { BudgetTracker } from '../core/budget-tracker';
import { D1Client } from '../core/d1';
import { traceLog, setTraceId } from '../core/trace-logger';
import { AppError, ErrorCode, isAppError } from '../core/errors';
import { ContentStrategist } from '../content/strategist/index';
import { runResearch } from '../content/research/index';
import { generateContent } from '../content/generator/index';
import { DiscordAdapter } from '../content/publish/adapters/discord-adapter';
import { HistoryTracker } from '../content/strategist/history-tracker';
import { searchVideos } from '../content/research/media/video-searcher';
import { searchImages } from '../content/research/media/image-searcher';
import { validateImages } from '../content/research/media/vision-validator';

/**
 * Main pipeline orchestrator - connects all agents into end-to-end content generation
 */
export async function runArticlePipeline(
  channelId: string,
  triggerType: ContentBrief['triggerType'],
  env: Env,
  ctx: ExecutionContext,
  overrides?: PipelineOverrides
): Promise<PipelineResult> {
  const startTime = Date.now();
  const traceId = crypto.randomUUID().slice(0, 8);
  setTraceId(traceId);

  const budget = new BudgetTracker(50);
  const db = new D1Client(env);
  const context: PipelineContext = {
    traceId,
    brief: {} as ContentBrief,
    channelId,
    startTime,
    phaseTimings: {},
  };

  traceLog('info', 'Pipeline', `Starting article generation pipeline`, {
    channelId,
    triggerType,
    overrides,
  });

  let currentPhase: PipelinePhase = 'strategist';

  try {
    // ============================================================
    // PHASE 1: CONTENT STRATEGIST - Decide what to write
    // ============================================================
    currentPhase = 'strategist';
    const strategistStart = Date.now();

    const strategist = new ContentStrategist(env);
    const brief = await strategist.decide(triggerType, overrides);
    context.brief = brief;
    context.phaseTimings.strategist = Date.now() - strategistStart;

    traceLog('info', 'Pipeline', `Strategist selected format`, {
      category: brief.category,
      format: brief.format,
      topic: brief.topic,
      ms: context.phaseTimings.strategist,
    });

    // ============================================================
    // PHASE 2: RESEARCH - Gather data and media
    // ============================================================
    currentPhase = 'research';
    const researchStart = Date.now();

    const researchBundle = await runResearch(brief, env, budget);
    context.phaseTimings.research = Date.now() - researchStart;

    traceLog('info', 'Pipeline', `Research complete`, {
      sources: researchBundle.sources.length,
      hasMediaPlan: Boolean(researchBundle.mediaPlan),
      ms: context.phaseTimings.research,
    });

    // ============================================================
    // PHASE 3: CONTENT GENERATION - Write the article
    // ============================================================
    currentPhase = 'generator';
    const generatorStart = Date.now();

    const article = await generateContent(brief, researchBundle, env, budget);
    context.phaseTimings.generator = Date.now() - generatorStart;

    traceLog('info', 'Pipeline', `Article generated`, {
      title: article.title,
      sections: article.sections.length,
      wordCount: article.wordCount,
      ms: context.phaseTimings.generator,
    });

    // ============================================================
    // PHASE 3.5: MEDIA SEARCH - Fetch real YouTube & Image URLs
    // ============================================================
    const usedMediaUrls = new Set<string>();

    // 1. YouTube Video Search
    if (env.GOOGLE_API_KEY) {
      const sectionsWithVideo = article.sections.filter(s => s.videoTitle);
      if (sectionsWithVideo.length > 0) {
        traceLog('info', 'Pipeline', `Fetching YouTube URLs for ${sectionsWithVideo.length} section(s)`);
        for (const section of sectionsWithVideo.slice(0, 2)) { // max 2 video searches
          const query = section.videoTitle!;
          const videos = await searchVideos(brief.topic, query, brief.category, budget, env);
          
          const validVideo = videos.find(v => !usedMediaUrls.has(v.url));
          if (validVideo) {
            section.videoUrl = validVideo.url;
            section.videoTitle = validVideo.title;
            usedMediaUrls.add(validVideo.url);
          } else {
            section.videoTitle = null; // clear if no result found
          }
        }
      }
    } else {
      traceLog('debug', 'Pipeline', 'No GOOGLE_API_KEY, skipping YouTube search');
      for (const section of article.sections) {
        section.videoTitle = null;
      }
    }

    // 2. Image Search & AI Vision Validation
    const sectionsWithImage = article.sections.filter(s => s.imageDescription);
    if (sectionsWithImage.length > 0) {
      traceLog('info', 'Pipeline', `Fetching Image URLs for ${sectionsWithImage.length} section(s)`);
      for (const section of sectionsWithImage) {
        try {
          const query = section.imageDescription!;
          const imageCandidates = await searchImages(brief.topic, query, brief.category, budget, env);
          
          const uniqueCandidates = imageCandidates.filter(c => !usedMediaUrls.has(c.url));

          if (uniqueCandidates.length > 0) {
            const contextDesc = `${brief.format} article about ${brief.topic}`;
            // Validate and pick the best image using AI Vision
            const validatedImages = await validateImages(uniqueCandidates, `${brief.topic} ${query}`, contextDesc, env, budget);
            if (validatedImages.length > 0) {
              section.imageUrl = validatedImages[0]!.url;
              usedMediaUrls.add(validatedImages[0]!.url);
            } else {
              section.imageDescription = null; // clear description if no image picked
            }
          } else {
            section.imageDescription = null; // clear description if all candidates already used
          }
        } catch (e) {
          traceLog('warn', 'Pipeline', `Failed to fetch image for section: ${section.heading}`, { error: (e as Error).message });
          section.imageDescription = null;
        }
      }
    }
    // ============================================================
    // PHASE 4: PUBLISHING - Send to Discord
    // ============================================================
    currentPhase = 'publisher';
    const publishStart = Date.now();

    // Attach metadata to create FinalContent
    const finalContent = {
      ...article,
      metadata: {
        traceId,
        generatedAt: new Date().toISOString(),
        sources: researchBundle.sources,
        providerUsed: 'multiple', // TODO: track actual provider used
        modelUsed: 'multiple', // TODO: track actual model used
        totalMs: Date.now() - startTime,
      },
    };

    const adapter = new DiscordAdapter(env.DISCORD_TOKEN);
    const messageId = await adapter.send(channelId, finalContent);
    context.phaseTimings.publisher = Date.now() - publishStart;

    traceLog('info', 'Pipeline', `Published to Discord`, {
      messageId,
      ms: context.phaseTimings.publisher,
    });

    // ============================================================
    // PHASE 5: HISTORY & METRICS (Background - non-blocking)
    // ============================================================
    const contentId = crypto.randomUUID();

    // Use ctx.waitUntil for background logging (doesn't block response)
    ctx.waitUntil(
      logPipelineResults(
        contentId,
        brief,
        article,
        messageId,
        channelId,
        context,
        budget,
        env
      ).catch((e) => {
        traceLog('error', 'Pipeline', 'Background logging failed', {
          error: (e as Error).message,
        });
      })
    );

    // ============================================================
    // SUCCESS - Return result
    // ============================================================
    const totalMs = Date.now() - startTime;

    traceLog('info', 'Pipeline', `Pipeline complete`, {
      contentId,
      messageId,
      totalMs,
      subrequestsUsed: budget.snapshot.used,
    });

    return {
      success: true,
      contentId,
      discordMessageId: messageId,
      traceId,
      totalMs,
      metrics: {
        strategistMs: context.phaseTimings.strategist ?? 0,
        researchMs: context.phaseTimings.research ?? 0,
        mediaMs: 0, // TODO: separate media timing
        generatorMs: context.phaseTimings.generator ?? 0,
        publishMs: context.phaseTimings.publisher ?? 0,
        subrequestsUsed: budget.snapshot.used,
      },
    };
  } catch (e) {
    // ============================================================
    // ERROR HANDLING
    // ============================================================
    const error = e as Error;
    const totalMs = Date.now() - startTime;

    traceLog('error', 'Pipeline', `Pipeline failed at ${currentPhase}`, {
      error: error.message,
      phase: currentPhase,
      totalMs,
    });

    // Log failure to metrics (background)
    ctx.waitUntil(
      logPipelineFailure(traceId, currentPhase, error, context, budget, env).catch(
        () => {}
      )
    );

    return {
      success: false,
      traceId,
      totalMs,
      error: {
        code: isAppError(e) ? e.code : ErrorCode.AI_ALL_FAILED,
        message: error.message,
        phase: currentPhase,
      },
      metrics: {
        strategistMs: context.phaseTimings.strategist ?? 0,
        researchMs: context.phaseTimings.research ?? 0,
        mediaMs: 0,
        generatorMs: context.phaseTimings.generator ?? 0,
        publishMs: context.phaseTimings.publisher ?? 0,
        subrequestsUsed: budget.snapshot.used,
      },
    };
  }
}

/**
 * Background logging - history + metrics
 */
async function logPipelineResults(
  contentId: string,
  brief: ContentBrief,
  article: { title: string; intro: string; sections: unknown[]; wordCount?: number },
  messageId: string,
  channelId: string,
  context: PipelineContext,
  budget: BudgetTracker,
  env: Env
): Promise<void> {
  const db = new D1Client(env);
  const tracker = new HistoryTracker(env);

  // Log to content_history
  await tracker.log({
    id: contentId,
    traceId: context.traceId,
    brief,
    article: article as never, // Type assertion needed due to complex type
    providerUsed: 'multiple',
    modelUsed: 'multiple',
    totalMs: Date.now() - context.startTime,
    discordMessageId: messageId,
    discordChannelId: channelId,
  });

  // Log to pipeline_metrics
  await db.execute(
    `INSERT INTO pipeline_metrics
     (trace_id, format, category,
      strategist_ms, research_ms, writer_ms, publish_ms, total_ms,
      writer_attempts, provider_used, model_used,
      budget_remaining, budget_total, success)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    context.traceId,
    brief.format,
    brief.category,
    context.phaseTimings.strategist ?? 0,
    context.phaseTimings.research ?? 0,
    context.phaseTimings.generator ?? 0,
    context.phaseTimings.publisher ?? 0,
    Date.now() - context.startTime,
    1, // writer_attempts
    'multiple',
    'multiple',
    budget.snapshot.max - budget.snapshot.used, // budget_remaining
    budget.snapshot.max, // budget_total
    1 // success
  );

  traceLog('info', 'Pipeline', 'Background logging complete');
}

/**
 * Log pipeline failure to metrics
 */
async function logPipelineFailure(
  traceId: string,
  phase: PipelinePhase,
  error: Error,
  context: PipelineContext,
  budget: BudgetTracker,
  env: Env
): Promise<void> {
  const db = new D1Client(env);

  await db.execute(
    `INSERT INTO pipeline_metrics
     (trace_id, format, category,
      strategist_ms, research_ms, writer_ms, publish_ms, total_ms,
      budget_remaining, budget_total, success, error_message, error_phase)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    traceId,
    context.brief.format ?? 'unknown',
    context.brief.category ?? 'anime',
    context.phaseTimings.strategist ?? 0,
    context.phaseTimings.research ?? 0,
    context.phaseTimings.generator ?? 0,
    context.phaseTimings.publisher ?? 0,
    Date.now() - context.startTime,
    budget.snapshot.max - budget.snapshot.used, // budget_remaining
    budget.snapshot.max, // budget_total
    0, // failure
    error.message,
    phase
  );

  traceLog('info', 'Pipeline', 'Failure logged to metrics');
}
