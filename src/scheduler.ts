/**
 * Scheduler System — Tugas Terjadwal Otomatis untuk Discord Bot
 * 
 * Menggunakan Cloudflare Cron Triggers + KV untuk persistensi.
 * 
 * Alur:
 * 1. User menambahkan task via MCP tool `scheduler-add`
 * 2. Task disimpan di KV dengan jadwal cron
 * 3. Cloudflare Cron Trigger memicu `scheduled()` handler
 * 4. Scheduler mengeksekusi task yang waktunya tepat
 * 5. Hasil dikirim ke channel Discord tujuan
 */

import { AiRouter } from "./ai-router";
import { WebScout } from "./web-scout";


import { researchArticle, generateArticle, generateFallbackArticle } from "./article-writer";
import { publishArticle } from "./article-publisher";
import { turboHeavyArticle } from "./turbo-helper";

// ─── Types ─────────────────────────────────────────────────

export type ScheduledAction =
  | "send-message"       // Kirim pesan teks
  | "ai-prompt"          // AI generate + kirim pesan
  | "ai-article"         // AI generate artikel + embed + gambar
  | "purge-channel"      // Bersihkan channel
  | "custom-webhook"     // Panggil webhook URL kustom
  | "update-status"      // Update status bot Discord
  | "github-run";        // Jalankan perintah GitHub Actions

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cron: string;            // Cron expression (UTC)
  action: ScheduledAction;
  params: Record<string, any>;
  enabled: boolean;
  channel_id: string;      // Target Discord channel untuk output
  guild_id: string;        // Target Discord guild
  created_at: string;      // ISO timestamp
  updated_at: string;      // ISO timestamp
  last_run: string | null; // ISO timestamp
  last_status: "success" | "failed" | "pending" | null;
  run_count: number;
  timezone?: string;       // Optional timezone offset
}

export interface TaskLogEntry {
  task_id: string;
  task_name: string;
  timestamp: string;       // ISO timestamp
  status: "success" | "failed";
  message: string;
  duration_ms: number;
}

// ─── KV Keys ───────────────────────────────────────────────

const KV_TASKS_KEY = "scheduler:tasks";
const KV_LOGS_PREFIX = "scheduler:logs:";
const MAX_LOGS_PER_TASK = 50;

// ─── Helper: Parse Cron ───────────────────────────────────
// Simple cron checker — cek apakah sekarang cocok dengan cron expression

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseCronField(field: string, min: number, max: number): number[] {
  const result: number[] = [];
  
  // Handle comma-separated values
  for (const part of field.split(",")) {
    // Handle step: */5, 1-10/2
    const stepMatch = part.match(/^(\d+|\*)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!stepMatch) continue;
    
    const [, startStr, endStr, stepStr] = stepMatch;
    const step = stepStr ? parseInt(stepStr) : 1;
    
    if (startStr === "*") {
      for (let i = min; i <= max; i += step) result.push(i);
    } else {
      const start = parseInt(startStr);
      const end = endStr ? parseInt(endStr) : start;
      for (let i = start; i <= end; i += step) result.push(i);
    }
  }
  
  return Array.from(new Set(result)).sort((a, b) => a - b);
}

function parseCron(cron: string): CronFields {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${cron}". Expected 5 fields.`);
  }
  
  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6), // 0=Sunday
  };
}

function cronMatches(cron: string, date: Date = new Date()): boolean {
  try {
    const fields = parseCron(cron);
    const utc = date;
    
    // Convert JS Sunday=0 to cron Sunday=0
    const minute = utc.getUTCMinutes();
    const hour = utc.getUTCHours();
    const dayOfMonth = utc.getUTCDate();
    const month = utc.getUTCMonth() + 1; // JS months are 0-based
    const dayOfWeek = utc.getUTCDay(); // 0=Sunday
    
    return (
      fields.minute.includes(minute) &&
      fields.hour.includes(hour) &&
      fields.dayOfMonth.includes(dayOfMonth) &&
      fields.month.includes(month) &&
      fields.dayOfWeek.includes(dayOfWeek)
    );
  } catch {
    return false;
  }
}

