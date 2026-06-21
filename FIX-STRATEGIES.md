# 🛠️ FIX STRATEGIES — Discord AI Bot

> **Tanggal:** 21 Juni 2026
> **Referensi:** Cloudflare Workers Docs, DEV.to, StackOverflow, Discord API Docs
> **Tujuan:** Strategi paling efisien & efektif untuk fix setiap issue

---

## 🔴 CRITICAL FIXES

### C1 & C2: Integrate `article-auditor.ts` + `media-query-optimizer.ts`

**Masalah:** 1.127 baris kode sudah ditulis tapi TIDAK TERINTEGRASI.

**Strategi Terbaik: Minimal Changes, Maximum Impact**

```
Flow SEBELUM (broken):
  AI Generate → parseArticleJSON → publishArticle → sendDiscord

Flow SESUDAH (fixed):
  AI Generate → parseArticleJSON → auditArticle → optimizeMediaQuery → publishArticle → sendDiscord
```

**Lokasi patch: `scheduler.ts` → `executeAiArticle()`**

```typescript
// ═══ SEBELUM (scheduler.ts line ~280) ═══
const pubResult = await publishArticle(token, channelId, article, env);

// ═══ SESUDAH ═══
import { auditBeforePublish } from "./article-auditor";
import { optimizeMediaQuery } from "./media-query-optimizer";

// 1. AUDIT dulu
const { article: auditedArticle, report } = auditBeforePublish(article);
if (!report.passed) {
  console.error(`🛑 Audit blocked: ${report.summary}`);
  return `⚠️ Artikel gagal audit: ${report.summary}`;
}

// 2. OPTIMIZE media queries
const optimized = await optimizeMediaQuery(
  auditedArticle.title,
  auditedArticle.sections.map(s => s.heading),
  auditedArticle.sections.map(s => s.body),
  env
);

// 3. Override image_query & video_query di setiap section
for (const sec of auditedArticle.sections) {
  if (optimized.mal_title) sec.image_query = optimized.mal_title;
  if (optimized.video_keywords[0]) sec.video_query = optimized.video_keywords[0];
}

// 4. Publish dengan article yang sudah di-audit & di-optimize
const pubResult = await publishArticle(token, channelId, auditedArticle, env);
```

**Estimasi:** ~30 baris kode diubah. 0 file baru. 0 dependency baru.
**Risk:** Rendah — audit & optimizer adalah pure functions, gak modify state eksternal.

---

### C3: Cron Schedule Efficiency

**Masalah:** `* * * * *` = 1.440 triggers/day, kebanyakan kosong.

**Data dari Cloudflare Docs:**
- Free plan: 10.000 cron triggers/day
- Paid plan: Cron triggers are free, tapi ada limit per Worker
- CPU time: 10ms (free), 30s (paid, interval < 1hr), 15min (paid, interval >= 1hr)

**Strategi: Smart Schedule + Task-level Cron**

```
OPSI A (Recommended): Ubah ke */5 * * * *
  → 288 triggers/day (80% reduction)
  → Task execution delay max 5 menit
  → Cocok untuk artikel scheduler

OPSI B: Per-task schedule (advanced)
  → Simpan cron expression PER TASK di KV
  → Scheduler cek: task.cron == current time?
  → Lebih fleksibel, tapi lebih kompleks
```

**Implementasi Opsi A:**
```jsonc
// wrangler.jsonc
"triggers": {
  "crons": ["*/5 * * * *"]  // Setiap 5 menit, bukan per menit
}
```

**Estimasi:** 1 baris diubah.
**Impact:** 80% lebih sedikit cron triggers, same functionality.

---

### C4: Fix Timeout on Long-Running Article Tasks

**Masalah:** `executeAiArticle()` butuh 55-126 detik. Cron trigger limit = 30s CPU (paid).

**Data Kritis dari Cloudflare Docs:**
| Handler | CPU Time | Wall Time |
|---------|----------|-----------|
| `fetch()` | 10ms (free) / 5min (paid) | Unlimited |
| `scheduled()` | 10ms (free) / 30s (paid, <1hr) | 15 min |
| `queue()` | **Unlimited** ⚡ | 15 min |

**Key Insight:** `wall time` (network wait) TIDAK dihitung sebagai CPU time!
- AI call (20-40s) = network wait = 0 CPU
- WebScout search (5-10s) = network wait = 0 CPU
- Discord API calls (1-3s) = network wait = 0 CPU
- Actual CPU: JSON parsing, scoring, routing = ~2-5ms

