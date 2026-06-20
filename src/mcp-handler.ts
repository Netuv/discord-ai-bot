/**
 * MCP SSE Transport — Lightweight implementation untuk Cloudflare Workers
 * 
 * Protocol: https://spec.modelcontextprotocol.io/specification/2025-03-26/
 * 
 * Flow:
 * 1. GET /mcp → SSE stream, server kirim "endpoint" event + sessionId
 * 2. POST /mcp?sessionId=xxx → JSON-RPC request, response via SSE
 * 
 * Kompatibel dengan: Claude Desktop, Cursor, VS Code, dll.
 */

import { z } from "zod";
import { queueAction, confirmAction, cancelAction, listPendingActions, formatPendingAction, getPendingAction } from "./mcp-confirm";
import { addTask, updateTask, deleteTask, getTask, getTasks, getTaskLogs, handleTestCron, executeAiArticle } from "./scheduler";
import { AiRouter, defaultProviderModels } from "./ai-router";
import { WebScout } from "./web-scout";
import { searchAnimeImage, downloadImage } from "./image-scraper";
import { searchYouTubeVideo } from "./video-scraper";
import { GitHubStudio } from "./github-studio";
import { researchArticle, generateArticle, generateFallbackArticle } from "./article-writer";
import { publishArticle } from "./article-publisher";

// ─── Types ─────────────────────────────────────────────────

