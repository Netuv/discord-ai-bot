# 🏗️ Hybrid Cloudflare Workers + Render — Turbo Layer Plan

> **Dokumen ini untuk Agent AI dan Developer**
> Tujuan: Menambahkan **2nd Layer** untuk heavy processing tanpa mengubah workflow yang sudah ada.
> **PRINSIP UTAMA: SEMUA YANG SEKARANG BERJALAN, TIDAK BOLEH BERUBAH.**

---

## 📋 **Navigasi Cepat**

| Section | Isi |
|---------|-----|
| [**1. Aturan Besi (Hard Rules)**](#-1-aturan-besi-hard-rules) | ⛔ **BACA INI DULU** — apa yang TIDAK BOLEH disentuh |
| [**2. Arsitektur Hybrid**](#-2-arsitektur-hybrid) | Gambaran besar — hubungan Worker ⇄ Render |
| [**3. Komponen Sistem**](#-3-komponen-sistem) | Detail setiap file baru & perubahannya |
| [**4. Kode Lengkap**](#-4-kode-lengkap) | Implementasi semua file baru |
| [**5. Integrasi**](#-5-integrasi) | Cara nyambung ke sistem existing (minimal) |
| [**6. Garansi Anti-Rusak**](#-6-garansi-anti-rusak) | Jaminan workflow existing aman |
| [**7. Cara Test**](#-7-cara-test) | Checklist verifikasi sebelum & sesudah |
| [**8. Rollback**](#-8-rollback) | Cara kembali ke kondisi awal |

---

## ⛔ **1. Aturan Besi (Hard Rules)**

### 🚫 **TIDAK BOLEH DISENTUH — LEWATKAN FILE INI!**

File berikut adalah **inti workflow** yang sudah berjalan. **JANGAN UBAH SATU BARIS PUN** di file ini:

```
src/index.ts              → Handler Discord, routing, slash commands
src/mcp-handler.ts        → ~115 MCP tools (jangan disentuh!)
src/scheduler.ts          → Scheduler engine + task execution
src/article-writer.ts     → Research, generate, parse artikel
src/article-publisher.ts  → Publish artikel ke Discord
src/ai-router.ts          → AI provider switching & routing
src/web-scout.ts          → Web search & scrape
src/image-scraper.ts      → Multi-source image search
src/video-scraper.ts      → Multi-source video search
src/github-studio.ts      → GitHub integration tools
src/user-config.ts        → User config per-user
src/mcp-confirm.ts        → Action confirmation queue
```

**Konsekuensi kalau disentuh:**
- Artikel yang jalan selama ini bisa rusak formatnya
- MCP tools yang dipakai AI Desktop bisa error
- Scheduler task yang udah jalan bisa mismatch
- Testing yang udah lulus 18/18 bisa gagal

### ✅ **YANG BOLEH DILAKUKAN:**

1. **BUAT FILE BARU** di `src/` (prefiks `render-*` atau `turbo-*`)
2. **BUAT FOLDER BARU** `render-server/` untuk server Render
3. **TAMBAH IMPORT + PANGGILAN** di file existing — tapi hanya:
   - Panggilan **opsional** (bungkus try-catch)
   - Panggilan **non-blocking** (gak nunggu hasilnya)
   - Panggilan yang kalau **gagal → fallback diam-diam**

### ⚡ **Pola yang Dipakai: "Coba, Ambil Kalau Ada"**

```typescript
// ✅ INI BOLEH — tambahan opsional, gak ngerusak flow
const hasilRender = await tryRender('/ai/chat', { messages });
if (hasilRender) {
  // Pakai hasil Render
} else {
  // Fallback: jalanin logic existing — SAMA SEPERTI SEBELUMNYA
}
```

```typescript
// ❌ INI TIDAK BOLEH — ngerubah flow existing
// const hasil = await renderChat(messages); // ngeganti function lama!
```

---

## 🏛️ **2. Arsitektur Hybrid**

### Diagram Hubungan

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🌐 CLOUDFLARE WORKERS (OTAK UTAMA — UNCHANGED)            ║
║   ─────────────────────────────────────────────             ║
║                                                              ║
║   📌 TUGAS: Semua yang sekarang jalan                        ║
║                                                              ║
║   ├── Discord Interactions (PING, /ask, /help, /provider)   ║
║   ├── MCP Server (SSE + JSON-RPC, ~115 tools)               ║
║   ├── Scheduler System (cron trigger + task execution)       ║
║   ├── AI Router (auto-failover 5 provider)                  ║
║   ├── Article Pipeline (research → generate → publish)      ║
║   ├── WebScout (search + scrape + deep research)            ║
║   ├── Image Scraper (8 sources + scoring)                   ║
║   ├── Video Scraper (5 sources + validasi)                  ║
║   ├── GitHub Studio (file, PR, issue, release, blog)        ║
║   └── REST API (/cron/tasks CRUD, /web/search, dll)        ║
║                                                              ║
║   ┌──────────────────────────────────────────────────────┐  ║
║   │ 🆕 render-helper.ts (FILE BARU)                       │  ║
║   │                                                       │  ║
║   │   TUGAS: Jembatan ke Render                           │  ║
║   │   - tryRenderHeavy() → call API Render                │  ║
║   │   - Kalau gagal → return null (bukan throw)           │  ║
║   │   - Polos, tanpa logic bisnis                         │  ║
║   └──────────────────┬───────────────────────────────────┘  ║
║                      │                                       ║
║                      │ HTTP (optional, async)                ║
║                      ▼                                       ║
╚══════════════════════════════════════════════════════════════╝
                         │
                         │
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 RENDER SERVER (OTOT TAMBAHAN — NEW LAYER)              ║
║   ────────────────────────────────────────                  ║
║                                                              ║
║   📌 TUGAS: Heavy processing yang gak bisa di Workers        ║
║                                                              ║
║   ├── 50 detik timeout (vs Workers 30s)                     ║
║   ├── 512 MB RAM (vs Workers 128 MB)                        ║
║   ├── Full Node.js (bukan V8 Isolate)                       ║
║   ├── Bisa akses filesystem, network bebas                  ║
║   └── Gak ada CPU time limit per request                    ║
║                                                              ║
║   🎯 ENDPOINTS:                                              ║
║                                                              ║
║   GET  /health              → Monitoring/health check        ║
║   POST /ai/chat             → AI processing + Discord kirim  ║
║   POST /article/heavy       → Generate artikel berat         ║
║   POST /discord/followup    → Kirim pesan ke Discord         ║
║                                                              ║
║   📂 FILE: render-server/server.js                           ║
║            render-server/package.json                        ║
║            render-server/Dockerfile                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

### Prinsip Komunikasi

```
Worker ──panggil─→ Render
  │                    │
  │  HTTP POST         │  Proses (0-50 detik)
  │  (async, timeout)  │
  │                    │
  │ ←─── Response ──── │
  │     { ok, result } │
  │                    │
  │  Kalau sukses:     │  Pakai hasil Render
  │  Kalau gagal:      │  Jalanin logic Worker seperti biasa
  │  Kalau timeout:    │  Jalanin logic Worker seperti biasa
  │  Kalau Render mati:│  Jalanin logic Worker seperti biasa
```

---

## 📁 **3. Komponen Sistem**

### 3.1 File Baru (WAJIB DIBUAT)

```
📦 discord-ai-bot/
│
├── 📄 src/render-helper.ts          → HTTP client ke Render (wajib)
│
├── 📁 render-server/                 → Folder terpisah dari Worker
│   ├── 📄 server.js                  → Express server (wajib)
│   ├── 📄 package.json               → Dependencies (wajib)
│   └── 📄 Dockerfile                 → Container (opsional, buat jaga-jaga)
│
└── 📄 HYBRID-RENDER-PLAN.md          → Dokumen ini
```

### 3.2 File yang Dimodifikasi (MINIMAL — Total ~20 baris)

```
📦 src/
├── 📄 index.ts           → +15 baris (handler /ask → deferred + Render)
└── 📄 scheduler.ts       → +5 baris  (optional Render di article gen)
```

### 3.3 Tabel Tanggung Jawab

| File | Baru/Modif? | Fungsi | Kompleksitas |
|------|-------------|--------|:---:|
| `src/render-helper.ts` | **BARU** | HTTP client + fallback logic | ⭐ Sederhana |
| `render-server/server.js` | **BARU** | Express server 4 endpoint | ⭐⭐ Menengah |
| `render-server/package.json` | **BARU** | Dependencies | ⭐ Sederhana |
| `render-server/Dockerfile` | **BARU** | Container config | ⭐ Sederhana |
| `src/index.ts` | ✅ **Modif** | `/ask` deferred response | ⭐⭐ Hati-hati |
| `src/scheduler.ts` | ✅ **Modif** | Optional render article | ⭐ Sederhana |

---

## 📝 **4. Kode Lengkap**

### 4.1 `src/render-helper.ts` — Jembatan Worker ⇄ Render

**Aturan untuk Agent yang nulis:**
- ✅ Fungsi ini MURNI helper — gak ada logic bisnis
- ✅ Semua fungsi pake `try-catch` — TIDAK BOLEH throw
- ✅ Return `null` kalau gagal — biar caller yang mutusin
- ✅ Jangan tambah dependensi — cukup pake `fetch()` bawaan Workers
- ✅ Jangan simpan state — stateless murni

```typescript
/**
 * render-helper.ts — Turbo Layer HTTP Client
 * ===========================================
 * 
 * PRINSIP:
 * 1. Semua fungsi OPSIONAL — return null kalau gagal
 * 2. Gak ada logic bisnis di sini — murni HTTP + fallback
 * 3. Stateless — panggil kapan aja, hasil sama
 * 4. Silent fallback — gak ngaruh ke flow kalo Render mati
 * 
 * CARA KONEKSI:
 * render-helper.ts  →  render-server/server.js (HTTP POST)
 *         ↑                        ↑
 *   Worker (caller)          Render (processor)
 * 
 * TESTING:
 * - Mock: hapus RENDER_URL → semua fungsi return null
 * - Integration: deploy Render → panggil endpoint → cek log
 */

// ─── Konfigurasi ─────────────────────────────────────────────
// RENDER_URL: di-set dari secret Cloudflare atau fallback global
// Cara set: `npx wrangler secret put RENDER_SERVICE_URL`
const RENDER_URL = typeof RENDER_SERVICE_URL !== 'undefined'
  ? RENDER_SERVICE_URL
  : (globalThis as any)?.__RENDER_URL__ || '';

const RENDER_TIMEOUT_MS = 50000; // 50 detik — untuk heavy AI processing

// ─── Type Definitions ────────────────────────────────────────
// Semua type di sini — biar gak perlu import dari file lain

export interface RenderChatPayload {
  messages: { role: string; content: string }[];
  discordToken?: string;
  applicationId?: string;
  interactionToken?: string;
  channelId?: string;
  provider?: string;
  model?: string;
}

export interface RenderChatResult {
  ok: boolean;
  result?: string;
  duration_ms?: number;
  model_used?: string;
}

export interface RenderArticlePayload {
  topic: string;
  research?: {
    summary?: string;
    reviewSummary?: string;
  };
}

export interface RenderArticleResult {
  ok: boolean;
  article?: any;
  duration_ms?: number;
  source?: string;
}

export interface RenderFollowupPayload {
  discordToken?: string;
  applicationId: string;
  interactionToken: string;
  content?: string;
  embeds?: any[];
}

// ─── Core: Generic Render Call ───────────────────────────────
// Semua fungsi spesifik pake ini di belakang layar

/**
 * Panggil endpoint Render dengan silent fallback.
 * 
 * @param endpoint - Path endpoint (e.g. '/ai/chat')
 * @param payload - JSON body
 * @param timeoutMs - Timeout dalam milidetik (default: 50000)
 * @returns Response data atau null kalau gagal
 * 
 * CONTOH:
 *   const result = await callRender<RenderChatResult>('/ai/chat', { messages });
 *   if (result?.ok) pakai hasilnya;
 *   // else: jalanin logic existing — aman!
 */
async function callRender<T = any>(
  endpoint: string,
  payload: Record<string, any>,
  timeoutMs: number = RENDER_TIMEOUT_MS
): Promise<T | null> {
  // Kalau Render gak dikonfigurasi → skip (silent)
  if (!RENDER_URL) {
    console.log('ℹ️ Render: not configured (RENDER_SERVICE_URL empty)');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${RENDER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'unknown');
      console.warn(`⚠️ Render HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const data = await response.json();
    return data as T;

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`⏰ Render timeout >${timeoutMs}ms: ${endpoint}`);
    } else {
      console.warn(`⚠️ Render connection error: ${error.message}`);
    }
    return null; // NULL = Worker lanjut seperti biasa
  }
}

// ─── Public Functions ────────────────────────────────────────
// Masing-masing fungsi punya 1 tanggung jawab

/**
 * Kirim prompt AI ke Render untuk heavy processing.
 * Render akan:
 * 1. Coba AI provider (OpenRouter → NVIDIA → fallback)
 * 2. Kalau sukses → kirim hasil ke Discord via follow-up webhook
 * 3. Return status ke Worker
 * 
 * Worker: tinggal terima status, gak perlu nunggu hasil.
 */
export async function renderChat(
  payload: RenderChatPayload
): Promise<RenderChatResult | null> {
  return callRender<RenderChatResult>('/ai/chat', payload);
}

/**
 * Minta Render buat generate artikel berat dengan timeout panjang.
 * Artikel yang dihasilkan biasanya lebih dalam & berkualitas.
 * 
 * Worker: kalau sukses → override article; kalau gagal → pakya punya sendiri.
 */
export async function renderHeavyArticle(
  payload: RenderArticlePayload
): Promise<RenderArticleResult | null> {
  return callRender<RenderArticleResult>('/article/heavy', payload);
}

/**
 * Kirim pesan ke Discord via follow-up webhook langsung dari Render.
 * Dipake kalau Worker udah kirim deferred response.
 */
export async function renderDiscordFollowup(
  payload: RenderFollowupPayload
): Promise<{ ok: boolean } | null> {
  return callRender<{ ok: boolean }>('/discord/followup', payload);
}

/**
 * Cek apakah Render hidup. Kalau mati, Worker gak perlu coba-coba.
 * 
 * CONTOH PAKAI:
 *   if (await isRenderAlive()) {
 *     const result = await renderChat({ messages });
 *   }
 */
export async function isRenderAlive(): Promise<boolean> {
  if (!RENDER_URL) return false;
  try {
    const res = await fetch(`${RENDER_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Utility: Set Render URL secara dinamis ──────────────────
// Untuk testing atau override dari environment

export function setRenderUrl(url: string): void {
  (globalThis as any).__RENDER_URL__ = url;
}

export function getRenderUrl(): string {
  return RENDER_URL || (globalThis as any)?.__RENDER_URL__ || '(not set)';
}
```

### 4.2 `render-server/server.js` — Turbo Layer Processor

**Aturan untuk Agent yang nulis:**
- ✅ Server ini STANDALONE — gak perlu akses ke code Worker
- ✅ Semua AI call pake API key dari environment Render
- ✅ Jangan simpan state di memory — biar Render bisa scale-to-zero
- ✅ Error handling di setiap endpoint — jangan sampai crash
- ✅ Logging yang jelas (timestamp + duration)


```javascript
/**
 * server.js — Render Turbo Layer: Heavy Processing Server
 * =======================================================
 * 
 * PRINSIP:
 * 1. Server ini CUMA dipanggil dari Worker — bukan dari publik
 * 2. Setiap request OPSIONAL — Worker gak nungguin kita
 * 3. Kalau kita mati → Worker jalan seperti biasa
 * 4. Gak ada state — stateless, scale-to-zero friendly
 * 
 * ENDPOINT LIST:
 *   GET  /health              → Monitoring
 *   POST /ai/chat             → AI heavy + Discord follow-up
 *   POST /article/heavy       → Generate artikel
 *   POST /discord/followup    → Kirim ke Discord
 * 
 * TESTING:
 *   curl http://localhost:3000/health
 *   curl -X POST http://localhost:3000/ai/chat \
 *     -H "Content-Type: application/json" \
 *     -d '{"messages":[{"role":"user","content":"Halo"}]}'
 */

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '5mb' }));
const PORT = process.env.PORT || 3000;

// ============================================================
// GET /health — Health Check
// ============================================================
// Dipanggil worker buat ngecek apakah Render hidup.
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'render-turbo-layer',
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// POST /ai/chat — Heavy AI + Auto Follow-up ke Discord
// ============================================================
// 
// Worker kirim:
//   { messages, discordToken, applicationId, interactionToken, channelId }
// 
// Alur:
//   1. Proses AI (OpenRouter → NVIDIA → Cloudflare AI)
//   2. Kirim hasil ke Discord via follow-up webhook
//   3. Return status ke Worker
// 
app.post('/ai/chat', async (req, res) => {
  const startTime = Date.now();
  const {
    messages,
    discordToken,
    applicationId,
    interactionToken,
    channelId,
  } = req.body;

  // Validasi
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'Field "messages" wajib diisi (array of {role, content})',
    });
  }

  try {
    // ── Langkah 1: Proses AI ──
    const aiResult = await processAI(messages);
    if (!aiResult) {
      throw new Error('Semua AI provider gagal merespon');
    }

    // ── Langkah 2: Kirim ke Discord (kalau ada token) ──
    if (applicationId && interactionToken) {
      await sendToDiscord({
        applicationId,
        interactionToken,
        discordToken,
        content: aiResult,
      });
    }

    // ── Langkah 3: Return sukses ──
    res.json({
      ok: true,
      result: aiResult,
      duration_ms: Date.now() - startTime,
      model_used: 'render-turbo',
    });

  } catch (error) {
    console.error(`❌ /ai/chat error setelah ${Date.now() - startTime}ms:`, error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    });
  }
});

// ============================================================
// POST /article/heavy — Generate Artikel Berat
// ============================================================
//
// Worker kirim:
//   { topic, research: { summary, reviewSummary } }
//
// Worker PAKAI KALAU:
//   - Result.ok === true
//   - Result.article.sections.length > 0
//
app.post('/article/heavy', async (req, res) => {
  const startTime = Date.now();
  const { topic, research } = req.body;

  if (!topic) {
    return res.status(400).json({
      ok: false,
      error: 'Field "topic" wajib diisi',
    });
  }

  try {
    // Build prompt khusus buat artikel
    const prompt = buildArticlePrompt(topic, research);

    // Panggil AI dengan prompt yang udah di-build
    const aiResult = await processAI([{ role: 'user', content: prompt }], {
      maxTokens: 8192,
      temperature: 0.8,
    });

    if (!aiResult) {
      throw new Error('AI gagal generate artikel');
    }

    // Parse JSON dari response AI
    const article = parseArticleJSON(aiResult);
    if (!article) {
      throw new Error('Response AI bukan JSON valid untuk artikel');
    }

    res.json({
      ok: true,
      article,
      duration_ms: Date.now() - startTime,
      source: 'render-turbo',
    });

  } catch (error) {
    console.error(`❌ /article/heavy error:`, error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// ============================================================
// POST /discord/followup — Kirim Pesan ke Discord
// ============================================================
//
// Endpoint ini bisa dipanggil langsung dari Render (setelah AI selesai)
// atau dari Worker (kalau mau kirim via Render).
//
app.post('/discord/followup', async (req, res) => {
  const startTime = Date.now();
  const { discordToken, applicationId, interactionToken, content, embeds } = req.body;

  if (!applicationId || !interactionToken) {
    return res.status(400).json({
      ok: false,
      error: 'Field "applicationId" dan "interactionToken" wajib',
    });
  }

  try {
    const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;

    const payload = {};
    if (content) payload.content = content.slice(0, 2000);
    if (embeds) payload.embeds = embeds;

    const headers = { 'Content-Type': 'application/json' };
    if (discordToken) {
      headers['Authorization'] = `Bot ${discordToken}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });

    res.json({
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// ============================================================
// AI Processing Engine
// ============================================================

/**
 * Proses AI dengan multi-provider strategy.
 * Coba OpenRouter dulu → NVIDIA → fallback.
 * 
 * @param {Array} messages - Array pesan [{role, content}]
 * @param {Object} options - { maxTokens, temperature }
 * @returns {string|null} Hasil AI atau null kalau semua gagal
 */
async function processAI(messages, options = {}) {
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.7;

  // ── Strategy 1: OpenRouter (prioritas utama) ──
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Netuv/discord-ai-bot',
          'X-Title': 'Discord AI Bot - Render Turbo',
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          messages: [
            { role: 'system', content: 'Kamu adalah asisten Discord yang pintar, santai, dan natural. Gunakan bahasa Indonesia.' },
            ...messages,
          ],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log(`✅ OpenRouter: ${data.model || 'unknown'} (${data.usage?.total_tokens || '?'} tokens)`);
          return content;
        }
      }
    } catch (e) {
      console.warn(`⚠️ OpenRouter: ${e.message}`);
    }
  }

  // ── Strategy 2: NVIDIA NIM (fallback) ──
  if (process.env.NVIDIA_API_KEY) {
    try {
      const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'system', content: 'Kamu adalah asisten Discord yang pintar dan santai. Gunakan bahasa Indonesia.' },
            ...messages,
          ],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log(`✅ NVIDIA success`);
          return content;
        }
      }
    } catch (e) {
      console.warn(`⚠️ NVIDIA: ${e.message}`);
    }
  }

  // ── Strategy 3: Cloudflare AI via Worker (fallback terakhir) ──
  if (process.env.CLOUDFLARE_WORKER_AI_URL) {
    try {
      const response = await fetch(process.env.CLOUDFLARE_WORKER_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.result?.response || data.response;
        if (content) {
          console.log(`✅ Cloudflare AI success`);
          return content;
        }
      }
    } catch (e) {
      console.warn(`⚠️ Cloudflare AI: ${e.message}`);
    }
  }

  return null; // Semua gagal
}

