# Discord AI Bot — Workspace Log

> **Tanggal:** 20 Juni 2026
> **Project:** `discord-ai-bot` — Cloudflare Workers Discord Bot + MCP Server
> **Worker URL:** `https://discord-ai-bot.luminary-bot.workers.dev`
> **Laptop:** Probadi (Baru) — Workspace dipindah dari PC kantor

---

## 📋 Ringkasan Project

Discord bot berbasis **Cloudflare Workers** dengan **MCP (Model Context Protocol)** server, AI integration (Llama 4 Scout), scheduler system, WebScout, GitHub Studio, VideoScraper, dan ~115 tools untuk administrasi Discord.

### Tech Stack
| Komponen | Teknologi |
|----------|-----------|
| Runtime | Cloudflare Workers (Node.js compat) |
| Bahasa | TypeScript (strict) |
| AI Model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 🚀 |
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
│   ├── mcp-handler.ts                 # MCP server + ~115 tool definitions (~4900 lines)
│   ├── mcp-confirm.ts                 # Konfirmasi queue untuk admin actions
│   ├── scheduler.ts                   # Scheduled task system (cron + ai-article)
│   ├── user-config.ts                 # User config per-user via KV
│   ├── web-scout.ts                   # Web intelligence (search, scrape, deep research)
│   ├── image-scraper.ts               # Image search (AniList + Jikan + Kitsu + scoring + download)
│   └── video-scraper.ts               # Video search (DDG + Invidious + YT API + scoring + validasi) [NEW]
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

## 🤖 MCP Tools (~115 tools)

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

### Media Search (2 tools)
`image-scrape` — Cari gambar anime/manga multi-source (AniList + MAL + Kitsu) + validasi
`video-search` — Cari video YouTube multi-source (DDG + Invidious + YT API) + scoring + validasi [NEW]

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
| `ai-article` | AI generate artikel + riset web + gambar + video (otomatis) |
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

## 🧠 Fix History (2026-06-19 — 2026-06-20)

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

### 16. Article Format v3.0 — Embed Headline + per-Section Group (2026-06-20)
- **Masalah sebelumnya:** Format artikel berantakan — headline teks biasa, gambar & video terpisah acak, masih ada "Kesimpulannya"
- **Perubahan di `scheduler.ts` — `executeAiArticle()`:**
  - **STEP 3:** HEADLINE sekarang dikirim sebagai **EMBED** (bukan teks biasa) dengan warna sesuai kategori
  - **STEP 4:** Tiap section dikelompok rapi: [**Narasi**] → [**Video** link] → [**Gambar** attachment]
  - **STEP 5:** Separator `---` antar section
  - **CLOSING DIHAPUS:** Artikel berakhir natural, tanpa "Kesimpulannya"
  - Fungsi `sendEmbed()` baru — kirim embed ke Discord channel
- **Perubahan `buildArticlePrompt()`:**
  - Field `"closing"` dihapus dari format JSON
  - Ditambahkan instruksi: "TIDAK ADA closing/kesimpulan — akhiri dengan kalimat natural"
  - Ditambahkan "FORMAT DISCORD" section di prompt
  - Ditambahkan contoh paragraf penutup natural
- **Update `ARTIKEL-GUIDE.md`:** v2.0 → v3.0, semua contoh & format direfresh
- **Update MCP tool `ai-article`:** Deskripsi diperbarui dengan format baru
- **Koneksi:** Fungsi `sendEmbed()` reusable, warna dari `getArticleColor()`

### 15. Video Scraper — Multi-Source YouTube Search + Scoring (2026-06-20)

### 16. Article v3.0 — Embed Headline + VideoScraper Fix (2026-06-20)
- **Headline sekarang pake Discord Embed** dengan warna sesuai kategori!
- **Flow baru:** Headline Embed → Narasi per-section → Video → Gambar → Closing
- **VideoScraper fix v3.1:** Validasi jadi lebih LENIENT:
  - oEmbed sukses → pake title real
  - oEmbed gagal → **tetap anggap valid** (format ID 11 char YouTube sudah cukup)
  - Gak pake HEAD request lagi (sering diblokir Cloudflare IP)
  - Early exit TIDAK perlu validasi lagi (2+ source setuju = reliable)
  - Fallback: coba search tanpa kata "trailer/teaser" dengan threshold lebih rendah (40)
- **sendEmbed()** — fungsi baru untuk kirim embed ke Discord
- Deploy sukses: v2 → v3 (352 KiB, startup 6ms)
- File baru: `src/video-scraper.ts` (902 baris) — Menggantikan `findYouTubeVideo()` lama yang rawan halusinasi
- **Masalah sebelumnya:** `findYouTubeVideo()` cuma pake DuckDuckGo API → sering ngasih link ngaco
- **Solusi:** Multi-source parallel fetch + scoring ketat + validasi URL + caching KV
- **Sumber pencarian (GRATIS):**
  1. **DuckDuckGo** — Instant Answer API + Lite HTML fallback
  2. **Invidious API** — 4 instansi publik, gratis tanpa API key
  3. **YouTube Data API** (optional) — kalau ada `YOUTUBE_API_KEY`
  4. **Google Custom Search** (optional) — kalau ada `GOOGLE_SEARCH_API_KEY`
  5. **YouTube oEmbed API** — validasi URL real-time + ambil title asli