// ─── Task Storage ──────────────────────────────────────────

export async function getTasks(env: any): Promise<ScheduledTask[]> {
  try {
    const raw = await env.SCHEDULER_KV.get(KV_TASKS_KEY, "text");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveTasks(env: any, tasks: ScheduledTask[]): Promise<void> {
  await env.SCHEDULER_KV.put(KV_TASKS_KEY, JSON.stringify(tasks));
}

export async function addTask(
  env: any,
  task: Omit<ScheduledTask, "id" | "created_at" | "updated_at" | "last_run" | "last_status" | "run_count">
): Promise<ScheduledTask> {
  const tasks = await getTasks(env);
  
  const newTask: ScheduledTask = {
    ...task,
    id: crypto.randomUUID().slice(0, 8),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_run: null,
    last_status: null,
    run_count: 0,
  };
  
  tasks.push(newTask);
  await saveTasks(env, tasks);
  return newTask;
}

export async function updateTask(
  env: any,
  taskId: string,
  updates: Partial<ScheduledTask>
): Promise<ScheduledTask | null> {
  const tasks = await getTasks(env);
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return null;
  
  tasks[idx] = {
    ...tasks[idx],
    ...updates,
    id: tasks[idx].id, // Prevent ID change
    updated_at: new Date().toISOString(),
  };
  
  await saveTasks(env, tasks);
  return tasks[idx];
}

export async function deleteTask(env: any, taskId: string): Promise<boolean> {
  const tasks = await getTasks(env);
  const filtered = tasks.filter(t => t.id !== taskId);
  if (filtered.length === tasks.length) return false;
  await saveTasks(env, filtered);
  return true;
}

export async function getTask(env: any, taskId: string): Promise<ScheduledTask | null> {
  const tasks = await getTasks(env);
  return tasks.find(t => t.id === taskId) || null;
}

// ─── Task Logs ─────────────────────────────────────────────

export async function addTaskLog(env: any, log: TaskLogEntry): Promise<void> {
  const logKey = `${KV_LOGS_PREFIX}${log.task_id}`;
  
  // Get existing logs
  let logs: TaskLogEntry[] = [];
  try {
    const raw = await env.SCHEDULER_KV.get(logKey, "text");
    logs = raw ? JSON.parse(raw) : [];
  } catch {
    logs = [];
  }
  
  // Add new log
  logs.unshift(log);
  
  // Trim to max
  if (logs.length > MAX_LOGS_PER_TASK) {
    logs = logs.slice(0, MAX_LOGS_PER_TASK);
  }
  
  await env.SCHEDULER_KV.put(logKey, JSON.stringify(logs));
}

export async function clearAllTasks(env: any): Promise<number> {
  const tasks = await getTasks(env);
  const count = tasks.length;
  await saveTasks(env, []);
  return count;
}

export async function getTaskLogs(env: any, taskId: string): Promise<TaskLogEntry[]> {
  try {
    const raw = await env.SCHEDULER_KV.get(`${KV_LOGS_PREFIX}${taskId}`, "text");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Action Executors ──────────────────────────────────────

async function executeSendMessage(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN tidak tersedia");
  
  const content = task.params.message || "⏰ **Tugas Terjadwal**";
  
  const res = await fetch(
    `https://discord.com/api/v10/channels/${task.channel_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: content,
        ...(task.params.embed ? { embeds: [task.params.embed] } : {}),
      }),
    }
  );
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API error (${res.status}): ${err}`);
  }
  
  return `✅ Pesan terkirim ke <#${task.channel_id}>`;
}

async function executeAiPrompt(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const prompt = task.params.prompt || "Buatkan pengumuman singkat untuk hari ini.";

  // Pakai AI Router — auto-failover antar provider
  const router = new AiRouter(env);
  const response = await router.chat([{ role: "user", content: prompt }]);

  // Kirim hasil ke Discord
  const token = env.DISCORD_TOKEN;
  const res = await fetch(
    `https://discord.com/api/v10/channels/${task.channel_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `**🤖 Scheduled AI — ${task.name}**\n\n${response.slice(0, 1900)}`,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API error (${res.status}): ${err}`);
  }

  return `✅ AI Response terkirim ke <#${task.channel_id}>`;
}

async function executePurgeChannel(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN tidak tersedia");
  
  const count = Math.min(task.params.jumlah || 10, 100);
  
  const msgRes = await fetch(
    `https://discord.com/api/v10/channels/${task.channel_id}/messages?limit=${count}`,
    { headers: { Authorization: `Bot ${token}` } }
  );
  
  if (!msgRes.ok) {
    const err = await msgRes.text();
    throw new Error(`Gagal ambil pesan (${msgRes.status}): ${err}`);
  }
  
  const messages: any[] = await msgRes.json();
  if (messages.length === 0) return "📭 Tidak ada pesan yang bisa dihapus.";
  
  const ids = messages.map(m => m.id);
  
  const delRes = await fetch(
    `https://discord.com/api/v10/channels/${task.channel_id}/messages/bulk-delete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: ids }),
    }
  );
  
  if (!delRes.ok) {
    const err = await delRes.text();
    // Bulk delete bisa gagal kalau pesan > 14 hari — fallback ke delete individual
    if (ids.length === 1) {
      const singleRes = await fetch(
        `https://discord.com/api/v10/channels/${task.channel_id}/messages/${ids[0]}`,
        { method: "DELETE", headers: { Authorization: `Bot ${token}` } }
      );
      if (!singleRes.ok) throw new Error(`Gagal hapus pesan: ${await singleRes.text()}`);
      return `✅ 1 pesan dihapus dari <#${task.channel_id}>`;
    }
    throw new Error(`Gagal bulk delete (${delRes.status}): ${err}`);
  }
  
  return `✅ ${ids.length} pesan dihapus dari <#${task.channel_id}>`;
}