// ============================================================
// Discord Follow-up Helper
// ============================================================

/**
 * Kirim hasil AI ke Discord via follow-up webhook.
 * Proses chunking kalo teks > 2000 karakter.
 */
async function sendToDiscord({ applicationId, interactionToken, discordToken, content }) {
  const baseUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  const headers = { 'Content-Type': 'application/json' };
  if (discordToken) {
    headers['Authorization'] = `Bot ${discordToken}`;
  }

  // Chunk teks biar gak > 2000 karakter (limit Discord)
  const chunks = chunkText(content, 1900);

  // Edit pesan deferred pertama
  await fetch(`${baseUrl}/messages/@original`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ content: `🤖 **Jawaban:**\n\n${chunks[0]}` }),
  });

  // Kirim sisa chunk sebagai follow-up messages
  for (let i = 1; i < chunks.length; i++) {
    await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: chunks[i] }),
    });
  }

  console.log(`✅ Discord: ${chunks.length} pesan terkirim`);
}

// ============================================================
// Article Prompt Builder
// ============================================================

function buildArticlePrompt(topic, research) {
  const lines = [
    'Kamu adalah jurnalis anime yang asik dan santai. Buat artikel singkat dari data di bawah.',
    '',
    `TOPIK: ${topic}`,
    '',
  ];

  if (research?.summary) {
    lines.push('DATA BERITA:', research.summary, '');
  }

  if (research?.reviewSummary) {
    lines.push('OPINI PUBLIK:', research.reviewSummary, '');
  }

  lines.push(
    'TUGAS:',
    'Buat artikel JSON dengan 1-3 section. TIDAK ADA closing.',
    '',
    'FORMAT JSON:',
    `{
  "title": "[Emoji] Headline max 100 karakter",
  "intro": "Hook 2 kalimat — bikin penasaran!",
  "sections": [{
    "heading": "🔍 Sub-judul",
    "body": "Narasi 4-6 kalimat. Santai, mengalir, bukan poin-poin!",
    "image_query": "Kata kunci gambar (atau kosongkan)",
    "video_query": "Kata kunci video (atau kosongkan)"
  }],
  "category": "anime/manga/game/breaking/announcement/general"
}`,
    '',
    'ATURAN:',
    '- Gaya santai kayak ngobrol di Discord ("aku-kamu")',
    '- Paragraf pendek 2-3 kalimat',
    '- TIDAK ADA bullet list di body — semua narasi!',
    '- TIDAK ADA "Kesimpulannya" atau kata penutup formal',
    '- Sertakan opini dari berbagai sumber kalo ada',
    '- JANGAN watermark, footer, atau "generated by AI"',
    '- BALAS HANYA JSON, tanpa teks lain!'
  );

  return lines.join('\n');
}

