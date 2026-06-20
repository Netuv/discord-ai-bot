# Discord AI Bot — Workspace Log

> **Tanggal:** 19 Juni 2026
> **Project:** `discord-ai-bot` — Cloudflare Workers Discord Bot + MCP Server
> **Worker URL:** `https://discord-ai-bot.luminary-bot.workers.dev`
> **Laptop:** Probadi (Baru) — Workspace dipindah dari PC kantor

---

## 📋 Ringkasan Project

Discord bot berbasis **Cloudflare Workers** dengan **MCP (Model Context Protocol)** server, AI integration (Llama 4 Scout), scheduler system, WebScout, GitHub Studio, dan ~114 tools untuk administrasi Discord.

### Tech Stack
| Komponen | Teknologi |
|----------|-----------|
| Runtime | Cloudflare Workers (Node.js compat) |
| Bahasa | TypeScript (strict) |
| AI Model | `@cf/meta/llama-4-scout-17b-16e-instruct` |
| Database | KV Namespace (`SCHEDULER_KV`) |
| Cron | Cloudflare Cron Triggers (`* * * * *`) |
| MCP Protocol | SSE Streamable HTTP (kustom) |
| CI/CD | GitHub Actions (remote-run) |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` |

---

## 📁 Struktur File

```
discord-ai-bot/
├── AGENTS.md                          # Agent instructions (Cloudflare Workers)
├── GITHUB-SETUP.md                    # Dokumentasi setup GitHub & fitur
├── WORKSPACE-LOG.md                   # File ini
├── package.json                       # Dependencies & scripts
├── tsconfig.json                      # TypeScript config (ES2024, Bundler)
├── vitest.config.mts                  # Vitest config untuk Workers
├── wrangler.jsonc                     # Cloudflare Workers config
├── worker-configuration.d.ts          # Generated types (wrangler types)
├── .gitignore                         # Git ignore rules
├── scripts/
│   └── register-commands.mjs          # Register Discord slash commands
├── src/
│   ├── index.ts                       # Entry point: fetch + scheduled handler
│   ├── mcp-handler.ts                 # MCP server + ~103 tool definitions (~3950 lines)
│   ├── mcp-confirm.ts                 # Konfirmasi queue untuk admin actions
│   ├── scheduler.ts                   # Scheduled task system
│   ├── user-config.ts                 # User config per-user via KV
│   ├── web-scout.ts                   # Web intelligence (search, scrape, deep research)
│   └── image-scraper.ts               # Image search (AniList + Jikan + scoring + download)
├── test/
│   ├── index.spec.ts                  # Unit test
│   ├── tsconfig.json                  # Test tsconfig
│   └── env.d.ts                       # Test env types
└── .github/
    └── workflows/
        └── remote-run.yml             # GitHub Actions workflow untuk remote terminal