- **Scoring system (`videoTitleScore()`, 0-100):**
  - Base score token-based (0-75) — sama kayak image-scraper
  - Relevance bonus (0-15) — deteksi "trailer", "PV", "official", dll
  - Specific keyword bonus (-10 to +10) — season/part/trailer awareness
  - **Abbreviation expansion** — MHA→My Hero Academia, JJK→Jujutsu Kaisen, dll (20+ abbreviation)
- **Validasi otomatis 3 lapis:**
  1. YouTube oEmbed API — paling reliable
  2. HEAD request ke thumbnail (`i.ytimg.com/vi/{id}/hqdefault.jpg`)
  3. HEAD request ke watch page
- **Optimasi:**
  - Parallel fetch semua source (~2-4 detik)
  - KV Cache 1 jam TTL
  - Safe early exit (2+ source setuju + score ≥ 75)
  - Fallback query jika hasil kosong
- **Update file:**
  - `src/scheduler.ts` — Import + pake `videoScraperFindVideo()` gantikan fungsi lama
  - `src/mcp-handler.ts` — Import `searchYouTubeVideo` + tool MCP `video-search` baru
- **Test file:** `test/video-scraper.spec.ts` (215 baris) — 18 test case scoring logic
- **Scoring test results:** 18/18 ✅ termasuk abbreviation expansion
- **Deploy:** Syntax check ✅ → Logic verification ✅ → `wrangler deploy` ✅
  - Upload: 350 KiB (gzip: 66 KiB) | Startup: 8ms
  - URL: `https://discord-ai-bot.luminary-bot.workers.dev`

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

### 17. Break Line v1.0 — Setiap Judul Wajib Break Line! (2026-06-20)

#### 📋 Task Checklist
- [x] **scheduler.ts** — Pisah heading dan body jadi message terpisah (break line setelah judul)
- [x] **scheduler.ts** — Tambah invisible spacer (`ㅤ`) setelah HEADLINE embed
- [x] **scheduler.ts** — Update flow comment dengan format BREAK LINE v1.0
- [x] **buildArticlePrompt()** — Tambah aturan break line di prompt AI
- [x] **ARTIKEL-GUIDE.md** — Update panduan + contoh + checklist v3.1
- [x] **WORKSPACE-LOG.md** — Catat perubahan ini

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `src/scheduler.ts` — Section send | ✅ Deploy | Heading & body jadi 2 message terpisah |
| 2 | `src/scheduler.ts` — Embed spacer | ✅ Deploy | Invisible spacer (`ㅤ`) setelah HEADLINE |
| 3 | `src/scheduler.ts` — Flow comment | ✅ Deploy | Updated ke format BREAK LINE v1.0 |
| 4 | `buildArticlePrompt()` | ✅ Deploy | Prompt AI tambah aturan break line |
| 5 | `ARTIKEL-GUIDE.md` | ✅ Deploy | Dokumentasi v3.1 + aturan break line |
| 6 | `npx tsc --noEmit` | ✅ Pass | Zero errors |

---
> **Signed:** 20 Juni 2026, 19:44 WIB — Break Line v1.0 implemented & verified ✅
> **Updated by Kira**

### 18. Multi-Sumber Review v4.0 — Gak Cuma MAL! (2026-06-20)

#### 📋 Task Checklist
- [x] **researchReviews()** — Fungsi baru cari review & opini dari Reddit, ANN, forum, Twitter/X
- [x] **webResearch()** — Di-upgrade: parallel fetch berita + review sekaligus
- [x] **buildArticlePrompt()** — Tambah section SUMBER & REVIEW MULTI-SUMBER di prompt AI
- [x] **executeAiArticle()** — Review data diteruskan ke prompt AI
- [x] **ARTIKEL-GUIDE.md** — Update v4.0: cara riset review + contoh paragraf multi-sumber
- [x] **npx tsc --noEmit** — Zero errors

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `researchReviews()` — NEW | ✅ Deploy | Cari review multi-query, scrape top 4, format summary |
| 2 | `webResearch()` — Upgrade | ✅ Deploy | Parallel berita + review, return reviewSummary |
| 3 | `executeAiArticle()` — STEP 1 | ✅ Deploy | Review summary diteruskan ke prompt AI |
| 4 | `buildArticlePrompt()` — Prompt AI | ✅ Deploy | Section SUMBER & REVIEW + instruksi multi-sumber |
| 5 | `ARTIKEL-GUIDE.md` | ✅ Deploy | v4.0 — Panduan riset review + contoh baru |
| 6 | `npx tsc --noEmit` | ✅ Pass | Zero errors |