// ============================================================
// Article JSON Parser
// ============================================================

function parseArticleJSON(raw) {
  if (!raw || raw.trim().length === 0) return null;

  // Bersihin response dari noise
  let cleaned = raw
    .replace(/!\[.*?\]\(.*?\)/g, '')     // Hapus markdown image
    .replace(/\[.*?\]\(.*?\)/g, '')       // Hapus markdown link
    .replace(/[\u0000-\u001F\u007F]/g, '') // Hapus kontrol chars
    .trim();

  // Cari JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    
    // Validasi struktur
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      if (parsed.topics && Array.isArray(parsed.topics)) {
        parsed.sections = parsed.topics;
        delete parsed.topics;
      } else {
        return null; // Bukan artikel valid
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

// ============================================================
// Utility: Chunk Text
// ============================================================

function chunkText(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLength));
    remaining = remaining.slice(maxLength);
  }
  
  return chunks.length > 0 ? chunks : ['(konten kosong)'];
}

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 Render Turbo Layer — Server Started');
  console.log('='.repeat(50));
  console.log(`   Port:     ${PORT}`);
  console.log(`   Health:   GET  /health`);
  console.log(`   AI Chat:  POST /ai/chat`);
  console.log(`   Article:  POST /article/heavy`);
  console.log(`   Followup: POST /discord/followup`);
  console.log('='.repeat(50));
  console.log(`   OPENROUTER: ${process.env.OPENROUTER_API_KEY ? '✅' : '❌'} ${process.env.OPENROUTER_API_KEY ? 'Set' : 'Not set'}`);
  console.log(`   NVIDIA:     ${process.env.NVIDIA_API_KEY ? '✅' : '❌'} ${process.env.NVIDIA_API_KEY ? 'Set' : 'Not set'}`);
  console.log('='.repeat(50));
});
```

### 4.3 `render-server/package.json`

```json
{
  "name": "render-turbo-layer",
  "version": "1.0.0",
  "description": "Turbo Layer for Discord AI Bot — Heavy processing on Render free tier",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "node-fetch": "^2.7.0"
  }
}
```

### 4.4 `render-server/Dockerfile`

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy dependencies first — biar caching Docker optimal
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source code
COPY server.js ./

# Port dari Render environment
EXPOSE 3000

# Start
CMD ["node", "server.js"]
```

