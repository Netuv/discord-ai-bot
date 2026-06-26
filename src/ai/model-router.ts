import type { Env } from '../types/env';
import { D1Client } from '../core/d1';
import { traceLog } from '../core/trace-logger';
import { MODEL_ROUTES } from './model-routes';
import { callProvider } from './call-provider';

export async function callAiWithRouter(
  taskId: string,
  messages: Array<{ role: string; content: string | unknown[] }>,
  env: Env
): Promise<string> {
  const route = MODEL_ROUTES[taskId] ?? MODEL_ROUTES['writer']!;
  const db = new D1Client(env);

  for (const providerName of route.preferred) {
    // Check health — skip disabled providers
    if (await isProviderDisabled(providerName, db)) {
      traceLog('debug', 'ModelRouter', `Skipping disabled: ${providerName}`);
      continue;
    }

    const startMs = Date.now();
    try {
      const result = await callProvider(providerName, messages, route, env);
      await recordSuccess(providerName, Date.now() - startMs, db);
      traceLog('info', 'ModelRouter', `Success: ${providerName} (${Date.now() - startMs}ms)`);
      return result;
    } catch (e) {
      const err = e as Error;
      traceLog('warn', 'ModelRouter', `Failed: ${providerName}`, { error: err.message });
      await recordFailure(providerName, err.message, db);
    }
  }

  // Guaranteed fallback — use CF built-in AI directly
  traceLog('warn', 'ModelRouter', `Using fallback: ${route.fallback}`);
  return callProvider(route.fallback, messages, route, env);
}

async function isProviderDisabled(provider: string, db: D1Client): Promise<boolean> {
  const row = await db.first<{ disabled_until: string | null }>(
    'SELECT disabled_until FROM provider_health WHERE provider = ?',
    provider
  );
  if (!row?.disabled_until) return false;
  return new Date(row.disabled_until) > new Date();
}

async function recordSuccess(provider: string, _latencyMs: number, db: D1Client): Promise<void> {
  await db.execute(
    `INSERT INTO provider_health
      (provider, consecutive_failures, total_calls, last_success_at, updated_at)
    VALUES (?, 0, 1, datetime('now'), datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      consecutive_failures = 0,
      total_calls = total_calls + 1,
      last_success_at = datetime('now'),
      disabled_until = NULL,
      updated_at = datetime('now')`,
    provider
  );
}

async function recordFailure(provider: string, error: string, db: D1Client): Promise<void> {
  await db.execute(
    `INSERT INTO provider_health
      (provider, consecutive_failures, total_calls, total_failures, last_failure_at, updated_at)
    VALUES (?, 1, 1, 1, datetime('now'), datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      consecutive_failures = consecutive_failures + 1,
      total_calls = total_calls + 1,
      total_failures = total_failures + 1,
      last_failure_at = datetime('now'),
      disabled_until = CASE
        WHEN consecutive_failures + 1 >= 3
        THEN datetime('now', '+5 minutes')
        ELSE disabled_until
      END,
      updated_at = datetime('now')`,
    provider
  );
}