```

---

## 🔗 API Routes

| Route | Method | Fungsi |
|-------|--------|--------|
| `/` atau `/mcp` | GET | MCP SSE endpoint (Streamable HTTP) |
| `/mcp` | POST | MCP JSON-RPC request |
| `/mcp` | OPTIONS | CORS preflight |
| `/interactions` | POST | Discord interactions (PING, /ask, /help) |
| `/cron/test` | GET | Trigger scheduled tasks manual |
| `/cron/notify` | POST | Notifikasi hasil scheduler ke Discord |
| `/web/search?q=...` | GET | WebScout multi-source search (JSON) |
| `/web/scrape?url=...` | GET | WebScout scrape URL (JSON) |

---

## 🛡️ Discord Slash Commands

| Command | Deskripsi |
|---------|-----------|
| `/ask <prompt>` | Tanya AI (Llama 4 Scout) — hanya untuk owner |
| `/help` | Lihat bantuan dan info bot |

### User Restriction
- Hanya user ID **468772891371110411** yang bisa pakai `/ask`
- Diatur via secret `ALLOWED_USER_ID`

---

## 🤖 MCP Tools (~103 tools)

### AI & Productivity (17 tools)
`status`, `ai-chat`, `translate`, `summarize`, `brainstorm`, `generate-code`, `code-review`, `explain-code`, `math-solve`, `generate-email`, `analyze-text`, `fetch-web`, `content-ideas`, `define`, `generate-story`, `convert`, `improve-writing`, `generate-quiz`, `career-advice`, `meal-plan`

### Discord Core (6 tools)
`send-discord`, `send-embed`, `send-file`, `edit-message`, `add-reaction`, `remove-reaction`, `read-channel`

### Discord Server Info (10 tools)
`get-guilds`, `get-me`, `get-channel`, `list-channels`, `list-categories`, `list-roles`, `list-members`, `search-members`, `get-member`, `get-bans`

### Admin — User Management (7 tools)
`ban-user`, `unban-user`, `kick-user`, `timeout-user`, `remove-timeout`, `prune-members`, `modify-member`

### Admin — Role Management (5 tools)
`add-role`, `remove-role`, `create-role`, `edit-role`, `delete-role`

### Admin — Channel Management (7 tools)
`create-channel`, `delete-channel`, `edit-channel`, `edit-channel-permissions`, `move-member`, `disconnect-member`, `purge-channel`

### Admin — Message Management (7 tools)
`delete-message`, `pin-message`, `unpin-message`, `crosspost-message`, `create-invite`, `create-thread`, `delete-thread`, `archive-thread`, `unarchive-thread`, `add-thread-member`, `remove-thread-member`, `list-active-threads`

### Admin — Webhook & Emoji & Sticker (10 tools)
`list-webhooks`, `create-webhook`, `delete-webhook`, `send-webhook`, `list-emojis`, `create-emoji`, `delete-emoji`, `list-stickers`, `create-sticker`, `delete-sticker`

### Admin — Server Management (10 tools)
`modify-guild`, `get-vanity-invite`, `list-invites`, `get-widget`, `modify-widget`, `list-events`, `create-event`, `delete-event`, `list-voice-regions`, `audit-log`

### Admin — AutoMod (3 tools)
`list-automod-rules`, `create-automod-rule`, `delete-automod-rule`

### Polling (1 tool)
`create-poll`

### Confirmation System (3 tools)
`confirm-action`, `cancel-action`, `list-pending`

### GitHub Runner (2 tools)
`github-run`, `github-run-status`

### Scheduler (7 tools)
`scheduler-list`, `scheduler-add`, `scheduler-remove`, `scheduler-toggle`, `scheduler-run`, `scheduler-logs`, `scheduler-edit`

### WebScout — Web Intelligence (4 tools)
`web-search`, `web-scrape`, `web-deep-research`, `web-browse`

### GitHub Studio — Content Creator & Community (7 tools)
`github-file`, `github-pr`, `github-issue`, `github-release`, `github-community`, `github-blog`

---

## ⏰ Scheduler System

### Cara Kerja
1. Cron Trigger `* * * * *` memicu `scheduled()` handler setiap menit
2. Handler membaca task dari KV (`scheduler:tasks`)
3. Cron parsing 5-field (UTC) — cocokkan dengan waktu sekarang
4. Task yang cocok dieksekusi, hasil/log disimpan di KV

### Action Types
| Aksi | Deskripsi |
|------|-----------|
| `send-message` | Kirim teks ke channel |
| `ai-prompt` | AI generate + kirim |
| `purge-channel` | Hapus pesan bulk |
| `custom-webhook` | Panggil webhook URL |
| `update-status` | Kirim status message |
| `github-run` | Trigger GitHub Actions |

### KV Storage
- `scheduler:tasks` — Array `ScheduledTask[]`
- `scheduler:logs:{taskId}` — Array `TaskLogEntry[]` (max 50)

---

## 🔐 Secrets (Cloudflare)

| Secret | Status | Fungsi |
|--------|--------|--------|
| `DISCORD_PUBLIC_KEY` | ✅ Set | Verifikasi signature Discord |
| `DISCORD_TOKEN` | ✅ Set | Bot token Discord |
| `ALLOWED_USER_ID` | ✅ Set | Restrict user (468772891371110411) |
| `GITHUB_TOKEN` | ✅ Set | GitHub API token (fine-grained PAT) |

---

## 🐙 GitHub Integration

- **Repo:** `Netuv/discord-ai-bot`
- **Remote:** `https://github.com/Netuv/discord-ai-bot.git`
- **Workflow:** `.github/workflows/remote-run.yml`
  - Trigger: `workflow_dispatch` (dari MCP `github-run` tool)
  - Runs on: `ubuntu-latest`
  - Timeout: 15 menit
  - Inputs: command, shell, working_directory, run_id

