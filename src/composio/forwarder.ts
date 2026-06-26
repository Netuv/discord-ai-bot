import type { FinalContent } from '../content/types/content';
import type { Env } from '../types/env';
import { composioExecute } from './client';
import { traceLog } from '../core/trace-logger';
import { D1Client } from '../core/d1';
import type { PlatformType, PlatformAdapter } from './types';
import { twitterAdapter } from './adapters/twitter-adapter';
import { instagramAdapter } from './adapters/instagram-adapter';
import { linkedinAdapter } from './adapters/linkedin-adapter';
import { redditAdapter } from './adapters/reddit-adapter';
import { telegramAdapter } from './adapters/telegram-adapter';

export async function distributeToSocialMedia(
  content: FinalContent,
  discordMessageId: string,
  env: Env,
  images?: Record<PlatformType, string>
): Promise<void> {
  if (!env.COMPOSIO_API_KEY) {
    traceLog('info', 'Composio', 'Skipping distribution (no API key)');
    return;
  }

  const platforms: Array<{
    platform: PlatformType;
    accountId: string | undefined;
    adapter: PlatformAdapter;
  }> = [
    { platform: 'twitter' as PlatformType,   accountId: env.COMPOSIO_TWITTER_ACCOUNT_ID,   adapter: twitterAdapter },
    { platform: 'instagram' as PlatformType, accountId: env.COMPOSIO_INSTAGRAM_ACCOUNT_ID, adapter: instagramAdapter },
    { platform: 'linkedin' as PlatformType,  accountId: env.COMPOSIO_LINKEDIN_ACCOUNT_ID,  adapter: linkedinAdapter },
    { platform: 'reddit' as PlatformType,    accountId: env.COMPOSIO_REDDIT_ACCOUNT_ID,    adapter: redditAdapter },
    { platform: 'telegram' as PlatformType,  accountId: env.COMPOSIO_TELEGRAM_ACCOUNT_ID,  adapter: telegramAdapter },
  ].filter(p => Boolean(p.accountId));

  if (platforms.length === 0) {
    traceLog('info', 'Composio', 'Skipping distribution (no connected accounts)');
    return;
  }

  const results = await Promise.allSettled(
    platforms.map(async ({ platform, accountId, adapter }) => {
      const startMs = Date.now();
      try {
        const platformImage = images ? [images[platform]] : undefined;
        const payload = adapter.format(content, discordMessageId, platformImage);
        
        const result = await composioExecute(
          env.COMPOSIO_API_KEY!,
          accountId!,
          adapter.actionId,
          payload
        );
        return { platform, success: true, result, durationMs: Date.now() - startMs };
      } catch (e) {
        return {
          platform,
          success: false,
          error: (e as Error).message,
          durationMs: Date.now() - startMs,
        };
      }
    })
  );

  // Log all results to D1
  const db = new D1Client(env);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { platform, success, error, durationMs } = result.value;
      await db.execute(
        `INSERT INTO distribution_log (content_id, platform, status, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
        [
          discordMessageId, 
          platform,
          success ? 'success' : 'failed',
          error ?? null,
          durationMs
        ]
      ).catch((e) => {
        traceLog('error', 'Composio', 'Failed to log distribution result', { error: (e as Error).message });
      });
    }
  }
}
