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

### 21. 🚀 Hybrid Render Turbo Layer — Heavy AI Processing (2026-06-21)

#### 📋 Task Checklist
- [x] **render-server/server.js** — Express server: `/health`, `/ai/chat`, `/article/heavy`, `/discord/followup`
- [x] **render-server/package.json** — Dependencies (express + node-fetch v2)
- [x] **render-server/Dockerfile** — Node.js 20 slim, production deploy
- [x] **src/render-helper.ts** — NEW: HTTP client ke Render (5 fungsi, silent fallback)
- [x] **src/index.ts** — /ask handler: DEFERRED response (type 5) + background via ctx.waitUntil() + coba Render dulu → fallback AiRouter
- [x] **src/scheduler.ts** — executeAiArticle(): coba renderHeavyArticle() setelah STEP 2, override kalau valid
- [x] **npx tsc --noEmit** — Zero errors ✅
- [x] **Render server test** — Health ✅, /ai/chat ✅, /article/heavy ✅, /discord/followup ✅

#### ✅ After Deployment — Changes Verified & Deployed
| # | File/Fitur | Status | Keterangan |
|---|------------|--------|------------|
| 1 | `render-server/server.js` | ✅ New | 492 baris — Express server 4 endpoint + multi-provider AI (OpenRouter→NVIDIA→Cloudflare) |
| 2 | `render-server/package.json` | ✅ New | express ^4.18.2, node-fetch ^2.7.0 |
| 3 | `render-server/Dockerfile` | ✅ New | node:20-slim, production npm ci |
| 4 | `src/render-helper.ts` | ✅ New | 204 baris — 5 exported functions: `renderChat`, `renderHeavyArticle`, `renderDiscordFollowup`, `discordFollowupDirect`, `isRenderAlive` |
| 5 | `src/index.ts` — /ask | ✅ Modified | DEFERRED response (type 5) + `ctx.waitUntil()` + coba Render → fallback AiRouter + PATCH webhook |
| 6 | `src/scheduler.ts` — executeAiArticle | ✅ Modified | Coba `renderHeavyArticle()` setelah STEP 2, override artikel kalau valid |
| 7 | `npx tsc --noEmit` | ✅ Pass | Zero errors |
| 8 | Render server test (local) | ✅ Pass | Health 200, /ai/chat 503 (tanpa API key), /article/heavy fallback, /discord/followup 400 |

#### 🔧 Cara Setup Render.com
1. Push `render-server/` ke GitHub
2. Deploy ke Render.com sebagai Web Service:
   - **Root Directory:** `render-server`
   - **Build:** `npm install`
   - **Start:** `npm start`
   - **Plan:** Free
3. Set environment variables di Render:
   - `OPENROUTER_API_KEY` (optional) — Priority 1
   - `NVIDIA_API_KEY` (optional) — Priority 2
   - `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN` (optional) — Priority 3
4. Catet URL Render: `https://discord-turbo-layer.onrender.com`
5. Set Cloudflare secret: `npx wrangler secret put RENDER_SERVICE_URL`
6. Deploy Worker: `npx wrangler deploy`

#### 🛡️ Garansi Keamanan
- Kalau `RENDER_SERVICE_URL` gak di-set → Render skip otomatis, bot jalan seperti biasa
- Semua fungsi Render return `null` kalau gagal → TIDAK PERNAH throw
- Kalau Render mati → bot tetap 100% fungsional (fallback ke Worker)

---

## 📝 Catatan Tambahan

- **MCP Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/mcp`
- **Interactions Endpoint:** `https://discord-ai-bot.luminary-bot.workers.dev/interactions`
- **Discord App ID:** `1192465007221411921`
- **File terbesar:** `src/mcp-handler.ts` (~4900 baris, ~115 tool definitions)
- **Scheduler memory:** Lihat `/memories/repo/scheduler-system.md` untuk detail
- **Semua kode sudah di-push ke GitHub** (`git push`已完成)
