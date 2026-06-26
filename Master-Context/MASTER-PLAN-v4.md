# DISCORD AI BOT — MASTER PLAN v4.0
## Build from Scratch — Complete Architecture Document

> **Versi:** 4.0 — Greenfield Build Plan  
> **Tanggal:** 25 Juni 2026  
> **Status:** READY FOR EXECUTION  
> **Runtime:** Cloudflare Workers (Wrangler)  
> **Stack:** TypeScript · Cloudflare D1 · Cloudflare KV · Cloudflare Queues · Cloudflare AI · Composio  
> **Motto:** *"Satu konten berkualitas tinggi, tersebar ke banyak platform, tanpa bayar sepeser pun."*

---

## ⚡ CARA MEMBACA DOKUMEN INI

Dokumen ini adalah **panduan build dari nol** — bukan revisi kode lama. Baca dari atas ke bawah sebelum mulai coding.

### Struktur Dokumen

| Part | Konten | Prioritas |
|------|--------|-----------|
| **Part 0** | Visi sistem, prinsip desain, tech stack | 🟢 BACA CEPAT |
| **Part 1** | Arsitektur global + data flow | 🔴 WAJIB BACA |
| **Part 2** | Project setup + wrangler config | 🔴 EKSEKUSI PERTAMA |
| **Part 3** | D1 Database schema lengkap | 🔴 EKSEKUSI KEDUA |
| **Part 4** | Core utilities (fetch, logger, budget, errors) | 🔴 WAJIB |
| **Part 5** | Content Intelligence System | 🔴 WAJIB |
| **Part 6** | Research Engines + Data Sources | 🔴 WAJIB |
| **Part 7** | Media Engine (Images + Video + AI Vision) | 🔴 WAJIB |
| **Part 8** | AI Model Router + Provider Pool | 🔴 WAJIB |
| **Part 9** | Content Generator + Prompt System | 🔴 WAJIB |
| **Part 10** | Discord Publisher + Embed System | 🔴 WAJIB |
| **Part 11** | MCP Server + Security Layer | 🔴 WAJIB |
| **Part 12** | Scheduler + Queue + Dead Letter | 🟡 HIGH |
| **Part 13** | Composio Distribution Layer | 🟡 HIGH |
| **Part 14** | Image Compositor Engine | 🟡 HIGH |
| **Part 15** | Analytics + Dashboard API | 🟢 MEDIUM |
| **Part 16** | [NEW] Plugin System (extensibility) | 🟢 MEDIUM |
| **Part 17** | [NEW] Webhook Listener + Event System | 🟢 MEDIUM |
| **Part 18** | [NEW] Content Cache + Smart Dedup | 🟢 MEDIUM |
| **Part 19** | Full file structure + agent assignment | 🔴 REFERENSI |
| **Part 20** | Setup guide + deployment protocol | 🔴 WAJIB DEPLOY |

### Label Prioritas

| Label | Arti |
|-------|------|
| 🔴 CRITICAL | Kerjakan SEBELUM yang lain |
| 🟡 HIGH | Penting, bisa paralel dengan critical |
| 🟢 MEDIUM | Setelah semua HIGH selesai |
| ⚪ LOW | Enhancement — skip dulu |

### Format Task Block

Setiap task punya struktur standar:

```
📋 TASK: [Nama Tugas]
🎯 Objective : 1 baris tujuan
📁 File       : path/ke/file.ts
⚙️ Spec       : Detail implementasi
⚙️ Behavior   : Input → Logic → Output
🧪 Test       : Kriteria lolos
🚫 Jangan     : Anti-patterns yang HARUS dihindari
```

---

## PART 0 — VISI SISTEM

### 0.1 Apa yang Dibangun

**Discord AI Bot** yang berjalan di Cloudflare Workers — sebuah autonomous content engine yang:

1. **Menghasilkan konten berkualitas tinggi** (artikel anime/manga/game/novel) secara otomatis setiap beberapa jam via cron, tanpa intervensi manual.
2. **Mendistribusikan konten** ke Discord dan optionally ke Twitter, Instagram, LinkedIn, Reddit, Telegram via Composio.
3. **Dikendalikan via MCP (Model Context Protocol)** — Claude Desktop / client MCP lainnya bisa trigger article generation, cek status, manage tasks, dll.
4. **Self-improving** — sistem belajar dari content history untuk hindari duplikasi dan optimalkan format selection.

### 0.2 Filosofi Sistem

| Prinsip | Implementasi |
|---------|-------------|
| **Quality > Quantity** | 1 artikel deep per trigger, bukan batch artikel dangkal |
| **Budget-Aware** | Tiap pipeline track subrequest, hard stop di limit |
| **Fail-Safe by Default** | Semua fetch punya timeout; semua AI call punya fallback |
| **Observable** | TraceId per pipeline; D1 metrics per phase |
| **Loosely Coupled** | Tiap modul bisa diganti/diupgrade independen |
| **Zero Additional Cost** | Semua AI providers gratis (CF Workers AI, OpenRouter, Puter AI) |
| **Extensible** | Plugin system untuk format dan platform baru |

### 0.3 Tech Stack

| Layer | Teknologi | Alasan |
|-------|-----------|--------|
| Runtime | Cloudflare Workers | Gratis, edge, 50ms cold start |
| Framework | Hono.js | Lightweight, TypeScript-first, Workers-compatible |
| Database | Cloudflare D1 (SQLite) | SQL queries, atomic updates, zero cost |
| Cache/Queue State | Cloudflare KV | Transient data, rate limit counters |
| Message Queue | Cloudflare Queues | Reliable task delivery, dead letter |
| AI (Built-in) | Cloudflare Workers AI | Llama 70B, 8B, Vision models — zero cost |
| AI (External) | OpenCode, NVIDIA NIM, OpenRouter, Puter AI | Fallback pool, semua gratis |
| MCP | `@cloudflare/mcp-server-cloudflare` | Official CF MCP library |
| Image Compose | `cf-workers-og` (Satori + resvg-wasm) | Render PNG di Workers |
| Distribution | Composio REST API | OAuth-managed social posting |
| Language | TypeScript strict | Type safety untuk sistem kompleks |

---

## PART 1 — ARSITEKTUR GLOBAL

### 1.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE WORKER                            │
│                                                                     │
│  TRIGGER LAYER                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │  Cron      │  │  MCP Tool  │  │  Webhook   │  │  HTTP API  │   │
│  │  0 */6 * * │  │  Manual    │  │  External  │  │  REST      │   │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘   │
│        └───────────────┴───────────────┴───────────────┘           │
│                                 │                                   │
│  SECURITY MIDDLEWARE            ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  CORS → Auth → Rate Limiter → Access Control → Audit Log     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 │                                   │
│  ORCHESTRATOR                   ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ContentStrategist → ContentBrief{category, format, topic}   │   │
│  └────────────────────────────────┬─────────────────────────────┘   │
│                                   │                                  │
│         ┌─────────────────────────┼──────────────────┐              │
│         ▼                         ▼                  ▼              │
│  ┌─────────────┐         ┌─────────────┐   ┌──────────────┐        │
│  │  Research   │         │  Image      │   │  Video       │        │
│  │  Agent      │         │  Agent      │   │  Agent       │        │
│  │  (per-      │         │  (multi-src │   │  (YouTube)   │        │
│  │  format)    │         │  + Vision)  │   │              │        │
│  └──────┬──────┘         └──────┬──────┘   └──────┬───────┘        │
│         └───────────────────────┴─────────────────┘                │
│                                 │                                   │
│  GENERATION                     ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  PromptBuilder → ModelRouter → Generator → QualityAuditor    │   │
│  └────────────────────────────────┬─────────────────────────────┘   │
│                                   │                                  │
│  PUBLISHING                       ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  DiscordAdapter → Send → HistoryLog → Metrics                │   │
│  └────────────────────────────────┬─────────────────────────────┘   │
│                                   │ (ctx.waitUntil — non-blocking)  │
│  DISTRIBUTION                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ImageCompositor + ComposioForwarder → Twitter/IG/LinkedIn   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  STORAGE LAYER                                                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐   │
│  │  D1 (CONTENT_DB)            │  │  KV (BOT_KV)                │   │
│  │  · scheduled_tasks          │  │  · rate limit counters      │   │
│  │  · task_logs                │  │  · vision cache             │   │
│  │  · content_history          │  │  · query expand cache       │   │
│  │  · pipeline_metrics         │  │  · font/template cache      │   │
│  │  · content_cache            │  │  · session tokens           │   │
│  │  · dead_letter_queue        │  │                             │   │
│  │  · provider_health          │  │                             │   │
│  │  · webhook_events           │  │                             │   │
│  │  · plugin_registry          │  │                             │   │
│  └─────────────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Content Pipeline End-to-End (Happy Path)

```
T0: TRIGGER (Cron 0 */6 * * * / Manual MCP / Webhook)
    │
    ▼
T1: CONTENT STRATEGIST [~300-500ms]
    1. Load recent content history dari D1 (1 SQL query)
    2. Check trending signal (optional — 0-1 subrequest)
    3. WeightCalculator → hitung weight tiap format + adjustments
    4. Weighted random selection → pilih format + kategori
    5. TopicGenerator → pilih topik spesifik (unique check via D1)
    Output: ContentBrief { category, format, depth, topic, reason, traceId }
    │
    ▼
T2: RESEARCH PIPELINE [~3-5s, paralel]
    Promise.all([
      FormatResearchEngine.execute(brief),  → format-specific context
      MediaAgent.execute(brief),             → image + video candidates
    ])
    Output: ResearchBundle { context, mediaPlan }
    │
    ▼
T2.5: AI VISION VALIDATION [~2s, paralel top-3]
    Promise.allSettled(top3.map(img => visionCheck(img)))
    Output: ImageCandidate[] sorted by aiScore DESC
    │
    ▼
T3: CONTENT GENERATION [~15-35s]
    1. PromptBuilder.build(ResearchBundle, ContentBrief)
    2. ModelRouter.call('writer', prompt) → pick best provider
    3. Parser.parse(rawAiOutput) → Article
    4. Auditor.audit(article) → pass or fix
    5. MediaAttacher.attach(article, mediaPlan) → FinalContent
    Output: FinalContent
    │
    ▼
T4: PUBLISHING [~1-2s]
    1. DiscordAdapter.format(FinalContent) → DiscordPayload
    2. DiscordAdapter.send(channelId, payload) → messageId
    3. HistoryTracker.log(ContentBrief, result) → D1 INSERT
    4. PipelineMetrics.record(timing) → D1 INSERT
    Output: messageId
    │
    ▼ (ctx.waitUntil — non-blocking)
T5: DISTRIBUTION [~3-10s, background]
    1. ImageCompositor.compose(image, title, platforms) → thumbnails
    2. ComposioForwarder.broadcast(FinalContent, thumbnails) → results
    3. Log distribution results → D1
```

### 1.3 Subrequest Budget (50 limit per Worker invocation)

| Phase | Jumlah | Paralel? | Est. Time |
|-------|--------|----------|-----------|
| Strategist — trending check | 0-1 | — | ~300ms |
| Research — Jikan resolve + reviews | 2-3 | ✅ | ~1.5s |
| Research — WebScout / ANN | 1-2 | ✅ | ~1s |
| Media — Query expansion (AI) | 1 | — | ~500ms |
| Media — Multi-source images | 3-5 | ✅ | ~1.5s |
| Media — AI Vision top-3 | 3 | ✅ PARALEL | ~2s |
| Media — YouTube search | 1 | ✅ | ~1s |
| Generator — AI call | 1-3 | — | ~20s |
| Publisher — Discord API | 5-8 | — | ~2s |
| Buffer (fallback headroom) | 5 | — | — |
| **Total** | **~22-32** | | **~30-45s** |

> ✅ Aman dalam 50 limit. Buffer 18-28 subrequest untuk fallback.

---

## PART 2 — PROJECT SETUP

### 2.1 Inisialisasi Project

```bash
# 1. Buat project baru
mkdir discord-ai-bot && cd discord-ai-bot
npm create cloudflare@latest . -- --type=hello-world --lang=ts --no-git

# 2. Install dependencies
npm install hono zod

# 3. Install dev dependencies
npm install -D typescript vitest wrangler @cloudflare/workers-types

# 4. Init git
git init && git add -A && git commit -m "chore: initial project setup"
```

### 2.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.3 `wrangler.jsonc`

```jsonc
{
  "name": "discord-ai-bot",
  "main": "src/index.ts",
  "compatibility_date": "2026-06-25",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "upload_source_maps": true,

  // AI binding — Cloudflare Workers AI (free)
  "ai": { "binding": "AI" },

  // KV namespace — transient state
  "kv_namespaces": [
    {
      "binding": "BOT_KV",
      "id": "<PASTE-KV-ID-HERE>",
      "preview_id": "<PASTE-KV-PREVIEW-ID-HERE>"
    }
  ],

  // D1 Database — primary storage
  "d1_databases": [
    {
      "binding": "CONTENT_DB",
      "database_name": "discord-ai-bot-db",
      "database_id": "<PASTE-DB-ID-HERE>",
      "migrations_dir": "migrations"
    }
  ],

  // Cloudflare Queues — reliable task delivery
  "queues": {
    "producers": [
      { "queue": "bot-task-queue", "binding": "TASK_QUEUE" }
    ],
    "consumers": [
      {
        "queue": "bot-task-queue",
        "max_batch_size": 1,
        "max_retries": 3,
        "dead_letter_queue": "bot-dlq"
      }
    ]
  },

  // Cron triggers — every 6 hours
  "triggers": {
    "crons": ["0 */6 * * *"]
  }
}
```

### 2.4 `src/types/env.ts` — Environment Interface

```typescript
export interface Env {
  // Storage
  BOT_KV: KVNamespace;
  CONTENT_DB: D1Database;

  // AI (built-in — no key needed)
  AI: Ai;

  // Queue
  TASK_QUEUE: Queue;

  // Discord
  DISCORD_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_DEFAULT_CHANNEL_ID: string;

  // AI Providers (external)
  OPENCODE_API_KEY: string;
  NVIDIA_API_KEY: string;
  OPENROUTER_API_KEY: string;
  PUTER_API_KEY: string;

  // Search (optional)
  BRAVE_SEARCH_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;

  // MCP Security
  MCP_SECRET: string;

  // Composio (optional — distribution layer)
  COMPOSIO_API_KEY?: string;
  COMPOSIO_TWITTER_ACCOUNT_ID?: string;
  COMPOSIO_INSTAGRAM_ACCOUNT_ID?: string;
  COMPOSIO_LINKEDIN_ACCOUNT_ID?: string;
  COMPOSIO_REDDIT_ACCOUNT_ID?: string;
  COMPOSIO_TELEGRAM_ACCOUNT_ID?: string;
}
```

### 2.5 `src/index.ts` — Entry Point

```typescript
import { Hono } from 'hono';
import type { Env } from './types/env';
import { mcpRouter } from './mcp/server';
import { analyticsRouter } from './analytics/routes';
import { webhookRouter } from './webhooks/router';
import { handleCron } from './cron/handler';
import { handleQueue } from './queue/handler';
import { healthCheck } from './core/health';

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', healthCheck);

// MCP endpoint
app.all('/mcp', (c) => mcpRouter(c.req.raw, c.env));
app.all('/mcp/*', (c) => mcpRouter(c.req.raw, c.env));

// Analytics API
app.route('/analytics', analyticsRouter);

// Webhook endpoints
app.route('/webhooks', webhookRouter);

export default {
  // HTTP handler
  fetch: app.fetch,

  // Cron handler
  scheduled: handleCron,

  // Queue consumer handler
  queue: handleQueue,
};
```

