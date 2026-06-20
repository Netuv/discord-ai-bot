#!/usr/bin/env node
/**
 * Register Discord Slash Commands
 * 
 * Usage:
 *   node scripts/register-commands.mjs
 * 
 * Environment variables:
 *   DISCORD_APP_ID    - Application ID dari Discord Developer Portal
 *   DISCORD_BOT_TOKEN - Bot Token dari Discord Developer Portal
 *   DISCORD_TOKEN     - Alternative untuk BOT_TOKEN
 * 
 * Atau edit langsung nilai di variabel APP_ID dan BOT_TOKEN di bawah.
 */

// ─── ISI DI SINI ───────────────────────────────────────────
const APP_ID = "1192465007221411921";   // Dari Discord Portal → General Information → APPLICATION ID
const BOT_TOKEN = ""; // Dari Discord Portal → Bot → Token
// ───────────────────────────────────────────────────────────

async function registerCommands() {
  const resolvedAppId = APP_ID || process.env.DISCORD_APP_ID;
  const resolvedToken = BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;

  if (!resolvedAppId || !resolvedToken) {
    console.error("\n❌  DISCORD_APP_ID dan DISCORD_BOT_TOKEN harus diisi!\n");
    console.error("   Cara 1: Edit variabel APP_ID dan BOT_TOKEN di file ini");
    console.error("   Cara 2: Set environment variable:\n");
    console.error("     $env:DISCORD_APP_ID = 'your-app-id'");
    console.error("     $env:DISCORD_BOT_TOKEN = 'your-bot-token'");
    console.error("     node scripts/register-commands.mjs\n");
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${resolvedAppId}/commands`;

  // Slash commands (type 1)
  const slashCommands = [
    {
      name: "ask",
      description: "Tanya AI via Cloudflare Workers",
      options: [
        {
          name: "prompt",
          description: "Pertanyaan atau perintah untuk AI",
          type: 3, // STRING
          required: true,
        },
      ],
    },
    {
      name: "help",
      description: "Lihat daftar perintah dan informasi bot",
    },
    {
      name: "provider",
      description: "Atur / Lihat AI provider & model — atau reset ke auto-router",
      options: [
        {
          name: "provider",
          description: "Pilih provider (dengan model) atau ketik 'reset'",
          type: 3, // STRING
          required: false,
          choices: [
            { name: "🌤️ Cloudflare Workers AI", value: "Cloudflare Workers AI" },
            { name: "🟢 NVIDIA NIM", value: "NVIDIA NIM" },
            { name: "🟣 OpenRouter", value: "OpenRouter" },
            { name: "🔵 OpenCode", value: "OpenCode" },
            { name: "🔄 Reset ke auto-router", value: "reset" },
          ],
        },
        {
          name: "model",
          description: "Model yang akan dipakai (lihat /provider untuk daftar model)",
          type: 3, // STRING
          required: false,
        },
        {
          name: "action",
          description: "Set atau reset konfigurasi",
          type: 3, // STRING
          required: false,
          choices: [
            { name: "reset — Kembali ke auto-router", value: "reset" },
          ],
        },
      ],
    },
  ];

  // Context menu commands (type 3 = MESSAGE)
  const contextCommands = [
    {
      name: "Ask AI",
      type: 3, // MESSAGE context menu — muncul saat klik kanan pesan
    },
  ];

  console.log("\n📝  Mendaftarkan slash commands ke Discord...\n");

  // Daftarkan slash commands
  for (const cmd of slashCommands) {
    console.log(`  → /${cmd.name}: ${cmd.description}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${resolvedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅  Berhasil! ID command: ${data.id}\n`);
    } else {
      const err = await res.text();
      console.error(`  ❌  Gagal (${res.status}): ${err}\n`);
    }
  }

  // Daftarkan context menu commands
  console.log("\n📝  Mendaftarkan context menu commands ke Discord...\n");
  for (const cmd of contextCommands) {
    console.log(`  → [Klik Kanan] ${cmd.name}`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${resolvedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅  Berhasil! ID command: ${data.id}\n`);
    } else {
      const err = await res.text();
      console.error(`  ❌  Gagal (${res.status}): ${err}\n`);
    }
  }

  console.log("✨  Selesai! Slash command sekarang bisa digunakan di Discord.");
  console.log("   (Mungkin perlu beberapa menit hingga muncul di semua server)\n");
}

registerCommands().catch(console.error);