---

## 🧠 Fix History (2026-06-19)

### 5. Workspace Setup — Laptop Probadi
- **Node.js:** v24.16.0 ✅
- **npm:** 11.13.0 ✅
- **Git:** 2.54.0 ✅
- Dependencies diinstall: `npm install` (189 packages)
- TypeScript types digenerate: `wrangler types`
- **120 TypeScript errors fixed** — semua karena `response.json()` return type `unknown`, ditambahkan `as any` / `: any` di seluruh `src/mcp-handler.ts`
- **3 test lulus semua** (unit + integration + MCP endpoint)
- `tsc --noEmit` — zero errors
- Cloudflare skills terinstall untuk AI coding agents

### 6. AI Router System (2026-06-19)
- File baru: `src/ai-router.ts` — sistem switching provider AI dengan auto-failover
- **Cara kerja:** Coba provider priority tinggi dulu → gagal → fallback ke provider berikutnya
- **Default provider (urutan prioritas):**
  1. **Cloudflare Workers AI** (built-in, gratis) — `@cf/meta/llama-4-scout-17b-16e-instruct`
  2. **NVIDIA NIM** (gratis) — butuh secret `NVIDIA_API_KEY`
  3. **OpenRouter** (gratis) — butuh secret `OPENROUTER_API_KEY`
  4. **OpenCode** (gratis) — butuh secret `OPENCODE_API_KEY`
  5. **Custom OpenAI** — butuh secret `CUSTOM_OPENAI_API_KEY`
- Router otomatis mendeteksi API key mana yang tersedia di Secret Environment
- Semua kode yang pakai AI di-upgrade: `mcp-handler.ts`, `index.ts`, `scheduler.ts`

### 7. User Config Provider/Model per User (2026-06-19)
- File baru: `src/user-config.ts` — simpan pilihan provider & model user ke KV (`user:config:{user_id}`)
- User bisa pilih provider + model via `/provider <nama> <model>` dan semua `/ask` pakai konfigurasi itu
- `/provider reset` untuk kembali ke auto-router
- Response `/ask` menampilkan info provider yang dipakai

### 8. Context Menu "Ask AI" (2026-06-19)
- Register **MESSAGE CONTEXT MENU** (`Apps → Ask AI`) — klik kanan pesan → AI analisis
- Handler di `src/index.ts` untuk `interaction.data.type === 3`
- Tetap terproteksi oleh `ALLOWED_USER_ID`

### 10. WebScout — Sistem Web Intelligence (2026-06-19)
- File baru: `src/web-scout.ts` — menggantikan `webResearch()` lama yang cuma RSS
- **3 sumber pencarian GRATIS tanpa API key:**
  1. **DuckDuckGo** (Instant Answer API + Lite HTML fallback) — hasil web luas
  2. **Wikipedia API** — definisi & artikel ensiklopedis
  3. **HackerNews Algolia API** — trending tech & diskusi
- **`scrapePage(url)`** — ambil konten readable dari HTML (strip tag, extract article/main/body)
- **`deepSearch(topic, aiRouter)`** — AI buat sub-queries → search semua → scrape → AI summary
- **`browseUrls(urls)`** — batch fetch multiple URLs
- **`researchForArticle(topic)`** — method khusus untuk scheduler (pengganti `webResearch()`)
- **Cache otomatis via KV** (1 jam TTL) — hemat bandwidth & cepat
- **MCP tools baru (4 tools):**
  - `web-search` — search multi-source
  - `web-scrape` — scrape satu URL
  - `web-deep-research` — AI deep research
  - `web-browse` — batch browse URLs