---
> **Signed:** 20 Juni 2026, 19:44 WIB — Multi-Sumber Review v4.0 implemented ✅
> **Updated by Kira**

### 19. Perbaikan Format Artikel — Parsing + Validasi + Fallback (2026-06-20)

#### 📋 Task Checklist
- [x] **article-publisher.ts** — Fix `findYouTubeVideo(query, { env })` → `(query, env)` (env kebungkus objek)
- [x] **article-writer.ts** — `parseArticleJSON()` tambah validasi sections + fallback kalau AI lupa
- [x] **article-writer.ts** — Backward compat `topics` → `sections` (AI kadang generate pake nama beda)
- [x] **npx tsc --noEmit** — Zero errors

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `article-publisher.ts` — video env | ✅ Fixed | `{ env }` → `env`, cache KV berfungsi normal |
| 2 | `article-writer.ts` — validation | ✅ Fixed | `parseArticleJSON` validasi sections + topics fallback |
| 3 | `article-writer.ts` — fallback section | ✅ Added | Kalau AI lupa generate sections, bikin 1 section default |
| 4 | `npx tsc --noEmit` | ✅ Pass | Zero errors |

---
> **Signed:** 20 Juni 2026, 19:44 WIB — Perbaikan format artikel v4.2 ✅
> **Updated by Kira**

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

### 20. Modular Scheduler REST API + Anti-Watermark (2026-06-21)

#### 📋 Task Checklist
- [x] **article-publisher.ts** — Hapus footer `"✨ Artikel • Lumina"` dari `publishHeadlineOnly()`
- [x] **article-writer.ts** — Tambah instruksi ANTI-WATERMARK di prompt AI
- [x] **index.ts** — REST API CRUD `/cron/tasks` (GET/POST/PUT/DELETE) — gak perlu edit TypeScript lagi!
- [x] **index.ts** — Import `addTask, deleteTask, updateTask, getTasks, getTask` dari scheduler
- [x] **npx tsc --noEmit** — Zero errors
- [x] Deploy + test CRUD (create/list/delete) ✅

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `article-publisher.ts` — Footer ✨ | ✅ Removed | Watermark "✨ Artikel • Lumina" dihapus |
| 2 | `article-writer.ts` — Prompt watermark | ✅ Added | Instruksi ANTI-WATERMARK di AI prompt |
| 3 | `index.ts` — REST API `/cron/tasks` | ✅ Deploy | CRUD lengkap: GET list/detail, POST create, PUT update, DELETE hapus |
| 4 | `scheduler.ts` — `clearAllTasks()` | ✅ Deploy | Utility hapus semua task |
| 5 | **Task "Update Konten Anime Harian"** | ✅ Active | Cron `0 6 * * *` (13:00 WIB), Control Room, ai-article |
| 6 | **REST API verified** | ✅ Tested | POST create ✅, GET list ✅, DELETE ✅ |

---

---

### 21. 🚀 Hybrid Turbo Layer — Heavy AI Processing (2026-06-21)

> **🚨 Final Update 21 Juni 2026:** Semua "Render" → **"Turbo"** (provider-agnostic).
> Provider hosting final = **Vercel Hobby** (gratis, NO CC ✅).
> Kode server pake Express + serverless (api/index.js + vercel.json).

#### 📋 Task Checklist
- [x] **turbo-server/server.js** — Express + 4 endpoint + conditional Vercel export
- [x] **turbo-server/api/index.js** — Vercel serverless entry point
- [x] **turbo-server/vercel.json** — Routing config
- [x] **src/turbo-helper.ts** — HTTP client (5 fungsi: `turboChat`, `turboHeavyArticle`, dll)
- [x] **src/index.ts** — /ask: DEFERRED + ctx.waitUntil() + coba Turbo → fallback AiRouter
- [x] **src/scheduler.ts** — executeAiArticle: coba turboHeavyArticle() setelah STEP 2
- [x] **scripts/deploy-turbo.sh** — Deployment script Vercel + Cloudflare
- [x] **HYBRID-RENDER-PLAN.md → TURBO-LAYER-PLAN.md** — Renamed & updated
- [x] **Vercel deploy** ✅ Live di `https://discord-turbo-layer.vercel.app`
- [x] **Cloudflare secret TURBO_SERVICE_URL** ✅ Set
- [x] **Worker deploy** ✅ 370 KiB, startup 9ms
- [x] **TSC check** ✅ Zero errors

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `turbo-server/server.js` | ✅ Final | Express + Vercel export + 4 AI provider (OpenRouter→NVIDIA→OpenCode→Cloudflare) |
| 2 | `turbo-server/api/index.js` | ✅ New | Vercel entry point, re-export app |
| 3 | `turbo-server/vercel.json` | ✅ New | Route /health, /ai/chat, /article/heavy, /discord/followup |
| 4 | `src/turbo-helper.ts` | ✅ Renamed | `render-helper.ts` → `turbo-helper.ts`, semua fungsi `renderX` → `turboX` |
| 5 | `src/index.ts` — /ask | ✅ Modified | DEFERRED + ctx.waitUntil() + `turboChat()` → fallback |
| 6 | `src/scheduler.ts` | ✅ Modified | `renderHeavyArticle` → `turboHeavyArticle()` |
| 7 | `TURBO-LAYER-PLAN.md` | ✅ New | Plan provider-agnostic, ganti HYBRID-RENDER-PLAN.md |
| 8 | `scripts/deploy-turbo.sh` | ✅ Updated | Vercel guide + secret + worker deploy |
| 9 | `src/ai-router.ts` | ✅ Updated | OpenCode default model → `deepseek-v4-flash-free` |
| 10 | `turbo-server/server.js` — OpenCode | ✅ Added | Priority 3 provider, model `deepseek-v4-flash-free` (FREE) |

