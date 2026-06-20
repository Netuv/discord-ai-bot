/**
 * User Config — Penyimpanan preferensi provider/model per user
 *
 * Disimpan di KV (SCHEDULER_KV) dengan key: `user:config:{user_id}`
 */

const KV_PREFIX = "user:config:";

export interface UserAiConfig {
  userId: string;
  providerName: string | null;   // null = auto (router default)
  modelName: string | null;      // null = default model provider
  updatedAt: string;
}

export async function getUserConfig(env: any, userId: string): Promise<UserAiConfig | null> {
  try {
    const raw = await env.SCHEDULER_KV.get(`${KV_PREFIX}${userId}`, "text");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setUserConfig(
  env: any,
  userId: string,
  config: { providerName?: string | null; modelName?: string | null }
): Promise<UserAiConfig> {
  const existing = await getUserConfig(env, userId);

  const newConfig: UserAiConfig = {
    userId,
    providerName: config.providerName !== undefined ? config.providerName : (existing?.providerName ?? null),
    modelName: config.modelName !== undefined ? config.modelName : (existing?.modelName ?? null),
    updatedAt: new Date().toISOString(),
  };

  await env.SCHEDULER_KV.put(`${KV_PREFIX}${userId}`, JSON.stringify(newConfig));
  return newConfig;
}

export async function clearUserConfig(env: any, userId: string): Promise<void> {
  try {
    await env.SCHEDULER_KV.delete(`${KV_PREFIX}${userId}`);
  } catch {
    // ignore if not exists
  }
}