async function executeCustomWebhook(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const url = task.params.webhook_url;
  if (!url) throw new Error("webhook_url tidak diset di params");
  
  const method = task.params.method || "POST";
  const headers = task.params.headers || { "Content-Type": "application/json" };
  const body = task.params.body ? JSON.stringify(task.params.body) : undefined;
  
  const res = await fetch(url, {
    method,
    headers,
    body,
  });
  
  const responseText = await res.text();
  return `✅ Webhook ${method} ${url} → ${res.status}: ${responseText.slice(0, 200)}`;
}

async function executeUpdateStatus(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN tidak tersedia");
  
  // Update bot presence via WebSocket not possible from Worker,
  // but we can send a message as status indicator
  const status = task.params.status || "🟢 Bot aktif — tugas terjadwal berjalan";
  
  const res = await fetch(
    `https://discord.com/api/v10/channels/${task.channel_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `📊 **Status Update:** ${status}`,
      }),
    }
  );
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord API error (${res.status}): ${err}`);
  }
  
  return `✅ Status terkirim ke <#${task.channel_id}>`;
}

// ─── Web Research ─────────────────────────────────────────
// ─── Web Research — Berita + Review Multi-Sumber ────────────
// v4.0: Gak cuma berita, tapi juga review & opini dari berbagai platform!
// WebScout search snippets + scrape review untuk AI summary

// ─── Artikel System — MODULAR (v4.1) ──────────────────────
// Research  → article-writer.ts (researchArticle)
// Generate  → article-writer.ts (generateArticle + generateFallbackArticle)
// Publish   → article-publisher.ts (publishArticle)
//
// executeAiArticle adalah satu-satunya entry point yang dipanggil
// dari scheduler dan MCP handler.