---

## PART 3 — D1 DATABASE SCHEMA

### 3.1 Setup Commands

```bash
# 1. Buat KV namespace
npx wrangler kv namespace create BOT_KV
# → copy id ke wrangler.jsonc

# 2. Buat D1 database
npx wrangler d1 create discord-ai-bot-db
# → copy database_id ke wrangler.jsonc

# 3. Apply migrations
npx wrangler d1 migrations apply discord-ai-bot-db

# 4. Verify tables
npx wrangler d1 execute discord-ai-bot-db \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

### 3.2 `migrations/0001_initial.sql`

```sql
-- ============================================================
-- Discord AI Bot — Initial D1 Schema
-- Version: 4.0
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- scheduled_tasks: menyimpan task config per channel
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  cron         TEXT NOT NULL,               -- cron expression
  action       TEXT NOT NULL,               -- 'generate-article' | 'send-message' | dll
  params       TEXT NOT NULL DEFAULT '{}',  -- JSON params
  enabled      INTEGER NOT NULL DEFAULT 1,
  channel_id   TEXT NOT NULL,
  guild_id     TEXT NOT NULL,
  category     TEXT,                        -- filter kategori (null = semua)
  format       TEXT,                        -- force format (null = auto)
  timezone     TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_run     TEXT,
  last_status  TEXT CHECK(last_status IN ('success','failed','pending',NULL)),
  run_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_st_enabled  ON scheduled_tasks(enabled);
CREATE INDEX IF NOT EXISTS idx_st_action   ON scheduled_tasks(action);
CREATE INDEX IF NOT EXISTS idx_st_channel  ON scheduled_tasks(channel_id);
CREATE INDEX IF NOT EXISTS idx_st_last_run ON scheduled_tasks(last_run);