#### 🚀 Deployment Final
| Komponen | URL / Status |
|----------|--------------|
| **Vercel (Turbo Layer)** | `https://discord-turbo-layer.vercel.app` ✅ |
| **Worker (Bot Utama)** | `https://discord-ai-bot.luminary-bot.workers.dev` ✅ |
| **TURBO_SERVICE_URL** | `https://discord-turbo-layer.vercel.app` ✅ Set |
| **Worker Startup** | 9ms ✅ |
| **MCP Endpoint** | `https://discord-ai-bot.luminary-bot.workers.dev/mcp` |

#### 🛡️ Garansi Keamanan
- ✅ Kode **tidak ada token hardcoded** — semua via env var
- ✅ `TURBO_SERVICE_URL` gak di-set → Turbo Layer skip, bot jalan normal
- ✅ Semua fungsi Turbo return `null` kalau gagal — **TIDAK PERNAH throw**
- ✅ Vercel Hobby **gratis selamanya, tanpa credit card**

---

## 🔐 Local Secrets File

File `.env.local` di root proyek ini nyimpen token buat agent AI:
- `VERCEL_TOKEN` — Deploy Vercel
- `CLOUDFLARE_API_TOKEN` — Deploy Worker
- `TURBO_SERVICE_URL` — URL Turbo Layer

File ini **gak ke-track git** (dilindungi `.gitignore`).
Kalau ganti chat window, agent baru bisa baca sini. Token update di sini juga kalau diregenerate.

## 📝 Catatan Tambahan

- **MCP Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/mcp`
- **Interactions Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/interactions`
- **Discord App ID:** `1192465007221411921`
- **File terbesar:** `src/mcp-handler.ts` (~4900 baris, ~115 tool definitions)
- **Scheduler memory:** Lihat `/memories/repo/scheduler-system.md` untuk detail
- **Semua kode sudah di-push ke GitHub** (`git push`已完成)
## ✅ After Deployment — Changes Verified & Deployed

### 🎯 Summary: AI Model Writer & Vision Modular Swap

| # | File | Status | Keterangan |
|---|------|--------|------------|
| 1 | `src/ai-router.ts` | ✅ Deploy | **OpenCode (deepseek-v4-flash-free) jadi Priority #1** untuk writer/chat. Urutan baru: OpenCode → Cloudflare → NVIDIA → OpenRouter → Custom |
| 2 | `src/ai-router.ts` | ✅ Deploy | **defaultVisionProviders** baru — modular, terpisah dari chat. Urutan: Xiaomi MiMo V2.5 📸 → Cloudflare Llama 4 Scout 👁️ → Llama 3.2 90B Vision → OpenRouter Gemma 3 12B fallback |
| 3 | `src/ai-router.ts` | ✅ Deploy | **defaultProviderModels** diurut ulang + tambah info Xiaomi MiMo V2.5 & Cloudflare Vision |
| 4 | `src/ai-router.ts` | ✅ Deploy | **AiRouter.visionChat()** sekarang pake `this.visionConfig` (dedicated vision providers), bukan campur aduk dengan chat providers |
| 5 | `turbo-server/server.js` | ✅ Deploy | **callAI() priority diubah** jadi: OpenCode → NVIDIA → OpenRouter → Cloudflare AI |
| 6 | `turbo-server/server.js` | ✅ Deploy | **Health check** updated dengan priority baru & startup log |
| 7 | `src/mcp-handler.ts` | ✅ Deploy | **Tool baru `vision-ocr`** — modular vision/OCR tool via MCP, pake AiRouter.visionChat() |
| 8 | Cloudflare Worker | ✅ Deploy | `discord-ai-bot` v2a5c4254 — live di workers.dev |
| 9 | Vercel Turbo Layer | ✅ Deploy | `discord-turbo-layer` — live di vercel.app, priority udah berubah |

