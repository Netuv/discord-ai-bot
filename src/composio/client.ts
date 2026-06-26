import { safeFetch } from '../core/safe-fetch';
import { AppError, ErrorCode } from '../core/errors';

const COMPOSIO_BASE = 'https://backend.composio.dev/api';

export async function composioExecute(
  apiKey: string,
  connectedAccountId: string,
  actionId: string,
  input: Record<string, unknown>
): Promise<unknown> {
  const res = await safeFetch(`${COMPOSIO_BASE}/tools/execute`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectedAccountId, actionId, input, version: 'latest' }),
    timeoutMs: 20_000,
  });

  if (!res || !res.ok) {
    const body = await res?.text().catch(() => 'unknown');
    throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `Composio ${res?.status}: ${body?.slice(0, 200)}`);
  }

  return res.json();
}