-- ────────────────────────────────────────────────────────────
-- task_logs: log setiap eksekusi task
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_logs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id     TEXT NOT NULL,
  task_name   TEXT NOT NULL,
  timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
  status      TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
  message     TEXT,
  error_code  TEXT,
  duration_ms INTEGER,
  trace_id    TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tl_task_time ON task_logs(task_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tl_status    ON task_logs(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tl_trace     ON task_logs(trace_id);


-- ────────────────────────────────────────────────────────────
-- content_history: riwayat artikel yang sudah dipublish
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_history (
  id               TEXT PRIMARY KEY,
  trace_id         TEXT NOT NULL,
  category         TEXT NOT NULL,
  format           TEXT NOT NULL,
  depth            TEXT NOT NULL,
  topic            TEXT NOT NULL,
  topic_normalized TEXT NOT NULL,           -- lowercase, trim — untuk dedup check
  angle            TEXT,
  reason           TEXT,
  trending_score   REAL,
  trigger_type     TEXT NOT NULL DEFAULT 'cron',
  sections_count   INTEGER DEFAULT 0,
  word_count       INTEGER DEFAULT 0,
  provider_used    TEXT,
  model_used       TEXT,
  total_ms         INTEGER,
  discord_message_id TEXT,
  discord_channel_id TEXT,
  published_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- Engagement (update setelah beberapa jam)
  reactions        INTEGER DEFAULT 0,
  comments         INTEGER DEFAULT 0,
  engagement_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_ch_published    ON content_history(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_topic        ON content_history(topic_normalized);
CREATE INDEX IF NOT EXISTS idx_ch_format_time  ON content_history(format, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_category     ON content_history(category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ch_trace        ON content_history(trace_id);


-- ────────────────────────────────────────────────────────────
-- pipeline_metrics: observability per pipeline run
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_metrics (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  trace_id         TEXT NOT NULL,
  format           TEXT NOT NULL,
  category         TEXT NOT NULL,
  trigger_type     TEXT NOT NULL,
  -- Per-phase timing
  strategist_ms    INTEGER,
  research_ms      INTEGER,
  media_ms         INTEGER,
  vision_ms        INTEGER,
  generator_ms     INTEGER,
  publish_ms       INTEGER,
  total_ms         INTEGER NOT NULL,
  -- AI info
  generator_attempts INTEGER DEFAULT 1,
  provider_used    TEXT,
  model_used       TEXT,
  -- Budget
  subrequests_used INTEGER,
  subrequests_max  INTEGER DEFAULT 50,
  -- Result
  success          INTEGER NOT NULL DEFAULT 1,
  error_message    TEXT,
  error_phase      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_created  ON pipeline_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_success  ON pipeline_metrics(success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_provider ON pipeline_metrics(provider_used);
CREATE INDEX IF NOT EXISTS idx_pm_trace    ON pipeline_metrics(trace_id);
CREATE INDEX IF NOT EXISTS idx_pm_format   ON pipeline_metrics(format, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- content_cache: short-lived cache untuk external API results
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_cache (
  cache_key  TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  source     TEXT,                          -- 'jikan' | 'anilist' | 'websearch' | dll
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cc_expires ON content_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cc_source  ON content_cache(source);


-- ────────────────────────────────────────────────────────────
-- dead_letter_queue: pesan yang gagal setelah max retries
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id       TEXT,
  trace_id      TEXT,
  queue_message TEXT NOT NULL,              -- JSON original message
  error_message TEXT NOT NULL,
  error_phase   TEXT,
  error_count   INTEGER NOT NULL DEFAULT 1,
  first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_at   TEXT,
  resolution    TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dlq_unresolved ON dead_letter_queue(resolved, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_trace      ON dead_letter_queue(trace_id);


-- ────────────────────────────────────────────────────────────
-- provider_health: track status provider AI
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_health (
  provider             TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_calls          INTEGER NOT NULL DEFAULT 0,
  total_successes      INTEGER NOT NULL DEFAULT 0,
  total_failures       INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms       INTEGER,
  last_failure_at      TEXT,
  last_success_at      TEXT,
  disabled_until       TEXT,
  disabled_reason      TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ────────────────────────────────────────────────────────────
-- webhook_events: [NEW] log incoming webhook events
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source     TEXT NOT NULL,               -- 'discord' | 'github' | 'custom'
  event_type TEXT NOT NULL,               -- e.g. 'message_reaction_add'
  payload    TEXT NOT NULL,               -- JSON
  processed  INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_we_source  ON webhook_events(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_we_proc    ON webhook_events(processed, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- plugin_registry: [NEW] daftar format/platform plugin aktif
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugin_registry (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK(type IN ('format','platform','source')),
  name        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0.0',
  config      TEXT NOT NULL DEFAULT '{}',   -- JSON config
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pr_type    ON plugin_registry(type, enabled);


-- ────────────────────────────────────────────────────────────
-- distribution_log: [NEW] log hasil distribusi ke social media
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribution_log (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  content_id      TEXT NOT NULL,            -- FK ke content_history.id
  platform        TEXT NOT NULL,            -- 'twitter' | 'instagram' | dll
  status          TEXT NOT NULL CHECK(status IN ('success','failed','skipped')),
  external_post_id TEXT,                    -- post ID dari platform
  error_message   TEXT,
  duration_ms     INTEGER,
  distributed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES content_history(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dl_content  ON distribution_log(content_id);
CREATE INDEX IF NOT EXISTS idx_dl_platform ON distribution_log(platform, distributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dl_status   ON distribution_log(status, distributed_at DESC);
```

---

## PART 4 — CORE UTILITIES

### 4.1 `src/core/trace-logger.ts`

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = string;

export interface LogEntry {
  level: LogLevel;
  source: LogSource;
  message: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

let _traceId = '';

export function setTraceId(id: string) { _traceId = id; }
export function getTraceId(): string { return _traceId; }

export function traceLog(
  level: LogLevel,
  source: LogSource,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    level,
    source,
    message,
    traceId: _traceId || undefined,
    metadata,
    timestamp: new Date().toISOString(),
  };

  const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${source}]${_traceId ? ` [${_traceId}]` : ''}`;
  const msg = `${prefix} ${message}`;

  switch (level) {
    case 'error': console.error(msg, metadata || ''); break;
    case 'warn':  console.warn(msg, metadata || ''); break;
    default:      console.log(msg, metadata || ''); break;
  }
}
```

### 4.2 `src/core/safe-fetch.ts`

```typescript
import { traceLog } from './trace-logger';

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response | null> {
  const { timeoutMs = 8000, ...fetchOptions } = options;

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(url, { ...fetchOptions, signal });
    return res;
  } catch (e) {
    traceLog('warn', 'SafeFetch', `Failed: ${url.slice(0, 100)}`, {
      error: (e as Error).message,
    });
    return null;
  }
}

export async function safeFetchJson<T>(
  url: string,
  options: SafeFetchOptions = {},
  fallback: T
): Promise<T> {
  const res = await safeFetch(url, options);
  if (!res || !res.ok) return fallback;
  try { return await res.json() as T; }
  catch { return fallback; }
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T; }
  catch { return fallback; }
}

export function safeAiResponse(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    return (obj['response'] as string) ||
           (obj['content'] as string) ||
           (obj['text'] as string) || '';
  }
  return String(raw);
}
```

### 4.3 `src/core/errors.ts`

```typescript
export enum ErrorCode {
  // Discord
  DISCORD_API_ERROR    = 'DISCORD_API_ERR',
  DISCORD_RATE_LIMIT   = 'DISCORD_RATE_LIMIT',
  DISCORD_SEND_FAILED  = 'DISCORD_SEND_FAILED',

  // AI Providers
  AI_PROVIDER_ERROR    = 'AI_PROVIDER_ERR',
  AI_PROVIDER_TIMEOUT  = 'AI_PROVIDER_TIMEOUT',
  AI_PROVIDER_DISABLED = 'AI_PROVIDER_DISABLED',
  AI_ALL_FAILED        = 'AI_ALL_FAILED',

  // Pipeline
  STRATEGIST_FAILED    = 'STRATEGIST_FAILED',
  RESEARCH_FAILED      = 'RESEARCH_FAILED',
  MEDIA_FAILED         = 'MEDIA_FAILED',
  WRITER_FAILED        = 'WRITER_FAILED',
  WRITER_LOW_QUALITY   = 'WRITER_LOW_QUALITY',
  PUBLISH_FAILED       = 'PUBLISH_FAILED',

  // System
  BUDGET_EXHAUSTED     = 'BUDGET_EXHAUSTED',
  DATABASE_ERROR       = 'DATABASE_ERR',
  VALIDATION_ERROR     = 'VALIDATION_ERR',
  CONFIG_MISSING       = 'CONFIG_MISSING',
  RATE_LIMITED         = 'RATE_LIMITED',
  NOT_FOUND            = 'NOT_FOUND',
  UNAUTHORIZED         = 'UNAUTHORIZED',
  FORBIDDEN            = 'FORBIDDEN',
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable = false,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
```

### 4.4 `src/core/d1.ts`

```typescript
import type { Env } from '../types/env';
import { traceLog } from './trace-logger';
import { AppError, ErrorCode } from './errors';

export class D1Client {
  private db: D1Database;

  constructor(env: Env) {
    this.db = env.CONTENT_DB;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T[]> {
    try {
      const result = await this.db.prepare(sql).bind(...bindings).all<T>();
      return result.results;
    } catch (e) {
      traceLog('error', 'D1Client', `Query failed: ${sql.slice(0, 80)}`, {
        error: (e as Error).message,
      });
      throw new AppError(ErrorCode.DATABASE_ERROR, (e as Error).message);
    }
  }

  async execute(sql: string, ...bindings: unknown[]): Promise<{ changes: number }> {
    try {
      const result = await this.db.prepare(sql).bind(...bindings).run();
      return { changes: result.meta.changes };
    } catch (e) {
      traceLog('error', 'D1Client', `Execute failed: ${sql.slice(0, 80)}`, {
        error: (e as Error).message,
      });
      throw new AppError(ErrorCode.DATABASE_ERROR, (e as Error).message);
    }
  }

  async first<T = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): Promise<T | null> {
    const results = await this.query<T>(sql, ...bindings);
    return results.length > 0 ? (results[0] ?? null) : null;
  }

  async batch(
    statements: Array<{ sql: string; bindings?: unknown[] }>
  ): Promise<void> {
    const stmts = statements.map(s =>
      this.db.prepare(s.sql).bind(...(s.bindings ?? []))
    );
    await this.db.batch(stmts);
  }

  // Cleanup expired cache entries
  async cleanupCache(): Promise<number> {
    const result = await this.execute(
      "DELETE FROM content_cache WHERE expires_at < datetime('now')"
    );
    return result.changes;
  }
}
```

### 4.5 `src/core/budget-tracker.ts`

```typescript
import { traceLog } from './trace-logger';
import { AppError, ErrorCode } from './errors';

export class BudgetTracker {
  private used = 0;
  private readonly max: number;

  constructor(max = 50) {
    this.max = max;
  }

  consume(count = 1, label?: string): void {
    this.used += count;
    if (label) {
      traceLog('debug', 'Budget', `Consumed ${count} (${label}): ${this.used}/${this.max}`);
    }
    if (this.used > this.max) {
      throw new AppError(
        ErrorCode.BUDGET_EXHAUSTED,
        `Subrequest budget exceeded: ${this.used}/${this.max}`,
        false
      );
    }
  }

  get remaining(): number { return this.max - this.used; }
  get snapshot(): { used: number; max: number; remaining: number } {
    return { used: this.used, max: this.max, remaining: this.remaining };
  }
}
```

### 4.6 `src/core/d1-cache.ts`

Wrapper untuk short-lived API response cache via D1:

```typescript
import type { D1Client } from './d1';
import type { Env } from '../types/env';
import { safeJsonParse } from './safe-fetch';

export class D1Cache {
  constructor(private db: D1Client) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.db.first<{ value: string }>(
      "SELECT value FROM content_cache WHERE cache_key = ? AND expires_at > datetime('now')",
      key
    );
    if (!row) return null;
    return safeJsonParse<T>(row.value, null as unknown as T);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    source?: string
  ): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.db.execute(
      `INSERT OR REPLACE INTO content_cache (cache_key, value, expires_at, source)
       VALUES (?, ?, datetime('now', ?), ?)`,
      key, serialized, `+${ttlSeconds} seconds`, source ?? null
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.execute('DELETE FROM content_cache WHERE cache_key = ?', key);
  }
}
```

---

## PART 5 — CONTENT INTELLIGENCE SYSTEM

### 5.1 Content Taxonomy

#### Kategori

| Kategori | Kode | Warna Discord |
|----------|------|---------------|
| Anime | `anime` | `#FF6B6B` |
| Manga | `manga` | `#9B59B6` |
| Game | `game` | `#3498DB` |
| Novel/Light Novel | `novel` | `#E67E22` |

#### Format Konten

| Format | Kode | Min Sections | Depth |
|--------|------|-------------|-------|
| Breaking News | `breaking-news` | 2 | quick |
| In-depth Review | `review` | 4 | standard |
| Recommendation | `recommendation` | 3 | standard |
| Deep Dive | `deep-dive` | 5 | deep |
| Season Preview | `season-preview` | 4 | standard |
| Comparison | `comparison` | 4 | standard |
| Retrospective | `retrospective` | 4 | deep |
| Industry Insight | `industry` | 3 | standard |
| Top List | `top-list` | 5 | quick |
| Discussion | `discussion` | 3 | standard |
| **[NEW] Character Spotlight** | `character-spotlight` | 3 | standard |
| **[NEW] Lore Explained** | `lore-explained` | 4 | deep |

> **[NEW] Character Spotlight** — fokus satu karakter: backstory, motivasi, symbolism.  
> **[NEW] Lore Explained** — breakdown dunia/sistem/lore: power system, worldbuilding, detail tersembunyi.

### 5.2 Core Types: `src/content/types/content.ts`

```typescript
export type ContentCategory = 'anime' | 'manga' | 'game' | 'novel';

export type ContentFormat =
  | 'breaking-news' | 'review' | 'recommendation' | 'deep-dive'
  | 'season-preview' | 'comparison' | 'retrospective' | 'industry'
  | 'top-list' | 'discussion'
  | 'character-spotlight' | 'lore-explained';  // NEW

export type ContentDepth = 'quick' | 'standard' | 'deep';

export interface ContentBrief {
  traceId: string;
  category: ContentCategory;
  format: ContentFormat;
  depth: ContentDepth;
  topic: string;
  alternativeTopics?: string[];
  angle?: string;
  reason: string;
  trendingScore?: number;
  timestamp: string;
  triggerType: 'cron' | 'manual' | 'webhook' | 'api';
  maxSubrequests: number;
  pluginOverride?: string;   // NEW — force specific plugin
}

export interface ArticleSection {
  heading: string;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
}

export interface Article {
  title: string;
  intro: string;
  sections: ArticleSection[];
  category: ContentCategory;
  format: ContentFormat;
  depth: ContentDepth;
  wordCount?: number;
}

export type FinalContent = Article & {
  metadata: {
    traceId: string;
    generatedAt: string;
    sources: string[];
    providerUsed: string;
    modelUsed: string;
    totalMs?: number;
  };
};
```

### 5.3 Format Weight Config: `src/content/config/formats.ts`

```typescript
export interface FormatWeightConfig {
  baseWeight: number;
  trendingBoost: number;     // % boost jika ada trending signal
  cooldownDays: number;      // hari sebelum bisa dipakai lagi tanpa penalty
  weekendMultiplier: number; // weight multiplier di akhir pekan
  seasonalMultiplier: number;// weight multiplier di awal season (tgl 1-7)
  minIntervalHours: number;  // minimum gap antar pakai (jam)
}

export const FORMAT_WEIGHTS: Record<ContentFormat, FormatWeightConfig> = {
  'breaking-news':      { baseWeight: 15, trendingBoost: 150, cooldownDays: 1,  weekendMultiplier: 0.5, seasonalMultiplier: 1.0, minIntervalHours: 6 },
  'review':             { baseWeight: 25, trendingBoost: 50,  cooldownDays: 2,  weekendMultiplier: 1.2, seasonalMultiplier: 1.0, minIntervalHours: 12 },
  'recommendation':     { baseWeight: 20, trendingBoost: 30,  cooldownDays: 2,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 12 },
  'deep-dive':          { baseWeight: 10, trendingBoost: 80,  cooldownDays: 4,  weekendMultiplier: 2.0, seasonalMultiplier: 1.0, minIntervalHours: 24 },
  'season-preview':     { baseWeight: 8,  trendingBoost: 40,  cooldownDays: 14, weekendMultiplier: 1.0, seasonalMultiplier: 4.0, minIntervalHours: 72 },
  'comparison':         { baseWeight: 8,  trendingBoost: 60,  cooldownDays: 3,  weekendMultiplier: 1.3, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'retrospective':      { baseWeight: 6,  trendingBoost: 40,  cooldownDays: 5,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 36 },
  'industry':           { baseWeight: 5,  trendingBoost: 100, cooldownDays: 3,  weekendMultiplier: 0.5, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'top-list':           { baseWeight: 5,  trendingBoost: 40,  cooldownDays: 5,  weekendMultiplier: 1.3, seasonalMultiplier: 1.0, minIntervalHours: 36 },
  'discussion':         { baseWeight: 5,  trendingBoost: 80,  cooldownDays: 3,  weekendMultiplier: 1.5, seasonalMultiplier: 1.0, minIntervalHours: 18 },
  'character-spotlight':{ baseWeight: 7,  trendingBoost: 60,  cooldownDays: 3,  weekendMultiplier: 1.8, seasonalMultiplier: 1.0, minIntervalHours: 24 },
  'lore-explained':     { baseWeight: 6,  trendingBoost: 70,  cooldownDays: 4,  weekendMultiplier: 2.0, seasonalMultiplier: 1.0, minIntervalHours: 30 },
};

export const CATEGORY_WEIGHTS: Record<ContentCategory, number> = {
  anime:  50,
  manga:  20,
  game:   20,
  novel:  10,
};
```

### 5.4 📋 TASK: Content Strategist

**🎯 Objective:** Engine yang memilih format + kategori + topik unik tiap trigger  
**📁 File:** `src/content/strategist/index.ts`  
**🔴 Priority:** CRITICAL

```typescript
export class ContentStrategist {
  private db: D1Client;
  private cache: D1Cache;

  constructor(private env: Env) {
    this.db = new D1Client(env);
    this.cache = new D1Cache(this.db);
  }

  async decide(
    triggerType: ContentBrief['triggerType'],
    overrides?: Partial<Pick<ContentBrief, 'category' | 'format' | 'topic'>>
  ): Promise<ContentBrief> {
    const traceId = crypto.randomUUID().slice(0, 8);
    setTraceId(traceId);

    // 1. Load recent history (1 SQL query)
    const history = await this.loadRecentHistory(14);

    // 2. Check trending (optional, 0-1 subrequest)
    const trending = await this.detectTrending().catch(() => null);

    // 3. Determine category
    const category = overrides?.category ?? this.selectCategory();

    // 4. Calculate format weights
    const weights = this.calculateWeights(history, trending, category);

    // 5. Select format
    const format = overrides?.format ?? this.selectWeighted(weights);

    // 6. Determine depth
    const depth = this.determineDepth(format);

    // 7. Generate unique topic
    const topic = overrides?.topic ?? await this.generateUniqueTopic(category, format, history);

    return {
      traceId,
      category,
      format,
      depth,
      topic,
      reason: `[${traceId}] ${format}/${category} selected. Trending: ${trending?.topic ?? 'none'}.`,
      trendingScore: trending?.score,
      timestamp: new Date().toISOString(),
      triggerType,
      maxSubrequests: 50,
    };
  }

  private calculateWeights(
    history: Array<{ format: string; published_at: string }>,
    trending: { topic: string; score: number } | null,
    category: ContentCategory
  ): Record<ContentFormat, number> {
    const now = new Date();
    const isWeekend = [0, 6].includes(now.getDay());
    const isSeasonStart = now.getDate() <= 7;

    const weights = {} as Record<ContentFormat, number>;

    for (const [fmt, cfg] of Object.entries(FORMAT_WEIGHTS) as [ContentFormat, FormatWeightConfig][]) {
      let w = cfg.baseWeight;

      // Weekend boost
      if (isWeekend) w *= cfg.weekendMultiplier;

      // Season preview boost at season start
      if (isSeasonStart && fmt === 'season-preview') w *= cfg.seasonalMultiplier;

      // Cooldown penalty — penalize jika baru dipakai
      const lastUsed = history.find(h => h.format === fmt);
      if (lastUsed) {
        const hoursSince = (Date.now() - new Date(lastUsed.published_at).getTime()) / 3600000;
        if (hoursSince < cfg.minIntervalHours) {
          w *= 0.1; // hampir tidak mungkin dipilih lagi
        } else if (hoursSince < cfg.cooldownDays * 24) {
          w *= 0.3; // cooldown penalty
        }
      }

      // Trending boost
      if (trending && fmt === 'breaking-news') {
        w *= (1 + cfg.trendingBoost / 100);
      }

      weights[fmt] = Math.max(0, w);
    }

    return weights;
  }

  private selectWeighted(weights: Record<ContentFormat, number>): ContentFormat {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [fmt, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) return fmt as ContentFormat;
    }
    return 'review'; // safe fallback
  }

  private selectCategory(): ContentCategory {
    const total = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      roll -= weight;
      if (roll <= 0) return cat as ContentCategory;
    }
    return 'anime';
  }

  private determineDepth(format: ContentFormat): ContentDepth {
    const deepFormats: ContentFormat[] = ['deep-dive', 'retrospective', 'lore-explained'];
    const quickFormats: ContentFormat[] = ['breaking-news', 'top-list'];
    if (deepFormats.includes(format)) return 'deep';
    if (quickFormats.includes(format)) return 'quick';
    return 'standard';
  }

  private async loadRecentHistory(days: number) {
    return this.db.query<{ format: string; topic: string; published_at: string }>(
      `SELECT format, topic, published_at FROM content_history
       WHERE published_at > datetime('now', ?)
       ORDER BY published_at DESC LIMIT 50`,
      `-${days} days`
    );
  }

  private async generateUniqueTopic(
    category: ContentCategory,
    format: ContentFormat,
    history: Array<{ topic: string }>
  ): Promise<string> {
    // Import topic generator module
    const { TopicGenerator } = await import('./topic-generator');
    const generator = new TopicGenerator(this.env, this.db);
    return generator.generate(category, format, history.map(h => h.topic));
  }

  private async detectTrending() {
    const { TrendingDetector } = await import('./trending-detector');
    const detector = new TrendingDetector(this.env);
    return detector.detect();
  }
}
```

### 5.5 📋 TASK: Topic Generator

**📁 File:** `src/content/strategist/topic-generator.ts`  
**🔴 Priority:** CRITICAL

```typescript
// Pool topik per kategori — fallback jika AI generation gagal
const TOPIC_POOLS: Record<ContentCategory, Record<ContentFormat, string[]>> = {
  anime: {
    'review': ['Frieren: Beyond Journey\'s End', 'Solo Leveling', 'Mushoku Tensei', 'Dungeon Meshi', 'Blue Lock'],
    'breaking-news': ['Anime season terbaru', 'Pengumuman adaptasi', 'Industri anime update'],
    'deep-dive': ['Attack on Titan ending analysis', 'Evangelion symbolism', 'Hunter x Hunter power system'],
    'recommendation': ['Hidden gem slice of life', 'Best isekai 2024', 'Anime for beginners'],
    'character-spotlight': ['Gojo Satoru', 'Zoro One Piece', 'Levi Ackerman', 'Rimuru Tempest'],
    'lore-explained': ['One Piece Devil Fruits', 'Jujutsu Kaisen cursed techniques', 'Naruto chakra system'],
    // ... (tambah semua format)
  },
  manga: { /* ... */ },
  game: { /* ... */ },
  novel: { /* ... */ },
} as const;

export class TopicGenerator {
  constructor(
    private env: Env,
    private db: D1Client
  ) {}

  async generate(
    category: ContentCategory,
    format: ContentFormat,
    recentTopics: string[]
  ): Promise<string> {
    // 1. Coba generate via AI (1 subrequest)
    try {
      const aiTopic = await this.generateWithAI(category, format, recentTopics);
      if (aiTopic && !(await this.isRecentlyUsed(aiTopic))) {
        return aiTopic;
      }
    } catch { /* fallback */ }

    // 2. Fallback: pick dari pool, hindari yang sudah dipakai
    const pool = TOPIC_POOLS[category]?.[format] ?? TOPIC_POOLS[category]?.['review'] ?? [];
    const available = pool.filter(t => !recentTopics.some(r => r.toLowerCase().includes(t.toLowerCase())));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)]!;
    }

    // 3. Last resort: return random from full pool
    return pool[Math.floor(Math.random() * pool.length)] ?? 'Popular anime of the season';
  }

  private async generateWithAI(
    category: ContentCategory,
    format: ContentFormat,
    recentTopics: string[]
  ): Promise<string> {
    const prompt = `Generate ONE specific ${category} topic for a "${format}" article.
Requirements:
- Must be specific (title, character name, or event — NOT generic)
- MUST NOT be similar to any of these recent topics: ${recentTopics.slice(0, 10).join(', ')}
- Return ONLY the topic, nothing else, no punctuation at end

Examples of good topics: "Frieren Beyond Journey's End", "Jujutsu Kaisen Culling Game arc", "One Piece Egghead arc"`;

    const result = await callAiWithRouter('query', [{ role: 'user', content: prompt }], this.env);
    return result.trim().slice(0, 100);
  }

  private async isRecentlyUsed(topic: string, days = 14): Promise<boolean> {
    const normalized = topic.toLowerCase().trim();
    const row = await this.db.first<{ count: number }>(
      `SELECT COUNT(*) as count FROM content_history
       WHERE published_at > datetime('now', ?)
         AND (topic_normalized LIKE '%' || ? || '%' OR ? LIKE '%' || topic_normalized || '%')`,
      `-${days} days`, normalized, normalized
    );
    return (row?.count ?? 0) > 0;
  }
}
```

### 5.6 📋 TASK: History Tracker

**📁 File:** `src/content/strategist/history-tracker.ts`

```typescript
export class HistoryTracker {
  private db: D1Client;

  constructor(env: Env) {
    this.db = new D1Client(env);
  }

  async log(params: {
    id: string;
    traceId: string;
    brief: ContentBrief;
    article: Article;
    providerUsed: string;
    modelUsed: string;
    totalMs: number;
    discordMessageId?: string;
    discordChannelId?: string;
  }): Promise<void> {
    const wordCount = [params.article.intro, ...params.article.sections.map(s => s.body)]
      .join(' ').split(/\s+/).length;

    await this.db.execute(
      `INSERT INTO content_history
       (id, trace_id, category, format, depth, topic, topic_normalized, angle, reason,
        trending_score, trigger_type, sections_count, word_count, provider_used,
        model_used, total_ms, discord_message_id, discord_channel_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      params.id,
      params.traceId,
      params.brief.category,
      params.brief.format,
      params.brief.depth,
      params.brief.topic,
      params.brief.topic.toLowerCase().trim(),
      params.brief.angle ?? null,
      params.brief.reason,
      params.brief.trendingScore ?? null,
      params.brief.triggerType,
      params.article.sections.length,
      wordCount,
      params.providerUsed,
      params.modelUsed,
      params.totalMs,
      params.discordMessageId ?? null,
      params.discordChannelId ?? null
    );
  }

  async getRecent(days = 7) {
    return this.db.query<{
      id: string; format: string; category: string; topic: string; published_at: string;
    }>(
      `SELECT id, format, category, topic, published_at FROM content_history
       WHERE published_at > datetime('now', ?) ORDER BY published_at DESC`,
      `-${days} days`
    );
  }
}
```

---

## PART 6 — RESEARCH ENGINES

### 6.1 Interface Standar

Semua research engine implement interface yang sama:

```typescript
// src/content/research/types.ts

export interface ResearchEngine {
  execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle>;
}

export interface ResearchBundle {
  topic: string;
  format: ContentFormat;
  category: ContentCategory;
  summary: string;              // Teks singkat untuk prompt AI
  context: Record<string, unknown>; // Structured data format-specific
  sources: string[];
  mediaPlan?: MediaPlan;
}

export interface MediaPlan {
  imageQuery: string;
  videoQuery?: string;
  preferredSource?: 'mal' | 'anilist';
}
```

### 6.2 Data Sources

#### `src/content/research/sources/jikan-source.ts`

```typescript
const JIKAN_BASE = 'https://api.jikan.moe/v4';

export class JikanSource {
  constructor(private env: Env, private cache: D1Cache, private budget: BudgetTracker) {}

  async searchAnime(query: string): Promise<JikanAnime[]> {
    const cacheKey = `jikan:search:${query.slice(0, 50)}`;
    const cached = await this.cache.get<JikanAnime[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:search');
    const data = await safeFetchJson<{ data: JikanAnime[] }>(
      `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 3600, 'jikan');
    return data.data;
  }

  async getAnimeReviews(malId: number): Promise<JikanReview[]> {
    const cacheKey = `jikan:reviews:${malId}`;
    const cached = await this.cache.get<JikanReview[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:reviews');
    const data = await safeFetchJson<{ data: JikanReview[] }>(
      `${JIKAN_BASE}/anime/${malId}/reviews?limit=10`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 7200, 'jikan');
    return data.data;
  }

  async getSeasonNow(): Promise<JikanAnime[]> {
    const cacheKey = 'jikan:season:now';
    const cached = await this.cache.get<JikanAnime[]>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'Jikan:season');
    const data = await safeFetchJson<{ data: JikanAnime[] }>(
      `${JIKAN_BASE}/seasons/now?limit=10`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    await this.cache.set(cacheKey, data.data, 3600, 'jikan');
    return data.data;
  }
}
```

#### `src/content/research/sources/anilist-source.ts`

```typescript
const ANILIST_GQL = 'https://graphql.anilist.co';

export class AniListSource {
  constructor(private cache: D1Cache, private budget: BudgetTracker) {}

  async searchMedia(query: string, type: 'ANIME' | 'MANGA' = 'ANIME') {
    const cacheKey = `anilist:search:${type}:${query.slice(0, 50)}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) return cached;

    this.budget.consume(1, 'AniList:search');
    const gql = `query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        id title { romaji english native }
        description averageScore popularity
        coverImage { extraLarge large }
        bannerImage genres tags { name }
      }
    }`;

    const res = await safeFetch(ANILIST_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql, variables: { search: query, type } }),
      timeoutMs: 5000,
    });

    if (!res || !res.ok) return null;
    const data = await res.json();
    await this.cache.set(cacheKey, data, 3600, 'anilist');
    return data;
  }
}
```

#### `src/content/research/sources/web-source.ts`

```typescript
// WebScout: free web search engine, tidak butuh API key
const WEBSCOUT_BASE = 'https://ddg-api.herokuapp.com/search';

export class WebSource {
  constructor(private budget: BudgetTracker) {}

  async search(query: string, site?: string): Promise<WebSearchResult[]> {
    const q = site ? `site:${site} ${query}` : query;
    this.budget.consume(1, `WebSource:${site ?? 'general'}`);

    const res = await safeFetch(
      `${WEBSCOUT_BASE}?query=${encodeURIComponent(q)}&max_results=5`,
      { timeoutMs: 6000 }
    );

    if (!res || !res.ok) return [];
    return res.json<WebSearchResult[]>().catch(() => []);
  }

  async searchMultiple(query: string, sites: string[]): Promise<WebSearchResult[]> {
    const results = await Promise.allSettled(sites.map(s => this.search(query, s)));
    return results
      .filter((r): r is PromiseFulfilledResult<WebSearchResult[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
```

### 6.3 Research Engine Map

| Format | File | Sources Utama |
|--------|------|---------------|
| `review` | `engines/review-engine.ts` | Jikan reviews+stats, Reddit, ANN |
| `breaking-news` | `engines/news-engine.ts` | WebScout, ANN, Jikan basic |
| `recommendation` | `engines/recommend-engine.ts` | MAL top lists, Reddit threads |
| `deep-dive` | `engines/deep-dive-engine.ts` | Wikipedia, analysis blogs, Jikan |
| `season-preview` | `engines/season-engine.ts` | Jikan seasonal, AniList |
| `comparison` | `engines/compare-engine.ts` | Jikan both entries, Reddit |
| `retrospective` | `engines/retrospective-engine.ts` | Historical data, community |
| `industry` | `engines/industry-engine.ts` | ANN, WebScout industry news |
| `top-list` | `engines/top-list-engine.ts` | MAL rankings, Reddit polls |
| `discussion` | `engines/discussion-engine.ts` | Reddit controversial threads |
| `character-spotlight` | `engines/character-engine.ts` | Jikan characters, fandom wiki |
| `lore-explained` | `engines/lore-engine.ts` | Fandom wiki, AniList, WebScout |

### 6.4 Research Engine Registry: `src/content/research/index.ts`

```typescript
import type { ContentFormat } from '../types/content';
import type { ResearchEngine } from './types';

const ENGINE_MAP: Record<ContentFormat, () => Promise<{ default: ResearchEngine }>> = {
  'review':              () => import('./engines/review-engine'),
  'breaking-news':       () => import('./engines/news-engine'),
  'recommendation':      () => import('./engines/recommend-engine'),
  'deep-dive':           () => import('./engines/deep-dive-engine'),
  'season-preview':      () => import('./engines/season-engine'),
  'comparison':          () => import('./engines/compare-engine'),
  'retrospective':       () => import('./engines/retrospective-engine'),
  'industry':            () => import('./engines/industry-engine'),
  'top-list':            () => import('./engines/top-list-engine'),
  'discussion':          () => import('./engines/discussion-engine'),
  'character-spotlight': () => import('./engines/character-engine'),
  'lore-explained':      () => import('./engines/lore-engine'),
};

export async function runResearch(
  brief: ContentBrief,
  env: Env,
  budget: BudgetTracker
): Promise<ResearchBundle> {
  const engineModule = await ENGINE_MAP[brief.format]();
  return engineModule.default.execute(brief.topic, brief.category, brief, env, budget);
}
```

> **Desain**: engine registry berbasis dynamic import → tiap format hanya dimuat saat dibutuhkan → tree-shaking friendly.

---

## PART 7 — MEDIA ENGINE

### 7.1 Media Pipeline

```
MediaEngine
    │
    ├── SemanticQueryExpander
    │   ├── Input: raw topic string (bisa ada emoji, kata extra)
    │   └── Output: cleanQuery (exact title only)
    │
    ├── ImageSearcher (paralel, multi-source)
    │   ├── jikanPictures(malId)           → source: 'mal' (paling reliable)
    │   ├── anilistArtwork(cleanQuery)     → source: 'anilist'
    │   ├── braveSearch(cleanQuery)        → source: 'brave'
    │   ├── googleImages(cleanQuery)       → source: 'google'
    │   └── duckDuckGoImages(cleanQuery)   → source: 'ddg' (last resort)
    │
    ├── MediaRanker
    │   ├── titleScore (0-100): query vs result title
    │   ├── sourceScore (0-100): hardcoded per source
    │   ├── finalScore = (title × 0.4) + (source × 0.3) + (vision × 0.3)
    │   └── Sort by finalScore DESC, take top 5
    │
    └── VisionValidator (paralel top-3)
        ├── Run AI Vision untuk TOP 3 kandidat PARALEL
        ├── Parse score + focal point dari response
        ├── Sort by aiScore DESC
        └── Cache hasil (TTL per source)
```

### 7.2 Source Reliability Scores

| Source | Score | Alasan |
|--------|-------|--------|
| MAL (Jikan) | 100 | Official, terverifikasi |
| AniList | 90 | Official, high quality |
| Kitsu | 80 | Official, coverage terbatas |
| Brave Search | 60 | Web, medium reliability |
| Google Images | 50 | Banyak noise |
| DuckDuckGo | 30 | Last resort |

### 7.3 📋 TASK: Semantic Query Expander

**📁 File:** `src/content/research/media/query-expander.ts`

```typescript
export interface QueryExpansion {
  cleanQuery: string;
  originalQuery: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function expandQuery(
  rawQuery: string,
  category: string,
  env: Env
): Promise<QueryExpansion> {
  const cacheKey = `qexpand:${rawQuery.slice(0, 80)}`;
  const cached = await env.BOT_KV.get(cacheKey, 'json') as QueryExpansion | null;
  if (cached) return cached;

  const prompt = `Extract the EXACT ${category} title from this text.
Return ONLY the title. No extra words. No punctuation at end.
If no clear title, return "GENERAL".
Text: "${rawQuery}"`;

  try {
    const result = await callAiWithRouter('query', [{ role: 'user', content: prompt }], env);
    const clean = result.trim();

    const output: QueryExpansion = {
      cleanQuery: clean === 'GENERAL' || !clean ? rawQuery : clean,
      originalQuery: rawQuery,
      confidence: clean === 'GENERAL' ? 'low' : 'high',
    };

    await env.BOT_KV.put(cacheKey, JSON.stringify(output), { expirationTtl: 86400 });
    return output;
  } catch {
    return { cleanQuery: rawQuery, originalQuery: rawQuery, confidence: 'low' };
  }
}
```

### 7.4 📋 TASK: Media Ranker

**📁 File:** `src/content/research/media/media-ranker.ts`

```typescript
export type ImageSource = 'mal' | 'anilist' | 'kitsu' | 'brave' | 'google' | 'ddg';

export interface ImageCandidate {
  url: string;
  source: ImageSource;
  title: string;
  width?: number;
  height?: number;
  titleScore: number;   // 0-100
  sourceScore: number;  // 0-100
  aiScore?: number;     // 0-10 dari AI Vision
  focalPoint?: FocalPoint; // dari AI Vision
  finalScore?: number;  // 0-100 combined
}

export type FocalPoint = 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const SOURCE_SCORES: Record<ImageSource, number> = {
  mal: 100, anilist: 90, kitsu: 80,
  brave: 60, google: 50, ddg: 30,
};

const WEIGHTS = { title: 0.4, source: 0.3, vision: 0.3 };

export function scoreCandidate(c: ImageCandidate): number {
  const visionScore = c.aiScore !== undefined ? c.aiScore * 10 : 50; // default 50 jika belum di-vision
  return (
    c.titleScore * WEIGHTS.title +
    c.sourceScore * WEIGHTS.source +
    visionScore * WEIGHTS.vision
  );
}

export function calculateTitleScore(query: string, resultTitle: string): number {
  const q = query.toLowerCase().trim();
  const t = resultTitle.toLowerCase().trim();
  if (t === q) return 100;
  if (t.includes(q) || q.includes(t)) return 85;
  // Word overlap
  const qWords = new Set(q.split(/\s+/));
  const tWords = new Set(t.split(/\s+/));
  const overlap = [...qWords].filter(w => tWords.has(w)).length;
  return Math.round((overlap / Math.max(qWords.size, tWords.size)) * 65);
}

export function buildCandidate(
  url: string,
  source: ImageSource,
  title: string,
  query: string
): ImageCandidate {
  return {
    url,
    source,
    title,
    titleScore: calculateTitleScore(query, title),
    sourceScore: SOURCE_SCORES[source],
  };
}
```

### 7.5 📋 TASK: AI Vision Validator

**📁 File:** `src/content/research/media/vision-validator.ts`

```typescript
export async function validateImages(
  candidates: ImageCandidate[],
  cleanQuery: string,
  contextDescription: string,
  env: Env,
  budget: BudgetTracker
): Promise<ImageCandidate[]> {
  // Take top 3 by pre-vision score
  const top3 = candidates
    .filter(c => c.titleScore >= 30)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    .slice(0, 3);

  if (top3.length === 0) return candidates.slice(0, 1);

  budget.consume(top3.length, 'VisionValidator');

  // Run AI Vision PARALEL
  const validated = await Promise.allSettled(
    top3.map(async (candidate) => {
      // Check KV cache
      const cacheKey = `vision:${candidate.url.slice(-50)}`;
      const cached = await env.BOT_KV.get(cacheKey, 'json') as {
        score: number; focalPoint: FocalPoint;
      } | null;

      if (cached) {
        return { ...candidate, aiScore: cached.score, focalPoint: cached.focalPoint };
      }

      const { score, focalPoint } = await runVisionCheck(
        candidate.url, cleanQuery, contextDescription, env
      );

      const ttl = VISION_TTL[candidate.source];
      await env.BOT_KV.put(
        cacheKey,
        JSON.stringify({ score, focalPoint }),
        { expirationTtl: ttl }
      );

      return { ...candidate, aiScore: score, focalPoint };
    })
  );

  const results = validated
    .filter((r): r is PromiseFulfilledResult<ImageCandidate> => r.status === 'fulfilled')
    .map(r => ({ ...r.value, finalScore: scoreCandidate(r.value) }))
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));

  return results.length > 0 ? results : candidates.slice(0, 1);
}

async function runVisionCheck(
  imageUrl: string,
  query: string,
  context: string,
  env: Env
): Promise<{ score: number; focalPoint: FocalPoint }> {
  const prompt = `Analyze this image for use as a header in an anime/manga/game article about "${query}".

Rate 1-10 based on:
1. Is it clearly anime/manga/game art style? (NOT live action, meme, or screenshot of text)
2. Does it visually represent "${query}"? (character, scene, or official art)
3. Is image quality acceptable? (no watermark >30%, not blurry, not NSFW)
4. Context match: "${context}"

Respond with EXACTLY TWO lines:
Line 1: Single number 1-10
Line 2: Focal point - one of: center top bottom left right top-left top-right bottom-left bottom-right`;

  const raw = await callAiWithRouter(
    'vision',
    [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ]}],
    env
  );

  return parseVisionResponse(raw);
}

function parseVisionResponse(raw: string): { score: number; focalPoint: FocalPoint } {
  const lines = raw.trim().split('\n').map(l => l.trim());
  const score = parseInt(lines[0] ?? '', 10);
  const validPoints: FocalPoint[] = [
    'center','top','bottom','left','right',
    'top-left','top-right','bottom-left','bottom-right'
  ];
  const focalPoint = validPoints.includes(lines[1] as FocalPoint)
    ? lines[1] as FocalPoint
    : 'center';
  return {
    score: isNaN(score) ? 5 : Math.max(1, Math.min(10, score)),
    focalPoint,
  };
}

const VISION_TTL: Record<ImageSource, number> = {
  mal: 86400, anilist: 86400, kitsu: 43200,
  brave: 3600, google: 3600, ddg: 1800,
};
```

---

## PART 8 — AI MODEL ROUTER

### 8.1 Task Type → Provider Priority

| Task ID | Deskripsi | Preferred Providers |
|---------|-----------|---------------------|
| `writer` | Nulis artikel (standard) | opencode → cf-70b → nvidia → openrouter-70b → puter-4o-mini |
| `writer-heavy` | Deep dive artikel | puter-4o → opencode → nvidia → cf-70b |
| `vision` | AI Vision image check | cf-90b-vision → cf-11b-vision → cf-mimo-vision → openrouter-gemma |
| `query` | Query expansion (murah) | cf-8b → openrouter-gemini-lite → opencode |
| `strategist` | Topic generation | opencode → cf-70b → openrouter-70b |
| `synthesis` | Review synthesis | opencode → cf-70b → puter-4o-mini |

### 8.2 Provider Pool: `src/ai/providers.ts`

```typescript
export interface Provider {
  name: string;
  type: 'cf-ai' | 'openai-compat' | 'custom';
  model: string;
  baseUrl?: string;           // null = CF built-in
  envKey?: keyof Env;         // env var name untuk API key
  headers?: Record<string, string>;
  maxTokens?: number;
}

export const PROVIDERS: Record<string, Provider> = {
  // Cloudflare Workers AI — built-in, zero cost
  'cf-70b': {
    name: 'cf-70b',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  },
  'cf-8b': {
    name: 'cf-8b',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.1-8b-instruct-fp8',
  },
  'cf-90b-vision': {
    name: 'cf-90b-vision',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.2-90b-vision-instruct',
  },
  'cf-11b-vision': {
    name: 'cf-11b-vision',
    type: 'cf-ai',
    model: '@cf/meta/llama-3.2-11b-vision-instruct',
  },
  'cf-mimo-vision': {
    name: 'cf-mimo-vision',
    type: 'cf-ai',
    model: '@cf/xiaomimi/mimo-v2.5-vision',
  },

  // OpenCode — DeepSeek gratis
  'opencode': {
    name: 'opencode',
    type: 'openai-compat',
    model: 'deepseek-v4-flash-free',
    baseUrl: 'https://opencode.ai/zen/v1',
    envKey: 'OPENCODE_API_KEY',
  },

  // NVIDIA NIM
  'nvidia': {
    name: 'nvidia',
    type: 'openai-compat',
    model: 'stepfun-ai/step-3.7-flash',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    envKey: 'NVIDIA_API_KEY',
  },

  // OpenRouter — meta llama 70B gratis
  'openrouter-70b': {
    name: 'openrouter-70b',
    type: 'openai-compat',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    headers: { 'HTTP-Referer': 'https://discord-ai-bot.workers.dev' },
  },

  // OpenRouter — Gemini Lite gratis (murah untuk query)
  'openrouter-gemini-lite': {
    name: 'openrouter-gemini-lite',
    type: 'openai-compat',
    model: 'google/gemini-2.0-flash-lite:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },

  // OpenRouter — Gemma vision
  'openrouter-gemma': {
    name: 'openrouter-gemma',
    type: 'openai-compat',
    model: 'google/gemma-3-12b:free',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
  },

  // Puter AI — GPT-4o gratis
  'puter-4o': {
    name: 'puter-4o',
    type: 'openai-compat',
    model: 'gpt-4o',
    baseUrl: 'https://api.puter.com/drivers/call',
    envKey: 'PUTER_API_KEY',
  },
  'puter-4o-mini': {
    name: 'puter-4o-mini',
    type: 'openai-compat',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.puter.com/drivers/call',
    envKey: 'PUTER_API_KEY',
  },
};
```

### 8.3 Model Routes: `src/ai/model-routes.ts`

```typescript
export interface ModelRoute {
  taskId: string;
  preferred: string[];    // Provider names, ordered by preference
  fallback: string;       // Guaranteed last resort
  timeoutMs: number;
  maxTokens?: number;
}

export const MODEL_ROUTES: Record<string, ModelRoute> = {
  'writer': {
    taskId: 'writer',
    preferred: ['opencode', 'cf-70b', 'nvidia', 'openrouter-70b', 'puter-4o-mini'],
    fallback: 'cf-70b',
    timeoutMs: 60_000,
    maxTokens: 4096,
  },
  'writer-heavy': {
    taskId: 'writer-heavy',
    preferred: ['puter-4o', 'opencode', 'nvidia', 'cf-70b'],
    fallback: 'cf-70b',
    timeoutMs: 120_000,
    maxTokens: 8192,
  },
  'vision': {
    taskId: 'vision',
    preferred: ['cf-90b-vision', 'cf-11b-vision', 'openrouter-gemma', 'cf-mimo-vision'],
    fallback: 'cf-11b-vision',
    timeoutMs: 15_000,
  },
  'query': {
    taskId: 'query',
    preferred: ['cf-8b', 'openrouter-gemini-lite', 'opencode'],
    fallback: 'cf-8b',
    timeoutMs: 10_000,
    maxTokens: 256,
  },
  'strategist': {
    taskId: 'strategist',
    preferred: ['opencode', 'cf-70b', 'openrouter-70b'],
    fallback: 'cf-70b',
    timeoutMs: 30_000,
    maxTokens: 512,
  },
  'synthesis': {
    taskId: 'synthesis',
    preferred: ['opencode', 'cf-70b', 'puter-4o-mini'],
    fallback: 'cf-70b',
    timeoutMs: 45_000,
    maxTokens: 2048,
  },
};
```

### 8.4 📋 TASK: Model Router Core

**📁 File:** `src/ai/model-router.ts`

```typescript
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
    'SELECT disabled_until FROM provider_health WHERE provider = ?', provider
  );
  if (!row?.disabled_until) return false;
  return new Date(row.disabled_until) > new Date();
}

async function recordSuccess(provider: string, latencyMs: number, db: D1Client): Promise<void> {
  await db.execute(`
    INSERT INTO provider_health
      (provider, consecutive_failures, total_calls, total_successes, avg_latency_ms, last_success_at, updated_at)
    VALUES (?, 0, 1, 1, ?, datetime('now'), datetime('now'))
    ON CONFLICT(provider) DO UPDATE SET
      consecutive_failures = 0,
      total_calls = total_calls + 1,
      total_successes = total_successes + 1,
      avg_latency_ms = COALESCE(((avg_latency_ms * (total_calls - 1)) + ?) / total_calls, ?),
      last_success_at = datetime('now'),
      disabled_until = NULL,
      updated_at = datetime('now')
  `, provider, latencyMs, latencyMs, latencyMs);
}

async function recordFailure(provider: string, error: string, db: D1Client): Promise<void> {
  await db.execute(`
    INSERT INTO provider_health
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
      updated_at = datetime('now')
  `, provider);
}
```

---

## PART 9 — CONTENT GENERATOR

### 9.1 📋 TASK: Generator Orchestrator

**📁 File:** `src/content/generator/index.ts`

```typescript
export async function generateContent(
  brief: ContentBrief,
  research: ResearchBundle,
  env: Env,
  budget: BudgetTracker
): Promise<Article> {
  // 1. Build format-specific prompt
  const prompt = await buildPrompt(brief, research);

  // 2. Pick task type based on depth
  const taskId = brief.depth === 'deep' ? 'writer-heavy' : 'writer';

  let article: Article | null = null;
  let lastError = '';

  // 3. Try up to 3 times
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      budget.consume(1, `Generator:attempt${attempt + 1}`);

      const raw = await callAiWithRouter(taskId, [
        { role: 'system', content: getSystemPrompt(brief) },
        { role: 'user', content: prompt },
      ], env);

      article = parseArticleResponse(raw, brief);

      // 4. Quality check
      const minSections = getMinSections(brief.depth);
      if (!article || article.sections.length < minSections) {
        lastError = `Sections: ${article?.sections.length ?? 0} < ${minSections}`;
        article = null;
        continue;
      }

      break; // success
    } catch (e) {
      lastError = (e as Error).message;
      traceLog('warn', 'Generator', `Attempt ${attempt + 1} failed`, { error: lastError });
    }
  }

  if (!article) {
    throw new AppError(ErrorCode.WRITER_FAILED, `Generator failed after 3 attempts: ${lastError}`);
  }

  // 5. Quality audit + auto-fix
  const audit = auditArticle(article, brief);
  if (!audit.passed) {
    traceLog('warn', 'Generator', 'Audit issues', { issues: audit.issues });
    article = autoFixArticle(article, audit);
  }

  return article;
}

function getMinSections(depth: ContentDepth): number {
  return { quick: 2, standard: 3, deep: 5 }[depth];
}
```

### 9.2 Prompt System

Setiap format punya file prompt sendiri. Semua extend dari `base-prompt.ts`:

**`src/content/generator/prompts/base-prompt.ts`**

```typescript
export function getSystemPrompt(brief: ContentBrief): string {
  return `Kamu adalah penulis konten anime/manga/game/novel profesional untuk Discord.

ATURAN ABSOLUT:
- Bahasa: Indonesia yang santai (gue-lo atau aku-kamu, konsisten satu pilihan)
- Jangan pernah mulai dengan "Halo", "Selamat datang", atau "Pada artikel ini"
- Jangan pernah tutup dengan "Kesimpulannya", "Sekian", "Terima kasih", "Semoga bermanfaat"
- Mulai LANGSUNG dengan hook yang kuat — fakta mengejutkan, pertanyaan tajam, atau klaim berani
- Paragraf max 3-4 kalimat per section
- Tidak ada bullet point berlebihan — tulis sebagai prosa yang mengalir
- Tidak menyebut "generated by AI" atau sejenisnya

FORMAT OUTPUT (JSON wajib):
\`\`\`json
{
  "title": "...",
  "intro": "...",
  "sections": [
    { "heading": "...", "body": "..." }
  ]
}
\`\`\``;
}

export function buildPrompt(brief: ContentBrief, research: ResearchBundle): string {
  const formatInstructions = FORMAT_PROMPT_MAP[brief.format];
  return `${formatInstructions(brief, research)}

TOPIK: ${brief.topic}
KATEGORI: ${brief.category.toUpperCase()}
KEDALAMAN: ${brief.depth}

DATA PENELITIAN:
${research.summary}

Tulis artikel ${brief.format} yang menarik dan informatif. Output HARUS valid JSON.`;
}
```

### 9.3 Quality Auditor: `src/content/generator/auditor.ts`

```typescript
const BANNED_PHRASES = [
  'kesimpulannya', 'dapat disimpulkan', 'demikian artikel',
  'sekian', 'terima kasih', 'that\'s all', 'semoga bermanfaat',
  'generated by ai', 'as an ai', 'i am an ai', 'sebagai ai',
  'pada artikel ini kita akan', 'halo semua',
];

export interface AuditResult {
  passed: boolean;
  issues: string[];
  severity: 'none' | 'warning' | 'critical';
}

export function auditArticle(article: Article, brief: ContentBrief): AuditResult {
  const issues: string[] = [];

  // Structure checks
  if (!article.title || article.title.length < 10) issues.push('Title too short (<10 chars)');
  if (!article.intro || article.intro.length < 50) issues.push('Intro too short (<50 chars)');

  const minSections = getMinSections(brief.depth);
  if (article.sections.length < minSections) {
    issues.push(`Too few sections: ${article.sections.length} < ${minSections}`);
  }

  // Content quality checks
  const fullText = [article.intro, ...article.sections.map(s => s.body)]
    .join(' ').toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (fullText.includes(phrase)) issues.push(`Banned phrase found: "${phrase}"`);
  }

  // Section quality
  for (const [i, sec] of article.sections.entries()) {
    if (!sec.heading || sec.heading.length < 3) issues.push(`Section ${i + 1}: empty heading`);
    if (!sec.body || sec.body.length < 30) issues.push(`Section ${i + 1}: body too short`);
  }

  const hasCritical = issues.some(i =>
    i.includes('Too few sections') || i.includes('Title too short')
  );

  return {
    passed: issues.length === 0,
    issues,
    severity: issues.length === 0 ? 'none' : hasCritical ? 'critical' : 'warning',
  };
}

export function autoFixArticle(article: Article, audit: AuditResult): Article {
  let fixed = { ...article };

  // Fix banned phrases — remove them
  for (const phrase of BANNED_PHRASES) {
    fixed.intro = fixed.intro.replace(new RegExp(phrase, 'gi'), '');
    fixed.sections = fixed.sections.map(s => ({
      ...s,
      body: s.body.replace(new RegExp(phrase, 'gi'), ''),
    }));
  }

  // Remove empty sections
  fixed.sections = fixed.sections.filter(s => s.heading && s.body && s.body.length >= 30);

  return fixed;
}
```

---

## PART 10 — DISCORD PUBLISHER

### 10.1 📋 TASK: Discord Adapter

**📁 File:** `src/content/publish/adapters/discord-adapter.ts`

```typescript
const CATEGORY_COLORS: Record<ContentCategory, number> = {
  anime: 0xFF6B6B,
  manga: 0x9B59B6,
  game:  0x3498DB,
  novel: 0xE67E22,
};

const FORMAT_EMOJI: Record<ContentFormat, string> = {
  'review':              '⭐',
  'breaking-news':       '🔥',
  'recommendation':      '💎',
  'deep-dive':           '🔍',
  'season-preview':      '🎌',
  'comparison':          '⚖️',
  'retrospective':       '📚',
  'industry':            '🏭',
  'top-list':            '🏆',
  'discussion':          '💬',
  'character-spotlight': '🎭',
  'lore-explained':      '📖',
};

export class DiscordAdapter {
  private baseUrl = 'https://discord.com/api/v10';

  constructor(private token: string) {}

  async send(channelId: string, content: FinalContent): Promise<string> {
    const payloads = this.formatToDiscord(content);

    let lastMessageId = '';
    for (const payload of payloads) {
      const res = await safeFetch(
        `${this.baseUrl}/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bot ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          timeoutMs: 10_000,
        }
      );

      if (!res || !res.ok) {
        const errText = await res?.text().catch(() => 'unknown');
        throw new AppError(ErrorCode.DISCORD_SEND_FAILED, `Discord API error: ${errText}`);
      }

      const data = await res.json<{ id: string }>();
      lastMessageId = data.id;

      // Discord rate limit buffer
      await new Promise(r => setTimeout(r, 500));
    }

    return lastMessageId;
  }

  private formatToDiscord(content: FinalContent): DiscordMessagePayload[] {
    const payloads: DiscordMessagePayload[] = [];
    const emoji = FORMAT_EMOJI[content.format];
    const color = CATEGORY_COLORS[content.category];

    // Message 1: Header embed (title + intro + first image)
    const headerImage = content.sections.find(s => s.imageUrl)?.imageUrl;
    payloads.push({
      embeds: [{
        title: `${emoji} ${content.title}`,
        description: content.intro,
        color,
        image: headerImage ? { url: headerImage } : undefined,
        footer: {
          text: `${content.category.toUpperCase()} · ${content.format} · ${new Date().toLocaleDateString('id-ID')}`,
        },
        timestamp: content.metadata.generatedAt,
      }],
    });

    // Messages 2+: Content sections (max 4 sections per embed)
    const chunks = chunkArray(content.sections, 4);
    for (const chunk of chunks) {
      const fields = chunk.map(sec => ({
        name: `**${sec.heading}**`,
        value: sec.body.slice(0, 1024),
        inline: false,
      }));

      payloads.push({
        embeds: [{ color, fields }],
      });

      // Send video if available
      const videoSec = chunk.find(s => s.videoUrl);
      if (videoSec?.videoUrl) {
        payloads.push({ content: `🎬 ${videoSec.videoUrl}` });
      }
    }

    return payloads;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
  fields?: Array<{ name: string; value: string; inline: boolean }>;
}
```

---

## PART 11 — MCP SERVER & SECURITY

### 11.1 Security Middleware Stack

```
Request → CORS → Auth(x-mcp-secret) → RateLimit → AccessControl → AuditLog → Handler
```

### 11.2 MCP Tools List

| Tool | Permission | Deskripsi |
|------|-----------|-----------|
| `status` | public | System health & stats |
| `ai-chat` | user | Chat langsung ke AI |
| `generate-article` | user | Trigger article generation |
| `send-message` | user | Kirim pesan ke channel |
| `purge-channel` | user | Hapus pesan di channel |
| `get-history` | user | Lihat content history |
| `get-metrics` | user | Pipeline metrics |
| `composio-status` | user | Status koneksi Composio |
| `composio-post` | user | Post ke satu platform |
| `composio-broadcast` | user | Broadcast ke semua platform |
| `task-list` | admin | Lihat scheduled tasks |
| `task-create` | admin | Buat scheduled task baru |
| `task-toggle` | admin | Enable/disable task |
| `task-delete` | admin | Hapus scheduled task |
| `provider-health` | admin | Lihat status AI providers |
| `clear-dlq` | admin | Resolve dead letter queue |
| `ban-user` | admin | Ban user Discord |
| `plugin-list` | admin | Lihat plugin aktif |
| `plugin-toggle` | admin | Enable/disable plugin |

### 11.3 📋 TASK: MCP Server

**📁 File:** `src/mcp/server.ts`

```typescript
import { McpServer } from '@cloudflare/mcp-server-cloudflare';
import type { Env } from '../types/env';
import { checkAuth } from './auth';
import { checkRateLimit } from './rate-limiter';
import { getToolPermission, hasPermission } from './access-control';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, x-mcp-secret',
  'Access-Control-Max-Age': '86400',
};

export async function mcpRouter(request: Request, env: Env): Promise<Response> {
  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 1. Fail closed jika secret tidak di-set
  if (!env.MCP_SECRET) {
    return errorResponse(503, 'MCP endpoint not configured');
  }

  // 2. Authenticate
  const authResult = checkAuth(request, env);
  if (!authResult.ok) {
    return errorResponse(401, authResult.error!, -32001);
  }

  // 3. Rate limit (30 req/min per IP)
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rateLimitOk = await checkRateLimit(ip, env);
  if (!rateLimitOk) {
    return errorResponse(429, 'Rate limit exceeded', -32029);
  }

  // 4. Parse body untuk cek tool permission
  const body = await request.json<{ method: string; params?: { name?: string } }>();
  const toolName = body.params?.name;

  if (toolName) {
    const permission = getToolPermission(toolName);
    if (!hasPermission(authResult.role, permission)) {
      return errorResponse(403, `Insufficient permission for: ${toolName}`, -32003);
    }
  }

  // 5. Delegate ke MCP handler
  const server = buildMcpServer(env);
  return server.handle(new Request(request, { body: JSON.stringify(body) }));
}

function buildMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: 'discord-ai-bot', version: '4.0.0' });

  // Register all tools
  registerStatusTools(server, env);
  registerContentTools(server, env);
  registerTaskTools(server, env);
  registerComposioTools(server, env);
  registerAdminTools(server, env);

  return server;
}

function errorResponse(status: number, message: string, code?: number): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: code ?? -32000, message },
    }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
  );
}
```

### 11.4 Rate Limiter: `src/mcp/rate-limiter.ts`

```typescript
export async function checkRateLimit(ip: string, env: Env): Promise<boolean> {
  const key = `ratelimit:mcp:${ip}`;
  const current = await env.BOT_KV.get(key, 'text');
  const count = current ? parseInt(current, 10) : 0;

  if (count >= 30) return false;

  await env.BOT_KV.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}
```

### 11.5 Auth: `src/mcp/auth.ts`

```typescript
export interface AuthResult {
  ok: boolean;
  role: 'admin' | 'user' | 'public';
  error?: string;
}

export function checkAuth(request: Request, env: Env): AuthResult {
  const secret = request.headers.get('x-mcp-secret');

  if (!secret) {
    return { ok: false, role: 'public', error: 'Missing x-mcp-secret header' };
  }

  if (secret !== env.MCP_SECRET) {
    return { ok: false, role: 'public', error: 'Invalid secret' };
  }

  // Role dari header opsional (default: user setelah auth berhasil)
  // Admin role: via ADMIN_SECRET env var jika perlu multi-level
  return { ok: true, role: 'user' };
}
```

---

## PART 12 — SCHEDULER, QUEUE & DEAD LETTER

### 12.1 Cron Handler: `src/cron/handler.ts`

```typescript
export async function handleCron(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const traceId = crypto.randomUUID().slice(0, 8);
  setTraceId(traceId);

  traceLog('info', 'Cron', `Triggered at ${new Date(event.scheduledTime).toISOString()}`);

  // Find tasks due to run
  const db = new D1Client(env);
  const tasks = await db.query<ScheduledTask>(
    `SELECT * FROM scheduled_tasks WHERE enabled = 1 ORDER BY last_run ASC`
  );

  for (const task of tasks) {
    if (!isCronDue(task.cron, task.last_run)) continue;

    // Enqueue task → handled by queue consumer
    await env.TASK_QUEUE.send({
      taskId: task.id,
      taskName: task.name,
      action: task.action,
      params: JSON.parse(task.params),
      channelId: task.channel_id,
      traceId,
      enqueuedAt: new Date().toISOString(),
    });

    // Update last run
    await db.execute(
      `UPDATE scheduled_tasks SET last_run = datetime('now'), last_status = 'pending' WHERE id = ?`,
      task.id
    );
  }
}
```

### 12.2 Queue Handler: `src/queue/handler.ts`

```typescript
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  for (const msg of batch.messages) {
    const { taskId, action, params, channelId, traceId } = msg.body;
    setTraceId(traceId);

    try {
      await executeTaskAction(action, params, channelId, env, ctx);

      await updateTaskStatus(taskId, 'success', env);
      msg.ack();
    } catch (e) {
      const err = e as Error;
      traceLog('error', 'Queue', `Task failed: ${taskId}`, { error: err.message });

      await updateTaskStatus(taskId, 'failed', env);

      // Max retries: Cloudflare Queues handles retries automatically.
      // After maxRetries, message goes to dead_letter_queue in DB.
      if (msg.attempts >= 3) {
        await moveToDLQ(taskId, msg.body, err.message, env);
        msg.ack(); // ack to prevent infinite loop
      } else {
        msg.retry();
      }
    }
  }
}

async function executeTaskAction(
  action: string,
  params: Record<string, unknown>,
  channelId: string,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  switch (action) {
    case 'generate-article':
      await runArticlePipeline(channelId, 'cron', env, ctx);
      break;
    case 'send-message':
      await sendDirectMessage(channelId, String(params['message'] ?? ''), env);
      break;
    default:
      throw new AppError(ErrorCode.VALIDATION_ERROR, `Unknown action: ${action}`);
  }
}
```

### 12.3 Dead Letter Queue Handler: `src/queue/dead-letter.ts`

```typescript
export async function moveToDLQ(
  taskId: string | undefined,
  message: QueueMessage,
  errorMessage: string,
  env: Env
): Promise<void> {
  const db = new D1Client(env);

  await db.execute(
    `INSERT INTO dead_letter_queue
     (task_id, trace_id, queue_message, error_message, error_phase)
     VALUES (?, ?, ?, ?, ?)`,
    taskId ?? null,
    message.traceId,
    JSON.stringify(message),
    errorMessage,
    message.action
  );

  traceLog('error', 'DLQ', `Message moved to DLQ: task=${taskId}`, {
    error: errorMessage,
    action: message.action,
  });

  // Optionally notify via Discord
  await notifyAdminDLQ(taskId, errorMessage, env).catch(() => {});
}

async function notifyAdminDLQ(
  taskId: string | undefined,
  error: string,
  env: Env
): Promise<void> {
  if (!env.DISCORD_DEFAULT_CHANNEL_ID) return;

  const adapter = new DiscordAdapter(env.DISCORD_TOKEN);
  const message = {
    embeds: [{
      title: '⚠️ Task Moved to Dead Letter Queue',
      description: `Task \`${taskId ?? 'unknown'}\` failed after max retries.`,
      color: 0xFF0000,
      fields: [{ name: 'Error', value: error.slice(0, 500), inline: false }],
      timestamp: new Date().toISOString(),
    }],
  };

  await safeFetch(
    `https://discord.com/api/v10/channels/${env.DISCORD_DEFAULT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );
}
```

---

## PART 13 — COMPOSIO DISTRIBUTION LAYER

### 13.1 Arsitektur

Composio berjalan **non-blocking** via `ctx.waitUntil()` setelah Discord publish berhasil.

```typescript
// Di pipeline orchestrator — setelah Discord send:
const discordMessageId = await discordAdapter.send(channelId, finalContent);

// Non-blocking background distribution
ctx.waitUntil(
  distributeToSocialMedia(finalContent, discordMessageId, env)
    .catch(e => traceLog('error', 'Composio', 'Distribution failed', { error: e.message }))
);
```

### 13.2 Composio REST Client

```typescript
// src/composio/client.ts — pakai REST API, BUKAN @composio/core SDK (4.7MB bundle!)

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
    throw new AppError(ErrorCode.AI_PROVIDER_ERROR, `Composio ${res?.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}
```

### 13.3 Platform Adapters

| Platform | Action ID | Format | Char Limit |
|----------|-----------|--------|-----------|
| Twitter | `TWITTER_CREATION_OF_A_POST` | Plain text + hashtags | 4000 |
| Instagram | `INSTAGRAM_CREATE_POST` | Caption + image wajib | 2200 |
| LinkedIn | `LINKEDIN_CREATE_LINKED_IN_POST` | Professional, markdown | 3000 |
| Reddit | `REDDIT_CREATE_POST` | Markdown, butuh subreddit | 40000 |
| Telegram | `TELEGRAM_SEND_MESSAGE` | HTML (`<b>`, `<a>`) | 4096 |

### 13.4 Distribution Forwarder: `src/composio/forwarder.ts`

```typescript
export async function distributeToSocialMedia(
  content: FinalContent,
  discordMessageId: string,
  env: Env
): Promise<void> {
  if (!env.COMPOSIO_API_KEY) return;

  const platforms: Array<{
    platform: PlatformType;
    accountId: string | undefined;
    adapter: PlatformAdapter;
  }> = [
    { platform: 'twitter',   accountId: env.COMPOSIO_TWITTER_ACCOUNT_ID,   adapter: twitterAdapter },
    { platform: 'instagram', accountId: env.COMPOSIO_INSTAGRAM_ACCOUNT_ID, adapter: instagramAdapter },
    { platform: 'linkedin',  accountId: env.COMPOSIO_LINKEDIN_ACCOUNT_ID,  adapter: linkedinAdapter },
    { platform: 'reddit',    accountId: env.COMPOSIO_REDDIT_ACCOUNT_ID,    adapter: redditAdapter },
    { platform: 'telegram',  accountId: env.COMPOSIO_TELEGRAM_ACCOUNT_ID,  adapter: telegramAdapter },
  ].filter(p => Boolean(p.accountId));

  const results = await Promise.allSettled(
    platforms.map(async ({ platform, accountId, adapter }) => {
      const startMs = Date.now();
      try {
        const payload = adapter.format(content, discordMessageId);
        const result = await composioExecute(
          env.COMPOSIO_API_KEY!,
          accountId!,
          adapter.actionId,
          payload
        );
        return { platform, success: true, result, durationMs: Date.now() - startMs };
      } catch (e) {
        return {
          platform,
          success: false,
          error: (e as Error).message,
          durationMs: Date.now() - startMs,
        };
      }
    })
  );

  // Log semua results ke D1
  const db = new D1Client(env);
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { platform, success, error, durationMs } = result.value;
      await db.execute(
        `INSERT INTO distribution_log (content_id, platform, status, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
        discordMessageId, platform,
        success ? 'success' : 'failed',
        error ?? null,
        durationMs
      ).catch(() => {}); // non-blocking log
    }
  }
}
```

---

## PART 14 — IMAGE COMPOSITOR ENGINE

### 14.1 Konsep 3 Layer

```
Layer 1: Background (dari Media Engine)
  ├── Smart Padding (default): blur + letterbox → 100% aman untuk semua rasio
  └── Smart Crop (jika focal point tersedia dari AI Vision): crop by focal point

Layer 2: Gradient Overlay
  ├── Gradient gelap dari bawah ke atas (readability judul)
  └── Category badge (warna sesuai kategori) di pojok kiri bawah

Layer 3: Text
  ├── Judul artikel (bold, auto-resize)
  └── Format tag + metadata kecil
```

### 14.2 Platform Sizes

| Platform | Width | Height | Ratio |
|----------|-------|--------|-------|
| Twitter | 1200 | 675 | 16:9 |
| Instagram | 1080 | 1080 | 1:1 |
| LinkedIn | 1200 | 627 | 1.91:1 |
| Reddit | 1200 | 600 | 2:1 |
| Telegram | 512 | 512 | 1:1 |

### 14.3 Implementation: `src/compositor/image-compositor.ts`

```typescript
// Library: cf-workers-og (Satori + resvg-wasm) — render JSX → PNG di CF Workers
// Font: Inter (Latin) + Noto Sans JP (Japanese) via Google Fonts, cached di KV

import { ImageResponse } from 'cf-workers-og';
import { loadFont } from './font-loader';

export async function composeImage(
  imageUrl: string,
  title: string,
  category: ContentCategory,
  format: ContentFormat,
  platform: PlatformType,
  focalPoint: FocalPoint = 'center',
  env: Env
): Promise<Uint8Array> {
  const { width, height } = PLATFORM_SIZES[platform];
  const font = await loadFont(env); // cached di KV

  try {
    const response = new ImageResponse(
      buildTemplate({ imageUrl, title, category, format, width, height, focalPoint }),
      { width, height, fonts: [{ name: 'Inter', data: font, weight: 700 }] }
    );
    return new Uint8Array(await response.arrayBuffer());
  } catch (e) {
    traceLog('warn', 'Compositor', `Composition failed, using original`, {
      error: (e as Error).message,
    });
    // Fallback: return empty buffer, caller will use original URL
    return new Uint8Array(0);
  }
}

const PLATFORM_SIZES: Record<PlatformType, { width: number; height: number }> = {
  twitter:   { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1080 },
  linkedin:  { width: 1200, height: 627 },
  reddit:    { width: 1200, height: 600 },
  telegram:  { width: 512,  height: 512 },
};
```

---

## PART 15 — ANALYTICS & DASHBOARD API

### 15.1 Analytics Routes: `src/analytics/routes.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/env';
import { D1Client } from '../core/d1';

const analyticsRouter = new Hono<{ Bindings: Env }>();

// GET /analytics/overview?days=7
analyticsRouter.get('/overview', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7', 10);
  const db = new D1Client(c.env);

  const [formatDist, successRate, avgDuration, topTopics] = await Promise.all([
    db.query(`SELECT format, COUNT(*) as count FROM content_history
              WHERE published_at > datetime('now', ?) GROUP BY format ORDER BY count DESC`,
              `-${days} days`),
    db.first(`SELECT
                COUNT(*) as total,
                SUM(success) as successes,
                ROUND(100.0 * SUM(success) / COUNT(*), 1) as rate
              FROM pipeline_metrics WHERE created_at > datetime('now', ?)`,
              `-${days} days`),
    db.first(`SELECT
                ROUND(AVG(total_ms), 0) as avg_ms,
                ROUND(AVG(generator_ms), 0) as avg_generator_ms
              FROM pipeline_metrics WHERE created_at > datetime('now', ?)`,
              `-${days} days`),
    db.query(`SELECT topic, reactions FROM content_history
              WHERE published_at > datetime('now', ?) ORDER BY reactions DESC LIMIT 5`,
              `-${days} days`),
  ]);

  return c.json({ formatDistribution: formatDist, successRate, avgDuration, topTopics });
});

// GET /analytics/providers?days=7
analyticsRouter.get('/providers', async (c) => {
  const db = new D1Client(c.env);
  const health = await db.query(`
    SELECT provider, consecutive_failures, total_calls, total_failures,
           avg_latency_ms, last_success_at, disabled_until
    FROM provider_health ORDER BY total_calls DESC
  `);
  return c.json({ providers: health });
});

// GET /analytics/traces/:traceId
analyticsRouter.get('/traces/:traceId', async (c) => {
  const db = new D1Client(c.env);
  const traceId = c.req.param('traceId');

  const [metrics, history, logs] = await Promise.all([
    db.first(`SELECT * FROM pipeline_metrics WHERE trace_id = ?`, traceId),
    db.first(`SELECT * FROM content_history WHERE trace_id = ?`, traceId),
    db.query(`SELECT * FROM task_logs WHERE trace_id = ? ORDER BY timestamp`, traceId),
  ]);

  return c.json({ metrics, history, logs });
});

// GET /analytics/content-history?days=14&format=review&category=anime
analyticsRouter.get('/content-history', async (c) => {
  const days = parseInt(c.req.query('days') ?? '14', 10);
  const format = c.req.query('format');
  const category = c.req.query('category');
  const db = new D1Client(c.env);

  let sql = `SELECT id, trace_id, category, format, topic, published_at, reactions, word_count
             FROM content_history WHERE published_at > datetime('now', ?)`;
  const bindings: unknown[] = [`-${days} days`];

  if (format) { sql += ` AND format = ?`; bindings.push(format); }
  if (category) { sql += ` AND category = ?`; bindings.push(category); }
  sql += ` ORDER BY published_at DESC LIMIT 50`;

  const history = await db.query(sql, ...bindings);
  return c.json({ history });
});

// GET /analytics/dlq — dead letter queue
analyticsRouter.get('/dlq', async (c) => {
  const db = new D1Client(c.env);
  const dlq = await db.query(
    `SELECT * FROM dead_letter_queue WHERE resolved = 0 ORDER BY last_seen DESC LIMIT 20`
  );
  return c.json({ dlq });
});

export { analyticsRouter };
```

---

## PART 16 — [NEW] PLUGIN SYSTEM

### 16.1 Konsep Plugin System

Plugin system memungkinkan penambahan format konten baru atau platform distribusi baru **tanpa mengubah kode inti**. Setiap plugin adalah sebuah modul TypeScript yang implement interface standar.

```
Plugin Types:
  ├── format-plugin: tambah format konten baru (e.g., 'tier-list', 'fan-theory')
  ├── platform-plugin: tambah target distribusi baru (e.g., Bluesky, Threads)
  └── source-plugin: tambah data source baru (e.g., IGDB untuk game)
```

### 16.2 Plugin Interface: `src/plugins/types.ts`

```typescript
export interface FormatPlugin {
  id: string;
  name: string;
  version: string;
  // Research handler
  research(topic: string, category: ContentCategory, env: Env, budget: BudgetTracker): Promise<ResearchBundle>;
  // Prompt builder
  buildPrompt(brief: ContentBrief, research: ResearchBundle): string;
  // Weight config
  weightConfig: FormatWeightConfig;
}

export interface PlatformPlugin {
  id: string;
  name: string;
  version: string;
  // Format content untuk platform ini
  format(content: FinalContent, imageUrl?: string): Record<string, unknown>;
  // Composio action ID
  actionId: string;
  // Max character limit
  maxLength: number;
}

export interface SourcePlugin {
  id: string;
  name: string;
  version: string;
  // Search untuk topik tertentu
  search(query: string, budget: BudgetTracker): Promise<ResearchBundle>;
  // Kategori yang didukung
  supportedCategories: ContentCategory[];
}

export type AnyPlugin = FormatPlugin | PlatformPlugin | SourcePlugin;
```

### 16.3 Plugin Registry: `src/plugins/registry.ts`

```typescript
const BUILT_IN_FORMAT_PLUGINS: Record<string, FormatPlugin> = {
  // Built-in format plugins (semua 12 format dari Part 5)
};

const EXTERNAL_FORMAT_PLUGINS: Record<string, FormatPlugin> = {
  // Akan diisi oleh plugin developer
  // Contoh: 'tier-list', 'fan-theory', 'music-ost-review'
};

export function getAllFormatPlugins(): Record<string, FormatPlugin> {
  return { ...BUILT_IN_FORMAT_PLUGINS, ...EXTERNAL_FORMAT_PLUGINS };
}

export function registerFormatPlugin(plugin: FormatPlugin): void {
  if (EXTERNAL_FORMAT_PLUGINS[plugin.id]) {
    traceLog('warn', 'PluginRegistry', `Overwriting plugin: ${plugin.id}`);
  }
  EXTERNAL_FORMAT_PLUGINS[plugin.id] = plugin;
  traceLog('info', 'PluginRegistry', `Registered format plugin: ${plugin.id} v${plugin.version}`);
}
```

---

## PART 17 — [NEW] WEBHOOK LISTENER & EVENT SYSTEM

### 17.1 Webhook Events yang Didukung

| Event | Source | Trigger |
|-------|--------|---------|
| `discord.message_reaction_add` | Discord | Update engagement data di D1 |
| `discord.message_create` | Discord | Monitor mention bot / command prefix |
| `github.push` | GitHub | Optional: trigger article dari commit message |
| `custom.trigger` | Apapun | Trigger article generation dengan payload |

### 17.2 Webhook Router: `src/webhooks/router.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/env';
import { verifyDiscordSignature } from './verifiers/discord';

const webhookRouter = new Hono<{ Bindings: Env }>();

// Discord Interactions Endpoint
webhookRouter.post('/discord', async (c) => {
  const isValid = await verifyDiscordSignature(c.req.raw, c.env);
  if (!isValid) return c.json({ error: 'Invalid signature' }, 401);

  const body = await c.req.json<DiscordInteraction>();

  // Log event ke D1
  const db = new D1Client(c.env);
  await db.execute(
    `INSERT INTO webhook_events (source, event_type, payload) VALUES (?, ?, ?)`,
    'discord', body.type, JSON.stringify(body)
  ).catch(() => {});

  // Handle specific events
  if (body.type === 1) {
    // PING — Discord verifikasi endpoint
    return c.json({ type: 1 });
  }

  if (body.type === 3 && body.data?.custom_id?.startsWith('generate_')) {
    // Button interaction: trigger article generation
    const category = body.data.custom_id.replace('generate_', '') as ContentCategory;
    // Respond immediately, process in background
    c.executionCtx?.waitUntil(
      triggerArticleFromWebhook(body.channel_id, category, c.env)
        .catch(e => traceLog('error', 'Webhook', 'Article trigger failed', { error: e.message }))
    );
    return c.json({ type: 5 }); // Deferred message update
  }

  return c.json({ ok: true });
});

// Custom webhook trigger (API key auth)
webhookRouter.post('/trigger', async (c) => {
  const apiKey = c.req.header('x-api-key');
  if (apiKey !== c.env.MCP_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{
    channelId?: string;
    category?: ContentCategory;
    format?: ContentFormat;
    topic?: string;
  }>();

  c.executionCtx?.waitUntil(
    runArticlePipeline(
      body.channelId ?? c.env.DISCORD_DEFAULT_CHANNEL_ID,
      'webhook',
      c.env,
      c.executionCtx,
      { category: body.category, format: body.format, topic: body.topic }
    )
  );

  return c.json({ ok: true, message: 'Article generation triggered' });
});

export { webhookRouter };
```

---

## PART 18 — [NEW] CONTENT CACHE & SMART DEDUP

### 18.1 Smart Deduplication

Sistem aktif mencegah artikel dengan topik yang terlalu mirip dipublish dalam window tertentu:

```typescript
// src/content/strategist/dedup-checker.ts

export class DedupChecker {
  private db: D1Client;

  constructor(env: Env) {
    this.db = new D1Client(env);
  }

  async isDuplicate(topic: string, windowDays = 14): Promise<{
    isDuplicate: boolean;
    similarTopics: string[];
    similarityScore: number;
  }> {
    const normalized = topic.toLowerCase().trim();

    // Exact + substring match
    const exactMatches = await this.db.query<{ topic: string; published_at: string }>(
      `SELECT topic, published_at FROM content_history
       WHERE published_at > datetime('now', '-' || ? || ' days')
         AND (topic_normalized LIKE '%' || ? || '%' OR ? LIKE '%' || topic_normalized || '%')
       ORDER BY published_at DESC LIMIT 5`,
      windowDays, normalized, normalized
    );

    if (exactMatches.length > 0) {
      return {
        isDuplicate: true,
        similarTopics: exactMatches.map(m => m.topic),
        similarityScore: 1.0,
      };
    }

    // Word-level fuzzy match
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return { isDuplicate: false, similarTopics: [], similarityScore: 0 };

    const recent = await this.db.query<{ topic: string; topic_normalized: string }>(
      `SELECT topic, topic_normalized FROM content_history
       WHERE published_at > datetime('now', '-' || ? || ' days')
       LIMIT 100`,
      windowDays
    );

    const fuzzyMatches = recent.filter(r => {
      const rWords = new Set(r.topic_normalized.split(/\s+/));
      const overlap = words.filter(w => rWords.has(w)).length;
      return overlap / Math.max(words.length, rWords.size) >= 0.7; // 70% overlap = duplicate
    });

    return {
      isDuplicate: fuzzyMatches.length > 0,
      similarTopics: fuzzyMatches.map(m => m.topic),
      similarityScore: fuzzyMatches.length > 0 ? 0.7 : 0,
    };
  }
}
```

### 18.2 External API Cache Strategy

| Source | TTL | Lokasi Cache |
|--------|-----|-------------|
| Jikan anime search | 1 jam | D1 content_cache |
| Jikan reviews | 2 jam | D1 content_cache |
| Jikan seasonal | 1 jam | D1 content_cache |
| AniList query | 1 jam | D1 content_cache |
| Web search | 30 menit | D1 content_cache |
| AI Vision result | Varies (per source) | KV |
| Query expansion | 24 jam | KV |
| Font binary | 24 jam | KV |

---

## PART 19 — FULL FILE STRUCTURE & AGENT ASSIGNMENT

### 19.1 Complete Directory Map

```
discord-ai-bot/
├── src/
│   ├── index.ts                              — Hono entry point
│   │
│   ├── types/
│   │   ├── env.ts                            — Env interface
│   │   ├── scheduler.ts                      — Task + Queue message types
│   │   └── discord.ts                        — Discord API types
│   │
│   ├── core/
│   │   ├── d1.ts                             — D1 database client
│   │   ├── d1-cache.ts                       — D1-backed cache
│   │   ├── errors.ts                         — AppError + ErrorCode
│   │   ├── safe-fetch.ts                     — fetch() wrapper + helpers
│   │   ├── trace-logger.ts                   — TraceId-aware structured logger
│   │   ├── budget-tracker.ts                 — Subrequest counter
│   │   └── health.ts                         — /health endpoint
│   │
│   ├── ai/
│   │   ├── model-router.ts                   — Auto-routing per task type
│   │   ├── model-routes.ts                   — Route definitions
│   │   ├── providers.ts                      — Provider pool + credentials
│   │   └── call-provider.ts                  — Per-provider call logic
│   │
│   ├── mcp/
│   │   ├── server.ts                         — MCP handler + middleware
│   │   ├── auth.ts                           — Secret auth
│   │   ├── rate-limiter.ts                   — 30 req/min per IP
│   │   ├── access-control.ts                 — Tool permission levels
│   │   ├── audit-log.ts                      — Audit logging to KV
│   │   └── tools/
│   │       ├── status-tools.ts               — status, health
│   │       ├── content-tools.ts              — generate-article, get-history
│   │       ├── task-tools.ts                 — task CRUD
│   │       ├── composio-tools.ts             — composio-* tools
│   │       └── admin-tools.ts                — ban, kick, provider-health, dlq
│   │
│   ├── cron/
│   │   └── handler.ts                        — Cron trigger → Queue enqueue
│   │
│   ├── queue/
│   │   ├── handler.ts                        — Queue consumer + retry logic
│   │   └── dead-letter.ts                    — DLQ handler + admin notify
│   │
│   ├── content/
│   │   ├── types/
│   │   │   ├── content.ts                    — Core content types
│   │   │   ├── research.ts                   — ResearchBundle types
│   │   │   └── media.ts                      — ImageCandidate, MediaPlan
│   │   │
│   │   ├── config/
│   │   │   ├── formats.ts                    — FORMAT_WEIGHTS
│   │   │   ├── categories.ts                 — CATEGORY_WEIGHTS
│   │   │   └── colors.ts                     — Category/format colors
│   │   │
│   │   ├── strategist/
│   │   │   ├── index.ts                      — ContentStrategist main
│   │   │   ├── topic-generator.ts            — Unique topic generation
│   │   │   ├── history-tracker.ts            — D1-backed history log
│   │   │   ├── weight-calculator.ts          — Format weight calculation
│   │   │   ├── dedup-checker.ts              — Smart deduplication
│   │   │   └── trending-detector.ts          — Optional trending signal
│   │   │
│   │   ├── research/
│   │   │   ├── index.ts                      — Research pipeline (engine registry)
│   │   │   ├── types.ts                      — ResearchEngine interface
│   │   │   ├── engines/
│   │   │   │   ├── review-engine.ts
│   │   │   │   ├── news-engine.ts
│   │   │   │   ├── recommend-engine.ts
│   │   │   │   ├── deep-dive-engine.ts
│   │   │   │   ├── season-engine.ts
│   │   │   │   ├── compare-engine.ts
│   │   │   │   ├── retrospective-engine.ts
│   │   │   │   ├── industry-engine.ts
│   │   │   │   ├── top-list-engine.ts
│   │   │   │   ├── discussion-engine.ts
│   │   │   │   ├── character-engine.ts       — [NEW] Character Spotlight
│   │   │   │   └── lore-engine.ts            — [NEW] Lore Explained
│   │   │   ├── sources/
│   │   │   │   ├── jikan-source.ts           — Jikan/MAL API
│   │   │   │   ├── anilist-source.ts         — AniList GraphQL
│   │   │   │   ├── web-source.ts             — WebScout / DDG search
│   │   │   │   └── reddit-source.ts          — Reddit scraper
│   │   │   └── media/
│   │   │       ├── index.ts                  — Media pipeline orchestrator
│   │   │       ├── query-expander.ts         — Semantic query clean-up
│   │   │       ├── image-searcher.ts         — Multi-source image search
│   │   │       ├── video-searcher.ts         — YouTube video search
│   │   │       ├── media-ranker.ts           — Two-dimensional scoring
│   │   │       └── vision-validator.ts       — AI Vision parallel top-3
│   │   │
│   │   ├── generator/
│   │   │   ├── index.ts                      — Generator orchestrator
│   │   │   ├── parser.ts                     — Parse AI response → Article
│   │   │   ├── auditor.ts                    — Quality audit + auto-fix
│   │   │   └── prompts/
│   │   │       ├── base-prompt.ts            — System prompt + base rules
│   │   │       ├── review-prompt.ts
│   │   │       ├── news-prompt.ts
│   │   │       ├── recommend-prompt.ts
│   │   │       ├── deep-dive-prompt.ts
│   │   │       ├── season-prompt.ts
│   │   │       ├── compare-prompt.ts
│   │   │       ├── retrospective-prompt.ts
│   │   │       ├── industry-prompt.ts
│   │   │       ├── top-list-prompt.ts
│   │   │       ├── discussion-prompt.ts
│   │   │       ├── character-prompt.ts       — [NEW]
│   │   │       └── lore-prompt.ts            — [NEW]
│   │   │
│   │   └── publish/
│   │       ├── index.ts                      — Publisher orchestrator
│   │       └── adapters/
│   │           ├── discord-adapter.ts        — Discord embed formatter
│   │           ├── web-adapter.ts            — HTML (future)
│   │           └── rss-adapter.ts            — RSS feed (future)
│   │
│   ├── agent/
│   │   ├── orchestrator.ts                   — Main pipeline: strategist→research→generate→publish
│   │   └── types.ts                          — PipelineResult, AgentContext
│   │
│   ├── analytics/
│   │   ├── routes.ts                         — Analytics HTTP endpoints
│   │   └── queries.ts                        — Reusable D1 analytics queries
│   │
│   ├── composio/
│   │   ├── index.ts
│   │   ├── types.ts                          — ComposioBridgePayload
│   │   ├── client.ts                         — REST API client (no SDK!)
│   │   ├── forwarder.ts                      — Distribution orchestrator
│   │   ├── content-formatter.ts              — Per-platform text formatting
│   │   └── adapters/
│   │       ├── twitter-adapter.ts
│   │       ├── instagram-adapter.ts
│   │       ├── linkedin-adapter.ts
│   │       ├── reddit-adapter.ts
│   │       └── telegram-adapter.ts
│   │
│   ├── compositor/
│   │   ├── index.ts
│   │   ├── image-compositor.ts              — 3-layer PNG rendering
│   │   ├── font-loader.ts                   — Google Fonts + KV cache
│   │   └── templates.ts                     — Per-platform templates
│   │
│   ├── plugins/
│   │   ├── types.ts                         — FormatPlugin, PlatformPlugin, SourcePlugin
│   │   ├── registry.ts                      — Plugin registration + lookup
│   │   └── built-in/                        — Built-in plugins (wrappers)
│   │
│   └── webhooks/
│       ├── router.ts                         — Hono webhook routes
│       └── verifiers/
│           ├── discord.ts                   — Discord signature verify
│           └── github.ts                    — GitHub webhook verify (future)
│
├── migrations/
│   └── 0001_initial.sql                     — Full D1 DDL
│
├── scripts/
│   ├── setup.sh                             — Full setup script (KV + D1 + secrets)
│   ├── pre-deploy-backup.sh                 — Backup before deploy
│   └── pre-deploy-audit.sh                  — Audit checklist runner
│
├── tests/
│   ├── unit/
│   │   ├── strategist.test.ts
│   │   ├── weight-calculator.test.ts
│   │   ├── dedup-checker.test.ts
│   │   ├── media-ranker.test.ts
│   │   └── auditor.test.ts
│   └── integration/
│       └── pipeline.test.ts
│
├── package.json
├── tsconfig.json
├── wrangler.jsonc
└── vitest.config.ts
```

### 19.2 Agent Assignment (Multi-Agent Paralel)

| Agent | Tanggung Jawab | Files | Est. |
|-------|----------------|-------|------|
| **Agent 0** (Foundation) | Project setup + D1 schema + core utilities + types | `migrations/`, `types/`, `core/`, `src/index.ts` | Day 0, 3h |
| **Agent 1** | AI Model Router + Provider Pool | `ai/*` | Day 1, 3h |
| **Agent 2** | Content Strategist + Dedup + History | `content/strategist/*`, `content/config/*` | Day 1, 4h |
| **Agent 3** | Research Engines (semua 12 format) | `content/research/engines/*`, `content/research/sources/*` | Day 1, 6h |
| **Agent 4** | Media Engine (Images + Video + Vision) | `content/research/media/*` | Day 1, 4h |
| **Agent 5** | Content Generator + Prompt System + Auditor | `content/generator/*` | Day 1, 5h |
| **Agent 6** | Discord Publisher + Adapter | `content/publish/*` | Day 1, 3h |
| **Agent 7** | MCP Server + Security + Tools | `mcp/*` | Day 2, 4h |
| **Agent 8** | Scheduler + Cron + Queue + DLQ | `cron/*`, `queue/*`, `services/*` | Day 2, 4h |
| **Agent 9** | Agent Orchestrator + Pipeline | `agent/*` | Day 2, 3h |
| **Agent 10** | Composio Distribution Layer | `composio/*` | Day 2, 4h |
| **Agent 11** | Image Compositor Engine | `compositor/*` | Day 2, 3h |
| **Agent 12** | Analytics + Webhook + Plugin System | `analytics/*`, `webhooks/*`, `plugins/*` | Day 3, 4h |

**Timeline:**
```
Day 0:  Agent 0 — Foundation (WAJIB selesai sebelum yang lain mulai)
Day 1:  Agent 1-6 PARALEL (dependency: Agent 0 selesai)
Day 2:  Agent 7-11 PARALEL (dependency: Agent 1-6 selesai)
Day 3:  Agent 12 + Integration Testing + Pre-deploy audit
Day 4:  Deploy ke production + monitoring 24 jam
```

### 19.3 Shared Contracts Antar Agent

```
Env interface           → semua agent
ContentBrief            → Strategist → Research → Generator → Publisher
ResearchBundle          → Research → Generator
Article                 → Generator → Publisher
FinalContent            → Publisher → Composio → Compositor
ImageCandidate          → MediaEngine → VisionValidator → Compositor
BudgetTracker           → semua pipeline steps
D1Client                → semua agent yang butuh storage
callAiWithRouter()      → Research, Generator, Strategist
```

---

## PART 20 — SETUP GUIDE & DEPLOYMENT

### 20.1 Setup Script: `scripts/setup.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Discord AI Bot v4.0 — Setup Script"
echo "======================================="

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Create KV namespace
echo "🗄️ Creating KV namespace..."
KV_ID=$(npx wrangler kv namespace create BOT_KV --json | jq -r '.id')
echo "   KV ID: $KV_ID"

# 3. Create D1 database
echo "🗄️ Creating D1 database..."
DB_INFO=$(npx wrangler d1 create discord-ai-bot-db --json)
DB_ID=$(echo $DB_INFO | jq -r '.uuid')
echo "   DB ID: $DB_ID"

# 4. Update wrangler.jsonc (manual step)
echo ""
echo "⚠️  MANUAL STEP: Update wrangler.jsonc with:"
echo "   KV ID: $KV_ID"
echo "   DB ID: $DB_ID"
echo ""
read -p "Press Enter after updating wrangler.jsonc..."

# 5. Apply migrations
echo "🔧 Applying D1 migrations..."
npx wrangler d1 migrations apply discord-ai-bot-db

# 6. Set required secrets
echo "🔐 Setting secrets..."
echo ""
echo "Discord Bot Token:"
npx wrangler secret put DISCORD_TOKEN

echo "Discord Client ID:"
npx wrangler secret put DISCORD_CLIENT_ID

echo "Discord Guild ID:"
npx wrangler secret put DISCORD_GUILD_ID

echo "Discord Default Channel ID:"
npx wrangler secret put DISCORD_DEFAULT_CHANNEL_ID

echo "MCP Secret (strong password):"
npx wrangler secret put MCP_SECRET

echo "OpenCode API Key:"
npx wrangler secret put OPENCODE_API_KEY

echo "NVIDIA API Key:"
npx wrangler secret put NVIDIA_API_KEY

echo "OpenRouter API Key:"
npx wrangler secret put OPENROUTER_API_KEY

echo "Puter API Key:"
npx wrangler secret put PUTER_API_KEY

echo ""
echo "Optional secrets (press Enter to skip):"
echo "Brave Search API Key (optional):"
read -r BRAVE_KEY
if [ -n "$BRAVE_KEY" ]; then
  echo "$BRAVE_KEY" | npx wrangler secret put BRAVE_SEARCH_API_KEY
fi

echo ""
echo "✅ Setup complete! Run 'npx wrangler dev' to test locally."
echo "   Deploy: npx wrangler deploy"
```

### 20.2 Pre-Deploy Checklist

```
📋 PRE-DEPLOY AUDIT — SEMUA HARUS HIJAU SEBELUM DEPLOY
════════════════════════════════════════════════════════

🔴 [ ] 1. TypeScript compile — 0 errors
         npx tsc --noEmit --strict

🔴 [ ] 2. Circular dependency check — 0 circular
         npx madge --circular src/

🟡 [ ] 3. Unit tests pass
         npx vitest run

🔴 [ ] 4. Subrequest budget check
         Confirm max subrequest per pipeline ≤ 35

🔴 [ ] 5. Security scan
         - Tidak ada API key/token hardcoded di code
         - Semua secrets via wrangler secrets
         - CORS headers correct
         - MCP_SECRET di-set

🔴 [ ] 6. D1 migration applied
         npx wrangler d1 migrations apply discord-ai-bot-db

🔴 [ ] 7. All env vars terdaftar di Env interface
         Match dengan wrangler.jsonc vars

🔴 [ ] 8. Setiap fetch() punya AbortSignal.timeout()

🔴 [ ] 9. Setiap AI call punya fallback ke cf-70b

🟢 [ ] 10. TraceId di semua critical log paths

🟡 [ ] 11. Health endpoint berfungsi
          curl https://<worker>.workers.dev/health

🟡 [ ] 12. Analytics endpoint berfungsi
          curl https://<worker>.workers.dev/analytics/overview

════════════════════════════════════════════════════════
✅ SEMUA HIJAU → npx wrangler deploy
❌ ADA MERAH   → FIX DULU, JANGAN DEPLOY
```

### 20.3 Deployment Steps

```bash
# 1. Backup (wajib)
bash scripts/pre-deploy-backup.sh

# 2. Type check
npx tsc --noEmit --strict

# 3. Tests
npx vitest run

# 4. Apply migrations (kalau ada yang baru)
npx wrangler d1 migrations apply discord-ai-bot-db

# 5. Deploy
npx wrangler deploy

# 6. Verify
curl https://<worker>.workers.dev/health
curl https://<worker>.workers.dev/analytics/overview?days=1
```

### 20.4 Rollback Plan

```bash
# Option 1: Git rollback
git tag "predeploy-$(date +%Y%m%d_%H%M%S)"
# Setelah masalah terdeteksi:
git checkout predeploy-<TIMESTAMP>
npx wrangler deploy

# Option 2: Cloudflare Dashboard
# Workers → discord-ai-bot → Deployments → Rollback ke versi sebelumnya
```

---

## APPENDIX A — Fitur Tambahan yang Direkomendasikan

Fitur-fitur ini **belum ada** di sistem lama tapi berguna dan mudah diintegrasikan:

| Fitur | Deskripsi | Effort | Priority |
|-------|-----------|--------|----------|
| **Character Spotlight** | Format baru fokus satu karakter | Low | 🟡 HIGH |
| **Lore Explained** | Format baru breakdown sistem/dunia | Low | 🟡 HIGH |
| **Smart Dedup** | Fuzzy match untuk cegah topik mirip | Low | 🔴 CRITICAL |
| **Plugin System** | Tambah format/platform tanpa ubah core | Medium | 🟢 MEDIUM |
| **Webhook Listener** | Discord button interaction + custom trigger | Medium | 🟢 MEDIUM |
| **Engagement Tracking** | Update reactions/comments ke D1 via webhook | Medium | 🟢 MEDIUM |
| **Distribution Log** | D1 table untuk track hasil distribusi Composio | Low | 🟡 HIGH |
| **Analytics Dashboard API** | REST endpoints untuk monitoring | Medium | 🟢 MEDIUM |
| **DLQ Admin Notify** | Notif Discord jika ada task yang masuk DLQ | Low | 🟡 HIGH |
| **Provider Latency Tracking** | avg_latency_ms di provider_health | Low | 🟢 MEDIUM |
| **Content Word Count** | Track jumlah kata per artikel | Low | 🟢 MEDIUM |
| **Multi-timezone Cron** | Task per timezone berbeda | Medium | 🟢 MEDIUM |

## APPENDIX B — Content Format Quick Reference

| Format | Hook Style | Tone | Ending |
|--------|-----------|------|--------|
| `review` | Pertanyaan / curiosity | Analitis, multi-sumber | Reveal konsensus |
| `recommendation` | "Lo pasti pernah ngerasa..." | Antusias, personal | CTA nonton/baca |
| `breaking-news` | Fakta besar langsung | Cepat, to the point | Reaksi komunitas |
| `deep-dive` | Klaim provocatif | Thoughtful, naratif | Insight/implikasi |
| `season-preview` | Hype building | Energik, anticipatif | Final picks |
| `comparison` | Setup dua kubu | Fair, analitis | Verdict |
| `discussion` | Opini kontroversial | Opinionated | Ajak diskusi |
| `character-spotlight` | Fakta mengejutkan soal karakter | Personal, emosional | Character legacy |
| `lore-explained` | "Ada yang notice..." / teori | Inquisitif, detail | Implikasi lore |

**SEMUA format:**
- ❌ JANGAN mulai dengan "Halo", "Pada artikel ini", "Selamat datang"
- ❌ JANGAN tutup dengan "Kesimpulan", "Sekian", "Terima kasih"
- ✅ Mulai dengan hook langsung yang memancing penasaran
- ✅ Gaya santai: gue-lo ATAU aku-kamu (konsisten)
- ✅ Ending natural — tidak perlu formal closing

## APPENDIX C — Key Design Decisions

| Keputusan | Alasan |
|-----------|--------|
| Hono.js sebagai framework | Lightweight, TypeScript-first, Workers-compatible, bukan Express |
| D1 bukan KV untuk persistence | SQL queries, atomic UPDATE, no race condition, analytics queryable |
| Dynamic import untuk research engines | Tree-shaking friendly, hanya load engine yang dibutuhkan |
| `ctx.waitUntil()` untuk Composio | Discord publish tidak terpengaruh distribusi sosmed yang lambat |
| Tidak install @composio/core SDK | Bundle 4.7MB — terlalu besar untuk Workers. REST API via fetch() cukup |
| AI Vision top-3 paralel | 3 paralel lebih baik daripada sequential try-reject-try |
| D1Cache + KVCache strategi berbeda | D1 untuk data queryable (cache by source), KV untuk binary/transient |
| Plugin system via interface | Tambah format baru = tambah 1 file, tidak ubah core |
| TraceId per pipeline | Debug mudah: satu trace_id lacak dari trigger hingga publish |
| `noUncheckedIndexedAccess` di tsconfig | Array access selalu type-safe |

---

> **Document Version:** 4.0 — Greenfield Build Plan  
> **Date:** 25 Juni 2026  
> **Status:** READY FOR EXECUTION  
> **Previous Version:** 3.0 (revision-based) → 4.0 (build from scratch)  
>
> *"Dibangun dari nol dengan arsitektur yang bersih — mudah dikembangkan, mudah dipahami, mudah di-scale."*