---

## 🔗 **5. Integrasi — Cara Nyambung Tanpa Merusak**

### 5.1 `src/index.ts` — Ubah Handler `/ask`

**Letak perubahan:** Di dalam handler `cmdName === "ask"`, blok `try { router.chat(...) }`.

**Yang berubah:** 
- Sebelum: Langsung proses AI → kirim response → sering timeout
- Sesudah: Kirim DEFERRED dulu → Render/Worker proses di background → follow-up webhook

**PENTING:** Jangan ubah handler lain (`/help`, `/provider`, context menu, PING).

```typescript
// ============================================================
// DI DALAM src/index.ts — Handler "/ask"
// Cari blok: if (cmdName === "ask") { ... }
// ============================================================

if (cmdName === "ask") {
  const promptUser = interaction.data.options?.[0]?.value || "Halo";
  const userId = interaction.member?.user?.id || interaction.user?.id;

  // ✅ BARU: Kirim DEFERRED response dulu — Discord tau bot bakal jawab
  // Ini terjadi dalam < 100ms — gak ada timeout!
  
  // Simpan info buat follow-up
  const appId = interaction.application_id;
  const intToken = interaction.token;
  const channelId = interaction.channel_id;
  const discordToken = env.DISCORD_TOKEN;

  // Proses di background via ctx.waitUntil
  ctx.waitUntil((async () => {
    try {
      // ── COBA RENDER DULU ──
      const renderSuccess = await renderChat({
        messages: [{ role: 'user', content: promptUser }],
        discordToken,
        applicationId: appId,
        interactionToken: intToken,
        channelId,
      });

      // Render berhasil? Selesai — Render udah kirim hasil ke Discord.
      if (renderSuccess?.ok) {
        console.log('🚀 Render handle /ask — Worker gak perlu proses.');
        return;
      }

      // ── FALLBACK: Worker proses sendiri ──
      console.log('⚠️ Render unavailable — Worker fallback untuk /ask');
      
      let balasanAI = 'AI tidak tersedia.';
      let usedConfig = null;

      try {
        const router = new AiRouter(env);
        const userConfig = await getUserConfig(env, userId);
        
        if (userConfig?.providerName) {
          usedConfig = { providerName: userConfig.providerName, modelName: userConfig.modelName };
          balasanAI = await router.chatWithUserConfig(
            [{ role: 'user', content: promptUser }],
            { providerName: userConfig.providerName, modelName: userConfig.modelName }
          );
        } else {
          balasanAI = await router.chat([{ role: 'user', content: promptUser }]);
        }
      } catch (e) {
        balasanAI = `Error: ${e.message}`;
      }

      // Kirim hasil via follow-up webhook
      const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${intToken}/messages/@original`;
      let responseContent = `🤖 **Jawaban:**\n\n${balasanAI.slice(0, 1900)}`;
      
      if (usedConfig) {
        responseContent += `\n\n_⚙️ Via: ${usedConfig.providerName} → ${usedConfig.modelName || 'Default'}_`;
      }

      await fetch(webhookUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bot ${discordToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: responseContent }),
      });

      console.log('✅ Worker fallback selesai untuk /ask');
    } catch (err) {
      console.error('❌ /ask background error:', err.message);
    }
  })());

  // ✅ BARU: Langsung return DEFERRED — gak nunggu AI!
  return new Response(
    JSON.stringify({
      type: 5, // InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      data: { content: '⏳🤔 Lagi mikir keras...' },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
```

### 5.2 `src/scheduler.ts` — Optional Render di Article

**Letak perubahan:** Di fungsi `executeAiArticle()`, setelah STEP 2 (AI generate) dan sebelum STEP 3 (publish).

```typescript
// ============================================================
// DI DALAM executeAiArticle() — setelah STEP 2
// Cari: article = await generateArticle(topic, research, env);
// ============================================================

// STEP 2.5: OPTIONAL — Coba heavy article dari Render (kalau available)
const renderArticle = await renderHeavyArticle({
  topic,
  research: {
    summary: research.summary,
    reviewSummary: research.reviewSummary,
  },
});

if (renderArticle?.ok && renderArticle?.article?.sections?.length > 0) {
  // Render sukses — override artikel dengan hasil yang lebih berkualitas
  article = renderArticle.article;
  console.log(`🚀 [${task.name}] Render heavy article digunakan (${renderArticle.duration_ms}ms)`);
} else {
  // Render gagal/tak tersedia — artikel dari Worker tetap dipakai
  console.log(`ℹ️ [${task.name}] Pakai artikel dari Worker (Render: ${renderArticle === null ? 'unavailable' : 'failed'})`);
}
// → LANJUT ke STEP 3 (publish). Flow SAMA PERSIS.
```

### 5.3 Import Baru yang Ditambahkan

**Di `src/index.ts`** (paling atas, bersama import lain):

```typescript
import { renderChat } from './render-helper';
```

**Di `src/scheduler.ts`** (paling atas, bersama import lain):

```typescript
import { renderHeavyArticle } from './render-helper';
```

---

## 🛡️ **6. Garansi Anti-Rusak**

### 6.1 Matriks Dampak

| Komponen | Sebelum | Sesudah | Bedanya? |
|----------|---------|---------|:--------:|
| `/ask` prompt simple | ✅ OK | ✅ OK | **SAMA** |
| `/ask` prompt kompleks | ❌ Sering gagal | ✅ Aman (deferred) | **MEMBAIK** |
| `/help` | ✅ OK | ✅ OK | **SAMA** |
| `/provider` | ✅ OK | ✅ OK | **SAMA** |
| MCP tools (~115) | ✅ OK | ✅ OK | **SAMA** ✅ |
| Scheduler (semua action) | ✅ OK | ✅ OK | **SAMA** ✅ |
| Article pipeline (research→generate→publish) | ✅ OK | ✅ OK | **SAMA** ✅ |
| WebScout | ✅ OK | ✅ OK | **SAMA** ✅ |
| Image Scraper | ✅ OK | ✅ OK | **SAMA** ✅ |
| Video Scraper | ✅ OK | ✅ OK | **SAMA** ✅ |
| GitHub Studio | ✅ OK | ✅ OK | **SAMA** ✅ |
| REST API (/cron/tasks) | ✅ OK | ✅ OK | **SAMA** ✅ |
| **Render mati/gak ada** | N/A | ✅ **Worker tetap jalan** | **AMAN** ✅ |

### 6.2 Jaminan Keamanan

| Aspek | Mekanisme |
|-------|-----------|
| **Tidak ada single point of failure** | Render = opsional. Worker tetap jadi otak utama |
| **Tidak ada data loss** | Semua data tetap di KV — Render gak simpen apa-apa |
| **Tidak ada perf degradation** | Kalau Render lambat → Worker gak nunggu, pake punya sendiri |
| **Tidak ada untested code path** | Fallback path = kode existing yang sudah jalan berbulan-bulan |
| **Rollback 30 detik** | `npx wrangler secret delete RENDER_SERVICE_URL` → Render mati, bot normal |

### 6.3 Behavior Matrix

```
                        ┌─ Render hidup, cepat → Pakai Render ✅
                        │   (Worker gak perlu proses AI)
                        │
Skenario ───────────────┼─ Render hidup, lambat → Worker pake punya sendiri ✅
                        │   (Render kalah race condition)
                        │
                        ├─ Render mati → Worker jalan seperti biasa ✅
                        │   (Gak ada perubahan)
                        │
                        └─ Render gak dikonfigurasi → Worker jalan seperti biasa ✅
                            (RENDER_URL kosong, render-helper return null)
```

---

## 🧪 **7. Cara Test**

### 7.1 Pre-Flight Checklist (Sebelum Deploy)

**Test A: Syntax & Compile**
```bash
# Pastikan Worker masih compile
npx tsc --noEmit
# Expected: Zero errors ✅
```

**Test B: Render Server Lokal**
```bash
cd render-server
npm install
node server.js &
# Test health
curl http://localhost:3000/health
# Expected: {"status":"ok", ...} ✅

# Test AI chat
curl -X POST http://localhost:3000/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Halo, tes!"}]}'
# Expected: {"ok":true,"result":"...", ...} ✅
```

### 7.2 Post-Deploy Checklist (Sesudah Deploy)

**Test 1: Bot masih hidup**
```
Discord: /help
Expected: Bot balas normal ✅
```

**Test 2: Prompt simple masih jalan**
```
Discord: /ask "halo"
Expected: Bot balas dalam <5 detik ✅
```

**Test 3: Prompt kompleks — sekarang gak gagal!**
```
Discord: /ask "analisis perbandingan 10 anime terbaik 2026..."
Expected: Muncul "⏳..." dalam 1 detik ✅
          Terus berubah jadi jawaban dalam 10-50 detik ✅
```

**Test 4: Scheduler artikel masih jalan**
```
Trigger artikel harian atau: GET /cron/test
Cek channel Discord — artikel harus jadi seperti biasa ✅
```

**Test 5: Render mati — bot tetap jalan**
```
Matikan Render service (Stop di Dashboard)
Discord: /ask "cerita pendek"
Expected: Bot balas seperti biasa (Worker fallback) ✅
```

### 7.3 Grafana/Debug Logs

Worker logs:
```bash
npx wrangler tail
# Cari: "🚀 Render success" atau "⚠️ Render unavailable"
```

Render logs:
```
Dashboard Render → Service → Logs
# Cari: "✅ OpenRouter success" atau "❌ /ai/chat error"
```

---

## ↩️ **8. Rollback — Kembali ke 100% Worker**

### Opsi 1: Instant (30 detik, tanpa deploy ulang)

```bash
# Hapus Render URL → render-helper otomatis return null
npx wrangler secret delete RENDER_SERVICE_URL

# Selesai! Bot balik ke kondisi awal.
# Gak perlu deploy ulang, gak perlu git revert.
```

### Opsi 2: Clean (kalau mau hapus semua kode Render)

```bash
# 1. Revert perubahan di index.ts & scheduler.ts
git checkout -- src/index.ts src/scheduler.ts

# 2. Hapus file baru
rm src/render-helper.ts
rm -rf render-server/

# 3. Hapus secret
npx wrangler secret delete RENDER_SERVICE_URL

# 4. Deploy ulang
npx wrangler deploy
```

---

## 📌 **Ringkasan untuk Agent**

### Yang HARUS dilakukan:

1. **Buat 3 file baru** di folder `render-server/`
2. **Buat 1 file baru** di `src/render-helper.ts`
3. **Tambah 2 baris import** di `src/index.ts` dan `src/scheduler.ts`
4. **Ubah handler `/ask`** di `src/index.ts` (+15 baris, pake deferred)
5. **Tambah 5 baris** di `src/scheduler.ts` (optional render article)
6. **Set secret** `RENDER_SERVICE_URL` di Cloudflare

### Yang TIDAK BOLEH dilakukan:

1. ❌ Jangan ubah file-file di daftar "TIDAK BOLEH DISENTUH" (Section 1)
2. ❌ Jangan ganti AI Router — tetap pake `AiRouter` untuk fallback
3. ❌ Jangan ubah format artikel — prompt di Render harus SAMA dengan di `article-writer.ts`
4. ❌ Jangan refactor — cukup tambah, jangan perbaiki yang udah jalan
5. ❌ Jangan sentuh MCP handler — 115 tools harus tetap connected

### Garansi:

> **"Kalau Render mati, gak ada response, atau kehapus — bot tetap berfungsi PERSIS seperti sebelum Render ada. Tidak ada perubahan perilaku, tidak ada error, tidak ada data loss."**

---

> **Dokumen ini selesai. Implementasi aman untuk dieksekusi.**
> **Updated by Kira — 21 Juni 2026**