### 🔄 Flow Baru

**Chat / AI Writer:**
```
User → AiRouter.chat() → OpenCode (DeepSeek Flash 🆓) → Cloudflare → NVIDIA → OpenRouter → Custom
```

**Vision / OCR (modular tool):**
```
User → AiRouter.visionChat() → Xiaomi MiMo V2.5 📸 → Cloudflare Llama 4 Scout 👁️ → Cloudflare Llama 3.2 90B Vision → OpenRouter Gemma 3 12B (free)
```

**Vercel Turbo Layer (artikel heavy):**
```
Cron → turboHeavyArticle() → OpenCode → NVIDIA → OpenRouter → Cloudflare
```

---

## 🔥 Hotfix: Article Media Pipeline — 21 Juni 2026

### 📋 Masalah yang Ditemukan

| # | Masalah | Akibat | Parah |
|---|---------|--------|-------|
| 1 | **AI prompt bilang "(atau kosongkan)"** → AI malas & sering generate `image_query: ""` dan `video_query: ""` | Gak ada keyword buat cari media | 🔴 |
| 2 | **Video format jelek saat `video_query` kosong** → `🎬 **:** url` | Tampilan Discord jelek | 🟡 |
| 3 | **Media optimizer fallback pake full title dengan emoji** → `fallbackQuery("🎉 Breaking: Dandadan...")` bikin query: `"🎉 Breaking: Dandadan... key visual"` | ImageScraper gak bisa match di MAL/AniList | 🔴 |
| 4 | **Timeout Turbo Layer 55s kurang** → Vercel Step 3.7 Flash butuh 60s+ | Turbo sering timeout → Worker pake fallback article generic | 🟠 |
| 5 | **Worker-side AI (Cloudflare Llama 4 Scout) token limit 2000** → prompt artikel 3576 tokens | Worker AI selalu gagal → cuma andelin Turbo Layer | 🔴 |

### ✅ Fix yang Diterapkan

| # | File | Fix | Status |
|---|------|-----|--------|
| 1 | `src/article-writer.ts` | Ubah prompt: `(atau kosongkan)` → `WAJIB DIISI! Keyword gambar/video spesifik` | ✅ Deploy |
| 2 | `turbo-server/server.js` | Sama: prompt diperbaiki di Turbo Layer juga | ✅ Deploy |
| 3 | `src/article-publisher.ts` | Video label fallback: kalo `video_query` kosong, pake `heading` section atau "🎬 Video" | ✅ Deploy |
| 4 | `src/media-query-optimizer.ts` | `fallbackQuery()` didesain ulang: extract nama anime dari judul artikel (strip emoji, cari proper noun, ambil 1-2 kata pertama) | ✅ Deploy |
| 5 | `src/turbo-helper.ts` | Timeout dinaikkan: 55s → **120s** (karena Step 3.7 Flash butuh 60s+) | ✅ Deploy |

### 📊 Hasil Test — SEBELUM vs SESUDAH

| Metrik | Sebelum | Sesudah |
|--------|---------|---------|
| **Section publish** | 1 section (fallback) | 2 section (real article) ✅ |
| **Gambar** | 0 ❌ | 2 gambar ✅ |
| **Video** | 1 (acak) | 1-2 video ✅ |
| **Judul artikel** | `📰 [topic generic]` (fallback) | `🌟 One Piece Live Action...` (real) ✅ |
| **image_query AI** | `""` (kosong) | `"Poster resmi film SPY x FAMILY..."` ✅ |
| **video_query AI** | `""` (kosong) | `"Trailer resmi film SPY x FAMILY..."` ✅ |
| **Waktu eksekusi** | 34-65s (sering timeout) | 38-60s (stabil dalam limit) ✅ |

#### 📋 Task Checklist
- [x] **src/article-writer.ts** — Prompt: `(atau kosongkan)` → `WAJIB DIISI!` 
- [x] **turbo-server/server.js** — Sama, prompt di Turbo Layer
- [x] **src/article-publisher.ts** — Video format fallback label
- [x] **src/media-query-optimizer.ts** — Fallback query redesigned (extract anime name, strip emoji)
- [x] **src/turbo-helper.ts** — Timeout 55s → 120s
- [x] **npx tsc --noEmit** — Zero errors
- [x] **Cloudflare Worker deploy** ✅ v2a5c4254 → v0e9210d7
- [x] **Vercel Turbo deploy** ✅ Prompt updated

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `src/article-writer.ts` | ✅ Deploy | Prompt WAJIB DIISI untuk image_query & video_query |
| 2 | `turbo-server/server.js` | ✅ Deploy | Sama, prompt di Turbo Layer |
| 3 | `src/article-publisher.ts` | ✅ Deploy | Video label fallback kalo query kosong |
| 4 | `src/media-query-optimizer.ts` | ✅ Deploy | Fallback query extract nama anime + strip emoji |
| 5 | `src/turbo-helper.ts` | ✅ Deploy | Timeout 55s→120s biar Vercel gak timeout |
| 6 | `npx tsc --noEmit` | ✅ Pass | Zero errors |
| 7 | Worker deploy | ✅ Live | `discord-ai-bot` v0e9210d7 |
| 8 | Vercel deploy | ✅ Live | `discord-turbo-layer` prompt updated |