- **HTTP API routes baru:**
  - `GET /web/search?q=...` — search JSON
  - `GET /web/scrape?url=...` — scrape JSON
- **Scheduler `webResearch()`** di-upgrade: pake WebScout, terima parameter `env`

### 11. GitHub Studio — Content Creator & Community Management (2026-06-19)
- File baru: `src/github-studio.ts` — Toolkit terintegrasi GitHub API
- **File Management:** create, read, update, delete file di repo langsung dari bot
- **PR Management:** list, create, merge (squash/merge/rebase), cek conflict status
- **Issue Management:** list, create, update (label/assign/close), **auto-triage AI** (label + prioritas)
- **Release Manager:** create release + tag + auto-changelog dari commits 30 hari
- **Blog Workflow:** `blogWorkflow()` — buat branch → commit artikel → PR dalam 1 perintah
- **Media Pipeline:** dispatch ke runner untuk: optimize-images, convert-video, resize, thumbnail, watermark
- **SEO Audit:** lighthouse audit via runner
- **Community Report:** stars, forks, issues, PRs, top contributors, recent activity
- **Milestone Tracker:** list progress milestone dengan progress bar
- **MCP tools baru (7 tools):**
  - `github-file` — baca/buat/update/hapus file
  - `github-pr` — list, create, merge, check PR
  - `github-issue` — list, create, update, auto-triage
  - `github-release` — create release + changelog, list
  - `github-community` — health report & milestone tracker
  - `github-blog` — blog workflow (1-click publish)
- Total tools: ~103 + 4 WebScout + 7 GitHub Studio = **~114 tools**

### 12. Image Scraper + Vision AI (2026-06-19)
- File baru: `src/image-scraper.ts` — Module image search & download terpisah
- **AniList GraphQL** — search paling akurat (exact match support)
- **Jikan API** — fallback + scoring 5 result
- **`titleMatchScore()`** — scoring 0-100:
  - 100 = exact match | 90 = substring | 80 = semua kata | 75/60 = partial
- **`downloadImage()`** — browser headers + magic bytes validation
- **Fallback otomatis:** hapus kata generik → ambil kata pertama
- **JSON sanitasi** di `scheduler.ts`:
  - Hapus markdown `![emoji](url)` dari response AI
  - Hapus `[text](url)` markdown
  - Retry: hapus semua URL kalau parse gagal
- **Artikel flow v2:** gambar dulu → embed teks
- **MCP tool baru:** `image-scrape` — cari gambar anime/manga + validasi
- **Prompt v2.0:** gaya santai "aku-kamu", JSON sanitasi, anti markdown injection
- **Vision AI:** Metadata match → Vision AI → Cache 24 jam

### 13. Writing Style v2.0 (2026-06-19)
- Prompt di `scheduler.ts` di-rewrite total
- **Gaya:** Kasual, santai, "aku-kamu", paragraf pendek 2-3 kalimat
- **Hook:** Pertanyaan relatable, fakta unik, pernyataan berani
- **Copywriting:** Transisi mulus, metafora, storytelling
- **Dilarang:** Kata robotik ("Kesimpulannya", "Dapat disimpulkan", "Penting untuk diingat")
- **Contoh:** "Kamu tau gak sih, summer 2026 bakal jadi season paling gila..."
- **JSON sanitasi:** Hapus `![emoji](url)` markdown dari response AI
- Panduan lengkap di `ARTIKEL-GUIDE.md` v2.0

### 14. Vision AI (ai-router.ts) (2026-06-19)
- **`ai-router.ts`** — `VisionMessage` + `VisionContentPart` types
- `visionChat()` — kirim gambar + teks ke AI, auto-failover
- `callCloudflareVision()` — `env.AI.run()` dengan content array (text + image)
- `callOpenAIVision()` — OpenAI-compatible API (`image_url` format)
- `buildVisionPayload()` — konversi format otomatis sesuai provider
- **Verification flow 2-layer:**
  - **Layer 1 (Metadata Match)** — GRATIS, CEPAT
  - **Layer 2 (Vision AI)** — Kalau metadata mismatch, cache 24 jam
  - Flow: Metadata ✅ → Verified | ❌ → Vision AI ✅ → Kirim