**Jadi: Seharusnya TIDAK timeout di paid plan!**

**Root Cause Sebenarnya:**
1. Mungkin masih di FREE plan (CPU limit 10ms per cron)
2. Atau ada bug di parallel execution yang consume CPU

**Strategi: 3 Layer Fix**

```
Layer 1 (Quick Fix): Pastikan Paid Plan + optimize CPU usage
  → Set cpu_ms: 30000 di wrangler.jsonc
  → Monitor CPU usage via Workers Logs

Layer 2 (Medium): Add timeout guards
  → Wrap setiap heavy operation dengan AbortSignal.timeout()
  → Kalau timeout, skip & lanjut ( degraded mode )

Layer 3 (Future): Cloudflare Queues untuk article generation
  → Cron trigger → enqueue message → queue handler (unlimited CPU)
  → Lebih robust, auto-retry, gak blocking
```

**Implementasi Layer 1:**
```jsonc
// wrangler.jsonc — tambah limits
"limits": {
  "cpu_ms": 30000  // 30 detik CPU time (paid plan)
}
```

**Implementasi Layer 2 (timeout guards):**
```typescript
// scheduler.ts → executeAiArticle()
const research = await Promise.race([
  researchArticle(topic, env),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Research timeout')), 30000))
]);
```

**Estimasi:** Layer 1 = 3 baris. Layer 2 = ~20 baris. Layer 3 = ~100 baris (future).
**Priority:** Layer 1 dulu (cepet, zero risk). Layer 2 kalau masih timeout. Layer 3 kalau sering gagal.

---

## 🟠 HIGH PRIORITY FIXES

### H1: Consolidate Article Writer Code

**Masalah:** `article-writer.ts` (Worker) DAN `turbo-server/server.js` punya kode identical.

**Strategi: Shared Module Pattern**

```
Option A (Recommended): Extract shared code ke file terpisah
  → Buat src/article-shared.ts (types, parsers, prompts)
  → article-writer.ts import dari shared
  → turbo-server/server.js import dari shared (via npm package atau copy)

Option B: Turbo Layer hanya proxy, Worker jadi single source of truth
  → Turbo Layer: /article/heavy → panggil Worker API
  → Worker: handle everything
  → Simpler, tapi Worker load lebih berat
```

**Rekomendasi: Option A** — tapi hanya untuk `parseArticleJSON()` dan `buildArticlePrompt()` yang identical.

**Estimasi:** ~50 baris dipindah. 1 file baru.
**Risk:** Rendah — pure functions, gak ada state.

---

### H2: MCP Handler Split Strategy

**Masalah:** 4.669 baris di 1 file.

**Strategi: Feature-based Split (Incremental)**

```
Phase 1 (Quick Win): Extract tool definitions
  → src/mcp-tools/discord-tools.ts  (~800 baris)
  → src/mcp-tools/ai-tools.ts       (~300 baris)
  → src/mcp-tools/scheduler-tools.ts (~400 baris)
  → src/mcp-tools/github-tools.ts   (~600 baris)
  → src/mcp-tools/media-tools.ts    (~200 baris)
  → src/mcp-handler.ts sisa ~1.500 baris (protocol handler + routing)

Phase 2 (Future): Extract tool logic ke modules
  → Setiap tool group = 1 file dengan handler function
  → mcp-handler.ts jadi router dispatcher
```

**Cara Aman:**
1. Buat file baru di `src/mcp-tools/`
2. Pindahkan tool definitions (bukan handler logic)
3. Import di mcp-handler.ts
4. Test semua tools masih work
5. Ulangi per batch

**Estimasi:** Phase 1 = ~2 jam. 5 file baru.
**Risk:** Medium — perlu pastikan imports benar, tapi gak ubah logic.

---

### H3: YouTube Scraping Resilience

**Masalah:** `ytInitialData` parsing rawan break kalau YouTube ubah HTML.

**Strategi: Multi-layer Fallback dengan Health Check**

```
Current Flow:
  YouTube HTML → Invidious → DDG → YouTube API → Google

Improved Flow:
  1. YouTube HTML (dengan regex patterns yang lebih robust)
  2. YouTube oEmbed API (validasi, gak search)
  3. Invidious API (dengan health check)
  4. Piped API (alternatif Invidious)
  5. DuckDuckGo (last resort)
  6. YouTube Data API (optional, quota limited)
```