interface ToolInputSchema {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  handler: (args: Record<string, any>) => Promise<{ content: { type: string; text: string }[] }>;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// ─── AI Helpers ────────────────────────────────────────────

let _env: any = {};
let _aiRouter: AiRouter | null = null;

function getAiRouter(): AiRouter {
  if (!_aiRouter) {
    _aiRouter = new AiRouter(_env);
  }
  return _aiRouter;
}

export function setEnv(env: any) {
  _env = env;
  _aiRouter = null; // Reset router kalau env berubah
}

export function getEnv(): any {
  return _env;
}

async function aiChat(messages: { role: string; content: string }[]): Promise<string> {
  try {
    return await getAiRouter().chat(messages as any);
  } catch (e: any) {
    return `Error AI: ${e.message}`;
  }
}

async function aiPrompt(system: string, user: string): Promise<string> {
  return aiChat([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}

// ─── AI Command Generator ───────────────────────────────────
// Ubah bahasa manusia ke perintah terminal yang tepat

async function aiGenerateCommand(intent: string, repo: string): Promise<{ command: string; shell: string; working_directory: string }> {
  const systemPrompt = (
    `Kamu adalah ahli terminal Linux. Tugasmu mengubah permintaan bahasa manusia menjadi perintah shell yang tepat.\n` +
    `Konteks: repository GitHub "${repo}" adalah project Cloudflare Workers (TypeScript).\n` +
    `BALAS HANYA DENGAN FORMAT JSON INI, tanpa teks lain:\n` +
    `{"command": "perintah shell", "shell": "bash", "working_directory": "."}\n` +
    `Contoh:\n` +
    `- "update packages" → {"command": "npm update", "shell": "bash", "working_directory": "."}\n` +
    `- "cek isi folder" → {"command": "ls -la", "shell": "bash", "working_directory": "."}\n` +
    `- "deploy ke cloudflare" → {"command": "npx wrangler deploy", "shell": "bash", "working_directory": "."}\n` +
    `- "install sharp" → {"command": "npm install sharp", "shell": "bash", "working_directory": "."}\n` +
    `- "git pull" → {"command": "git pull origin master", "shell": "bash", "working_directory": "."}`
  );
  const result = await aiPrompt(systemPrompt, intent);
  try {
    const parsed = JSON.parse(result);
    return {
      command: parsed.command || intent,
      shell: parsed.shell || "bash",
      working_directory: parsed.working_directory || ".",
    };
  } catch {
    // Fallback: pakai intent mentah sebagai command
    return { command: intent, shell: "bash", working_directory: "." };
  }
}

// ─── Discord Formatter ─────────────────────────────────────
// Discord supports Markdown: **bold**, *italic*, `code`, ```block```, > quote, - list, [link](url)
// Discord does NOT support: HTML, <br>, images inline, colored text

function sanitizeForDiscord(text: string): string {
  if (!text) return "";
  // Hapus HTML tags
  let clean = text.replace(/<[^>]+>/g, "");
  // Ganti multiple newline jadi max 2
  clean = clean.replace(/\n{3,}/g, "\n\n");
  // Trim
  clean = clean.trim();
  return clean;
}

function codeBlock(lang: string, code: string): string {
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

function inlineCode(text: string): string {
  return `\`${text}\``;
}

function bold(text: string): string {
  return `**${text}**`;
}

function italic(text: string): string {
  return `*${text}*`;
}

function bulletList(items: string[]): string {
  return items.map(i => `• ${i}`).join("\n");
}

function numberedList(items: string[]): string {
  return items.map((i, idx) => `${idx + 1}. ${i}`).join("\n");
}

function divider(): string {
  return "───";
}

function header(lvl: 1|2|3, text: string): string {
  const prefix = "#".repeat(lvl);
  return `${prefix} ${text}`;
}

// ─── Discord Embed Builder ─────────────────────────────────
// Untuk rich embed (butuh izin embed links di channel)

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

function buildEmbed(params: DiscordEmbed): any {
  return {
    embeds: [{
      title: params.title?.slice(0, 256),
      description: params.description?.slice(0, 4096),
      color: params.color ?? 0x5865F2, // Discord blurple
      fields: params.fields?.map(f => ({
        name: f.name.slice(0, 256),
        value: f.value.slice(0, 1024),
        inline: f.inline ?? false,
      })),
      footer: params.footer ? { text: params.footer.text.slice(0, 2048) } : undefined,
      timestamp: params.timestamp ?? new Date().toISOString(),
    }],
  };
}

// ─── Action Handler Registrations ─────────────────────────
// Stored for execution via confirm-action tool

const actionHandlers: Record<string, (params: Record<string, any>) => Promise<{ content: { type: string; text: string }[] }>> = {};

async function requireConfirm(
  action: string,
  params: Record<string, any>,
  description: string,
  requiredConfirms: number = 1
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const entry = queueAction(action, params, description, requiredConfirms);
    return {
      content: [{
        type: "text",
        text: (
          `${bold("⚠️ KONFIRMASI DIPERLUKAN")}\n${divider()}\n` +
          `${formatPendingAction(entry)}\n${divider()}\n` +
          `Gunakan tool ${inlineCode("confirm-action")} dengan kode ${inlineCode(entry.code)} untuk menjalankan aksi ini.\n` +
          `Atau ${inlineCode("cancel-action")} ${inlineCode(entry.code)} untuk membatalkan.`
        )
      }]
    };
  } catch (e: any) {
    return { content: [{ type: "text", text: `❌ ${e.message}` }] };
  }
}

// ─── Admin Action Handlers ─────────────────────────────────

actionHandlers["purge-channel"] = async ({ channel_id, jumlah, user_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  const count = Math.min(jumlah || 10, 100);
  try {
    let fetchUrl = `https://discord.com/api/v10/channels/${channel_id}/messages?limit=${count}`;
    if (user_id) fetchUrl += `&author_id=${user_id}`;
    const msgRes = await fetch(fetchUrl, { headers: { Authorization: `Bot ${token}` } });
    if (!msgRes.ok) {
      const err = await msgRes.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal ambil pesan")} (${msgRes.status}): ${err}` }] };
    }
    const messages: any = await msgRes.json();
    if (messages.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada pesan yang bisa dihapus." }] };
    const ids = messages.map((m: any) => m.id);
    const delRes = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/bulk-delete`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: ids }),
    });
    if (delRes.ok) {
      return { content: [{ type: "text", text: `${bold(`✅ ${ids.length} Pesan Dihapus`)} dari ${inlineCode(channel_id)}${user_id ? ` (filter user: ${inlineCode(user_id)})` : ""}` }] };
    } else {
      const err = await delRes.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal hapus")} (${delRes.status}): ${err}\n\nCatatan: Bulk delete hanya untuk pesan < 14 hari dan minimal 2 pesan.` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["ban-user"] = async ({ guild_id, user_id, alasan, hapus_pesan }) => {
  const token = getEnv().DISCORD_TOKEN;
  const days = Math.min(Math.max(hapus_pesan || 0, 0), 7);
  try {
    const body: any = { reason: alasan || "Melanggar aturan server" };
    if (days > 0) body.delete_message_days = days;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/bans/${user_id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("🔨 User Dibanned")}\n• User: ${inlineCode(user_id)}\n• Alasan: ${sanitizeForDiscord(alasan || "Melanggar aturan server")}\n• Hapus pesan: ${days} hari` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Ban")} (${res.status}): ${err}\n\nPastikan bot punya izin "Ban Members" dan user ID benar.` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["unban-user"] = async ({ guild_id, user_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/bans/${user_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ User Di-unban")}\nUser: ${inlineCode(user_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Unban")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["kick-user"] = async ({ guild_id, user_id, alasan }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {};
    if (alasan) body.reason = alasan;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("👢 User Di-kick")}\n• User: ${inlineCode(user_id)}${alasan ? `\n• Alasan: ${sanitizeForDiscord(alasan)}` : ""}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Kick")} (${res.status}): ${err}\n\nPastikan bot punya izin "Kick Members".` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["timeout-user"] = async ({ guild_id, user_id, durasi, alasan }) => {
  const token = getEnv().DISCORD_TOKEN;
  const menit = Math.min(Math.max(durasi || 60, 0), 40320);
  const ms = menit * 60 * 1000;
  const sampai = new Date(Date.now() + ms).toISOString();
  try {
    const body: any = { communication_disabled_until: sampai };
    if (alasan) body.reason = alasan;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("🔇 User Di-timeout")}\n• User: ${inlineCode(user_id)}\n• Durasi: ${menit} menit${alasan ? `\n• Alasan: ${sanitizeForDiscord(alasan)}` : ""}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Timeout")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["remove-timeout"] = async ({ guild_id, user_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ communication_disabled_until: null }),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Timeout Dihapus")} untuk ${inlineCode(user_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["add-role"] = async ({ guild_id, user_id, role_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Role Ditambahkan")}\n• User: ${inlineCode(user_id)}\n• Role: ${inlineCode(role_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}\n\nPastikan bot punya role hierarchy yang cukup.` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["remove-role"] = async ({ guild_id, user_id, role_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}/roles/${role_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Role Dihapus")}\n• User: ${inlineCode(user_id)}\n• Role: ${inlineCode(role_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-channel"] = async ({ channel_id, alasan }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const headers: any = { Authorization: `Bot ${token}` };
    if (alasan) headers["X-Audit-Log-Reason"] = alasan;
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}`, {
      method: "DELETE",
      headers,
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("🗑️ Channel Dihapus")} • ${inlineCode(channel_id)}${alasan ? `\nAlasan: ${sanitizeForDiscord(alasan)}` : ""}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-channel"] = async ({ guild_id, nama, topik, kategori }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {
      name: nama.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      type: 0,
    };
    if (topik) body.topic = topik;
    if (kategori) body.parent_id = kategori;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ch: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Channel Dibuat")}\n• Nama: #${ch.name}\n• ID: ${inlineCode(ch.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-message"] = async ({ channel_id, message_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Pesan Dihapus")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Pesan")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["pin-message"] = async ({ channel_id, message_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/pins/${message_id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("📌 Pesan Di-pin")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Pin")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["unpin-message"] = async ({ channel_id, message_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/pins/${message_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Unpin Pesan")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Unpin")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-thread"] = async ({ channel_id, name, message_id, archive_duration }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = { name };
    if (archive_duration) body.auto_archive_duration = archive_duration;
    let url: string;
    if (message_id) {
      url = `https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}/threads`;
    } else {
      url = `https://discord.com/api/v10/channels/${channel_id}/threads`;
      body.type = 11; // GUILD_PUBLIC_THREAD
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ch: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Thread Dibuat")}\n• Nama: ${ch.name}\n• ID: ${inlineCode(ch.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Thread")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["archive-thread"] = async ({ channel_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Thread Diarsipkan")}\n• Channel: ${inlineCode(channel_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Arsip")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["unarchive-thread"] = async ({ channel_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Thread Dibuka Kembali")}\n• Channel: ${inlineCode(channel_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buka Arsip")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["crosspost-message"] = async ({ channel_id, message_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}/crosspost`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("📢 Pesan Dipublikasikan")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Crosspost")} (${res.status}): ${err}\n\nPastikan channel adalah announcement channel.` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-webhook"] = async ({ channel_id, name, avatar_url }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = { name };
    if (avatar_url) {
      const imgRes = await fetch(avatar_url);
      const imgBuf = await imgRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
      body.avatar = `data:${imgRes.headers.get("content-type") || "image/png"};base64,${base64}`;
    }
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/webhooks`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const wh: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Webhook Dibuat")}\n• Nama: ${wh.name}\n• ID: ${inlineCode(wh.id)}\n• Token: ${inlineCode(wh.token?.slice(0, 10) + "...")}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Webhook")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-webhook"] = async ({ webhook_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${webhook_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Webhook Dihapus")}\n• ID: ${inlineCode(webhook_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Webhook")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-emoji"] = async ({ guild_id, name, image_url }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const imgRes = await fetch(image_url);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
    const image = `data:${imgRes.headers.get("content-type") || "image/png"};base64,${base64}`;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/emojis`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, image }),
    });
    if (res.ok) {
      const emoji: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Emoji Dibuat")}\n• Nama: ${emoji.name}\n• ID: ${inlineCode(emoji.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Emoji")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-emoji"] = async ({ guild_id, emoji_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/emojis/${emoji_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Emoji Dihapus")}\n• Guild: ${inlineCode(guild_id)}\n• Emoji: ${inlineCode(emoji_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Emoji")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-sticker"] = async ({ guild_id, name, description, image_url, tags }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const imgRes = await fetch(image_url);
    const imgBuf = await imgRes.arrayBuffer();
    const blob = new Blob([imgBuf], { type: imgRes.headers.get("content-type") || "image/png" });
    const form = new FormData();
    form.append("file", blob, "sticker.png");
    form.append("name", name);
    form.append("description", description || "");
    form.append("tags", tags || name);
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/stickers`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}` },
      body: form,
    });
    if (res.ok) {
      const sticker: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Sticker Dibuat")}\n• Nama: ${sticker.name}\n• ID: ${inlineCode(sticker.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Sticker")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-sticker"] = async ({ guild_id, sticker_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/stickers/${sticker_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Sticker Dihapus")}\n• Guild: ${inlineCode(guild_id)}\n• Sticker: ${inlineCode(sticker_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Sticker")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["modify-guild"] = async ({ guild_id, name, description, icon_url }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {};
    if (name) body.name = name;
    if (description !== undefined) body.description = description;
    if (icon_url) {
      const imgRes = await fetch(icon_url);
      const imgBuf = await imgRes.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
      body.icon = `data:${imgRes.headers.get("content-type") || "image/png"};base64,${base64}`;
    }
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const g: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Guild Diperbarui")}\n• Nama: ${g.name}\n• ID: ${inlineCode(g.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Update Guild")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["modify-member"] = async ({ guild_id, user_id, nick, deaf, mute }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {};
    if (nick !== undefined) body.nick = nick;
    if (deaf !== undefined) body.deaf = deaf;
    if (mute !== undefined) body.mute = mute;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Member Diperbarui")}\n• User: ${inlineCode(user_id)}${nick ? `\n• Nickname: ${sanitizeForDiscord(nick)}` : ""}${deaf !== undefined ? `\n• Deaf: ${deaf}` : ""}${mute !== undefined ? `\n• Mute: ${mute}` : ""}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Update Member")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["move-member"] = async ({ guild_id, user_id, channel_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id }),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Member Dipindahkan")}\n• User: ${inlineCode(user_id)}\n• Ke channel: ${inlineCode(channel_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Pindahkan Member")} (${res.status}): ${err}\n\nPastikan channel adalah voice channel.` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["disconnect-member"] = async ({ guild_id, user_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: null }),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Member Diputuskan dari Voice")}\n• User: ${inlineCode(user_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Putuskan Member")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-role"] = async ({ guild_id, name, color, hoist, mentionable }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = { name };
    if (color) body.color = parseInt(color.replace("#", ""), 16);
    if (hoist !== undefined) body.hoist = hoist;
    if (mentionable !== undefined) body.mentionable = mentionable;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/roles`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const role: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Role Dibuat")}\n• Nama: ${role.name}\n• ID: ${inlineCode(role.id)}${role.color ? `\n• Color: #${role.color.toString(16).padStart(6, "0")}` : ""}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Role")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["edit-role"] = async ({ guild_id, role_id, name, color, hoist, mentionable }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {};
    if (name !== undefined) body.name = name;
    if (color !== undefined) body.color = parseInt(color.replace("#", ""), 16);
    if (hoist !== undefined) body.hoist = hoist;
    if (mentionable !== undefined) body.mentionable = mentionable;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/roles/${role_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const role: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Role Diperbarui")}\n• Nama: ${role.name}\n• ID: ${inlineCode(role.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Edit Role")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-role"] = async ({ guild_id, role_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/roles/${role_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Role Dihapus")}\n• Guild: ${inlineCode(guild_id)}\n• Role: ${inlineCode(role_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Role")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["edit-channel"] = async ({ channel_id, name, topic, slowmode, nsfw }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {};
    if (name) body.name = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (topic !== undefined) body.topic = topic;
    if (slowmode !== undefined) body.rate_limit_per_user = slowmode;
    if (nsfw !== undefined) body.nsfw = nsfw;
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ch: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Channel Diperbarui")}\n• Nama: #${ch.name}\n• ID: ${inlineCode(ch.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Edit Channel")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-automod-rule"] = async ({ guild_id, name, event_type, actions, trigger_type, trigger_metadata }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {
      name,
      event_type: parseInt(event_type),
      actions: JSON.parse(actions),
      trigger_type: parseInt(trigger_type),
    };
    if (trigger_metadata) body.trigger_metadata = JSON.parse(trigger_metadata);
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/auto-moderation/rules`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const rule: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ AutoMod Rule Dibuat")}\n• Nama: ${rule.name}\n• ID: ${inlineCode(rule.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat AutoMod Rule")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-automod-rule"] = async ({ guild_id, rule_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/auto-moderation/rules/${rule_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ AutoMod Rule Dihapus")}\n• Guild: ${inlineCode(guild_id)}\n• Rule: ${inlineCode(rule_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus AutoMod Rule")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["prune-members"] = async ({ guild_id, days, compute_only }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = { days: parseInt(days) || 7 };
    if (compute_only) body.compute_on_prune_count = true;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/prune`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (compute_only) {
        return { content: [{ type: "text", text: `${bold("📊 Prune Count")}\n• ${data.pruned} member akan di-prune setelah ${days} hari.` }] };
      }
      return { content: [{ type: "text", text: `${bold("✅ Prune Selesai")}\n• ${data.pruned} member diprune (inactive > ${days} hari).` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Prune")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["edit-channel-permissions"] = async ({ channel_id, target_id, target_type, allow, deny }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = { type: parseInt(target_type) };
    if (allow) body.allow = allow;
    if (deny) body.deny = deny;
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/permissions/${target_id}`, {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Permission Diperbarui")}\n• Channel: ${inlineCode(channel_id)}\n• Target: ${inlineCode(target_id)}\n• Type: ${target_type === "0" ? "Role" : "Member"}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Set Permission")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-scheduled-event"] = async ({ guild_id, name, description, scheduled_start_time, scheduled_end_time, channel_id, entity_type }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const body: any = {
      name,
      description: description || "",
      scheduled_start_time,
      entity_type: parseInt(entity_type) || 3,
    };
    if (scheduled_end_time) body.scheduled_end_time = scheduled_end_time;
    if (channel_id) body.channel_id = channel_id;
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/scheduled-events`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ev: any = await res.json();
      return { content: [{ type: "text", text: `${bold("✅ Event Dibuat")}\n• Nama: ${ev.name}\n• ID: ${inlineCode(ev.id)}\n• Mulai: ${ev.scheduled_start_time}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Event")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["delete-scheduled-event"] = async ({ guild_id, event_id }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/scheduled-events/${event_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      return { content: [{ type: "text", text: `${bold("✅ Event Dihapus")}\n• Guild: ${inlineCode(guild_id)}\n• Event: ${inlineCode(event_id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Hapus Event")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["create-poll"] = async ({ channel_id, question, answers, duration_hours }) => {
  const token = getEnv().DISCORD_TOKEN;
  try {
    const parsedAnswers = typeof answers === "string" ? JSON.parse(answers) : answers;
    const pollAnswers = parsedAnswers.map((a: string) => ({
      poll_media: { text: a.slice(0, 55) },
    }));
    const body = {
      content: `📊 ${question}`,
      poll: {
        question: { text: question.slice(0, 300) },
        answers: pollAnswers.slice(0, 10),
        duration: Math.min(Math.max(duration_hours || 24, 1), 168),
      },
    };
    const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const msg: any = await res.json();
      return { content: [{ type: "text", text: `${bold("📊 Poll Dibuat")}\n• Channel: ${inlineCode(channel_id)}\n• Pertanyaan: ${sanitizeForDiscord(question)}\n• Jawaban: ${parsedAnswers.length}\n• Durasi: ${Math.min(Math.max(duration_hours || 24, 1), 168)} jam\n• Message ID: ${inlineCode(msg.id)}` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Buat Poll")} (${res.status}): ${err}` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

actionHandlers["github-run"] = async ({ owner, repo, command, shell, working_directory, run_id, intent }) => {
  const token = getEnv().GITHUB_TOKEN;
  if (!token) {
    return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset. Set via: npx wrangler secret put GITHUB_TOKEN" }] };
  }

  // Natural language → command generator
  let finalCommand = command;
  let finalShell = shell || "bash";
  let finalWorkDir = working_directory || ".";

  if (!command && intent) {
    try {
      const generated = await aiGenerateCommand(intent, repo);
      finalCommand = generated.command;
      finalShell = generated.shell;
      finalWorkDir = generated.working_directory;
    } catch (e: any) {
      return { content: [{ type: "text", text: `${bold("❌ Gagal generate command")}: ${e.message}` }] };
    }
  }

  if (!finalCommand) {
    return { content: [{ type: "text", text: "❌ Tidak ada perintah yang diberikan. Kirim 'command' atau 'intent' (bahasa manusia)." }] };
  }

  try {
    const workflowFile = "remote-run.yml";
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "discord-mcp-bot",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            command: finalCommand,
            shell: finalShell,
            working_directory: finalWorkDir,
            run_id,
          },
        }),
      }
    );
    if (res.ok) {
      const displayIntent = intent ? ` (dari: "${intent}")` : "";
      return { content: [{ type: "text", text: `${bold("🚀 GitHub Run Dispatched")}\n• Run ID: ${inlineCode(run_id)}\n• Repo: ${owner}/${repo}\n• Perintah: ${codeBlock(finalShell, finalCommand)}${displayIntent}\n${divider()}\nGunakan ${inlineCode("github-run-status")} dengan Run ID untuk cek progress.\nLink: https://github.com/${owner}/${repo}/actions` }] };
    } else {
      const err = await res.text();
      return { content: [{ type: "text", text: `${bold("❌ Gagal Dispatch")} (${res.status}): ${err}\n\nPastikan:\n1. GITHUB_TOKEN valid\n2. File .github/workflows/remote-run.yml ada di repo\n3. Token punya akses actions:write` }] };
    }
  } catch (e: any) {
    return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
  }
};

// ─── Tool Definitions ──────────────────────────────────────

const tools: ToolDefinition[] = [
  {
    name: "status",
    description: "Cek status bot dan informasi server",
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({
      content: [{ type: "text", text: `✅ Bot Discord berjalan lancar di Cloudflare Edge!\nModel AI: Router aktif (${getAiRouter().getActiveProviders().length} provider)\nRuntime: Cloudflare Workers` }],
    }),
  },
  {
    name: "ai-chat",
    description: "Bercakap-cakap dengan AI (Llama 3)",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Pertanyaan atau perintah untuk AI" },
      },
      required: ["prompt"],
    },
    handler: async ({ prompt }) => ({
      content: [{ type: "text", text: sanitizeForDiscord(await aiPrompt("Kamu adalah asisten AI yang cerdas dan membantu. Jawab dengan bahasa Indonesia. Gunakan format Markdown Discord: **bold**, *italic*, \`kode\`, > quote. JANGAN pakai HTML.", prompt)) }],
    }),
  },
  {
    name: "translate",
    description: "Terjemahkan teks ke bahasa lain",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Teks yang akan diterjemahkan" },
        bahasa: { type: "string", description: "Bahasa target (Inggris, Jepang, Prancis, Arab)", default: "Inggris" },
      },
      required: ["text"],
    },
    handler: async ({ text, bahasa }) => ({
      content: [{ type: "text", text: sanitizeForDiscord(await aiPrompt(`Kamu adalah penerjemah profesional. Terjemahkan teks ke bahasa ${bahasa || "Inggris"} dengan akurat. Hanya balas dengan hasil terjemahan saja. JANGAN pakai HTML.`, text)) }],
    }),
  },
  {
    name: "summarize",
    description: "Ringkas teks panjang menjadi poin-poin penting",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Teks yang akan diringkas" },
        poin: { type: "number", description: "Jumlah poin maksimal", default: 5 },
      },
      required: ["text"],
    },
    handler: async ({ text, poin }) => ({
      content: [{ type: "text", text: sanitizeForDiscord(await aiPrompt(`Kamu adalah perangkum profesional. Ringkas teks berikut dalam maksimal ${poin || 5} poin penting menggunakan bahasa Indonesia. Format: Poin-poin dengan bullet.`, text)) }],
    }),
  },
  {
    name: "brainstorm",
    description: "Curah pendapat ide tentang suatu topik",
    inputSchema: {
      type: "object",
      properties: {
        topik: { type: "string", description: "Topik brainstorming" },
        jumlah: { type: "number", description: "Jumlah ide", default: 5 },
      },
      required: ["topik"],
    },
    handler: async ({ topik, jumlah }) => ({
      content: [{ type: "text", text: sanitizeForDiscord(await aiPrompt(`Kamu adalah kreator inovatif. Berikan ${jumlah || 5} ide kreatif dan orisinal. Gunakan bahasa Indonesia. Format: numbered list.`, topik)) }],
    }),
  },
  {
    name: "generate-code",
    description: "Hasilkan kode program berdasarkan deskripsi",
    inputSchema: {
      type: "object",
      properties: {
        deskripsi: { type: "string", description: "Deskripsi program" },
        bahasa: { type: "string", description: "Bahasa pemrograman", default: "TypeScript" },
      },
      required: ["deskripsi"],
    },
    handler: async ({ deskripsi, bahasa }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah programmer senior. Hasilkan kode ${bahasa || "TypeScript"} yang bersih dan efisien. Sertakan penjelasan singkat.`, deskripsi) }],
    }),
  },
  {
    name: "code-review",
    description: "Review kode dan berikan saran perbaikan",
    inputSchema: {
      type: "object",
      properties: {
        kode: { type: "string", description: "Kode yang akan direview" },
        bahasa: { type: "string", description: "Bahasa pemrograman", default: "auto" },
      },
      required: ["kode"],
    },
    handler: async ({ kode, bahasa }) => ({
      content: [{ type: "text", text: sanitizeForDiscord(await aiPrompt("Kamu adalah code reviewer senior. Analisis kode: cari bug, masalah keamanan, code smell, dan saran perbaikan. Gunakan format Discord. JANGAN pakai HTML.", `Bahasa: ${bahasa || "auto"}\n\nKode:\n${kode}`)) }],
    }),
  },
  {
    name: "explain-code",
    description: "Jelaskan potongan kode secara detail",
    inputSchema: {
      type: "object",
      properties: {
        kode: { type: "string", description: "Kode yang akan dijelaskan" },
        bahasa: { type: "string", description: "Bahasa pemrograman", default: "auto" },
      },
      required: ["kode"],
    },
    handler: async ({ kode, bahasa }) => ({
      content: [{ type: "text", text: await aiPrompt("Kamu adalah mentor programming. Jelaskan kode baris per baris dengan mudah dipahami. Gunakan bahasa Indonesia.", `Bahasa: ${bahasa || "auto"}\n\nKode:\n${kode}`) }],
    }),
  },
  {
    name: "math-solve",
    description: "Selesaikan soal matematika langkah demi langkah",
    inputSchema: {
      type: "object",
      properties: {
        soal: { type: "string", description: "Soal matematika" },
      },
      required: ["soal"],
    },
    handler: async ({ soal }) => ({
      content: [{ type: "text", text: await aiPrompt("Kamu adalah tutor matematika. Selesaikan soal langkah demi langkah. Pakai bahasa Indonesia.", soal) }],
    }),
  },
  {
    name: "generate-email",
    description: "Buat email profesional berdasarkan konteks",
    inputSchema: {
      type: "object",
      properties: {
        tujuan: { type: "string", description: "Tujuan email" },
        penerima: { type: "string", description: "Nama penerima", default: "" },
        nada: { type: "string", description: "Nada email (formal/semi-formal/ramah)", default: "formal" },
      },
      required: ["tujuan"],
    },
    handler: async ({ tujuan, penerima, nada }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah asisten profesional. Buat email dengan nada ${nada || "formal"} untuk tujuan: ${tujuan}${penerima ? ` kepada ${penerima}` : ""}. Gunakan bahasa Indonesia.`, `Tujuan: ${tujuan}\nPenerima: ${penerima || "-"}\nNada: ${nada || "formal"}`) }],
    }),
  },
  {
    name: "analyze-text",
    description: "Analisis teks: sentimen, tone, dan insight",
    inputSchema: {
      type: "object",
      properties: {
        teks: { type: "string", description: "Teks yang akan dianalisis" },
      },
      required: ["teks"],
    },
    handler: async ({ teks }) => ({
      content: [{ type: "text", text: await aiPrompt("Kamu adalah analis teks. Analisis: sentimen, tone, kata kunci, dan insight. Gunakan bahasa Indonesia.", teks) }],
    }),
  },
  {
    name: "fetch-web",
    description: "Ambil dan baca konten dari URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL yang akan diambil kontennya" },
      },
      required: ["url"],
    },
    handler: async ({ url }) => {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Cloudflare-Worker" } });
        const text = await res.text();
        const cleaned = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/`/g, "'").slice(0, 3900);
        const preview = cleaned.length > 3900 ? cleaned + "\n\n*(konten dipotong)*" : cleaned;
        return { content: [{ type: "text", text: `${bold("📄 Fetch Web")}\n${inlineCode(url)}\n${divider()}\nStatus: ${res.status}\n\n${preview}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Gagal: ${e.message}` }] };
      }
    },
  },
  {
    name: "content-ideas",
    description: "Hasilkan ide konten untuk media sosial atau blog",
    inputSchema: {
      type: "object",
      properties: {
        topik: { type: "string", description: "Topik konten" },
        platform: { type: "string", description: "Platform", default: "Blog" },
        jumlah: { type: "number", description: "Jumlah ide", default: 5 },
      },
      required: ["topik"],
    },
    handler: async ({ topik, platform, jumlah }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah content strategist. Berikan ${jumlah || 5} ide konten untuk ${platform || "Blog"} tentang: ${topik}. Gunakan bahasa Indonesia.`, `Topik: ${topik}\nPlatform: ${platform || "Blog"}\nJumlah: ${jumlah || 5}`) }],
    }),
  },
  {
    name: "define",
    description: "Cari penjelasan/definisi suatu istilah atau konsep",
    inputSchema: {
      type: "object",
      properties: {
        istilah: { type: "string", description: "Istilah yang ingin didefinisikan" },
        sederhana: { type: "boolean", description: "Jelaskan dengan cara sederhana (ELI5)", default: false },
      },
      required: ["istilah"],
    },
    handler: async ({ istilah, sederhana }) => ({
      content: [{ type: "text", text: await aiPrompt(sederhana ? "Jelaskan istilah ini seperti ke anak 5 tahun (ELI5). Gunakan bahasa Indonesia." : "Jelaskan istilah ini secara komprehensif namun ringkas. Gunakan bahasa Indonesia.", istilah) }],
    }),
  },
  {
    name: "generate-story",
    description: "Tulis cerita pendek berdasarkan prompt",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Ide atau tema cerita" },
        genre: { type: "string", description: "Genre", default: "fantasi" },
        panjang: { type: "string", description: "Panjang (pendek/sedang)", default: "sedang" },
      },
      required: ["prompt"],
    },
    handler: async ({ prompt, genre, panjang }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah penulis cerita. Tulis cerita ${genre || "fantasi"} dengan panjang ${panjang || "sedang"} yang menarik. Gunakan bahasa Indonesia.`, prompt) }],
    }),
  },
  {
    name: "convert",
    description: "Konversi satuan (panjang, berat, suhu, mata uang)",
    inputSchema: {
      type: "object",
      properties: {
        nilai: { type: "number", description: "Nilai yang akan dikonversi" },
        dari: { type: "string", description: "Satuan asal" },
        ke: { type: "string", description: "Satuan tujuan" },
      },
      required: ["nilai", "dari", "ke"],
    },
    handler: async ({ nilai, dari, ke }) => ({
      content: [{ type: "text", text: await aiPrompt("Kamu adalah kalkulator konversi. Konversikan nilai ini. Berikan hasil dan rumus singkat. Gunakan bahasa Indonesia.", `${nilai} ${dari} = ? ${ke}`) }],
    }),
  },
  {
    name: "improve-writing",
    description: "Perbaiki tata bahasa dan gaya penulisan",
    inputSchema: {
      type: "object",
      properties: {
        teks: { type: "string", description: "Teks yang akan diperbaiki" },
        formal: { type: "boolean", description: "Hasil formal?", default: false },
      },
      required: ["teks"],
    },
    handler: async ({ teks, formal }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah editor bahasa. Perbaiki teks${formal ? " menjadi formal" : " tetap santai namun benar"}. Tampilkan versi sebelum dan sesudah. Gunakan bahasa Indonesia.`, teks) }],
    }),
  },
  {
    name: "generate-quiz",
    description: "Buat kuis/soal latihan tentang suatu topik",
    inputSchema: {
      type: "object",
      properties: {
        topik: { type: "string", description: "Topik kuis" },
        jumlah: { type: "number", description: "Jumlah soal", default: 5 },
        tingkat: { type: "string", description: "Tingkat (mudah/sedang/sulit)", default: "sedang" },
      },
      required: ["topik"],
    },
    handler: async ({ topik, jumlah, tingkat }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah guru. Buat ${jumlah || 5} soal ${tingkat || "sedang"} tentang: ${topik}. Format pilihan ganda + kunci jawaban. Gunakan bahasa Indonesia.`, `Topik: ${topik}\nJumlah: ${jumlah || 5}\nTingkat: ${tingkat || "sedang"}`) }],
    }),
  },
  {
    name: "career-advice",
    description: "Saran karir berdasarkan minat dan latar belakang",
    inputSchema: {
      type: "object",
      properties: {
        minat: { type: "string", description: "Minat dan bidang" },
        latar: { type: "string", description: "Latar belakang", default: "" },
      },
      required: ["minat"],
    },
    handler: async ({ minat, latar }) => ({
      content: [{ type: "text", text: await aiPrompt("Kamu adalah career counselor. Berikan saran karir personalized: jalur karir, skill, dan prospek. Gunakan bahasa Indonesia.", `Minat: ${minat}\nLatar: ${latar || "-"}`) }],
    }),
  },
  {
    name: "meal-plan",
    description: "Buat rencana menu makanan",
    inputSchema: {
      type: "object",
      properties: {
        preferensi: { type: "string", description: "Preferensi makanan" },
        hari: { type: "number", description: "Jumlah hari", default: 3 },
      },
      required: ["preferensi"],
    },
    handler: async ({ preferensi, hari }) => ({
      content: [{ type: "text", text: await aiPrompt(`Kamu adalah ahli gizi. Buat menu ${hari || 3} hari untuk: ${preferensi}. Sertakan sarapan, makan siang, makan malam, camilan. Gunakan bahasa Indonesia.`, `Preferensi: ${preferensi}\nHari: ${hari || 3}`) }],
    }),
  },
  // ─── TOOLS DISCORD ───────────────────────────────────────
  {
    name: "send-discord",
    description: "KIRIM PESAN ke channel Discord. Gunakan ini untuk mengirim pesan/balasan ke channel Discord. Channel ID wajib diisi.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel Discord tujuan" },
        pesan: { type: "string", description: "Isi pesan yang akan dikirim" },
      },
      required: ["channel_id", "pesan"],
    },
    handler: async ({ channel_id, pesan }) => {
      const token = getEnv().DISCORD_TOKEN;
      if (!token) {
        return { content: [{ type: "text", text: "❌ DISCORD_TOKEN tidak tersedia. Set dulu via: npx wrangler secret put DISCORD_TOKEN" }] };
      }
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: pesan }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const jump = `https://discord.com/channels/@me/${channel_id}/${data.id}`;
          return { content: [{ type: "text", text: `${bold("✅ Pesan Terkirim")} • ${inlineCode(data.id)}\n• Channel: ${inlineCode(channel_id)}\n• [Lompat ke pesan](${jump})` }] };
        } else {
          const err = sanitizeForDiscord(await res.text());
          return { content: [{ type: "text", text: `${bold("❌ Gagal Kirim")} (${res.status})\n\`\`\`\n${err.slice(0, 1500)}\n\`\`\`` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${sanitizeForDiscord(e.message)}` }] };
      }
    },
  },
  {
    name: "list-channels",
    description: "Dapatkan daftar channel teks dari server (guild) Discord. Butuh Guild ID.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server (guild) Discord" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      if (!token) {
        return { content: [{ type: "text", text: "❌ DISCORD_TOKEN tidak tersedia." }] };
      }
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const channels: any = await res.json();
          const textChannels = channels
            .filter((ch: any) => [0, 5].includes(ch.type)) // GUILD_TEXT + GUILD_ANNOUNCEMENT
            .sort((a: any, b: any) => a.position - b.position)
            .map((ch: any) => `• ${bold("#" + ch.name)} ${inlineCode(ch.id)}${ch.topic ? ` — ${ch.topic.slice(0, 60)}` : ""}`)
            .join("\n");
          const count = channels.filter((ch: any) => [0, 5].includes(ch.type)).length;
          const header = `${bold(`📋 ${count} Channel Teks`)} di server ${inlineCode(guild_id)}`;
          return { content: [{ type: "text", text: `${header}\n${divider()}\n${textChannels || "(tidak ada channel teks)"}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `❌ Gagal (${res.status}): ${err}\n\nPastikan BOT sudah diinvite ke server dengan izin yang cukup.` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-guilds",
    description: "Dapatkan daftar server (guild) tempat bot Discord terinstall, lengkap dengan ID dan nama. Penting: GUNAKAN INI DULU sebelum list-channels untuk cari Guild ID.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const token = getEnv().DISCORD_TOKEN;
      if (!token) return { content: [{ type: "text", text: "❌ DISCORD_TOKEN tidak tersedia." }] };
      try {
        const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const guilds: any = await res.json();
          if (guilds.length === 0) return { content: [{ type: "text", text: "❌ Bot tidak ada di server manapun. Invite bot ke server dulu." }] };
          const list = guilds.map((g: any) => `  • **${g.name}** — ID: \`${g.id}\``).join("\n");
          const count = guilds.length;
          const guildInfo = guilds.map((g: any) => `• ${bold(g.name)} ${inlineCode(g.id)}${g.approximate_member_count ? ` (${g.approximate_member_count} members)` : ""}`).join("\n");
          return {
            content: [{ type: "text", text: `${bold(`📋 ${count} Server`)} tempat bot terinstall\n${divider()}\n${guildInfo}\n\n${italic("Gunakan list-channels dengan Guild ID untuk lihat channel.")}` }],
          };
        } else {
          const err = sanitizeForDiscord(await res.text());
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-me",
    description: "Dapatkan informasi bot Discord sendiri: username, ID, server count, dll.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const token = getEnv().DISCORD_TOKEN;
      if (!token) return { content: [{ type: "text", text: "❌ DISCORD_TOKEN tidak tersedia." }] };
      try {
        const [meRes, guildsRes] = await Promise.all([
          fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bot ${token}` } }),
          fetch("https://discord.com/api/v10/users/@me/guilds", { headers: { Authorization: `Bot ${token}` } }),
        ]);
        if (meRes.ok) {
          const me: any = await meRes.json();
          const guilds: any = guildsRes.ok ? await guildsRes.json() : [];
          const appRes = await fetch(`https://discord.com/api/v10/applications/${me.id}/rpc`, {
            headers: { Authorization: `Bot ${token}` },
          }).catch(() => null);
          return {
            content: [{ type: "text", text: `🤖 **Info Bot Discord**\n\nUsername: ${me.username}#${me.discriminator || "0"}\nID: \`${me.id}\`\nServer: ${guilds.length} server\n${appRes ? `Verified: ${appRes.ok ? "✅" : "❌"}` : ""}` }],
          };
        } else {
          const err = await meRes.text();
          return { content: [{ type: "text", text: `❌ Gagal (${meRes.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  // ─── ADMIN TOOLS ─────────────────────────────────────────
  // FEATURE 2026-06-19: Tools administrasi guild Discord
  {
    name: "read-channel",
    description: "BACA pesan terbaru dari channel Discord. GUNAKAN INI untuk lihat percakapan terbaru di channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        limit: { type: "number", description: "Jumlah pesan (max 50)", default: 10 },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id, limit }) => {
      const token = getEnv().DISCORD_TOKEN;
      const max = Math.min(limit || 10, 50);
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages?limit=${max}`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const messages: any = await res.json();
          if (messages.length === 0) return { content: [{ type: "text", text: "📭 Belum ada pesan di channel ini." }] };
          const formatted = messages.slice(0, 20).map((m: any) => {
            const author = m.author?.global_name || m.author?.username || "Unknown";
            const content = m.content?.slice(0, 200) || "(embed/sticker)";
            const time = new Date(m.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
            return `**${author}** (${time}): ${content}`;
          }).join("\n");
          return { content: [{ type: "text", text: `${bold(`📋 ${messages.length} Pesan Terbaru`)} • ${inlineCode(channel_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal baca channel")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "purge-channel",
    description: "HAPUS PESAN MASSAL dari channel. Bot perlu izin 'Manage Messages'. Hanya bisa hapus pesan < 14 hari.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        jumlah: { type: "number", description: "Jumlah pesan yang akan dihapus (max 100)", default: 10 },
        user_id: { type: "string", description: "Filter: hapus hanya pesan dari user ID ini (opsional)", default: "" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id, jumlah, user_id }) => {
      return requireConfirm("purge-channel", { channel_id, jumlah, user_id }, `Hapus ${jumlah || 10} pesan dari channel ${channel_id}${user_id ? ` (filter user: ${user_id})` : ""}`);
    },
  },
  {
    name: "ban-user",
    description: "BAN user dari server. Bot perlu izin 'Ban Members'. Beri alasan yang jelas.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user yang akan di-ban" },
        alasan: { type: "string", description: "Alasan ban", default: "Melanggar aturan server" },
        hapus_pesan: { type: "number", description: "Hapus pesan dari x hari terakhir (0-7)", default: 0 },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id, alasan, hapus_pesan }) => {
      return requireConfirm("ban-user", { guild_id, user_id, alasan, hapus_pesan }, `Ban user ${inlineCode(user_id)} dari server ${inlineCode(guild_id)}${alasan ? `\nAlasan: ${sanitizeForDiscord(alasan)}` : ""}`);
    },
  },
  {
    name: "unban-user",
    description: "CABUT BAN dari user di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user yang akan di-unban" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id }) => {
      return requireConfirm("unban-user", { guild_id, user_id }, `Unban user ${inlineCode(user_id)} dari server ${inlineCode(guild_id)}`);
    },
  },
  {
    name: "kick-user",
    description: "KICK user dari server. Bot perlu izin 'Kick Members'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user yang akan di-kick" },
        alasan: { type: "string", description: "Alasan kick", default: "" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id, alasan }) => {
      return requireConfirm("kick-user", { guild_id, user_id, alasan }, `Kick user ${inlineCode(user_id)} dari server ${inlineCode(guild_id)}${alasan ? `\nAlasan: ${sanitizeForDiscord(alasan)}` : ""}`);
    },
  },
  {
    name: "timeout-user",
    description: "TIMEOUT / MUTE sementara user di server. Bot perlu izin 'Moderate Members'. Durasi dalam menit.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
        durasi: { type: "number", description: "Durasi timeout dalam MENIT (max 40320 = 28 hari)", default: 60 },
        alasan: { type: "string", description: "Alasan timeout", default: "" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id, durasi, alasan }) => {
      return requireConfirm("timeout-user", { guild_id, user_id, durasi, alasan }, `Timeout user ${inlineCode(user_id)} di server ${inlineCode(guild_id)} selama ${durasi || 60} menit${alasan ? `\nAlasan: ${sanitizeForDiscord(alasan)}` : ""}`);
    },
  },
  {
    name: "remove-timeout",
    description: "HAPUS timeout/mute dari user.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id }) => {
      return requireConfirm("remove-timeout", { guild_id, user_id }, `Hapus timeout user ${inlineCode(user_id)} di server ${inlineCode(guild_id)}`);
    },
  },
  {
    name: "create-invite",
    description: "BUAT UNDANGAN (invite link) ke channel Discord. Bot perlu izin 'Create Invite'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        max_usages: { type: "number", description: "Maksimal pemakaian (0 = unlimited)", default: 0 },
        max_age: { type: "number", description: "Kadaluarsa dalam DETIK (0 = never, 86400 = 1 hari, 604800 = 7 hari)", default: 86400 },
        temporary: { type: "boolean", description: "Membership sementara?", default: false },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id, max_usages, max_age, temporary }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/invites`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            max_uses: max_usages || 0,
            max_age: max_age ?? 86400,
            temporary: temporary || false,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          const ageLabel = max_age === 0 ? "Tidak kadaluarsa" : `${Math.round((max_age || 86400) / 3600)} jam`;
          const usesLabel = max_usages === 0 ? "Unlimited" : `${max_usages} kali`;
          return { content: [{ type: "text", text: `${bold("🔗 Invite Link Dibuat")}\n• Link: https://discord.gg/${data.code}\n• Channel: ${inlineCode(channel_id)}\n• Kadaluarsa: ${ageLabel}\n• Max pemakaian: ${usesLabel}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal buat invite")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "audit-log",
    description: "LIHAT catatan audit (audit log) server. Bot perlu izin 'View Audit Log'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        limit: { type: "number", description: "Jumlah entry (max 50)", default: 10 },
        action_type: { type: "number", description: "Filter jenis aksi (opsional, lihat enum Discord AuditLogEvent)", default: null },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, limit, action_type }) => {
      const token = getEnv().DISCORD_TOKEN;
      const max = Math.min(limit || 10, 50);
      try {
        let url = `https://discord.com/api/v10/guilds/${guild_id}/audit-logs?limit=${max}`;
        if (action_type) url += `&action_type=${action_type}`;
        const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
        if (res.ok) {
          const data: any = await res.json();
          const entries = data.audit_log_entries || [];
          if (entries.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada entry audit log." }] };
          // Map action type ke nama
          const actionNames: Record<number, string> = {
            1: "Update Guild", 10: "Create Channel", 11: "Update Channel", 12: "Delete Channel",
            20: "Create Channel Overwrite", 21: "Update Channel Overwrite", 22: "Delete Channel Overwrite",
            30: "Kick Member", 31: "Prune Members", 32: "Ban Member", 33: "Unban Member", 34: "Update Member",
            40: "Add Role", 41: "Remove Role",
            50: "Create Invite", 51: "Update Invite", 52: "Delete Invite",
            60: "Create Webhook", 61: "Update Webhook", 62: "Delete Webhook",
            70: "Create Emoji", 71: "Update Emoji", 72: "Delete Emoji",
            73: "Create Sticker", 74: "Update Sticker", 75: "Delete Sticker",
            80: "Create Scheduled Event", 81: "Update Scheduled Event", 82: "Delete Scheduled Event",
            90: "Create Thread", 91: "Update Thread", 92: "Delete Thread",
            100: "Update Permission Overwrites",
            110: "Create Auto Mod Rule", 111: "Update Auto Mod Rule", 112: "Delete Auto Mod Rule",
          };
          const formatted = entries.map((e: any) => {
            const action = actionNames[e.action_type] || `Action ${e.action_type}`;
            const user = data.users?.find((u: any) => u.id === e.user_id);
            const target = e.target_id || "-";
            return `• **${action}** by ${user?.username || e.user_id} → ${inlineCode(target)}${e.reason ? `: ${e.reason}` : ""}`;
          }).join("\n");
          return { content: [{ type: "text", text: `${bold(`📋 ${entries.length} Audit Log Entry`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal baca audit log")} (${res.status}): ${err}\n\nBot perlu izin "View Audit Log".` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-member",
    description: "CARI informasi member di server Discord.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const [memRes, userRes] = await Promise.all([
          fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/${user_id}`, { headers: { Authorization: `Bot ${token}` } }),
          fetch(`https://discord.com/api/v10/users/${user_id}`, { headers: { Authorization: `Bot ${token}` } }).catch(() => null),
        ]);
        if (memRes.ok) {
          const member: any = await memRes.json();
          const user = member.user || {};
          const roles = member.roles?.filter((r: string) => r !== guild_id) || [];
          const joined = new Date(member.joined_at).toLocaleDateString("id-ID");
          const created = new Date(user.id ? (parseInt(user.id) / 4194304 + 1420070400000) : Date.now()).toLocaleDateString("id-ID");
          return {
            content: [{ type: "text", text: `${bold(`👤 ${user.global_name || user.username || "Unknown"}`)} ${inlineCode(user_id)}\n${divider()}\n• **Username:** ${user.username}#${user.discriminator || "0"}\n• **Join server:** ${joined}\n• **Akun dibuat:** ${created}\n• **Roles:** ${roles.length > 0 ? roles.map((r: string) => inlineCode(r)).join(", ") : "(no roles)"}\n• **Bot:** ${user.bot ? "✅ Ya" : "❌ Tidak"}` }],
          };
        } else {
          const err = await memRes.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${memRes.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "list-members",
    description: "DAFTAR member di server (guild). Bot perlu izin 'Manage Server' untuk lihat semua member.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        limit: { type: "number", description: "Jumlah member (max 100)", default: 20 },
        after: { type: "string", description: "Mulai dari user ID ini (opsional, untuk pagination)", default: "" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, limit, after }) => {
      const token = getEnv().DISCORD_TOKEN;
      const max = Math.min(limit || 20, 100);
      try {
        let url = `https://discord.com/api/v10/guilds/${guild_id}/members?limit=${max}`;
        if (after) url += `&after=${after}`;
        const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
        if (res.ok) {
          const members: any = await res.json();
          if (members.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada member (mungkin perlu pagination)." }] };
          const formatted = members.slice(0, 50).map((m: any) => {
            const name = m.user?.global_name || m.user?.username || "Unknown";
            const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString("id-ID") : "?";
            return `• ${bold(name)} ${inlineCode(m.user?.id || "?")} — join ${joined}`;
          }).join("\n");
          const lastId = members[members.length - 1]?.user?.id || "";
          return {
            content: [{ type: "text", text: `${bold(`👥 ${members.length} Member`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}${lastId ? `\n\n${italic(`Gunakan "after: ${lastId}" untuk halaman berikutnya`)}` : ""}` }],
          };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "add-role",
    description: "TAMBAHKAN role ke user di server. Bot perlu punya role yang lebih tinggi dari target role.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
        role_id: { type: "string", description: "ID role yang akan diberikan" },
      },
      required: ["guild_id", "user_id", "role_id"],
    },
    handler: async ({ guild_id, user_id, role_id }) => {
      return requireConfirm("add-role", { guild_id, user_id, role_id }, `Add role ${inlineCode(role_id)} ke user ${inlineCode(user_id)} di server ${inlineCode(guild_id)}`);
    },
  },
  {
    name: "remove-role",
    description: "HAPUS role dari user di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
        role_id: { type: "string", description: "ID role yang akan dihapus" },
      },
      required: ["guild_id", "user_id", "role_id"],
    },
    handler: async ({ guild_id, user_id, role_id }) => {
      return requireConfirm("remove-role", { guild_id, user_id, role_id }, `Hapus role ${inlineCode(role_id)} dari user ${inlineCode(user_id)} di server ${inlineCode(guild_id)}`);
    },
  },
  {
    name: "create-channel",
    description: "BUAT channel teks baru di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        nama: { type: "string", description: "Nama channel (lowercase, tanpa spasi)" },
        topik: { type: "string", description: "Topik channel", default: "" },
        kategori: { type: "string", description: "ID parent category (opsional)", default: "" },
      },
      required: ["guild_id", "nama"],
    },
    handler: async ({ guild_id, nama, topik, kategori }) => {
      return requireConfirm("create-channel", { guild_id, nama, topik, kategori }, `Buat channel "#${nama}" di server ${inlineCode(guild_id)}${topik ? `\nTopik: ${sanitizeForDiscord(topik)}` : ""}`);
    },
  },
  {
    name: "delete-channel",
    description: "HAPUS channel. Bot perlu izin 'Manage Channels'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel yang akan dihapus" },
        alasan: { type: "string", description: "Alasan", default: "" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id, alasan }) => {
      return requireConfirm("delete-channel", { channel_id, alasan }, `Hapus channel ${inlineCode(channel_id)}${alasan ? `\nAlasan: ${sanitizeForDiscord(alasan)}` : ""}`);
    },
  },
  {
    name: "list-roles",
    description: "DAFTAR semua role di server Discord.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/roles`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const roles: any = await res.json();
          const formatted = roles
            .filter((r: any) => r.name !== "@everyone")
            .sort((a: any, b: any) => b.position - a.position)
            .map((r: any) => `• ${r.name} ${inlineCode(r.id)} — ${r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "no color"} ${r.hoist ? "📌" : ""} ${r.managed ? "🤖" : ""}`)
            .join("\n");
          return { content: [{ type: "text", text: `${bold(`📋 ${roles.filter((r: any) => r.name !== "@everyone").length} Roles`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-bans",
    description: "LIHAT daftar user yang diban di server. Bot perlu izin 'Ban Members'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        limit: { type: "number", description: "Jumlah (max 50)", default: 20 },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, limit }) => {
      const token = getEnv().DISCORD_TOKEN;
      const max = Math.min(limit || 20, 50);
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/bans?limit=${max}`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const bans: any = await res.json();
          if (bans.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada user yang diban di server ini." }] };
          const formatted = bans.map((b: any) => `• ${bold(b.user?.global_name || b.user?.username || "Unknown")} ${inlineCode(b.user?.id || "?")}${b.reason ? ` — ${b.reason}` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🔨 ${bans.length} Banned Users`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  // ─── NEW TOOLS ─────────────────────────────────────────
  {
    name: "confirm-action",
    description: "KONFIRMASI dan jalankan aksi admin yang tertunda. Gunakan kode yang diberikan oleh tool admin.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode konfirmasi 6 karakter" },
      },
      required: ["code"],
    },
    handler: async ({ code }) => {
      try {
        const entry = getPendingAction(code);
        if (!entry) {
          return { content: [{ type: "text", text: `${bold("❌ Kode tidak ditemukan")}\nKode "${code}" tidak valid atau sudah kadaluarsa.` }] };
        }
        const result = confirmAction(code);
        if (!result.success) {
          return { content: [{ type: "text", text: `❌ ${result.message}` }] };
        }
        const handler = actionHandlers[entry.action];
        if (!handler) {
          return { content: [{ type: "text", text: `${bold("❌ Aksi tidak dikenal")}: ${entry.action}` }] };
        }
        if (entry.confirmCount < entry.requiredConfirms) {
          const sisa = entry.requiredConfirms - entry.confirmCount;
          return { content: [{ type: "text", text: `${bold(`⚠️ ${entry.confirmCount}/${entry.requiredConfirms} Konfirmasi`)}\n${result.message}\n\nAksi: ${entry.description}\nGunakan confirm-action lagi untuk ${sisa}x konfirmasi tambahan.` }] };
        }
        const execResult = await handler(entry.params);
        return {
          content: [{
            type: "text",
            text: `${bold("✅ Aksi Dikonfirmasi & Dijalankan")}\n${divider()}\n${entry.description}\n${divider()}\n${execResult.content[0].text}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "cancel-action",
    description: "BATALKAN aksi admin yang tertunda.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode konfirmasi 6 karakter" },
      },
      required: ["code"],
    },
    handler: async ({ code }) => {
      const found = cancelAction(code);
      if (found) {
        return { content: [{ type: "text", text: `${bold("✅ Aksi Dibatalkan")}\nKode: ${inlineCode(code)}` }] };
      }
      return { content: [{ type: "text", text: `${bold("❌ Kode tidak ditemukan")}\nKode "${code}" tidak valid atau sudah kadaluarsa.` }] };
    },
  },
  {
    name: "list-pending",
    description: "LIHAT semua aksi admin yang menunggu konfirmasi.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const pending = listPendingActions();
      if (pending.length === 0) {
        return { content: [{ type: "text", text: "📭 Tidak ada aksi yang menunggu konfirmasi." }] };
      }
      const formatted = pending.map((p) => formatPendingAction(p)).join("\n\n");
      return { content: [{ type: "text", text: `${bold(`⏳ ${pending.length} Aksi Tertunda`)}\n${divider()}\n${formatted}` }] };
    },
  },
  {
    name: "edit-message",
    description: "EDIT pesan yang sudah dikirim di channel Discord.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan yang akan diedit" },
        content: { type: "string", description: "Konten baru" },
      },
      required: ["channel_id", "message_id", "content"],
    },
    handler: async ({ channel_id, message_id, content }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Pesan Diedit")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal Edit")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "delete-message",
    description: "HAPUS sebuah pesan dari channel Discord. Bot perlu izin 'Manage Messages'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan yang akan dihapus" },
      },
      required: ["channel_id", "message_id"],
    },
    handler: async ({ channel_id, message_id }) => {
      return requireConfirm("delete-message", { channel_id, message_id }, `Hapus pesan ${message_id} dari channel ${channel_id}`);
    },
  },
  {
    name: "pin-message",
    description: "PIN pesan di channel Discord. Bot perlu izin 'Manage Messages'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan yang akan di-pin" },
      },
      required: ["channel_id", "message_id"],
    },
    handler: async ({ channel_id, message_id }) => {
      return requireConfirm("pin-message", { channel_id, message_id }, `Pin pesan ${message_id} di channel ${channel_id}`);
    },
  },
  {
    name: "unpin-message",
    description: "UNPIN pesan di channel Discord. Bot perlu izin 'Manage Messages'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan yang akan di-unpin" },
      },
      required: ["channel_id", "message_id"],
    },
    handler: async ({ channel_id, message_id }) => {
      return requireConfirm("unpin-message", { channel_id, message_id }, `Unpin pesan ${message_id} dari channel ${channel_id}`);
    },
  },
  {
    name: "add-reaction",
    description: "TAMBAHKAN reaksi emoji ke pesan di channel Discord.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan" },
        emoji: { type: "string", description: "Emoji (URL encoded, contoh: ✅ atau %E2%9C%85)" },
      },
      required: ["channel_id", "message_id", "emoji"],
    },
    handler: async ({ channel_id, message_id, emoji }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const encoded = encodeURIComponent(emoji);
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}/reactions/${encoded}/@me`, {
          method: "PUT",
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Reaksi Ditambahkan")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}\n• Emoji: ${emoji}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "remove-reaction",
    description: "HAPUS reaksi emoji dari pesan. Bot perlu izin 'Manage Messages' untuk hapus reaksi user lain.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID pesan" },
        emoji: { type: "string", description: "Emoji" },
        user_id: { type: "string", description: "ID user (default: @me/bot sendiri)", default: "" },
      },
      required: ["channel_id", "message_id", "emoji"],
    },
    handler: async ({ channel_id, message_id, emoji, user_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const encoded = encodeURIComponent(emoji);
        const target = user_id || "@me";
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}/reactions/${encoded}/${target}`, {
          method: "DELETE",
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Reaksi Dihapus")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}\n• Emoji: ${emoji}${user_id ? `\n• User: ${inlineCode(user_id)}` : ""}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "send-embed",
    description: "KIRIM rich embed (pesan dengan format kaya) ke channel Discord. Pakai warna hex tanpa # (contoh: FF0000 untuk merah).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        title: { type: "string", description: "Judul embed" },
        description: { type: "string", description: "Deskripsi embed" },
        color: { type: "string", description: "Warna hex (contoh: 5865F2 untuk blurple)", default: "5865F2" },
        fields: { type: "string", description: "JSON string array of {name,value,inline} (opsional)", default: "" },
      },
      required: ["channel_id", "title", "description"],
    },
    handler: async ({ channel_id, title, description, color, fields }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const embed: any = {
          title: title.slice(0, 256),
          description: description.slice(0, 4096),
          color: parseInt(color || "5865F2", 16),
          timestamp: new Date().toISOString(),
        };
        if (fields) {
          const parsed = typeof fields === "string" ? JSON.parse(fields) : fields;
          embed.fields = parsed.slice(0, 25).map((f: any) => ({
            name: f.name.slice(0, 256),
            value: f.value.slice(0, 1024),
            inline: f.inline ?? false,
          }));
        }
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        });
        if (res.ok) {
          const msg: any = await res.json();
          return { content: [{ type: "text", text: `${bold("✅ Embed Terkirim")}\n• Channel: ${inlineCode(channel_id)}\n• Judul: ${sanitizeForDiscord(title)}\n• Message: ${inlineCode(msg.id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "crosspost-message",
    description: "PUBLIKASI/KIRIM pesan dari announcement channel ke following channel. Bot perlu izin 'Manage Messages'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID announcement channel" },
        message_id: { type: "string", description: "ID pesan yang akan di-crosspost" },
      },
      required: ["channel_id", "message_id"],
    },
    handler: async ({ channel_id, message_id }) => {
      return requireConfirm("crosspost-message", { channel_id, message_id }, `Crosspost/publikasi pesan ${message_id} dari channel ${channel_id}`);
    },
  },
  {
    name: "send-file",
    description: "KIRIM FILE (gambar, PDF, dll) dari URL ke channel Discord.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        file_url: { type: "string", description: "URL file yang akan dikirim" },
        filename: { type: "string", description: "Nama file (opsional)", default: "" },
        content: { type: "string", description: "Teks tambahan (opsional)", default: "" },
      },
      required: ["channel_id", "file_url"],
    },
    handler: async ({ channel_id, file_url, filename, content }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const fileRes = await fetch(file_url);
        if (!fileRes.ok) return { content: [{ type: "text", text: `❌ Gagal download file: ${fileRes.status}` }] };
        const fileBuf = await fileRes.arrayBuffer();
        const blob = new Blob([fileBuf], { type: fileRes.headers.get("content-type") || "application/octet-stream" });
        const form = new FormData();
        const name = filename || file_url.split("/").pop() || "file";
        form.append("file", blob, name);
        if (content) form.append("content", content);
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}` },
          body: form,
        });
        if (res.ok) {
          const msg: any = await res.json();
          return { content: [{ type: "text", text: `${bold("✅ File Terkirim")}\n• File: ${name}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(msg.id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-thread",
    description: "BUAT thread baru di channel Discord. Bot perlu izin 'Create Public Threads' atau 'Create Private Threads'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        name: { type: "string", description: "Nama thread" },
        message_id: { type: "string", description: "ID pesan untuk membuat thread dari pesan tertentu (opsional)", default: "" },
        archive_duration: { type: "number", description: "Auto-archive dalam menit (60, 1440, 4320, 10080)", default: 1440 },
      },
      required: ["channel_id", "name"],
    },
    handler: async ({ channel_id, name, message_id, archive_duration }) => {
      return requireConfirm("create-thread", { channel_id, name, message_id, archive_duration: archive_duration || 1440 }, `Buat thread "${name}" di channel ${channel_id}${message_id ? ` dari pesan ${message_id}` : ""}`);
    },
  },
  {
    name: "delete-thread",
    description: "HAPUS thread/channel. Bot perlu izin 'Manage Channels'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID thread/channel yang akan dihapus" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id }) => {
      return requireConfirm("delete-thread", { channel_id }, `Hapus thread ${channel_id}`);
    },
  },
  {
    name: "archive-thread",
    description: "ARSIPKAN thread. Bot perlu izin 'Manage Threads'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID thread" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id }) => {
      return requireConfirm("archive-thread", { channel_id }, `Arsipkan thread ${channel_id}`);
    },
  },
  {
    name: "unarchive-thread",
    description: "BUKA ARSIP thread. Bot perlu izin 'Manage Threads'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID thread" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id }) => {
      return requireConfirm("unarchive-thread", { channel_id }, `Buka arsip thread ${channel_id}`);
    },
  },
  {
    name: "list-active-threads",
    description: "LIHAT daftar thread aktif di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/threads/active`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          const threads = data.threads || [];
          if (threads.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada thread aktif di server ini." }] };
          const formatted = threads.map((t: any) => `• ${bold(t.name)} ${inlineCode(t.id)} — ${t.member_count || 0} members`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🧵 ${threads.length} Thread Aktif`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "add-thread-member",
    description: "TAMBAHKAN member ke thread.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID thread" },
        user_id: { type: "string", description: "ID user" },
      },
      required: ["channel_id", "user_id"],
    },
    handler: async ({ channel_id, user_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/thread-members/${user_id}`, {
          method: "PUT",
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Member Ditambahkan ke Thread")}\n• Thread: ${inlineCode(channel_id)}\n• User: ${inlineCode(user_id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "remove-thread-member",
    description: "HAPUS member dari thread.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID thread" },
        user_id: { type: "string", description: "ID user" },
      },
      required: ["channel_id", "user_id"],
    },
    handler: async ({ channel_id, user_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/thread-members/${user_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Member Dihapus dari Thread")}\n• Thread: ${inlineCode(channel_id)}\n• User: ${inlineCode(user_id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "list-webhooks",
    description: "LIHAT daftar webhook di server atau channel.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        channel_id: { type: "string", description: "Filter: ID channel (opsional)", default: "" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, channel_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        let url = `https://discord.com/api/v10/guilds/${guild_id}/webhooks`;
        if (channel_id) url = `https://discord.com/api/v10/channels/${channel_id}/webhooks`;
        const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
        if (res.ok) {
          const webhooks: any = await res.json();
          if (webhooks.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada webhook." }] };
          const formatted = webhooks.map((w: any) => `• ${bold(w.name)} ${inlineCode(w.id)} — Channel: ${w.channel_id}${w.token ? ` (token: ${w.token.slice(0, 8)}...)` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🔗 ${webhooks.length} Webhook`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-webhook",
    description: "BUAT webhook baru di channel Discord. Bot perlu izin 'Manage Webhooks'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        name: { type: "string", description: "Nama webhook" },
        avatar_url: { type: "string", description: "URL avatar webhook (opsional)", default: "" },
      },
      required: ["channel_id", "name"],
    },
    handler: async ({ channel_id, name, avatar_url }) => {
      return requireConfirm("create-webhook", { channel_id, name, avatar_url }, `Buat webhook "${name}" di channel ${channel_id}${avatar_url ? " (dengan avatar)" : ""}`);
    },
  },
  {
    name: "delete-webhook",
    description: "HAPUS webhook. Bot perlu izin 'Manage Webhooks'.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_id: { type: "string", description: "ID webhook" },
      },
      required: ["webhook_id"],
    },
    handler: async ({ webhook_id }) => {
      return requireConfirm("delete-webhook", { webhook_id }, `Hapus webhook ${webhook_id}`);
    },
  },
  {
    name: "send-webhook",
    description: "KIRIM pesan via webhook Discord. Gunakan ID dan token webhook yang sudah ada.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_id: { type: "string", description: "ID webhook" },
        content: { type: "string", description: "Isi pesan" },
        username: { type: "string", description: "Override username (opsional)", default: "" },
        avatar_url: { type: "string", description: "Override avatar URL (opsional)", default: "" },
      },
      required: ["webhook_id", "content"],
    },
    handler: async ({ webhook_id, content, username, avatar_url }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        let url = `https://discord.com/api/v10/webhooks/${webhook_id}`;
        if (token) url += `?token=${token}`;
        const body: any = { content };
        if (username) body.username = username;
        if (avatar_url) body.avatar_url = avatar_url;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Webhook Terkirim")}\n• Webhook: ${inlineCode(webhook_id)}\n${username ? `• Username: ${username}\n` : ""}• Content: ${sanitizeForDiscord(content.slice(0, 100))}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "list-emojis",
    description: "LIHAT daftar emoji kustom di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/emojis`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const emojis: any = await res.json();
          if (emojis.length === 0) return { content: [{ type: "text", text: "📭 Server ini tidak punya emoji kustom." }] };
          const formatted = emojis.map((e: any) => `• ${e.animated ? "<a:" : "<:"}${e.name}:${e.id}> ${bold(e.name)} ${inlineCode(e.id)}${e.roles?.length ? ` (restricted)` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`😀 ${emojis.length} Emoji`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-emoji",
    description: "BUAT emoji kustom baru di server. Bot perlu izin 'Manage Emojis & Stickers'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama emoji (tanpa : :)" },
        image_url: { type: "string", description: "URL gambar untuk emoji" },
      },
      required: ["guild_id", "name", "image_url"],
    },
    handler: async ({ guild_id, name, image_url }) => {
      return requireConfirm("create-emoji", { guild_id, name, image_url }, `Buat emoji :${name}: di server ${guild_id}`);
    },
  },
  {
    name: "delete-emoji",
    description: "HAPUS emoji kustom dari server. Bot perlu izin 'Manage Emojis & Stickers'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        emoji_id: { type: "string", description: "ID emoji" },
      },
      required: ["guild_id", "emoji_id"],
    },
    handler: async ({ guild_id, emoji_id }) => {
      return requireConfirm("delete-emoji", { guild_id, emoji_id }, `Hapus emoji ${emoji_id} dari server ${guild_id}`);
    },
  },
  {
    name: "list-stickers",
    description: "LIHAT daftar sticker kustom di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/stickers`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const stickers: any = await res.json();
          if (stickers.length === 0) return { content: [{ type: "text", text: "📭 Server ini tidak punya sticker kustom." }] };
          const formatted = stickers.map((s: any) => `• ${bold(s.name)} ${inlineCode(s.id)} — ${s.tags || ""}${s.description ? `: ${s.description.slice(0, 60)}` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🏷️ ${stickers.length} Sticker`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-sticker",
    description: "BUAT sticker kustom baru di server. Bot perlu izin 'Manage Emojis & Stickers'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama sticker" },
        description: { type: "string", description: "Deskripsi sticker", default: "" },
        image_url: { type: "string", description: "URL gambar sticker (harus PNG/APNG/Lottie)" },
        tags: { type: "string", description: "Tag emoji untuk sticker (contoh: 🤖)", default: "" },
      },
      required: ["guild_id", "name", "image_url"],
    },
    handler: async ({ guild_id, name, description, image_url, tags }) => {
      return requireConfirm("create-sticker", { guild_id, name, description, image_url, tags }, `Buat sticker "${name}" di server ${guild_id}`);
    },
  },
  {
    name: "delete-sticker",
    description: "HAPUS sticker kustom dari server. Bot perlu izin 'Manage Emojis & Stickers'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        sticker_id: { type: "string", description: "ID sticker" },
      },
      required: ["guild_id", "sticker_id"],
    },
    handler: async ({ guild_id, sticker_id }) => {
      return requireConfirm("delete-sticker", { guild_id, sticker_id }, `Hapus sticker ${sticker_id} dari server ${guild_id}`);
    },
  },
  {
    name: "modify-guild",
    description: "EDIT pengaturan server (guild). Bot perlu izin 'Manage Server'. Butuh 2x konfirmasi.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama baru server (opsional)", default: "" },
        description: { type: "string", description: "Deskripsi baru server (opsional)", default: "" },
        icon_url: { type: "string", description: "URL gambar untuk icon baru (opsional)", default: "" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, name, description, icon_url }) => {
      return requireConfirm("modify-guild", { guild_id, name, description, icon_url }, `Edit server ${guild_id}${name ? `: nama="${name}"` : ""}${description ? `, deskripsi diperbarui` : ""}${icon_url ? ", icon diganti" : ""}`, 2);
    },
  },
  {
    name: "get-vanity-invite",
    description: "DAPATKAN vanity URL invite server (contoh: discord.gg/nama). Bot perlu izin 'Manage Guild'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/vanity-url`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data.code) {
            return { content: [{ type: "text", text: `${bold("🔗 Vanity URL")}\n• https://discord.gg/${data.code}\n• Server: ${inlineCode(guild_id)}${data.uses ? `\n• Digunakan: ${data.uses}x` : ""}` }] };
          }
          return { content: [{ type: "text", text: "📭 Server ini tidak punya vanity URL." }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}\n\nServer perlu level 1 boost atau lebih untuk vanity URL.` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "list-invites",
    description: "LIHAT daftar invite link server. Bot perlu izin 'Manage Guild'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/invites`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const invites: any = await res.json();
          if (invites.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada invite link aktif." }] };
          const formatted = invites.map((i: any) => `• https://discord.gg/${i.code} — ${bold(i.inviter?.username || "?")} → ${i.channel_name || i.channel_id || "?"} (${i.uses || 0} uses)`).join("\n");
          return { content: [{ type: "text", text: `${bold("🔗 ${invites.length} Invites")} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-widget",
    description: "DAPATKAN guild widget (server info widget).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/widget.json`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const data: any = await res.json();
          return { content: [{ type: "text", text: `${bold("📊 Widget Info")}\n• Nama: ${data.name}\n• ID: ${inlineCode(data.id)}\n• Members: ${data.presence_count || 0} online / ${data.members?.length || 0} total\n• Channel: ${data.channel_name || "N/A"}\n• Invite: ${data.instant_invite || "N/A"}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "modify-widget",
    description: "EDIT guild widget settings. Bot perlu izin 'Manage Guild'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        enabled: { type: "boolean", description: "Aktifkan widget?", default: null },
        channel_id: { type: "string", description: "ID channel untuk widget (opsional)", default: "" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, enabled, channel_id }) => {
      const body: any = {};
      if (enabled !== null && enabled !== undefined) body.enabled = enabled;
      if (channel_id) body.channel_id = channel_id;
      return requireConfirm("modify-widget", { guild_id, ...body }, `Edit widget server ${guild_id}${enabled !== null && enabled !== undefined ? `: enabled=${enabled}` : ""}${channel_id ? `, channel=${channel_id}` : ""}`);
    },
  },
  {
    name: "list-events",
    description: "LIHAT daftar scheduled events di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/scheduled-events`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const events: any = await res.json();
          if (events.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada scheduled events." }] };
          const formatted = events.map((e: any) => {
            const status = e.status === 2 ? "🟢 Active" : e.status === 3 ? "✅ Completed" : e.status === 4 ? "❌ Canceled" : "⏳ Scheduled";
            return `• ${bold(e.name)} ${inlineCode(e.id)} — ${status}\n  Mulai: ${new Date(e.scheduled_start_time).toLocaleString("id-ID")}`;
          }).join("\n");
          return { content: [{ type: "text", text: `${bold(`📅 ${events.length} Events`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-event",
    description: "BUAT scheduled event di server. entity_type: 1=Stage, 2=Voice, 3=External. Butuh 2x konfirmasi.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama event" },
        description: { type: "string", description: "Deskripsi event (opsional)", default: "" },
        scheduled_start_time: { type: "string", description: "Waktu mulai (ISO string, contoh: 2025-01-01T15:00:00Z)" },
        scheduled_end_time: { type: "string", description: "Waktu selesai (ISO string, opsional)", default: "" },
        channel_id: { type: "string", description: "ID channel (untuk Stage/Voice event)", default: "" },
        entity_type: { type: "number", description: "Tipe: 1=Stage, 2=Voice, 3=External", default: 3 },
      },
      required: ["guild_id", "name", "scheduled_start_time"],
    },
    handler: async ({ guild_id, name, description, scheduled_start_time, scheduled_end_time, channel_id, entity_type }) => {
      return requireConfirm("create-scheduled-event", { guild_id, name, description, scheduled_start_time, scheduled_end_time, channel_id, entity_type }, `Buat event "${name}" di server ${guild_id} mulai ${scheduled_start_time}`, 2);
    },
  },
  {
    name: "delete-event",
    description: "HAPUS scheduled event dari server. Bot perlu izin 'Manage Events'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        event_id: { type: "string", description: "ID event" },
      },
      required: ["guild_id", "event_id"],
    },
    handler: async ({ guild_id, event_id }) => {
      return requireConfirm("delete-scheduled-event", { guild_id, event_id }, `Hapus event ${event_id} dari server ${guild_id}`);
    },
  },
  {
    name: "list-voice-regions",
    description: "LIHAT daftar voice region yang tersedia.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch("https://discord.com/api/v10/voice/regions", {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const regions: any = await res.json();
          const formatted = regions.map((r: any) => `• **${r.name}** — \`${r.id}\` ${r.optimal ? "⭐ Optimal" : ""} ${r.deprecated ? "⚠️ Deprecated" : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🌍 ${regions.length} Voice Regions`)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "get-channel",
    description: "DAPATKAN informasi detail channel Discord.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const ch: any = await res.json();
          const typeNames: Record<number, string> = { 0: "Text", 1: "DM", 2: "Voice", 3: "Group DM", 4: "Category", 5: "Announcement", 10: "Announcement Thread", 11: "Public Thread", 12: "Private Thread", 13: "Stage", 14: "Directory", 15: "Forum", 16: "Media" };
          return { content: [{ type: "text", text: `${bold(`#${ch.name || "N/A"}`)} ${inlineCode(ch.id)}\n${divider()}\n• **Type:** ${typeNames[ch.type] || ch.type}\n• **Guild:** ${ch.guild_id ? inlineCode(ch.guild_id) : "N/A"}\n• **Topic:** ${ch.topic || "(no topic)"}\n• **Position:** ${ch.position ?? "N/A"}\n• **NSFW:** ${ch.nsfw ? "✅" : "❌"}\n• **Parent:** ${ch.parent_id ? inlineCode(ch.parent_id) : "N/A"}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "list-automod-rules",
    description: "LIHAT daftar AutoMod rules di server. Bot perlu izin 'Manage Guild'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/auto-moderation/rules`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const rules: any = await res.json();
          if (rules.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada AutoMod rules." }] };
          const formatted = rules.map((r: any) => `• ${bold(r.name)} ${inlineCode(r.id)} — Trigger: ${r.trigger_type} — ${r.enabled ? "✅ Active" : "❌ Disabled"}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🛡️ ${rules.length} AutoMod Rules`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-automod-rule",
    description: "BUAT AutoMod rule baru di server. Bot perlu izin 'Manage Guild'. Butuh 2x konfirmasi.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama rule" },
        event_type: { type: "number", description: "Event type: 1=Message Send" },
        actions: { type: "string", description: "JSON string dari actions array. Contoh: [{\"type\":1,\"metadata\":{\"channel_id\":\"...\",\"duration_seconds\":60}}]" },
        trigger_type: { type: "number", description: "Trigger type: 1=Keyword, 4=Member Profile, 5=Spam, 6=Link" },
        trigger_metadata: { type: "string", description: "JSON string trigger_metadata (opsional)", default: "" },
      },
      required: ["guild_id", "name", "event_type", "actions", "trigger_type"],
    },
    handler: async ({ guild_id, name, event_type, actions, trigger_type, trigger_metadata }) => {
      return requireConfirm("create-automod-rule", { guild_id, name, event_type, actions, trigger_type, trigger_metadata }, `Buat AutoMod rule "${name}" di server ${guild_id}`, 2);
    },
  },
  {
    name: "delete-automod-rule",
    description: "HAPUS AutoMod rule dari server. Bot perlu izin 'Manage Guild'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        rule_id: { type: "string", description: "ID rule" },
      },
      required: ["guild_id", "rule_id"],
    },
    handler: async ({ guild_id, rule_id }) => {
      return requireConfirm("delete-automod-rule", { guild_id, rule_id }, `Hapus AutoMod rule ${rule_id} dari server ${guild_id}`);
    },
  },
  {
    name: "modify-member",
    description: "EDIT member server: ganti nickname, deaf/mute status. Bot perlu izin 'Moderate Members'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
        nick: { type: "string", description: "Nickname baru (opsional)", default: "" },
        deaf: { type: "boolean", description: "Deafen di voice (opsional)", default: null },
        mute: { type: "boolean", description: "Mute di voice (opsional)", default: null },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id, nick, deaf, mute }) => {
      return requireConfirm("modify-member", { guild_id, user_id, nick, deaf, mute }, `Edit member ${user_id} di server ${guild_id}${nick ? `: nick="${nick}"` : ""}${deaf !== null && deaf !== undefined ? `, deaf=${deaf}` : ""}${mute !== null && mute !== undefined ? `, mute=${mute}` : ""}`);
    },
  },
  {
    name: "search-members",
    description: "CARI member di server berdasarkan nama atau nickname.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        query: { type: "string", description: "Kata kunci pencarian" },
      },
      required: ["guild_id", "query"],
    },
    handler: async ({ guild_id, query }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/members/search?query=${encodeURIComponent(query)}&limit=25`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const members: any = await res.json();
          if (members.length === 0) return { content: [{ type: "text", text: `📭 Tidak ada member dengan nama "${query}".` }] };
          const formatted = members.map((m: any) => `• ${bold(m.user?.global_name || m.user?.username || "Unknown")} ${inlineCode(m.user?.id || "?")}${m.nick ? ` (${m.nick})` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`🔍 ${members.length} Member Ditemukan`)} • query: "${sanitizeForDiscord(query)}"\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "prune-members",
    description: "PRUNE (bersihkan) member offline. Bot perlu izin 'Kick Members'. compute_only=true untuk lihat estimasi dulu.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        days: { type: "number", description: "Inactive selama x hari", default: 7 },
        compute_only: { type: "boolean", description: "Hitung dulu tanpa eksekusi", default: true },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id, days, compute_only }) => {
      return requireConfirm("prune-members", { guild_id, days, compute_only }, `${compute_only ? "Hitung" : "Eksekusi"} prune server ${guild_id} untuk member inactive > ${days || 7} hari`);
    },
  },
  {
    name: "move-member",
    description: "PINDAHKAN member ke voice channel lain. Bot perlu izin 'Move Members'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
        channel_id: { type: "string", description: "ID voice channel tujuan" },
      },
      required: ["guild_id", "user_id", "channel_id"],
    },
    handler: async ({ guild_id, user_id, channel_id }) => {
      return requireConfirm("move-member", { guild_id, user_id, channel_id }, `Pindahkan member ${user_id} ke voice channel ${channel_id} di server ${guild_id}`);
    },
  },
  {
    name: "disconnect-member",
    description: "PUTUSKAN member dari voice channel. Bot perlu izin 'Move Members'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        user_id: { type: "string", description: "ID user" },
      },
      required: ["guild_id", "user_id"],
    },
    handler: async ({ guild_id, user_id }) => {
      return requireConfirm("disconnect-member", { guild_id, user_id }, `Putuskan member ${user_id} dari voice di server ${guild_id}`);
    },
  },
  {
    name: "create-role",
    description: "BUAT role baru di server. Bot perlu punya role hierarchy yang cukup.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama role" },
        color: { type: "string", description: "Warna hex (contoh: FF0000 untuk merah, opsional)", default: "" },
        hoist: { type: "boolean", description: "Tampilkan terpisah di sidebar?", default: false },
        mentionable: { type: "boolean", description: "Bisa di-mention oleh siapapun?", default: false },
      },
      required: ["guild_id", "name"],
    },
    handler: async ({ guild_id, name, color, hoist, mentionable }) => {
      return requireConfirm("create-role", { guild_id, name, color, hoist, mentionable }, `Buat role "${name}" di server ${guild_id}${color ? ` (warna: #${color})` : ""}`);
    },
  },
  {
    name: "edit-role",
    description: "EDIT role yang sudah ada. Bot perlu punya role hierarchy yang cukup.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        role_id: { type: "string", description: "ID role" },
        name: { type: "string", description: "Nama baru (opsional)", default: "" },
        color: { type: "string", description: "Warna hex baru (opsional)", default: "" },
        hoist: { type: "boolean", description: "Tampilkan terpisah (opsional)", default: null },
        mentionable: { type: "boolean", description: "Bisa di-mention (opsional)", default: null },
      },
      required: ["guild_id", "role_id"],
    },
    handler: async ({ guild_id, role_id, name, color, hoist, mentionable }) => {
      return requireConfirm("edit-role", { guild_id, role_id, name, color, hoist, mentionable }, `Edit role ${role_id} di server ${guild_id}`);
    },
  },
  {
    name: "delete-role",
    description: "HAPUS role dari server. Bot perlu punya role hierarchy yang cukup.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        role_id: { type: "string", description: "ID role yang akan dihapus" },
      },
      required: ["guild_id", "role_id"],
    },
    handler: async ({ guild_id, role_id }) => {
      return requireConfirm("delete-role", { guild_id, role_id }, `Hapus role ${role_id} dari server ${guild_id}`);
    },
  },
  {
    name: "edit-channel",
    description: "EDIT channel: nama, topik, slowmode, NSFW. Bot perlu izin 'Manage Channels'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        name: { type: "string", description: "Nama baru (lowercase, tanpa spasi, opsional)", default: "" },
        topic: { type: "string", description: "Topik baru (opsional)", default: "" },
        slowmode: { type: "number", description: "Slowmode dalam detik (0-21600, opsional)", default: null },
        nsfw: { type: "boolean", description: "Jadikan NSFW? (opsional)", default: null },
      },
      required: ["channel_id"],
    },
    handler: async ({ channel_id, name, topic, slowmode, nsfw }) => {
      return requireConfirm("edit-channel", { channel_id, name, topic, slowmode, nsfw }, `Edit channel ${channel_id}${name ? `: nama="${name}"` : ""}${topic ? ", topic diubah" : ""}${slowmode !== null && slowmode !== undefined ? `, slowmode=${slowmode}` : ""}${nsfw !== null && nsfw !== undefined ? `, nsfw=${nsfw}` : ""}`);
    },
  },
  {
    name: "edit-channel-permissions",
    description: "SET permission overwrite untuk channel. target_type: 0=Role, 1=Member. allow/deny berupa string bit permission. Butuh 2x konfirmasi.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        target_id: { type: "string", description: "ID role atau member" },
        target_type: { type: "number", description: "0=Role, 1=Member" },
        allow: { type: "string", description: "Permission bit string yang diizinkan (contoh: 1024 untuk View Channel)", default: "0" },
        deny: { type: "string", description: "Permission bit string yang ditolak (contoh: 2048 untuk Send Messages)", default: "0" },
      },
      required: ["channel_id", "target_id", "target_type"],
    },
    handler: async ({ channel_id, target_id, target_type, allow, deny }) => {
      return requireConfirm("edit-channel-permissions", { channel_id, target_id, target_type, allow, deny }, `Set permission ${target_type === "0" ? "role" : "member"} ${target_id} di channel ${channel_id}`, 2);
    },
  },
  {
    name: "list-categories",
    description: "LIHAT daftar kategori channel di server.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
      },
      required: ["guild_id"],
    },
    handler: async ({ guild_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const channels: any = await res.json();
          const categories = channels.filter((ch: any) => ch.type === 4);
          if (categories.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada kategori channel." }] };
          const formatted = categories.map((c: any) => `• ${bold(c.name)} ${inlineCode(c.id)}${c.position !== undefined ? ` (pos: ${c.position})` : ""}`).join("\n");
          return { content: [{ type: "text", text: `${bold(`📁 ${categories.length} Kategori`)} • ${inlineCode(guild_id)}\n${divider()}\n${formatted}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-category",
    description: "BUAT kategori channel baru di server. Bot perlu izin 'Manage Channels'.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string", description: "ID server" },
        name: { type: "string", description: "Nama kategori" },
      },
      required: ["guild_id", "name"],
    },
    handler: async ({ guild_id, name }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const res = await fetch(`https://discord.com/api/v10/guilds/${guild_id}/channels`, {
          method: "POST",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            type: 4, // GUILD_CATEGORY
          }),
        });
        if (res.ok) {
          const ch: any = await res.json();
          return { content: [{ type: "text", text: `${bold("✅ Kategori Dibuat")}\n• Nama: ${ch.name}\n• ID: ${inlineCode(ch.id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "create-poll",
    description: "BUAT poll/survei di channel. answers berupa JSON string array (contoh: [\"Opsi A\",\"Opsi B\"]). Maks 10 jawaban, durasi 1-168 jam.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        question: { type: "string", description: "Pertanyaan poll" },
        answers: { type: "string", description: "JSON string array jawaban, contoh: [\"Ya\",\"Tidak\",\"Mungkin\"]" },
        duration_hours: { type: "number", description: "Durasi dalam jam (1-168)", default: 24 },
      },
      required: ["channel_id", "question", "answers"],
    },
    handler: async ({ channel_id, question, answers, duration_hours }) => {
      return requireConfirm("create-poll", { channel_id, question, answers, duration_hours }, `Buat poll "${question.slice(0, 50)}..." di channel ${channel_id} (${duration_hours || 24} jam)`);
    },
  },
  {
    name: "end-poll",
    description: "AKHIRI poll lebih awal. Bot perlu izin 'Manage Messages'.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string", description: "ID channel" },
        message_id: { type: "string", description: "ID message poll" },
      },
      required: ["channel_id", "message_id"],
    },
    handler: async ({ channel_id, message_id }) => {
      const token = getEnv().DISCORD_TOKEN;
      try {
        const body = {
          poll: {
            expiry: new Date().toISOString(),
          },
        };
        const res = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages/${message_id}`, {
          method: "PATCH",
          headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          return { content: [{ type: "text", text: `${bold("✅ Poll Diakhiri")}\n• Channel: ${inlineCode(channel_id)}\n• Message: ${inlineCode(message_id)}` }] };
        } else {
          const err = await res.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal Akhiri Poll")} (${res.status}): ${err}` }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  // ─── GITHUB TOOLS ────────────────────────────────────────
  {
    name: "github-run",
    description: "JALANKAN PERINTAH TERMINAL di GitHub Actions runner. Bisa pakai command exact, atau bahasa manusia — AI akan generate perintah yang tepat. Contoh intent: 'update packages', 'cek isi folder', 'deploy ke cloudflare', 'git pull'",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Nama owner/org GitHub", default: "Netuv" },
        repo: { type: "string", description: "Nama repository" },
        command: { type: "string", description: "Perintah bash exact (opsional — kalau kosong, pake intent)" },
        intent: { type: "string", description: "Bahasa manusia: apa yang ingin dilakukan? Misal: 'cek disk usage', 'install dependencies', 'deploy'. AI akan generate command-nya." },
        shell: { type: "string", description: "Shell (bash/pwsh)", default: "bash" },
        working_directory: { type: "string", description: "Directory tujuan", default: "." },
      },
      required: ["repo"],
    },
    handler: async ({ owner, repo, command, intent, shell, working_directory }) => {
      const run_id = crypto.randomUUID().slice(0, 8);
      const resolvedOwner = owner || "Netuv";
      return requireConfirm("github-run", {
        owner: resolvedOwner,
        repo,
        command,
        intent,
        shell: shell || "bash",
        working_directory: working_directory || ".",
        run_id,
      }, `Jalankan perintah di ${resolvedOwner}/${repo}${command ? `\n${codeBlock("bash", command)}` : `\n🧠 Intent: "${intent || "?"}" (AI akan generate command)`}`);
    },
  },
  {
    name: "github-run-status",
    description: "CEK STATUS dan LOG dari GitHub Actions run. Ambil Run ID dari response github-run.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Nama owner/org GitHub", default: "Netuv" },
        repo: { type: "string", description: "Nama repository" },
        run_id: { type: "string", description: "Run ID dari response github-run" },
      },
      required: ["repo", "run_id"],
    },
    handler: async ({ owner, repo, run_id }) => {
      const token = getEnv().GITHUB_TOKEN;
      if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
      try {
        const resolvedOwner = owner || "Netuv";
        // Cari workflow run terbaru yang cocok dengan run_id
        const runsRes = await fetch(
          `https://api.github.com/repos/${resolvedOwner}/${repo}/actions/runs?event=workflow_dispatch&per_page=10`,
          { headers: { Authorization: `Bearer ${token}`, "User-Agent": "discord-mcp-bot", Accept: "application/vnd.github.v3+json" } }
        );
        if (!runsRes.ok) {
          const err = await runsRes.text();
          return { content: [{ type: "text", text: `${bold("❌ Gagal cek status")} (${runsRes.status}): ${err}` }] };
        }
        const runsData: any = await runsRes.json();
        // Cari run dengan input run_id
        const allRuns = runsData.workflow_runs || [];
        const foundRun = allRuns.find((r: any) => {
          const displayTitle = r.display_title || r.name || "";
          return displayTitle.includes(run_id) || r.head_branch === "main";
        }) || allRuns[0];
        if (!foundRun) {
          return { content: [{ type: "text", text: `📭 Belum ada workflow run ditemukan untuk ID: ${inlineCode(run_id)}. Coba tunggu beberapa saat.` }] };
        }
        const status = foundRun.conclusion || foundRun.status || "unknown";
        const statusEmoji = status === "success" ? "✅" : status === "failure" ? "❌" : status === "cancelled" ? "🚫" : "⏳";
        // Ambil log
        let logPreview = "";
        if (foundRun.status === "completed") {
          const jobsRes = await fetch(foundRun.jobs_url, {
            headers: { Authorization: `Bearer ${token}`, "User-Agent": "discord-mcp-bot" },
          });
          if (jobsRes.ok) {
            const jobsData: any = await jobsRes.json();
            const steps = jobsData.jobs?.[0]?.steps || [];
            logPreview = steps
              .filter((s: any) => s.conclusion)
              .map((s: any) => `  ${s.conclusion === "success" ? "✅" : "❌"} ${s.name.slice(0, 60)}`)
              .join("\n");
          }
        }
        return {
          content: [{
            type: "text",
            text: `${bold(`${statusEmoji} GitHub Run ${status}`)}\n• Run ID: ${inlineCode(run_id)}\n• Repo: ${resolvedOwner}/${repo}\n• Status: ${status}\n• Link: ${foundRun.html_url || "https://github.com/${resolvedOwner}/${repo}/actions"}${logPreview ? `\n${divider()}\n${logPreview}` : ""}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  // ─── GITHUB STUDIO TOOLS ─────────────────────────────────
  {
    name: "github-file",
    description: "BACA, BUAT, UPDATE, atau HAPUS file di GitHub repo. Untuk content creator: edit README, artikel, konfigurasi langsung dari bot.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "'read' — baca file | 'create' — buat baru | 'update' — update | 'delete' — hapus" },
        path: { type: "string", description: "Path file di repo (contoh: 'README.md', 'blog/post-1.md')" },
        content: { type: "string", description: "[create/update] Konten file" },
        message: { type: "string", description: "Commit message", default: "📝 Update via Discord AI Bot" },
        repo: { type: "string", description: "Nama repository (default: dari konteks)" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
        branch: { type: "string", description: "Branch", default: "main" },
      },
      required: ["action", "path"],
    },
    handler: async ({ action, path, content, message, repo, owner, branch }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo || "discord-ai-bot");

        switch (action) {
          case "read": {
            const file = await gs.getFile(path, branch);
            return {
              content: [{ type: "text", text: `${bold("📄 File:")} ${inlineCode(path)}\n${divider()}\n${file.content.slice(0, 3800)}${file.content.length > 3800 ? "\n\n*(konten dipotong)*" : ""}` }],
            };
          }
          case "create": {
            if (!content) return { content: [{ type: "text", text: "❌ Parameter 'content' wajib untuk action 'create'." }] };
            const result = await gs.createFile(path, content, message || `📝 Create ${path}`, branch);
            return { content: [{ type: "text", text: `✅ File dibuat: ${inlineCode(path)}\n🔗 ${result.html_url}` }] };
          }
          case "update": {
            if (!content) return { content: [{ type: "text", text: "❌ Parameter 'content' wajib untuk action 'update'." }] };
            const result = await gs.updateFile(path, content, message || `📝 Update ${path}`, branch);
            return { content: [{ type: "text", text: `✅ File diupdate: ${inlineCode(path)}\n🔗 ${result.html_url}` }] };
          }
          case "delete": {
            const result = await gs.deleteFile(path, message || `🗑️ Delete ${path}`, branch);
            return { content: [{ type: "text", text: result }] };
          }
          default:
            return { content: [{ type: "text", text: "❌ Action tidak valid. Pilih: read, create, update, delete." }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "github-pr",
    description: "KELOLA Pull Request: list, buat, merge, cek status conflict. Untuk content creator: publish artikel via PR.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "'list' — lihat PR | 'create' — buat PR | 'merge' — merge PR | 'check' — cek conflict" },
        title: { type: "string", description: "[create] Judul PR" },
        head: { type: "string", description: "[create] Branch sumber (head)" },
        base: { type: "string", description: "[create] Branch tujuan (default: main)", default: "main" },
        body: { type: "string", description: "[create] Deskripsi PR" },
        number: { type: "number", description: "[merge/check] Nomor PR" },
        mergeMethod: { type: "string", description: "[merge] Metode: merge/squash/rebase", default: "squash" },
        repo: { type: "string", description: "Nama repository" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
      },
      required: ["action"],
    },
    handler: async ({ action, title, head, base, body, number, mergeMethod, repo, owner }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo);

        switch (action) {
          case "list": {
            const prs = await gs.listPullRequests();
            if (prs.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada open PR." }] };
            const lines = prs.map((p) => `${p.state === "open" ? "🔀" : "✅"} **#${p.number}** ${p.title}\n   ${p.html_url}`);
            return { content: [{ type: "text", text: `${bold("📋 Open Pull Requests")}\n${divider()}\n${lines.join("\n")}` }] };
          }
          case "create": {
            if (!title || !head) return { content: [{ type: "text", text: "❌ Parameter 'title' dan 'head' wajib." }] };
            const pr = await gs.createPullRequest(title, head, base || "main", body);
            return { content: [{ type: "text", text: `✅ PR #${pr.number} created: ${pr.html_url}` }] };
          }
          case "merge": {
            if (!number) return { content: [{ type: "text", text: "❌ Parameter 'number' (nomor PR) wajib." }] };
            const result = await gs.mergePullRequest(number, undefined, mergeMethod as any);
            return { content: [{ type: "text", text: result }] };
          }
          case "check": {
            if (!number) return { content: [{ type: "text", text: "❌ Parameter 'number' (nomor PR) wajib." }] };
            const check = await gs.checkPullRequest(number);
            return { content: [{ type: "text", text: `${bold(`🔍 PR #${number}: ${check.status}`)}\n${divider()}\n${check.details}` }] };
          }
          default:
            return { content: [{ type: "text", text: "❌ Action tidak valid. Pilih: list, create, merge, check." }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "github-issue",
    description: "KELOLA Issue: list, buat, update (label/assign/close), auto-triage. Untuk community manager: organized issues.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "'list' — lihat issues | 'create' — buat baru | 'update' — edit | 'triage' — auto-label & prioritas" },
        title: { type: "string", description: "[create] Judul issue" },
        body: { type: "string", description: "[create] Deskripsi issue" },
        labels: { type: "string", description: "[create/update] Labels, pisah koma. Contoh: 'bug, urgent'" },
        assignees: { type: "string", description: "[create/update] Assignees, pisah koma" },
        number: { type: "number", description: "[update/triage] Nomor issue" },
        state: { type: "string", description: "[update] 'open' atau 'closed'" },
        repo: { type: "string", description: "Nama repository" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
      },
      required: ["action"],
    },
    handler: async ({ action, title, body, labels, assignees, number, state, repo, owner }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo);

        switch (action) {
          case "list": {
            const labelFilter = labels ? labels.split(",").map((l: string) => l.trim()) : undefined;
            const issues = await gs.listIssues("open", labelFilter);
            if (issues.length === 0) return { content: [{ type: "text", text: "📭 Tidak ada open issues." }] };
            const lines = issues.map((i) => {
              const labelStr = i.labels.length > 0 ? ` [${i.labels.join(", ")}]` : "";
              return `🐛 **#${i.number}**${labelStr} ${i.title}\n   👤 ${i.assignees.join(", ") || "unassigned"} • 💬 ${i.comments}`;
            });
            return { content: [{ type: "text", text: `${bold("📋 Open Issues")}\n${divider()}\n${lines.join("\n")}` }] };
          }
          case "create": {
            if (!title) return { content: [{ type: "text", text: "❌ Parameter 'title' wajib." }] };
            const labelArr = labels ? labels.split(",").map((l: string) => l.trim()) : undefined;
            const assignArr = assignees ? assignees.split(",").map((a: string) => a.trim()) : undefined;
            const issue = await gs.createIssue(title, body, labelArr, assignArr);
            return { content: [{ type: "text", text: `✅ Issue #${issue.number} dibuat: ${issue.html_url}` }] };
          }
          case "update": {
            if (!number) return { content: [{ type: "text", text: "❌ Parameter 'number' wajib." }] };
            const updates: any = {};
            if (body) updates.body = body;
            if (state) updates.state = state;
            if (labels) updates.labels = labels.split(",").map((l: string) => l.trim());
            if (assignees) updates.assignees = assignees.split(",").map((a: string) => a.trim());
            const issue = await gs.updateIssue(number, updates);
            return { content: [{ type: "text", text: `✅ Issue #${issue.number} diupdate. State: ${issue.state}. Labels: ${issue.labels.join(", ") || "none"}.` }] };
          }
          case "triage": {
            if (!number) return { content: [{ type: "text", text: "❌ Parameter 'number' (issue) wajib." }] };
            const router = getAiRouter();
            const result = await gs.autoTriage(number, router);
            return { content: [{ type: "text", text: `${bold("🏷️ Auto-Triage Result")}\n${divider()}\n${result.summary}\n🏷️ Labels: ${result.suggestedLabels.join(", ") || "none"}\n🔥 Priority: ${result.priority}` }] };
          }
          default:
            return { content: [{ type: "text", text: "❌ Action tidak valid. Pilih: list, create, update, triage." }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "github-release",
    description: "KELOLA RELEASE: buat release + tag + auto-changelog, list releases. Untuk content creator: publikasi versi baru.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "'create' — buat release baru | 'list' — lihat releases" },
        tag: { type: "string", description: "[create] Nama tag. Contoh: 'v1.2.0'" },
        name: { type: "string", description: "[create] Nama release (default: pakai tag)" },
        body: { type: "string", description: "[create] Catatan release (kosongkan untuk auto-changelog)" },
        branch: { type: "string", description: "[create] Target branch", default: "main" },
        generateNotes: { type: "boolean", description: "[create] Auto-generate changelog dari commits", default: true },
        prerelease: { type: "boolean", description: "[create] Prerelease?", default: false },
        repo: { type: "string", description: "Nama repository" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
      },
      required: ["action"],
    },
    handler: async ({ action, tag, name, body, branch, generateNotes, prerelease, repo, owner }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo);

        switch (action) {
          case "create": {
            if (!tag) return { content: [{ type: "text", text: "❌ Parameter 'tag' wajib. Contoh: 'v1.2.0'" }] };
            const release = await gs.createRelease(tag, {
              targetBranch: branch || "main",
              name: name || tag,
              body: body || "",
              generateNotes: generateNotes !== false,
              prerelease: prerelease === true,
            });
            return { content: [{ type: "text", text: `✅ Release ${release.tag_name} created!\n🔗 ${release.html_url}` }] };
          }
          case "list": {
            const releases = await gs.listReleases();
            if (releases.length === 0) return { content: [{ type: "text", text: "📭 Belum ada release." }] };
            const lines = releases.map((r) => `📦 **${r.tag_name}**\n   ${r.html_url}`);
            return { content: [{ type: "text", text: `${bold("📋 Releases")}\n${divider()}\n${lines.join("\n")}` }] };
          }
          default:
            return { content: [{ type: "text", text: "❌ Action tidak valid. Pilih: create, list." }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "github-community",
    description: "LAPORAN KOMUNITAS & MILESTONE: health report, milestone tracker. Untuk community manager: pantau kesehatan repo.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "'report' — community health report | 'milestones' — lihat milestone progress" },
        repo: { type: "string", description: "Nama repository" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
      },
      required: ["action"],
    },
    handler: async ({ action, repo, owner }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo);

        switch (action) {
          case "report": {
            const report = await gs.communityReport();
            return { content: [{ type: "text", text: report.summary }] };
          }
          case "milestones": {
            const ms = await gs.listMilestones();
            if (ms.length === 0) return { content: [{ type: "text", text: "📭 Belum ada milestones." }] };
            const lines = ms.map((m) => {
              const bar = "▓".repeat(Math.floor(m.progress / 10)) + "░".repeat(10 - Math.floor(m.progress / 10));
              return `📍 **${m.title}** (${m.state})\n   ${bar} ${m.progress}% (${m.closed_issues}/${m.open_issues + m.closed_issues} issues)\n   Due: ${m.due_on ? new Date(m.due_on).toLocaleDateString("id-ID") : "—"}`;
            });
            return { content: [{ type: "text", text: `${bold("📊 Milestones")}\n${divider()}\n${lines.join("\n")}` }] };
          }
          default:
            return { content: [{ type: "text", text: "❌ Action tidak valid. Pilih: report, milestones." }] };
        }
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "github-blog",
    description: "BLOG WORKFLOW: buat artikel + branch + commit + PR dalam satu perintah. Untuk content creator: publish konten cepat.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Judul artikel" },
        content: { type: "string", description: "Konten artikel (Markdown)" },
        filepath: { type: "string", description: "Path file. Contoh: 'blog/my-post.md'", default: "blog/post.md" },
        draft: { type: "boolean", description: "True = simpan di branch aja tanpa PR", default: false },
        tags: { type: "string", description: "Tags pisah koma. Contoh: 'anime, review, gaming'" },
        repo: { type: "string", description: "Nama repository" },
        owner: { type: "string", description: "Owner/org", default: "Netuv" },
      },
      required: ["title", "content"],
    },
    handler: async ({ title, content, filepath, draft, tags, repo, owner }) => {
      try {
        const token = getEnv().GITHUB_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ GITHUB_TOKEN belum diset." }] };
        const gs = new GitHubStudio(token, owner || "Netuv", repo || "discord-ai-bot");
        const tagArr = tags ? tags.split(",").map((t: string) => t.trim()) : undefined;

        const result = await gs.blogWorkflow(title, content, filepath || "blog/post.md", {
          draft: draft === true,
          tags: tagArr,
        });

        return {
          content: [{
            type: "text",
            text: `${bold("📝 Blog Workflow Complete")}\n${divider()}\n${result.message}\n📂 Branch: \`${result.branch}\`\n🔗 ${result.pr?.html_url || `https://github.com/${owner || "Netuv"}/${repo || "discord-ai-bot"}/tree/${result.branch}`}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  // ─── SCHEDULER TOOLS ─────────────────────────────────────
  {
    name: "scheduler-list",
    description: "LIHAT semua tugas terjadwal (scheduled tasks). Menampilkan ID, nama, cron, status, dan last run.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      try {
        const tasks = await getTasks(getEnv());
        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "📭 Belum ada tugas terjadwal. Gunakan `scheduler-add` untuk membuat tugas baru." }] };
        }
        const now = new Date();
        const lines = tasks.map(t => {
          const statusEmoji = !t.enabled ? "⏸️" : t.last_status === "success" ? "✅" : t.last_status === "failed" ? "❌" : "🆕";
          const lastRunStr = t.last_run ? new Date(t.last_run).toLocaleString("id-ID") : "—";
          return (
            `${statusEmoji} **${t.name}** (\`${t.id}\`)\n` +
            `  ⏰ \`${t.cron}\` • 🔄 ${t.run_count}x • 🕐 ${lastRunStr}\n` +
            `  📋 ${t.description.slice(0, 100)}`
          );
        });
        return {
          content: [{
            type: "text",
            text: `${bold("📅 Daftar Tugas Terjadwal")}\n${divider()}\n${bulletList(lines)}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-add",
    description: "TAMBAH tugas terjadwal baru. Pilih action type dan parameter yang sesuai.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama tugas (misal: 'Pagi sapa', 'Auto-clean', 'Daily report')" },
        description: { type: "string", description: "Deskripsi tugas" },
        cron: { type: "string", description: "Cron expression UTC. Contoh: '0 8 * * *' (setiap jam 8 pagi), '*/30 * * * *' (setiap 30 menit), '0 0 * * 1' (setiap Senin tengah malam), '0 9-17 * * 1-5' (setiap jam kerja)" },
        action: { type: "string", description: "Jenis aksi: 'send-message' (kirim pesan), 'ai-prompt' (AI generate + kirim), 'ai-article' (AI artikel + embed + gambar), 'purge-channel' (bersihkan channel), 'custom-webhook' (panggil webhook), 'update-status' (status update), 'github-run' (jalankan GitHub Actions)" },
        channel_id: { type: "string", description: "ID channel Discord tujuan output" },
        guild_id: { type: "string", description: "ID guild/server Discord" },
        message: { type: "string", description: "[send-message] Pesan yang akan dikirim" },
        prompt: { type: "string", description: "[ai-prompt] Prompt untuk AI (default: 'Buatkan pengumuman singkat untuk hari ini.')" },
        jumlah: { type: "number", description: "[purge-channel] Jumlah pesan yang akan dihapus (default: 10, max: 100)" },
        webhook_url: { type: "string", description: "[custom-webhook] URL webhook tujuan" },
        webhook_method: { type: "string", description: "[custom-webhook] HTTP method (GET/POST/PUT, default: POST)" },
        webhook_body: { type: "string", description: "[custom-webhook] JSON body sebagai string" },
        repo: { type: "string", description: "[github-run] Nama repository GitHub" },
        command: { type: "string", description: "[github-run] Perintah bash yang akan dijalankan" },
        status: { type: "string", description: "[update-status] Status message yang akan dikirim" },
      },
      required: ["name", "cron", "action", "channel_id", "guild_id"],
    },
    handler: async (args) => {
      try {
        const action = args.action as string;
        const channelId = args.channel_id as string;
        const guildId = args.guild_id as string;

        // Validate action
        const validActions = ["send-message", "ai-prompt", "ai-article", "purge-channel", "custom-webhook", "update-status", "github-run"];
        if (!validActions.includes(action)) {
          return { content: [{ type: "text", text: `❌ Action tidak valid. Pilih salah satu: ${validActions.join(", ")}` }] };
        }

        // Build params based on action
        const params: Record<string, any> = {};

        switch (action) {
          case "send-message":
            params.message = args.message || "⏰ **Tugas Terjadwal Otomatis**";
            break;
          case "ai-prompt":
            params.prompt = args.prompt || "Buatkan pengumuman singkat untuk hari ini.";
            break;
          case "purge-channel":
            params.jumlah = args.jumlah || 10;
            break;
          case "custom-webhook":
            params.webhook_url = args.webhook_url;
            params.method = args.webhook_method || "POST";
            if (args.webhook_body) {
              try { params.body = JSON.parse(args.webhook_body); } catch { params.body = args.webhook_body; }
            }
            if (!params.webhook_url) {
              return { content: [{ type: "text", text: "❌ custom-webhook membutuhkan parameter `webhook_url`." }] };
            }
            break;
          case "update-status":
            params.status = args.status || "🟢 Bot aktif — tugas terjadwal berjalan";
            break;
          case "github-run":
            params.repo = args.repo;
            params.command = args.command || "echo 'Scheduled task run'";
            if (!params.repo) {
              return { content: [{ type: "text", text: "❌ github-run membutuhkan parameter `repo`." }] };
            }
            break;
        }

        const task = await addTask(getEnv(), {
          name: args.name as string,
          description: args.description || args.name as string,
          cron: args.cron as string,
          action: action as any,
          params,
          enabled: true,
          channel_id: channelId,
          guild_id: guildId,
        });

        return {
          content: [{
            type: "text",
            text: (
              `${bold("✅ Tugas Terjadwal Dibuat")}\n${divider()}\n` +
              `• **Nama:** ${task.name}\n` +
              `• **ID:** \`${task.id}\`\n` +
              `• **Cron:** \`${task.cron}\` (UTC)\n` +
              `• **Aksi:** ${task.action}\n` +
              `• **Channel:** <#${channelId}>\n` +
              `${divider()}\n` +
              `Gunakan \`scheduler-toggle ${task.id}\` untuk nonaktifkan sementara.\n` +
              `Gunakan \`scheduler-run ${task.id}\` untuk test jalan sekarang.`
            ),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-remove",
    description: "HAPUS tugas terjadwal permanent. Gunakan scheduler-list untuk lihat ID tugas.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID tugas (dari scheduler-list)" },
      },
      required: ["task_id"],
    },
    handler: async ({ task_id }) => {
      try {
        const deleted = await deleteTask(getEnv(), task_id);
        if (deleted) {
          return { content: [{ type: "text", text: `🗑️ Tugas \`${task_id}\` berhasil dihapus.` }] };
        }
        return { content: [{ type: "text", text: `❌ Tugas \`${task_id}\` tidak ditemukan.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-toggle",
    description: "AKTIFKAN/NONAKTIFKAN tugas terjadwal tanpa menghapus. Gunakan scheduler-list untuk lihat ID.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID tugas" },
      },
      required: ["task_id"],
    },
    handler: async ({ task_id }) => {
      try {
        const task = await getTask(getEnv(), task_id);
        if (!task) {
          return { content: [{ type: "text", text: `❌ Tugas \`${task_id}\` tidak ditemukan.` }] };
        }
        const updated = await updateTask(getEnv(), task_id, { enabled: !task.enabled });
        if (updated?.enabled) {
          return { content: [{ type: "text", text: `✅ Tugas **${updated.name}** (\`${task_id}\`) sekarang **AKTIF**.` }] };
        }
        return { content: [{ type: "text", text: `⏸️ Tugas **${updated?.name}** (\`${task_id}\`) sekarang **NONAKTIF**.` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-run",
    description: "JALANKAN tugas terjadwal SEKARANG juga (test). Berguna untuk testing sebelum dijadwalkan otomatis.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID tugas yang ingin dijalankan sekarang" },
      },
      required: ["task_id"],
    },
    handler: async ({ task_id }) => {
      try {
        const task = await getTask(getEnv(), task_id);
        if (!task) {
          return { content: [{ type: "text", text: `❌ Tugas \`${task_id}\` tidak ditemukan.` }] };
        }

        const result = await handleTestCron(getEnv(), task_id);
        const detail = result.logs.join("\n");

        return {
          content: [{
            type: "text",
            text: (
              `${bold("🚀 Test Eksekusi Scheduler")}\n${divider()}\n` +
              `${detail}\n${divider()}\n` +
              `✅ ${result.executed} berhasil, ❌ ${result.failed} gagal`
            ),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-logs",
    description: "LIHAT LOG eksekusi tugas terjadwal. Menampilkan riwayat 10 eksekusi terakhir.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID tugas (kosongkan untuk lihat ringkasan semua)" },
      },
    },
    handler: async ({ task_id }) => {
      try {
        if (task_id) {
          const task = await getTask(getEnv(), task_id as string);
          if (!task) {
            return { content: [{ type: "text", text: `❌ Tugas \`${task_id}\` tidak ditemukan.` }] };
          }
          const logs = await getTaskLogs(getEnv(), task_id as string);
          if (logs.length === 0) {
            return { content: [{ type: "text", text: `📭 Belum ada log untuk tugas **${task.name}** (\`${task_id}\`).` }] };
          }
          const lines = logs.slice(0, 10).map(l =>
            `${l.status === "success" ? "✅" : "❌"} **${l.task_name}** (${l.duration_ms}ms)\n` +
            `  🕐 ${new Date(l.timestamp).toLocaleString("id-ID")}\n` +
            `  📝 ${l.message.slice(0, 200)}`
          );
          return {
            content: [{
              type: "text",
              text: `${bold(`📋 Log: ${task.name}`)}\n${divider()}\n${lines.join("\n\n")}`,
            }],
          };
        }

        // No task_id — show summary of all
        const tasks = await getTasks(getEnv());
        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "📭 Belum ada tugas terjadwal." }] };
        }
        const summaries = await Promise.all(tasks.map(async t => {
          const logs = await getTaskLogs(getEnv(), t.id);
          const lastLog = logs[0];
          const lastStatus = lastLog
            ? `${lastLog.status === "success" ? "✅" : "❌"} ${lastLog.message.slice(0, 60)}`
            : "🆕 Belum pernah jalan";
          return `• **${t.name}** (\`${t.id}\`) — ${lastStatus}`;
        }));
        return {
          content: [{
            type: "text",
            text: `${bold("📊 Ringkasan Log Scheduler")}\n${divider()}\n${summaries.join("\n")}\n${divider()}\nGunakan \`scheduler-logs {task_id}\` untuk detail.`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  // ─── PROVIDER/MODEL TOOLS ────────────────────────────────
  {
    name: "provider-list",
    description: "LIHAT daftar semua AI provider yang terdaftar dan statusnya (aktif/nonaktif).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      try {
        const env = getEnv();
        const router = new AiRouter(env);
        const activeProviders = router.getActiveProviders();

        const lines = defaultProviderModels.map((p) => {
          const isActive = activeProviders.some((a: any) => a.name === p.name);
          const statusIcon = isActive ? "✅" : "⏸️";
          const keyRequired = p.secret ? "(butuh key)" : "";
          const secretStatus = p.secret
            ? (env[p.secret] ? "✅ Key OK" : "❌ Key belum diset")
            : "✅ Built-in";
          return `${statusIcon} **${p.emoji} ${p.name}** ${keyRequired}
  ${secretStatus} — ${p.models.length} model gratis`;
        });

        return {
          content: [{
            type: "text",
            text: `${bold("🤖 AI Provider List")}
${divider()}
${lines.join("\n")}
${divider()}
Gunakan ${inlineCode("model-list")} untuk lihat model per provider.`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "model-list",
    description: "LIHAT daftar model gratis dari provider AI tertentu. Provider: Cloudflare Workers AI, NVIDIA NIM, OpenRouter, OpenCode",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Nama provider: Cloudflare Workers AI, NVIDIA NIM, OpenRouter, atau OpenCode" },
      },
      required: ["provider"],
    },
    handler: async ({ provider }) => {
      try {
        const prov = defaultProviderModels.find((p) => p.name.toLowerCase() === (provider as string).toLowerCase());
        if (!prov) {
          const available = defaultProviderModels.map((p) => `\`${p.name}\``).join(", ");
          return { content: [{ type: "text", text: `❌ Provider "${provider}" tidak dikenal. Pilih: ${available}` }] };
        }

        const env = getEnv();
        const router = new AiRouter(env);
        const activeProviders = router.getActiveProviders();
        const isActive = activeProviders.some((a: any) => a.name === prov.name);
        const statusIcon = isActive ? "✅" : "⏸️";
        const secretStatus = prov.secret
          ? (env[prov.secret] ? "✅ Key tersimpan" : "❌ Key belum diset")
          : "✅ Built-in (no setup)";

        const modelLines = prov.models.map(
          (m: any, i: number) => `${i === 0 ? "⭐" : "•"} \`${m.name}\`${m.note ? ` — ${m.note}` : ""}`
        ).join("\n");

        return {
          content: [{
            type: "text",
            text: `${statusIcon} **${prov.emoji} ${prov.name}**
${secretStatus}
_${prov.note}_

${bold(`Model Gratis (${prov.models.length}):`)}
${divider()}
${modelLines}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  {
    name: "scheduler-edit",
    description: "EDIT parameter tugas terjadwal yang sudah ada. Semua parameter opsional — hanya yang diisi yang akan diubah.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID tugas yang akan diedit" },
        name: { type: "string", description: "Nama baru tugas" },
        description: { type: "string", description: "Deskripsi baru" },
        cron: { type: "string", description: "Cron expression baru (UTC)" },
        enabled: { type: "boolean", description: "Aktif/nonaktif" },
        channel_id: { type: "string", description: "Channel ID baru" },
        message: { type: "string", description: "[send-message] Pesan baru" },
        prompt: { type: "string", description: "[ai-prompt] Prompt AI baru" },
        jumlah: { type: "number", description: "[purge-channel] Jumlah hapus baru" },
        status: { type: "string", description: "[update-status] Status message baru" },
        repo: { type: "string", description: "[github-run] Repo baru" },
        command: { type: "string", description: "[github-run] Command baru" },
      },
      required: ["task_id"],
    },
    handler: async (args) => {
      try {
        const taskId = args.task_id as string;
        const existing = await getTask(getEnv(), taskId);
        if (!existing) {
          return { content: [{ type: "text", text: `❌ Tugas \`${taskId}\` tidak ditemukan.` }] };
        }

        const updates: Record<string, any> = {};
        if (args.name) updates.name = args.name;
        if (args.description) updates.description = args.description;
        if (args.cron) updates.cron = args.cron;
        if (args.enabled !== undefined) updates.enabled = args.enabled;
        if (args.channel_id) updates.channel_id = args.channel_id;

        // Update params
        const params = { ...existing.params };
        if (args.message) params.message = args.message;
        if (args.prompt) params.prompt = args.prompt;
        if (args.jumlah) params.jumlah = args.jumlah;
        if (args.status) params.status = args.status;
        if (args.repo) params.repo = args.repo;
        if (args.command) params.command = args.command;
        updates.params = params;

        const updated = await updateTask(getEnv(), taskId, updates);
        if (!updated) {
          return { content: [{ type: "text", text: `❌ Gagal mengupdate tugas \`${taskId}\`.` }] };
        }

        return {
          content: [{
            type: "text",
            text: `${bold("✅ Tugas Diperbarui")}\n• **${updated.name}** (\`${updated.id}\`)\n• ⏰ \`${updated.cron}\`\n• ${updated.enabled ? "✅ Aktif" : "⏸️ Nonaktif"}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `${bold("❌ Error")}: ${e.message}` }] };
      }
    },
  },
  // ─── WebScout: Web Search & Intelligence ─────────────────
  {
    name: "web-search",
    description: "Cari informasi dari web multi-source (DuckDuckGo, Wikipedia, HackerNews)",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci pencarian" },
        max: { type: "number", description: "Jumlah hasil maksimal", default: 5 },
      },
      required: ["query"],
    },
    handler: async (args: any) => {
      try {
        const scout = new WebScout(getEnv());
        const results = await scout.search(args.query, { maxResults: args.max || 5 });

        if (results.length === 0) {
          return { content: [{ type: "text", text: "❌ Tidak ada hasil ditemukan." }] };
        }

        const lines = results.map((r, i) =>
          `${i + 1}. **${r.title}** ([${r.source}])\n   ${r.snippet.slice(0, 150)}\n   ${inlineCode(r.url)}`
        );

        return {
          content: [{
            type: "text",
            text: `${bold("🔍 Web Search:")} ${inlineCode(args.query)}\n${divider()}\n${lines.join("\n\n")}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  {
    name: "web-scrape",
    description: "Ambil konten readable dari satu URL (berita, artikel, dokumentasi)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL yang akan di-scrape" },
        maxLength: { type: "number", description: "Maksimal karakter", default: 3000 },
      },
      required: ["url"],
    },
    handler: async (args: any) => {
      try {
        const scout = new WebScout(getEnv());
        const page = await scout.scrapePage(args.url, { maxLength: args.maxLength || 3000 });

        return {
          content: [{
            type: "text",
            text: `${bold("📄 Scrape:")} ${page.title}\n${divider()}\n🔗 ${inlineCode(page.url)}\n📊 ${page.wordCount} kata\n\n${page.snippet}\n\n${divider()}\n${bold("📑 Konten:")}\n${page.text.slice(0, 2500)}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error scrape: ${e.message}` }] };
      }
    },
  },
  {
    name: "web-deep-research",
    description: "Penelitian mendalam: AI buat sub-queries → search → scrape → AI summary",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topik penelitian" },
        depth: { type: "number", description: "Jumlah sub-queries (1-5)", default: 3 },
      },
      required: ["topic"],
    },
    handler: async (args: any) => {
      try {
        const scout = new WebScout(getEnv());
        const router = getAiRouter();
        const result = await scout.deepSearch(args.topic, router, {
          maxSubQueries: Math.min(args.depth || 3, 5),
        });

        const sourcesSection = result.sources.length > 0
          ? `\n\n${bold("📚 Sumber:")}\n${result.sources.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "";

        return {
          content: [{
            type: "text",
            text: `${bold("🧠 Deep Research:")} ${args.topic}\n${divider()}\n${bold("🔎 Sub-queries:")} ${result.subQueries.join(" | ")}\n\n${bold("📋 Ringkasan:")}\n${result.summary.slice(0, 3000)}${sourcesSection}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error deep research: ${e.message}` }] };
      }
    },
  },
  {
    name: "web-browse",
    description: "Buka beberapa URL sekaligus dan dapatkan kontennya",
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "string", description: "Daftar URL dipisah koma" },
        maxPages: { type: "number", description: "Maksimal halaman", default: 3 },
      },
      required: ["urls"],
    },
    handler: async (args: any) => {
      try {
        const urls = args.urls.split(",").map((u: string) => u.trim()).filter(Boolean);
        const scout = new WebScout(getEnv());
        const pages = await scout.browseUrls(urls, { maxPages: args.maxPages || 3 });

        if (pages.length === 0) {
          return { content: [{ type: "text", text: "❌ Tidak ada halaman yang berhasil diambil." }] };
        }

        const sections = pages.map((p, i) =>
          `${bold(`📄 ${i + 1}. ${p.title}`)}\n🔗 ${inlineCode(p.url)}\n${p.snippet.slice(0, 400)}`
        );

        return {
          content: [{
            type: "text",
            text: `${bold("🌐 Batch Browse")}\n${divider()}\n${sections.join("\n\n")}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error browse: ${e.message}` }] };
      }
    },
  },
  // ─── IMAGE SCRAPE TOOL ──────────────────────────────────
  {
    name: "image-scrape",
    description: "Cari gambar anime/manga dengan akurat. Multi-source (AniList + MyAnimeList) + title scoring. Cocok untuk article workflow.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Judul anime/manga (contoh: 'Jujutsu Kaisen', 'One Piece')" },
        minScore: { type: "number", description: "Minimum match score (0-100, default 60)", default: 60 },
      },
      required: ["query"],
    },
    handler: async ({ query, minScore }) => {
      try {
        const env = getEnv();
        const hasGoogle = !!env?.GOOGLE_SEARCH_API_KEY && !!env?.GOOGLE_SEARCH_ENGINE_ID;

        // Quick Google API test
        let googleDebug = "N/A";
        if (hasGoogle) {
          try {
            const testUrl = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_SEARCH_API_KEY}&cx=${env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=1`;
            const testRes = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });
            const testData: any = await testRes.json();
            if (testData.error) {
              googleDebug = `❌ ${testData.error.code}: ${testData.error.message?.slice(0, 80)}`;
            } else {
              googleDebug = `✅ ${testData.items?.length || 0} items`;
            }
          } catch (e: any) {
            googleDebug = `⚠️ ${e.message}`;
          }
        }

        const result = await searchAnimeImage(query, { minScore: minScore || 60, env });
        const sourceTag = !result ? "❌" :
          result.source.startsWith("Google") ? "🟦 Google" :
          result.source.startsWith("AniList") ? "🟪 AniList" :
          result.source.startsWith("Kitsu") ? "🟩 Kitsu" :
          result.source.startsWith("ANN") ? "🟧 ANN" : "🟥 MAL";

        if (!result) {
          return { content: [{ type: "text", text: `❌ Tidak ditemukan gambar untuk: ${inlineCode(query)}\n🔍 Google API: ${googleDebug}` }] };
        }

        const imgData = await downloadImage(result.url);

        return {
          content: [{
            type: "text",
            text: `${bold("🖼️ Image Scrape:")} ${inlineCode(query)}\n${divider()}\n` +
              `${sourceTag}: ${result.source}\n` +
              `🔗 URL: ${result.url}\n` +
              `✅ Validasi: ${imgData ? "Gambar valid ✅" : "⚠️ Gagal download"}\n` +
              `🔍 Google API: ${googleDebug}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  // ─── ARTICLE TOOL ───────────────────────────────────────
  {
    name: "ai-article",
    description: "BUAT ARTIKEL + RISET WEB + GAMBAR + VIDEO dalam 1 perintah! HEADLINE pakai EMBED dengan warna kategori. Tiap section: [Narasi] → [Video] → [Gambar] dikelompok rapi. Tanpa kesimpulan — gaya ngobrol santai. Tool ini sudah include riset web otomatis — JANGAN pakai web-search/web-scrape terpisah sebelumnya! Gunakan parameter 'fast' untuk versi cepat tanpa gambar/video.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topik artikel (contoh: 'berita anime summer 2026', 'game rilis baru')" },
        channel_id: { type: "string", description: "ID channel Discord untuk kirim hasil" },
        guild_id: { type: "string", description: "ID guild/server Discord" },
        fast: { type: "boolean", description: "Mode cepat: skip gambar & video, kirim lebih responsif" },
      },
      required: ["topic", "channel_id", "guild_id"],
    },
    handler: async (args: any) => {
      try {
        const env = getEnv();
        const token = env.DISCORD_TOKEN;
        if (!token) return { content: [{ type: "text", text: "❌ DISCORD_TOKEN belum diset." }] };

        const topic = args.topic;
        const channelId = args.channel_id;
        const fastMode = args.fast === true;

        // ═══ RESEARCH ═══
        let research = { summary: "Gunakan pengetahuan umum.", reviewSummary: "" };
        try {
          research = await researchArticle(topic, env);
        } catch (e: any) {
          console.warn(`⚠️ MCP Research gagal: ${e.message}`);
        }

        // ═══ AI GENERATE (3 attempts + fallback) ═══
        let article: any;
        try {
          article = await generateArticle(topic, research, env);
        } catch (e: any) {
          console.error(`❌ MCP AI article gagal: ${e.message}`);
          article = generateFallbackArticle(topic);
        }

        // ═══ PUBLISH ═══
        (globalThis as any).__LUMINA_ENV__ = env;
        const pubResult = await publishArticle(token, channelId, article, { faster: fastMode });

        if (!pubResult.success) {
          return { content: [{ type: "text", text: `❌ Artikel gagal dikirim: ${pubResult.error}` }] };
        }

        const headlineTitle = article.title || `📰 ${topic}`;
        const summary = `✅ "${headlineTitle.slice(0, 60)}..." → ${pubResult.sectionsPublished} section${pubResult.imagesPublished > 0 ? ` • ${pubResult.imagesPublished} gambar` : ""}${pubResult.videosPublished > 0 ? ` • ${pubResult.videosPublished} video` : ""}`;

        return { content: [{ type: "text", text: `${bold("📝 Artikel Terkirim!")}\n${divider()}\n${summary}` }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
  // ─── VIDEO SEARCH TOOL ───────────────────────────────────
  {
    name: "video-search",
    description: "Cari video YouTube paling relevan dengan scoring multi-source (DDG + Invidious + optional YT API). Validasi URL otomatis — anti-halusinasi! Cocok untuk cari trailer/PV anime.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci video (contoh: 'Jujutsu Kaisen Season 3 trailer', 'Dorohedoro Season 3 PV')" },
        minScore: { type: "number", description: "Minimum match score (0-100, default 50)", default: 50 },
      },
      required: ["query"],
    },
    handler: async ({ query, minScore }) => {
      try {
        const env = getEnv();
        const result = await searchYouTubeVideo(query, {
          env,
          minScore: minScore || 50,
          requireValidation: true,
        });

        if (!result) {
          return { content: [{ type: "text", text: `❌ Tidak ditemukan video YouTube untuk: ${inlineCode(query)}` }] };
        }

        // Dapatkan detail tambahan dari video ID
        const vidMatch = result.url.match(/v=([a-zA-Z0-9_-]{11})/);
        const videoId = vidMatch ? vidMatch[1] : "?";
        const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        let sourceEmoji = "🟦";
        if (result.source.includes("Invidious")) sourceEmoji = "🟪";
        else if (result.source.includes("Google")) sourceEmoji = "🟩";
        else if (result.source.includes("YouTube API")) sourceEmoji = "🟥";

        return {
          content: [{
            type: "text",
            text: `${bold("🎬 Video Search:")} ${inlineCode(query)}\n${divider()}\n` +
              `${sourceEmoji} **Judul:** ${result.title}\n` +
              `🔗 **URL:** ${result.url}\n` +
              `📊 **Score:** ${result.score}/100\n` +
              `📡 **Source:** ${result.source}\n` +
              `🖼️ **Thumbnail:** ${thumbnailUrl}\n` +
              `${result.score >= 70 ? "✅ Sangat relevan" : result.score >= 50 ? "⚠️ Cukup relevan" : "❌ Kurang relevan"}`,
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    },
  },
];

// ─── JSON-RPC Handler ──────────────────────────────────────

function getToolList(): any[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

function makeJsonRpcError(id: number | string | null, code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

function makeJsonRpcResult(id: number | string | null, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

async function handleJsonRpcRequest(body: any): Promise<JsonRpcResponse> {
  const { method, params, id } = body as JsonRpcRequest;

  if (!method) {
    return makeJsonRpcError(id ?? null, -32600, "Invalid Request: method is required");
  }

  switch (method) {
    case "initialize":
      return makeJsonRpcResult(id, {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {},
        },
        serverInfo: { name: "discord-mcp-bot", version: "1.0.0" },
      });

    case "ping":
      return makeJsonRpcResult(id, {});

    case "tools/list":
      return makeJsonRpcResult(id, { tools: getToolList() });

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        return makeJsonRpcError(id, -32602, `Tool '${toolName}' not found`);
      }

      try {
        const result = await tool.handler(args);
        return makeJsonRpcResult(id, result);
      } catch (e: any) {
        return makeJsonRpcError(id, -32603, `Tool error: ${e.message}`);
      }
    }

    case "notifications/initialized":
      // No response needed for notifications
      return makeJsonRpcResult(id, {});

    default:
      return makeJsonRpcError(id, -32601, `Method '${method}' not found`);
  }
}

// ─── SSE Stream Manager ────────────────────────────────────

interface SseSession {
  stream: ReadableStream;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  createdAt: number;
}

const sessions = new Map<string, SseSession>();

function writeSseEvent(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: string, data: string) {
  controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
}

function writeSseJson(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: string, data: any) {
  writeSseEvent(controller, encoder, event, JSON.stringify(data));
}

// ─── MCP Handler ───────────────────────────────────────────

async function handleMcpGet(request: Request): Promise<Response> {
  const sessionId = crypto.randomUUID();

  const encoder = new TextEncoder();

  let streamController: ReadableStreamDefaultController | null = null;

  const readable = new ReadableStream({
    start(controller) {
      streamController = controller;

      // Kirim endpoint event — klien akan POST ke sini
      const endpointUrl = `/mcp?sessionId=${sessionId}`;
      writeSseEvent(controller, encoder, "endpoint", endpointUrl);
    },
    cancel() {
      sessions.delete(sessionId);
    },
  });

  const session: SseSession = {
    stream: readable,
    controller: streamController!,
    encoder,
    createdAt: Date.now(),
  };

  sessions.set(sessionId, session);

  // Bersihin session lama (> 5 menit)
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (now - s.createdAt > 300000) {
      try { s.controller.close(); } catch {}
      sessions.delete(sid);
    }
  }

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handleMcpPost(request: Request, sessionId: string): Promise<Response> {
  // Validate Content-Type
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify(makeJsonRpcError(null, -32700, "Parse error")), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Parse body
  let body: any;
  try {
    body = await request.json() as any;
  } catch {
    return new Response(JSON.stringify(makeJsonRpcError(null, -32700, "Parse error: Invalid JSON")), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const result = await handleJsonRpcRequest(body);

  // Kalau ada session, kirim response via SSE
  const session = sessions.get(sessionId);
  if (session) {
    try {
      writeSseJson(session.controller, session.encoder, "message", result);
    } catch {
      sessions.delete(sessionId);
    }
  }

  // Kembalikan response JSON juga
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
  });
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, X-Signature-Ed25519, X-Signature-Timestamp",
      },
    });
  }

  if (method === "GET") {
    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/event-stream")) {
      return handleMcpGet(request);
    }
    // GET tanpa SSE → return info
    return new Response(JSON.stringify({
      name: "discord-mcp-bot",
      version: "1.0.0",
      description: "Discord AI Bot MCP Server",
      tools: getToolList().map((t) => t.name),
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  if (method === "POST") {
    const sessionId = url.searchParams.get("sessionId") || request.headers.get("mcp-session-id") || "";
    return handleMcpPost(request, sessionId);
  }

  return new Response("Method Not Allowed", { status: 405, headers: { "Access-Control-Allow-Origin": "*" } });
}