- Default model `@cf/meta/llama-4-scout-17b-16e-instruct` support vision — gratis!

### 7. Slash Command /provider + MCP Provider Tools (2026-06-19)
- Command baru: **`/provider`** — lihat daftar AI provider & model gratis
  - `/provider` → list semua provider dengan status (✅ aktif / ⏸️ nonaktif)
  - `/provider <nama>` → detail model gratis dari provider tertentu
  - Restrict user mode tetap aktif (via `ALLOWED_USER_ID`)
- MCP tools baru (2 tools):
  - **`provider-list`** — lihat daftar semua provider + status secret/key
  - **`model-list <provider>`** — lihat daftar model gratis per provider
- Data provider dipindah ke `src/ai-router.ts` sebagai `defaultProviderModels` — bisa dipakai bersama oleh index.ts dan mcp-handler.ts
- Register command: `scripts/register-commands.mjs`

### 1. verifyKey Async Fix
- `verifyKey` dari `discord-interactions` adalah async (`__awaiter`)
- **Before:** `const isValid = signature && timestamp && verifyKey(...)` — Promise selalu truthy
- **After:** `const isValidRequest = await verifyKey(rawBody, signature, timestamp, key)`

### 2. MCP Transport Rewrite
- **Before:** Menggunakan `McpServer.serve()` — method tidak ada di SDK
- **After:** Kustom SSE Streamable HTTP implementation:
  - `GET /mcp` → SSE stream dengan `endpoint` event + sessionId
  - `POST /mcp?sessionId=xxx` → JSON-RPC, response via SSE + HTTP JSON
  - `handleMcpGet()` — buat session, kirim SSE events
  - `handleMcpPost()` — parse JSON-RPC, cari tool, eksekusi, kirim response

### 3. User Restriction
- Tambah filter `ALLOWED_USER_ID` di handler interactions
- User yang tidak terdaftar mendapat pesan "⛔ Maaf, bot ini hanya bisa digunakan oleh owner."

### 4. Error Handling
- Global try-catch di fetch handler
- Setiap action handler punya try-catch sendiri

---

## 📦 Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "discord-interactions": "^4.4.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.12.4",
    "@types/node": "^25.9.3",
    "typescript": "^5.5.2",
    "vitest": "~3.2.0",
    "wrangler": "^4.102.0"
  }
}
```

---

## 🔧 Scripts

| Script | Perintah |
|--------|---------|
| `npm run deploy` | `wrangler deploy` |
| `npm run dev` | `wrangler dev` |
| `npm test` | `vitest` |
| `npm run cf-typegen` | `wrangler types` |

---

## 🌐 Environment

| Variabel | Lingkungan |
|----------|-----------|
| OS | Windows |
| Shell | PowerShell |
| Node.js | v24.16.0 |
| npm | 11.13.0 |
| Git | 2.54.0 |
| Wrangler | 4.102.0 (via npx) |
| Laptop | Probadi (Baru) |

---

## ⚙️ Wrangler Config

```jsonc
{
  "name": "discord-ai-bot",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-19",
  "observability": { "enabled": true },
  "compatibility_flags": ["nodejs_compat"],
  "ai": { "binding": "AI" },
  "kv_namespaces": [{
    "binding": "SCHEDULER_KV",
    "id": "d55f00a62a194646b9c7bc069048f3c2"
  }],
  "triggers": { "crons": ["* * * * *"] }
}
```

---

## 🧪 Testing

- Framework: Vitest + `@cloudflare/vitest-pool-workers`
- Test file: `test/index.spec.ts`
- Config: `vitest.config.mts`

---

## 📝 Catatan Tambahan

- **MCP Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/mcp`
- **Interactions Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/interactions`
- **Discord App ID:** `1192465007221411921`
- **File terbesar:** `src/mcp-handler.ts` (~4900 baris, ~115 tool definitions)
- **Scheduler memory:** Lihat `/memories/repo/scheduler-system.md` untuk detail
- **Semua kode sudah di-push ke GitHub** (`git push`已完成)