**Key Improvement: Piped API sebagai Invidious alternative**
```typescript
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://api.piped.projectsegfau.lt",
];

async function searchPiped(query: string): Promise<YouTubeVideoResult[]> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/streams?q=${encodeURIComponent(query)}&limit=5`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      // Parse response...
    } catch { continue; }
  }
  return [];
}
```

**Health Check untuk Invidious/Piped:**
```typescript
async function checkInstanceHealth(instance: string): Promise<boolean> {
  try {
    const res = await fetch(`${instance}/api/v1/stats`, {
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch { return false; }
}
```

**Estimasi:** ~100 baris tambahan.
**Risk:** Rendah — additive, gak ubah existing logic.

---

### H4: ImageScraper Resilience

**Masalah:** Query deskriptif gagal di API (MAL/AniList butuh exact title).

**Strategi: Query Normalization Layer**

```
Current: "Demon Slayer key visual 2026" → API search → GAGAL
Fixed:   "Demon Slayer key visual 2026" → normalize → "Kimetsu no Yaiba" → API search → OK
```

**Implementasi: Title Normalizer**
```typescript
function normalizeAnimeQuery(query: string): string {
  // 1. Hapus suffix deskriptif
  let clean = query
    .replace(/\b(key visual|poster|art|trailer|pv|teaser|official|new|2024|2025|2026|season \d+|part \d+)\b/gi, '')
    .trim();
  
  // 2. Cek abbreviation map (dari video-scraper.ts)
  for (const [abbr, full] of Object.entries(ANIME_ABBREVIATIONS)) {
    if (clean.toLowerCase().includes(abbr)) {
      clean = clean.replace(new RegExp(abbr, 'gi'), full);
    }
  }
  
  // 3. Fallback: ambil 2-3 kata pertama (biasanya nama anime)
  const words = clean.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 3) clean = words.slice(0, 3).join(' ');
  
  return clean || query;
}
```

**Integrasi:**
```typescript
// image-scraper.ts → searchAnimeImage()
const normalizedQuery = normalizeAnimeQuery(query);
// Coba normalized query dulu, baru original
const results = await searchWithQuery(normalizedQuery);
if (results.length === 0) {
  results = await searchWithQuery(query);
}
```

**Estimasi:** ~50 baris.
**Risk:** Rendah — normalization hanya affect query, gak ubah search logic.

---

### H5: Fix sendImageToDiscord

**Masalah:** Download + upload approach rawan gagal di Workers.

**Strategi: Dual Approach — URL Direct + FormData Fallback**

```
OPSI A (Recommended): URL Direct via Embed
  → Kirim image sebagai embed dengan image.url
  → Discord auto-fetch & cache
  → Gak perlu download/upload
  → Workaround: image URL harus publicly accessible

OPSI B: FormData Upload (keep as fallback)
  → Tetap tersedia untuk kasus tertentu
  → Tapi tambah timeout & error handling
```

**Implementasi Opsi A:**
```typescript
// article-publisher.ts → ganti sendImageToDiscord()
export async function sendImageToDiscord(
  token: string,
  channelId: string,
  imageUrl: string,
  caption?: string
): Promise<boolean> {
  // Opsi 1: Kirim sebagai embed (URL direct)
  try {
    await discordFetch(token, channelId, {
      embeds: [{
        image: { url: imageUrl },
        description: caption || '',
        color: 0x5865F2,
      }],
    });
    return true;
  } catch (e: any) {
    console.warn(`⚠️ Embed image gagal, coba direct message: ${e.message}`);
  }

  // Opsi 2: Direct message dengan URL (Discord auto-embed)
  try {
    await sendDiscordMessage(token, channelId, imageUrl);
    return true;
  } catch (e: any) {
    console.warn(`⚠️ Direct image gagal: ${e.message}`);
    return false;
  }
}
```

**Estimasi:** ~30 baris diubah.
**Risk:** Rendah — embed approach lebih reliable dari FormData.

---

### H6: Remove Global Mutable State

**Masalah:** `let _env: any = {}` di mcp-handler.ts.

**Strategi: Pass Env via Function Parameters**

```
SEBELUM:
  let _env: any = {};
  export function setEnv(env) { _env = env; }
  function getAiRouter() { return new AiRouter(_env); }

SESUDAH:
  // Hapus _env global
  // Setiap tool handler terima env sebagai parameter
  // Atau wrap dalam context object
```

**Implementasi Incremental:**
```typescript
// 1. Buat context type
interface ToolContext {
  env: any;
  router: AiRouter;
}

// 2. Update tool handler signature
type ToolHandler = (args: Record<string, any>, ctx: ToolContext) => Promise<...>;

// 3. Create context per request (bukan global)
function createToolContext(env: any): ToolContext {
  return {
    env,
    router: new AiRouter(env),
  };
}
```

**Estimasi:** ~100 baris (karena banyak tool handlers).
**Risk:** Medium — perlu update semua tool handler signatures.
**Alternative:** Biarkan `_env` tapi tambah documentation bahwa ini pattern khusus Workers (single-threaded).

---

## 🟡 MEDIUM FIXES

### M1: Token Security

**Strategi:** Pindahkan tokens ke Cloudflare Secrets

```bash
# Set secrets via wrangler
npx wrangler secret put VERCEL_TOKEN
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put OPENCODE_API_KEY
npx wrangler secret put NVIDIA_API_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

`.env.local` → hanya untuk local dev reference, bukan source of truth.

---

### M7: Test Coverage

**Strategi: Priority Tests**

```
Priority 1 (Critical): 
  → article-auditor.test.ts (karena baru diintegrasikan)
  → media-query-optimizer.test.ts

Priority 2 (High):
  → article-writer.test.ts (parseArticleJSON edge cases)
  → scheduler.test.ts (cronMatches, task execution)

Priority 3 (Medium):
  → image-scraper.test.ts (scoring functions)
  → video-scraper.test.ts (extend existing)
```

**Quick Win: Test audit functions**
```typescript
// test/article-auditor.spec.ts
describe('auditArticle', () => {
  it('should detect closing phrases', () => {
    const article = { sections: [{ body: 'Kesimpulannya.', heading: 'X' }] };
    const report = auditArticle(article);
    expect(report.passed).toBe(true); // auto-fixed
    expect(report.autoFixedCount).toBeGreaterThan(0);
  });
  
  it('should detect watermark', () => {
    const article = { title: '✨ Artikel • Lumina', sections: [] };
    const report = auditArticle(article);
    expect(report.article.title).not.toContain('Lumina');
  });
});
```

---

## 📊 Effort vs Impact Matrix

| Fix | Effort | Impact | Priority |
|-----|--------|--------|----------|
| C1+C2: Integrate auditor+optimizer | 🟢 Low | 🔴 Critical | ⭐⭐⭐ |
| C3: Cron schedule | 🟢 Tiny | 🟡 Medium | ⭐⭐⭐ |
| C4: Timeout fix | 🟡 Medium | 🔴 Critical | ⭐⭐⭐ |
| H5: sendImage URL direct | 🟢 Low | 🟠 High | ⭐⭐ |
| H3: YouTube resilience | 🟡 Medium | 🟠 High | ⭐⭐ |
| H4: ImageScraper normalize | 🟢 Low | 🟠 High | ⭐⭐ |
| H1: Article writer dedup | 🟡 Medium | 🟡 Medium | ⭐ |
| H2: MCP handler split | 🔴 High | 🟡 Medium | ⭐ |
| M7: Test coverage | 🟡 Medium | 🟡 Medium | ⭐ |
| H6: Remove global state | 🔴 High | 🔵 Low | ⭐ |

---

## 🎯 Recommended Fix Order (Sprint Plan)

### Sprint 1 (Quick Wins — 1-2 jam)
1. ✅ C3: Change cron to `*/5 * * * *` (1 baris)
2. ✅ C1+C2: Integrate auditor + optimizer ke scheduler.ts (~30 baris)
3. ✅ H5: Fix sendImageToDiscord ke URL direct (~30 baris)

### Sprint 2 (Core Fixes — 2-3 jam)
4. ✅ C4: Add timeout guards + CPU limit config (~25 baris)
5. ✅ H4: Add query normalizer ke image-scraper.ts (~50 baris)
6. ✅ H3: Add Piped API + health check ke video-scraper.ts (~100 baris)

### Sprint 3 (Quality — 2-4 jam)
7. ✅ M7: Write tests untuk auditor + optimizer (~150 baris test)
8. ✅ H1: Extract shared article code (~50 baris)
9. ✅ M1: Migrate tokens ke Cloudflare Secrets

### Future (Nice to Have)
10. H2: MCP handler split (Phase 1)
11. H6: Remove global state (with refactoring)
12. Cloudflare Queues untuk article generation

---

> **Signed:** 21 Juni 2026, 20:15 WIB — Fix Strategies ✅
> **Updated by Kira**