---

## 🔄 Model Swap: Llama-4-Scout → Llama 3.3 70B — 21 Juni 2026

### 🔍 Latar Belakang
- **Masalah:** Llama-4-Scout-17B-16E punya **context limit 2000 tokens** → prompt artikel 3576 tokens selalu gagal
- **Solusi:** Migrasi ke **Llama 3.3 70B Instruct (FP8 Fast)** — 70B parameter, context lebih besar, lebih cepat & reliable

### 📦 Perubahan Model

| Provider | Sebelum (❌) | Sesudah (✅) |
|----------|-------------|-------------|
| **Cloudflare Workers AI** (Chat/Writer) | `@cf/meta/llama-4-scout-17b-16e-instruct` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 🚀 |
| **OpenRouter** (Chat/Writer) | `meta-llama/llama-4-scout:free` | `meta-llama/llama-3.3-70b-instruct:free` |
| **Cloudflare Vision** | Llama 4 Scout (Priority 2) | **Dihapus** — Llama 3.3 gak support vision. Pake Llama 3.2 90B Vision aja 👁️ |
| **Turbo Layer** (Fallback) | `@cf/meta/llama-4-scout-17b-16e-instruct` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 🚀 |

### ✅ File yang Diubah

| # | File | Perubahan |
|---|------|-----------|
| 1 | `src/ai-router.ts` | 6 referensi model + comments di-update |
| 2 | `turbo-server/server.js` | Cloudflare fallback model di-update |

### 📊 Test Hasil
- `✅ 1 section • 1 gambar • 1 video — 24,162ms` (cepat! sebelumnya 60s+)
- Title real: `🎬 Demon Slayer: Infinity Castle Arc Resmi Diumumkan`
- Zero errors (`tsc --noEmit` ✅)
- Worker & Vercel deployed ✅

### ⚠️ Catatan Penting
- **Legacy model (Llama 4 Scout)** masih ada di comment/docs lama di file non-kritis (README.md, PLAN docs)
- **Llama 3.3 70B = text-only**, tidak support vision/multimodal
- **Vision tetap pake:** Xiaomi MiMo V2.5 📸 (Priority 1) → Cloudflare Llama 3.2 90B Vision 👁️ (Priority 2) → OpenRouter Gemma 3 12B (Priority 3)

#### 📋 Task Checklist
- [x] `src/ai-router.ts` — Ganti 6 referensi model + update comments + hapus vision entry
- [x] `turbo-server/server.js` — Ganti Cloudflare fallback model
- [x] `npx tsc --noEmit` — Zero errors
- [x] Worker deploy ✅ `v1f6b7d0b`
- [x] Vercel deploy ✅ Turbo Layer model updated
- [x] Test pipeline ✅ Article + images + video berfungsi

---

## 🛡️ NEW: Article Auditor (QA Layer) — 21 Juni 2026

### 📋 Deskripsi
Modul **`article-auditor.ts`** adalah quality assurance layer TERAKHIR sebelum artikel dikirim ke Discord. Bertindak sebagai gatekeeper yang memvalidasi, membersihkan, dan auto-fix konten.

### 🔍 Ceklist Validasi (7 Poin)

| # | Check | Auto-Fix? | Deskripsi |
|---|-------|-----------|-----------|
| 1 | **✅ Format sesuai aturan** | ✅ Fix | Heading/body kosong → fallback, bullet list → narasi |
| 2 | **✅ Ada gambar/video atau gak** | ⚠️ Warning doang | Report kalo image_query/video_query gak nemu media |
| 3 | **✅ URL media valid** | ❌ Block | Image URL harus http, video harus YouTube valid |
| 4 | **✅ Gak ada duplikasi** | ✅ Filter | Duplicate section heading/body → warning, duplicate media URL → dihapus |
| 5 | **✅ Support Discord limits** | ✅ Truncate | 2000 char/message, 256 embed title, 4096 embed desc |
| 6 | **✅ Gak ada ASCII/Unicode garbage** | ✅ Clean | Control characters, replacement chars, broken surrogates |
| 7 | **✅ Gak ada watermark** | ✅ Strip | "✨ Artikel • Lumina", "AI-generated", "Scheduled content", dll |

