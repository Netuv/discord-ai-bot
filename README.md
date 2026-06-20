# 🤖 Discord AI Bot

> **Cloudflare Workers Discord Bot + MCP Server** — Platform bot serba bisa untuk administrasi Discord, AI generasi konten, web intelligence, GitHub management, dan tugas terjadwal otomatis.

[![Deploy](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://discord-ai-bot.luminary-bot.workers.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2-6E9F18?logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📋 Daftar Isi

- [🤖 Discord AI Bot](#-discord-ai-bot)
  - [📋 Daftar Isi](#-daftar-isi)
  - [✨ Fitur Utama](#-fitur-utama)
  - [🏗️ Arsitektur](#️-arsitektur)
  - [📁 Struktur Project](#-struktur-project)
  - [⚙️ Prerequisites \& Dependencies](#️-prerequisites--dependencies)
    - [Runtime](#runtime)
    - [Dev Dependencies](#dev-dependencies)
    - [Production Dependencies](#production-dependencies)
  - [🚀 Development Method](#-development-method)
    - [1. Clone \& Install](#1-clone--install)
    - [2. Setup Environment](#2-setup-environment)
    - [3. Local Development](#3-local-development)
    - [4. Register Slash Commands](#4-register-slash-commands)
    - [5. Deploy](#5-deploy)
    - [6. Generate Types](#6-generate-types)
  - [🔧 Secrets \& Konfigurasi](#-secrets--konfigurasi)
  - [🧠 AI Router (Multi-Provider)](#-ai-router-multi-provider)
  - [🔌 MCP Tools Overview](#-mcp-tools-overview)
    - [AI \& Productivity (20 tools)](#ai--productivity-20-tools)
    - [Discord Core (7 tools)](#discord-core-7-tools)
    - [Discord Server Info (10 tools)](#discord-server-info-10-tools)
    - [Admin — User/Role/Channel (19 tools)](#admin--userrolechannel-19-tools)
    - [Admin — Message/Webhook/Emoji (17 tools)](#admin--messagewebhookemoji-17-tools)
    - [Admin — Server Management (10 tools)](#admin--server-management-10-tools)
    - [AutoMod (3 tools)](#automod-3-tools)
    - [WebScout (4 tools)](#webscout-4-tools)
    - [GitHub Studio (7 tools)](#github-studio-7-tools)
    - [Image Scraper (1 tool)](#image-scraper-1-tool)
    - [Scheduler (7 tools)](#scheduler-7-tools)
    - [Confirmation (3 tools)](#confirmation-3-tools)
    - [Polling (1 tool)](#polling-1-tool)
  - [🌐 API Routes](#-api-routes)
  - [⏰ Scheduler System](#-scheduler-system)
  - [🎨 Image Scraper (Multi-Source)](#-image-scraper-multi-source)
  - [🔎 WebScout — Web Intelligence](#-webscout--web-intelligence)
  - [🐙 GitHub Studio](#-github-studio)
  - [🧪 Testing](#-testing)
  - [📦 Scripts Reference](#-scripts-reference)
  - [🤝 Kontribusi](#-kontribusi)
  - [📄 Lisensi](#-lisensi)

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **🧠 Multi-Provider AI** | Auto-failover antara Cloudflare AI, NVIDIA NIM, OpenRouter, OpenCode — support text + vision |
| **🔌 MCP Server (SSE)** | ~115 tools untuk AI Desktop (Claude, VS Code, Cursor, Copilot) |
| **💬 Discord Integration** | Slash commands (`/ask`, `/help`, `/provider`) + webhook interactions |
| **🔎 WebScout** | Multi-source web intelligence (DuckDuckGo, Wikipedia, HackerNews, Reddit) + scraping |
| **🎨 Image Scraper** | Cari gambar anime/manga dari AniList, Kitsu, Jikan (MAL), ANN — scoring otomatis |
| **⏰ Scheduler** | Cron-based task scheduler dengan 7 jenis aksi (send-message, ai-prompt, ai-article, dll) |
| **🐙 GitHub Studio** | File management, PR, Issues, Release, Community Health — langsung dari Discord |
| **🛡️ Admin Confirmation** | System konfirmasi 2-step untuk aksi berbahaya (ban, kick, delete) |
| **☁️ Cloudflare Workers** | Deploy global dengan latency rendah, cron triggers, KV storage |

---

## 🏗️ Arsitektur

```
                    ┌─────────────────────────────────┐
                    │      Discord API (Gateway)       │
                    └──────────┬──────────────────────┘
                               │ POST /interactions
                    ┌──────────▼──────────────────────┐
                    │       Cloudflare Workers         │
                    │        (index.ts)                │
                    │                                  │
                    │  ┌────────────┐ ┌─────────────┐  │
                    │  │  MCP SSE   │ │  Discord    │  │
                    │  │  Endpoint  │ │  Interaction│  │
                    │  └──────┬─────┘ └──────┬──────┘  │
                    │         │               │         │
                    │  ┌──────▼───────────────▼──────┐  │
                    │  │       mcp-handler.ts        │  │
                    │  │   (~115 MCP Tools)          │  │
                    │  └──────┬──────────────────────┘  │
                    │         │                         │
                    │  ┌──────▼──────────────────────┐  │
                    │  │  AI Router │ Scheduler │    │  │
                    │  │  WebScout  │ GitHub    │    │  │
                    │  │  Image     │ Config    │    │  │
                    │  └──────────────────────────────┘  │
                    │         │                         │
                    │  ┌──────▼──────┐                   │
                    │  │  KV Store   │                   │
                    │  └─────────────┘                   │
                    └────────────────────────────────────┘
```

**Alur Request:**
1. **Discord:** User kirim `/ask` → Discord webhook → Worker → AI Router → response embed
2. **MCP:** AI Desktop connect SSE → Worker → tool execution → JSON-RPC response
3. **Cron:** Cloudflare Cron Trigger → `scheduled()` → Scheduler → baca task dari KV → eksekusi
4. **HTTP API:** GET `/web/search?q=...` → WebScout → JSON response

---

## 📁 Struktur Project

```
discord-ai-bot/
├── .dev.vars.example          # Template env vars untuk local dev
├── .editorconfig              # Editor config (tab, charset, dll)
├── .gitignore                 # Git ignore rules
├── .prettierrc                # Prettier config (140 col, single quote, tabs)
├── .github/
│   └── workflows/
│       └── remote-run.yml     # GitHub Actions: remote terminal runner
├── AGENTS.md                  # Cloudflare Workers agent instructions
├── ARTIKEL-GUIDE.md           # Panduan format artikel AI (v2.0 Narasi)
├── Article Guide More.md      # Referensi cepat artikel
├── GITHUB-SETUP.md            # Dokumentasi setup GitHub & fitur
├── GITHUB-STUDIO-GUIDE.md     # Panduan lengkap GitHub Studio
├── WORKSPACE-LOG.md           # Catatan workspace & development log
├── package.json               # Dependencies & scripts
├── tsconfig.json              # TypeScript strict (ES2024, Bundler)
├── vitest.config.mts          # Vitest + cloudflare pool config
├── wrangler.jsonc             # Cloudflare Workers config
├── worker-configuration.d.ts  # Generated types (dari `wrangler types`)
├── scripts/
│   └── register-commands.mjs  # Register Discord slash commands
├── src/
│   ├── index.ts               # Entry point: fetch + scheduled handler
│   ├── mcp-handler.ts         # MCP SSE server + ~115 tool definitions
│   ├── mcp-confirm.ts         # Confirmation queue untuk admin actions
│   ├── scheduler.ts           # Cron-based scheduler system
│   ├── ai-router.ts           # Multi-provider AI with auto-failover
│   ├── user-config.ts         # Per-user provider/model config via KV
│   ├── web-scout.ts           # Web intelligence (search, scrape, deep research)
│   ├── image-scraper.ts       # Multi-source image search + scoring + download
│   └── github-studio.ts       # GitHub API: file, PR, issues, releases, community
└── test/
    ├── index.spec.ts          # Unit tests
    ├── tsconfig.json          # Test tsconfig
    └── env.d.ts               # Test env types
```

---

## ⚙️ Prerequisites & Dependencies

### Runtime

| Dependency | Version | Purpose |
|-----------|---------|---------|
| [Node.js](https://nodejs.org/) | ≥18 | Runtime |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | 4.x | Cloudflare Workers CLI |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [TypeScript](https://www.typescriptlang.org/) | ^5.5.2 | Type checking & compilation |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | ^4.102.0 | Deploy, dev server, types |
| [Vitest](https://vitest.dev/) | ~3.2.0 | Testing framework |
| [@cloudflare/vitest-pool-workers](https://www.npmjs.com/package/@cloudflare/vitest-pool-workers) | ^0.12.4 | Cloudflare Workers Vitest pool |
| [@types/node](https://www.npmjs.com/package/@types/node) | ^25.9.3 | Node.js type definitions |

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | ^1.29.0 | MCP protocol implementation (SSE + JSON-RPC) |
| [discord-interactions](https://www.npmjs.com/package/discord-interactions) | ^4.4.0 | Discord interaction verification & response |

---

## 🚀 Development Method

### 1. Clone & Install

```bash
git clone https://github.com/Netuv/discord-ai-bot.git
cd discord-ai-bot
npm install
```

### 2. Setup Environment

```bash
# Copy template, lalu isi nilai-nilainya
cp .dev.vars.example .dev.vars
```

Isi `.dev.vars` dengan credentials dari Discord Developer Portal:

```env
DISCORD_APP_ID=your_app_id
DISCORD_BOT_TOKEN=your_bot_token
# Opsional: OpenAI-compatible providers
NVIDIA_NIM_API_KEY=...
OPENROUTER_API_KEY=...
OPENCODE_API_KEY=...
```

### 3. Local Development

```bash
# Jalankan dev server (localhost:8787)
npm run dev

# Atau
npx wrangler dev
```

Server akan berjalan di `http://localhost:8787` dengan:
- **MCP SSE:** `http://localhost:8787/mcp`
- **Discord interactions:** `http://localhost:8787/interactions`
- **Web API:** `http://localhost:8787/web/search?q=...`

### 4. Register Slash Commands

Edit `scripts/register-commands.mjs`, isi `APP_ID` dan `BOT_TOKEN`, lalu:

```bash
node scripts/register-commands.mjs
```

Atau via environment variable:

```bash
$env:DISCORD_APP_ID = 'your-app-id'
$env:DISCORD_BOT_TOKEN = 'your-bot-token'
node scripts/register-commands.mjs
```

### 5. Deploy

```bash
npm run deploy
# atau
npx wrangler deploy
```

Set secrets setelah deploy:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put ALLOWED_USER_ID
npx wrangler secret put GITHUB_TOKEN
```

### 6. Generate Types

Jalankan setelah mengubah binding di `wrangler.jsonc`:

```bash
npm run cf-typegen
# atau
npx wrangler types
```

---

## 🔧 Secrets & Konfigurasi

| Secret | Wajib? | Deskripsi |
|--------|--------|-----------|
| `DISCORD_PUBLIC_KEY` | ✅ Ya | Public Key dari Discord Developer Portal |
| `DISCORD_TOKEN` | ✅ Ya | Bot token untuk kirim pesan ke Discord |
| `ALLOWED_USER_ID` | ✅ Ya | Discord user ID yang boleh pakai `/ask` |
| `GITHUB_TOKEN` | ✅ Ya | GitHub Personal Access Token (for GitHub Studio) |
| `NVIDIA_NIM_API_KEY` | ❌ Opsional | API key untuk NVIDIA NIM provider |
| `OPENROUTER_API_KEY` | ❌ Opsional | API key untuk OpenRouter provider |
| `OPENCODE_API_KEY` | ❌ Opsional | API key untuk OpenCode provider |

---

## 🧠 AI Router (Multi-Provider)

**File:** `src/ai-router.ts`

Sistem routing AI dengan **auto-failover** antara multiple provider:

| Provider | Type | Priority | Model Default |
|----------|------|----------|---------------|
| Cloudflare Workers AI | `cloudflare` | 1 (tertinggi) | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| NVIDIA NIM | `openai` | 2 | `nvidia/llama-3.1-nemotron-70b-instruct` |
| OpenRouter | `openai` | 3 | `qwen/qwq-32b:free` |
| OpenCode | `openai` | 4 | `gpt-4o-mini` |

**Fitur:**
- ✅ Auto-failover: coba provider priority 1, gagal → fallback ke berikutnya
- ✅ Vision support: kirim gambar + teks ke model vision
- ✅ Per-user config: user bisa pilih provider/model favorit via `/provider`
- ✅ Config disimpan di KV, persist antar session

**Cara kerja failover:**
```
User request → Coba Cloudflare AI → Gagal? → Coba NVIDIA NIM → Gagal? → Coba OpenRouter → Gagal? → Error
```
Setiap provider punya `maxRetries` (default 2) sebelum dianggap gagal.

---

## 🔌 MCP Tools Overview

MCP Server berjalan di endpoint `/mcp` dengan **Streamable HTTP** (SSE GET + JSON-RPC POST).

### AI & Productivity (20 tools)

`status`, `ai-chat`, `translate`, `summarize`, `brainstorm`, `generate-code`, `code-review`, `explain-code`, `math-solve`, `generate-email`, `analyze-text`, `fetch-web`, `content-ideas`, `define`, `generate-story`, `convert`, `improve-writing`, `generate-quiz`, `career-advice`, `meal-plan`

### Discord Core (7 tools)

`send-discord`, `send-embed`, `send-file`, `edit-message`, `add-reaction`, `remove-reaction`, `read-channel`

### Discord Server Info (10 tools)

`get-guilds`, `get-me`, `get-channel`, `list-channels`, `list-categories`, `list-roles`, `list-members`, `search-members`, `get-member`, `get-bans`

### Admin — User/Role/Channel (19 tools)

`kick-user`, `ban-user`, `unban-user`, `timeout-user`, `remove-timeout`, `move-user`, `rename-user`, `create-role`, `delete-role`, `assign-role`, `remove-role`, `create-channel`, `delete-channel`, `rename-channel`, `edit-channel-perms`, `create-category`, `move-channel`, `lock-channel`, `unlock-channel`

### Admin — Message/Webhook/Emoji (17 tools)

`delete-message`, `bulk-delete`, `pin-message`, `unpin-message`, `create-webhook`, `delete-webhook`, `send-webhook`, `create-emoji`, `delete-emoji`, `create-sticker`, `delete-sticker`, `list-invites`, `create-invite`, `create-thread`, `delete-thread`, `list-threads`, `archive-thread`

### Admin — Server Management (10 tools)

`create-guild`, `delete-guild`, `modify-guild`, `get-guild-preview`, `get-guild-vanity`, `set-guild-icon`, `set-guild-banner`, `set-guild-splash`, `list-guild-emojis`, `list-guild-stickers`

### AutoMod (3 tools)

`automod-rule-create`, `automod-rule-list`, `automod-rule-delete`

### WebScout (4 tools)

- `web-search` — Multi-source search (DuckDuckGo + Wikipedia + HackerNews + Reddit)
- `web-scrape` — Ekstrak konten readable dari URL
- `web-deep-research` — AI generates sub-queries → search all → scrape → AI summarize
- `web-browse` — Batch fetch multiple URLs

### GitHub Studio (7 tools)

- `github-file` — Baca/buat/update/hapus file di repo
- `github-pr` — Manage Pull Request (list, create, merge, close)
- `github-issue` — Manage Issue + auto-triage AI
- `github-release` — Buat release + auto-changelog
- `github-community` — Health report & milestone tracker
- `github-blog` — Blog workflow 1-klik (draft → commit → PR → publish)

### Image Scraper (1 tool)

- `image-scrape` — Cari gambar anime/manga dari 4 sumber, scoring 0-100, download + magic bytes validation

### Scheduler (7 tools)

`scheduler-list`, `scheduler-add`, `scheduler-remove`, `scheduler-toggle`, `scheduler-run`, `scheduler-logs`, `scheduler-edit`

### Confirmation (3 tools)

`confirm-action`, `cancel-action`, `list-pending`

### Polling (1 tool)

`create-poll`

---

## 🌐 API Routes

| Route | Method | Fungsi |
|-------|--------|--------|
| `/` atau `/mcp` | GET | MCP SSE endpoint (Streamable HTTP) |
| `/mcp` | POST | MCP JSON-RPC request |
| `/mcp` | OPTIONS | CORS preflight |
| `/interactions` | POST | Discord interactions (PING, `/ask`, `/help`, `/provider`) |
| `/cron/test` | GET | Manual trigger scheduled tasks |
| `/cron/notify` | POST | Kirim notifikasi hasil scheduler ke Discord |
| `/web/search?q=...` | GET | WebScout multi-source search (JSON) |
| `/web/scrape?url=...` | GET | WebScout scrape URL (JSON) |

---

## ⏰ Scheduler System

**File:** `src/scheduler.ts`

Sistem tugas terjadwal menggunakan **Cloudflare Cron Triggers** (`* * * * *` — setiap menit) + KV untuk persistensi.

**Jenis Task:**

| Aksi | Deskripsi |
|------|-----------|
| `send-message` | Kirim pesan teks ke channel |
| `ai-prompt` | AI generate konten + kirim ke channel |
| `ai-article` | AI generate artikel (narasi) + embed + cari gambar otomatis |
| `purge-channel` | Bersihkan pesan di channel |
| `custom-webhook` | Panggil webhook URL kustom |
| `update-status` | Kirim status update ke channel |
| `github-run` | Panggil GitHub Actions runner |

**Alur:**
1. Task disimpan di KV dengan cron expression
2. Cron trigger tiap menit → `scheduled()` handler
3. Scheduler cek task mana yang cocok dengan waktu sekarang
4. Eksekusi task → kirim hasil ke Discord channel tujuan
5. Log disimpan di KV untuk audit

**Contoh cron:**
| Expression | Arti (UTC) |
|------------|-----------|
| `* * * * *` | Setiap menit |
| `0 8 * * *` | Setiap jam 8 pagi |
| `*/30 * * * *` | Setiap 30 menit |
| `0 9-17 * * 1-5` | Jam kerja (9-17, Senin-Jumat) |

---

## 🎨 Image Scraper (Multi-Source)

**File:** `src/image-scraper.ts`

Mencari gambar anime/manga dari **4 sumber GRATIS** tanpa API key:

| Source | Metode | Keakuratan |
|--------|--------|-----------|
| **AniList** | GraphQL API | ⭐ Tertinggi — exact match support |
| **Kitsu** | REST API | ⭐ Baik — poster art berkualitas |
| **Jikan (MyAnimeList)** | REST API | ⭐ 5 results + scoring |
| **ANN** | REST API | ⭐ Encyclopedia |

**Scoring system (0-100):**
- Token-based title matching
- Season-aware (part, season, cour)
- Description similarity bonus
- Early exit kalau score 100 (exact match)

**Optimization:**
- Parallel fetch via `Promise.allSettled`
- KV cache (1 jam TTL)
- Magic bytes validation untuk download

---

## 🔎 WebScout — Web Intelligence

**File:** `src/web-scout.ts`

| Feature | Deskripsi |
|---------|-----------|
| **webSearch()** | Multi-source: DuckDuckGo, Wikipedia, HackerNews, Reddit, Google News |
| **scrapePage()** | Ekstrak konten readable + metadata dari URL |
| **deepSearch()** | AI generate sub-queries → search all → scrape → AI summarize |
| **browseUrls()** | Batch fetch multiple URLs parallel |
| **Cache** | Otomatis via KV (1 jam TTL) |

---

## 🐙 GitHub Studio

**File:** `src/github-studio.ts`

Toolkit GitHub terintegrasi untuk **Content Creator** & **Community Manager**.

**Content Creator:**
- 📁 File Management: CRUD file di repo
- ✍️ Blog Pipeline: draft → commit → PR → publish (1-klik)
- 🎬 Media Pipeline: perintah batch ke runner (optimize image, convert video)
- 📦 Release Manager: release + auto-changelog dari commits
- 🔍 SEO & Performance: lighthouse audit via runner

**Community Manager:**
- 🎯 Issue Triage: auto-label, assign, prioritization dengan AI
- 🔀 PR Management: merge, status check, conflict detection
- 📊 Community Health Report: contributor stats, activity metrics
- 🏁 Milestone Tracker: progress, burndown

---

## 🧪 Testing

Framework testing menggunakan **Vitest** dengan `@cloudflare/vitest-pool-workers`:

```bash
# Run all tests
npm test

# Run with watch mode
npx vitest

# Run specific test file
npx vitest test/index.spec.ts
```

---

## 📦 Scripts Reference

| Script | Command | Fungsi |
|--------|---------|--------|
| `deploy` | `wrangler deploy` | Deploy ke Cloudflare Workers |
| `dev` | `wrangler dev` | Local development server |
| `start` | `wrangler dev` | Alias untuk dev |
| `test` | `vitest` | Run test suite |
| `cf-typegen` | `wrangler types` | Generate TypeScript types dari bindings |

---

## 🤝 Kontribusi

1. Fork repository
2. Buat branch fitur: `git checkout -b feat/fitur-keren`
3. Commit perubahan: `git commit -m 'feat: tambah fitur keren'`
4. Push ke branch: `git push origin feat/fitur-keren`
5. Buat Pull Request

---

## 📄 Lisensi

Project ini menggunakan lisensi MIT. Lihat file [LICENSE](LICENSE) untuk informasi lengkap.

---

> **Worker URL:** [https://discord-ai-bot.luminary-bot.workers.dev](https://discord-ai-bot.luminary-bot.workers.dev)  
> **MCP Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/mcp`  
> **Repository:** [github.com/Netuv/discord-ai-bot](https://github.com/Netuv/discord-ai-bot)  
> **Author:** [Netuv](https://github.com/Netuv)