export async function executeAiArticle(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN tidak tersedia");
  const topic = task.params.topic || task.params.prompt || "berita anime/manga/game terkini";
  const channelId = task.channel_id;

  // ═══ STEP 1: RESEARCH via article-writer ════════════════
  let research = { summary: "Gunakan pengetahuan umum.", reviewSummary: "" };
  try {
    research = await researchArticle(topic, env);
    console.log(`✅ Research selesai: ${research.summary.slice(0, 100)}...`);
  } catch (e: any) {
    console.warn(`⚠️ Research gagal (lanjut tanpa data): ${e.message}`);
  }

  // ═══ STEP 2: AI GENERATE — PARALLEL (Worker + Turbo race) ═══
  // Jalankan Worker AI generate & Turbo Layer BERSAMAAN.
  // Dulu sequential: Worker (30-60s) → Turbo (0-55s) = TOTAL 85-115s ❌
  // Sekarang parallel: max(Worker, Turbo) = paling lama ~45s ✅
  let article: any;

  // Start both in parallel
  const workerArticlePromise = (async () => {
    try {
      return await generateArticle(topic, research, env);
    } catch (e: any) {
      console.warn(`⚠️ Worker article gagal: ${e.message}`);
      return generateFallbackArticle(topic);
    }
  })();

  const turboArticlePromise = (async () => {
    try {
      const t = await turboHeavyArticle(env, topic, research);
      if (t && t.title && Array.isArray(t.sections) && t.sections.length > 0) {
        return t;
      }
      return null;
    } catch {
      return null;
    }
  })();

  // Wait for both — prefer Turbo if valid
  const [workerArticle, turboArticle] = await Promise.all([workerArticlePromise, turboArticlePromise]);
  if (turboArticle) {
    article = turboArticle;
    console.log(`✅ [Turbo] Artikel dari Turbo Layer override Worker`);
  } else {
    article = workerArticle;
    console.log(`ℹ️ Worker article dipakai (Turbo tidak valid/gagal)`);
  }

  // ═══ STEP 3-4: PUBLISH ke Discord via article-publisher ══
  // Pass env LANGSUNG ke publishArticle, bukan via globalThis!
  const pubResult = await publishArticle(token, channelId, article, env);

  if (!pubResult.success) {
    return `⚠️ Artikel gagal dikirim: ${pubResult.error}`;
  }

  const headlineTitle = article.title || `📰 ${topic}`;
  return `✅ "${headlineTitle.slice(0, 60)}..." → ${pubResult.sectionsPublished} section${pubResult.imagesPublished > 0 ? ` • ${pubResult.imagesPublished} gambar` : ""}${pubResult.videosPublished > 0 ? ` • ${pubResult.videosPublished} video` : ""}`;
}

/**
 * Cari video YouTube via VideoScraper (multi-source + scoring + validasi).
 * Fungsi ini DIGANTI oleh video-scraper.ts yang lebih akurat.
 * Discord auto-embed YouTube links → muncul thumbnail + tombol play.
 * 
 * Note: Implementasi lama pindah ke src/video-scraper.ts dengan:
 * - Multi-source parallel (DDG + Invidious + YT API + Google)
 * - Token-based scoring (0-100)
 * - Validasi URL via oEmbed/HEAD
 * - Cache KV 1 jam
 * - Fallback query
 */

async function executeGithubRun(
  task: ScheduledTask,
  env: any
): Promise<string> {
  const token = env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN tidak tersedia");
  
  const owner = task.params.owner || "Netuv";
  const repo = task.params.repo;
  const command = task.params.command || "echo 'Scheduled task run'";
  
  if (!repo) throw new Error("repo tidak diset di params");
  
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/remote-run.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "discord-mcp-bot-scheduler",
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          command,
          shell: task.params.shell || "bash",
          working_directory: task.params.working_directory || ".",
          run_id: `sched-${task.id}-${Date.now()}`,
        },
      }),
    }
  );
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${err}`);
  }
  
  return `✅ GitHub Actions di-trigger: ${owner}/${repo} → \`${command}\``;
}

// ─── Main Executor ─────────────────────────────────────────

async function executeTask(task: ScheduledTask, env: any): Promise<string> {
  switch (task.action) {
    case "send-message":
      return executeSendMessage(task, env);
    case "ai-prompt":
      return executeAiPrompt(task, env);
    case "ai-article":
      return executeAiArticle(task, env);
    case "purge-channel":
      return executePurgeChannel(task, env);
    case "custom-webhook":
      return executeCustomWebhook(task, env);
    case "update-status":
      return executeUpdateStatus(task, env);
    case "github-run":
      return executeGithubRun(task, env);
    default:
      throw new Error(`Unknown action: ${task.action}`);
  }
}