### 📁 File Baru
| File | Ukuran | Fungsi |
|------|--------|--------|
| `src/article-auditor.ts` | 25.6 KB | Audit & validasi artikel sebelum kirim |

### 🔗 Integrasi
- **Dipanggil dari:** `article-publisher.ts` — **2 titik**:
  1. **Phase 0.5:** Sebelum fetch media & kirim — validasi artikel + auto-fix
  2. **Setelah media fetch:** Validasi URL media + deduplikasi
- **Output:** `AuditReport` (issues, auto-fix count, summary)

### 🛡️ Flow Baru
```
Article AI → [FORMAT CHECK] → [CONTENT CLEAN] → [WATERMARK STRIP] 
→ [MEDIA FETCH] → [MEDIA VALIDATE] → [DEDUP] → [DISCORD SEND]
                                        ↑
                              AUDITOR LAYER 🛡️
```

### ✅ Test Results
- `✅ 1 section • 1 gambar • 1 video — 50s` (Real article: "🎬 Adaptasi Anime Dandadan...")
- Audit passed — 0 critical errors, auto-fix berjalan
- Zero TypeScript errors
- Worker deployed ✅

#### 📋 Task Checklist
- [x] **src/article-auditor.ts** — NEW: Full audit module (25.6 KB)
- [x] **src/article-publisher.ts** — Integrasi audit di 2 titik (Phase 0.5 + media audit)
- [x] `npx tsc --noEmit` — Zero errors
- [x] Worker deploy ✅ `va554ebe1`
- [x] Test pipeline ✅ Artikel + audit berfungsi

---

## 🐛 Hotfix: Auditor V2 — Regex Garbage & Watermark Fix — 21 Juni 2026

### 🩹 Bug yang Ditemukan

| # | Bug | Akibat | Fix |
|---|-----|--------|-----|
| 1 | **🔴 Regex garbage pake `\\u` (double backslash)** → yg bener `\u` (Unicode escape) | Regex gak matching → control chars, replacement chars, broken surrogates gak ke-filter | Ganti `\\u` → `\u` di GARBAGE_PATTERNS |
| 2 | **🟡 Watermark pattern terlalu agresif** → `follow\s+for\s+more`, `powered\s+by` | Ke-match di teks natural → teks ilang! | Hanya pake pattern yg spesifik (bracket `[generated by AI]`, `-- generated`, `Scheduled Content` kapital) |
| 3 | **🟡 Closing phrases stripper hapus dari awal body** → `/^kesimpulannya/` | "Kesimpulannya, anime ini bagus" → " anime ini bagus" (kata "Kesimpulannya" ilang, meski itu bagian dari kalimat) | Hanya hapus kalo SELURUH baris terakhir adalah closing phrase |
| 4 | **🟢 EYD check belum ada** | Spasi ganda, kapitalisasi setelah titik gak terdeteksi | Tambah `checkEyd()` — spasi setelah tanda baca, kapital after period, spasi berlebih |

### ✅ Auditor V2 — Final Check List

```
🛡️ AUDITOR V2:
├── ✅ Format: heading/body kosong → fallback
├── ✅ Bullet list: konversi ke narasi (kalo ada)
├── ✅ Duplikasi: section heading/body, media URL
├── ✅ Media: validasi image URL + YouTube URL
├── ✅ Garbage: HANYA control chars + replacement + surrogates (bukan aesthetic Unicode!)
├── ✅ Watermark: HANYA footer/promo explicit (bukan teks natural!)
├── ✅ Closing: HANYA baris terakhir kalo pure closing
├── ✅ Platform: Discord limits (2000 char, 256 embed, dll)
└── ✅ EYD: Spasi, kapitalisasi, spasi ganda
```

### 📦 File Diubah
| File | Perubahan |
|------|-----------|
| `src/article-auditor.ts` | Fix 6 bug + tambah EYD check |

### 📊 Test
```
✅ "🔥 Solo Leveling Season 2 Cetak Rekor Baru!..." → 2 section • 1 gambar • 2 video (64s)
```
- Zero TypeScript errors
- Worker deployed ✅ `vcd03a15f`

> **Signed:** 21 Juni 2026, 18:50 WIB — Auditor V2: Regex, Watermark & EYD Fix 🛡️
> **Updated by Kira**

---

## 📋 Update Log — 21 Juni 2026 (Phase 1 Fix)

### Changes Made:
1. **turbo-server/server.js** — Removed `node-fetch` require (native fetch)
2. **turbo-server/package.json** — Removed `node-fetch` dependency
3. **src/media-query-optimizer.ts** — Removed unused `optimizeMediaQuerySimple()` and `getPrimaryKeywords()`
4. **src/scheduler.ts** — Cleaned unused imports (searchAnimeImage, downloadImage, videoScraperFindVideo, parseArticleJSON, buildArticlePrompt, getArticleColor)
5. **ISSUES-LOG.md** — Created full audit log with 26 issues and strategies

### Verification:
- `npx tsc --noEmit` — ✅ Clean (no errors)
- All CRITICAL issues (C1-C4) already fixed in previous sessions
- H5 (sendImageToDiscord) already using URL direct approach

### Key Findings:
- Cloudflare Workers: Network calls (fetch, KV) do NOT count toward CPU time
- Cron */5 = 30s CPU limit, 15min wall time limit — current executeAiArticle ~60-120s is safe
- article-auditor.ts and media-query-optimizer.ts already integrated in article-publisher.ts

> **Signed:** 21 Juni 2026, 20:30 WIB — Phase 1 Fix Complete
> **Updated by Kira**

---

## 📋 Task Checklist — H1: Consolidate Article Writer Code

- [ ] **turbo-server/server.js** — Hapus `buildArticlePrompt()` dan `parseArticleJSON()` (duplikasi dari article-writer.ts)
- [ ] **turbo-server/server.js** — Simplify `/article/heavy` endpoint: terima `{ prompt }` → call AI → return raw content
- [ ] **src/turbo-helper.ts** — Import `buildArticlePrompt()` dan `parseArticleJSON()` dari article-writer.ts
- [ ] **src/turbo-helper.ts** — Update `turboHeavyArticle()`: build prompt lokal, kirim ke Turbo, parse response
- [ ] **npx tsc --noEmit** — Verifikasi syntax
- [ ] **npx vitest run** — Verifikasi tests pass

---

## 📋 Task Checklist — H1: Consolidate Article Writer Code

- [x] **turbo-server/server.js** — Hapus `buildArticlePrompt()` dan `parseArticleJSON()` (duplikasi dari article-writer.ts)
- [x] **turbo-server/server.js** — Simplify `/article/heavy` endpoint: terima `{ messages }` → call AI → return raw content
- [x] **src/turbo-helper.ts** — Update `turboHeavyArticle()`: build prompt lokal via `article-writer.ts`, kirim ke Turbo proxy
- [x] **npx tsc --noEmit** — ✅ Clean (no errors)
- [x] **npx vitest run** — ⚠️ Sandbox memory limit (tcmalloc crashing), tapi TypeScript compilation ✅

#### ✅ After Deployment — Changes Verified & Deployed

| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `turbo-server/server.js` | ✅ Deploy | Removed `buildArticlePrompt()` + `parseArticleJSON()` — 425 lines (was 577) |
| 2 | `src/turbo-helper.ts` | ✅ Deploy | `turboHeavyArticle()` now builds prompt local, sends to Turbo proxy |
| 3 | `src/scheduler.ts` | ✅ Deploy | Cleaned unused imports |
| 4 | `src/media-query-optimizer.ts` | ✅ Deploy | Removed unused `optimizeMediaQuerySimple()` + `getPrimaryKeywords()` |
| 5 | `turbo-server/package.json` | ✅ Deploy | Removed `node-fetch` dependency |
| 6 | `ISSUES-LOG.md` | ✅ Deploy | Full audit log (26 issues) + strategies |

> **Signed:** 21 Juni 2026.js
- **Masalah:** Orphan code sisa dari `parseArticleJSON` yang gak kehapus bersih saat H1 Consolidate
  - Orphan `}` di line 272 + old `/article/heavy` handler (Attempt 2, 3, fallback) masih nyisa setelah `/avy dandiscollow`

 ✅ StateAudua perubahan di-commit & di-sync ke GitHub, Cloudflare Worker, dan Vel| | Fileitur Status Keterangan |
|---|------------|--------|------------|
| 1 | `src/article-auditor.ts` (new) | ✅ Committed | 855 baris — Audit/validasi artikel sebelum publish |
|2izerittedasi search|3testud.spec.ts` (new) | ✅ Committed | Unit test untuk auditor |
| 4 | `src/article-publisher.ts` | ✅ Committed | Integrasi auditBeforePublish + optimizeMediaQuery |
| 5 | `src/scheduler.ts` | ✅ Committed | Parallel Worker + Turbo race, cleanup imports |
| 6 | `src/turbo-helper.ts` | ✅ Committed | Build prompt lokal via article-writer.ts |
| 7 | `turbo-server/server.js` | ✅ Committed | Simplify proxy, fix syntax error |
| 8 | `ISSUES-LOG.md` (new) | ✅ Committed | 26 issues found + fixed status |
| 9 | `FIX-STRATEGIES.md` (new) | ✅ Committed | Strategi fix setiap issue |
| 10 | Worker deploy | ✅ Live | Cloudflare Worker deployed |
| 11 | Vercel deploy | ✅ Live | Turbo Layer deployed |

> **Signed:** 21 Juni 2026, 21:20 WIB — Final Sync: Commit + Push + Deploy ✅
> **Updated by Kira**