// ─── Cron Handler (Dipanggil dari scheduled() di index.ts) ─

export async function handleScheduled(env: any, ctx: any): Promise<{ executed: number; failed: number; logs: string[] }> {
  const tasks = await getTasks(env);
  const now = new Date();
  
  let executed = 0;
  let failed = 0;
  const logs: string[] = [];
  
  // Cari task yang waktunya cocok
  const dueTasks = tasks.filter(t => {
    if (!t.enabled) return false;
    return cronMatches(t.cron, now);
  });
  
  if (dueTasks.length === 0) {
    return { executed: 0, failed: 0, logs: ["Tidak ada task yang perlu dijalankan sekarang."] };
  }
  
  // Eksekusi task satu per satu (pakai waitUntil agar tidak block cron)
  for (const task of dueTasks) {
    const startTime = Date.now();
    
    try {
      const result = await executeTask(task, env);
      const duration = Date.now() - startTime;
      
      // Update task status
      await updateTask(env, task.id, {
        last_run: new Date().toISOString(),
        last_status: "success",
        run_count: task.run_count + 1,
      });
      
      // Log success
      await addTaskLog(env, {
        task_id: task.id,
        task_name: task.name,
        timestamp: new Date().toISOString(),
        status: "success",
        message: result,
        duration_ms: duration,
      });
      
      executed++;
      logs.push(`✅ "${task.name}": ${result} (${duration}ms)`);
    } catch (e: any) {
      const duration = Date.now() - startTime;
      
      // Update task status
      await updateTask(env, task.id, {
        last_run: new Date().toISOString(),
        last_status: "failed",
        run_count: task.run_count + 1,
      });
      
      // Log failure
      await addTaskLog(env, {
        task_id: task.id,
        task_name: task.name,
        timestamp: new Date().toISOString(),
        status: "failed",
        message: e.message,
        duration_ms: duration,
      });
      
      failed++;
      logs.push(`❌ "${task.name}": ${e.message} (${duration}ms)`);
    }
  }
  
  return { executed, failed, logs };
}

// ─── Test Cron — untuk testing manual via API ──────────────

export async function handleTestCron(env: any, taskId?: string): Promise<{ executed: number; failed: number; logs: string[] }> {
  const tasks = await getTasks(env);
  let targetTasks = tasks.filter(t => t.enabled);
  
  if (taskId) {
    targetTasks = targetTasks.filter(t => t.id === taskId);
    if (targetTasks.length === 0) {
      return { executed: 0, failed: 0, logs: [`Task "${taskId}" tidak ditemukan atau tidak aktif.`] };
    }
  }
  
  let executed = 0;
  let failed = 0;
  const logs: string[] = [];
  
  for (const task of targetTasks) {
    const startTime = Date.now();
    
    try {
      const result = await executeTask(task, env);
      const duration = Date.now() - startTime;
      
      await updateTask(env, task.id, {
        last_run: new Date().toISOString(),
        last_status: "success",
        run_count: task.run_count + 1,
      });
      
      await addTaskLog(env, {
        task_id: task.id,
        task_name: task.name,
        timestamp: new Date().toISOString(),
        status: "success",
        message: result,
        duration_ms: duration,
      });
      
      executed++;
      logs.push(`✅ "${task.name}": ${result} (${duration}ms)`);
    } catch (e: any) {
      const duration = Date.now() - startTime;
      
      await updateTask(env, task.id, {
        last_run: new Date().toISOString(),
        last_status: "failed",
        run_count: task.run_count + 1,
      });
      
      await addTaskLog(env, {
        task_id: task.id,
        task_name: task.name,
        timestamp: new Date().toISOString(),
        status: "failed",
        message: e.message,
        duration_ms: duration,
      });
      
      failed++;
      logs.push(`❌ "${task.name}": ${e.message} (${duration}ms)`);
    }
  }
  
  return { executed, failed, logs };
}
