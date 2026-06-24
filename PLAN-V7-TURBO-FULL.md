# PLAN v7 — Offload Full Article Pipeline to Vercel Turbo Layer

> **Date:** 23 Juni 2026
> **Current:** v6.1 — Image accuracy + budget optimization (still fragile)
> **Target:** v7.0 — Zero subrequest errors via Vercel offload
> **Status:** Ready to implement

---

## 1. Current Problem

### 1.1 Root Cause

CF Workers Free plan: **50 subrequest limit per invocation.**

Our article pipeline:

```
Phase               Subrequests     Controlled?
─────────────────────────────────────────────────
Research (web)      3-5             ✅ Yes
AI generate (Turbo) 1-2             ✅ Yes
Image search ×5     5-10            ❌ Per section
Video search ×2     2-4             ❌ Per section
Discord publish ×5  5               ❌ Per section
─────────────────────────────────────────────────
Total               25-50+          ⚠️ BOOM
```

### 1.2 Failure Pattern

```
Section[3] fetch error: Too many subrequests by single Worker invocation
```

Always hits at section 3-4 (last sections). The fix in v6.1 (1 keyword, sequential) helps but doesn't eliminate — still 1 keyword × 5 sections × 2-3 sources = 10-15 subreq for images alone + rest of pipeline = borderline.

### 1.3 Why Free Plan Can't Be Fixed

| Resource | CF Free | CF Paid | Vercel Hobby |
|----------|---------|---------|-------------|
| Subrequest limit | 50 | 10,000 | **Unlimited** |
| CPU time | 30s | 5m | **Unlimited** |
| Wall time | 15m | 15m | **60s (pro: 900s)** |
| Price | **$0** | $5/mo | **$0** |

Vercel Hobby: 60s timeout per function call. Our pipeline ~100s → **exceeds Hobby timeout**.

**Verdict:** Vercel Hobby timeout 60s too short. Workers Paid $5/mo is cheapest fix.

### 1.4 Vercel Hobby 60s Problem

Current article pipeline takes ~90-105s. 60s wall time on Hobby = not enough.

**Solutions for Vercel timeout:**
1. **Split into multiple calls** — Worker calls Vercel for AI gen only (45s). Search & publish stays on Worker but with fewer keywords (already optimized).
2. **Upgrade to Vercel Pro** — $20/mo, 900s timeout. Expensive.
3. **Workers Paid** — $5/mo, 10,000 subreq, 15m wall time. Simplest.

---

## 2. Proposed Architecture

### 2.1 Hybrid: Vercel AI + Worker Publish (Best for Free)

```
Worker (scheduled → queue → handleScheduled)
  │
  ├── 1 call → Vercel: Research + AI generate (45s, fits Hobby)
  │                → Return { title, intro, sections[{heading,body,image_query,video_query}] }
  │
  ├── Per section → Image search (sequential, 1 keyword)
  │                  Jikan → AniList → Brave → Google → DDG
  │                  Break on first match. Budget: ~3 subreq/section
  │
  ├── Per section → Video search (section 0-1 only)
  │                  YT API → oEmbed → Invidious → DDG
  │                  Budget: ~3 subreq/section
  │
  └── Per section → Discord POST (5 subreq total)
```

**Estimated subrequests:**
```
Research:      1 (Vercel)
AI generate:   1 (Vercel)  
Image ×5:      15 (if 3 sources each)
Video ×2:      6  (if 3 sources each)
Discord ×5:    5  (POST messages)
────────────────────
Total:         28  ✅ Under 50
```

### 2.2 Workers Paid (Best for Reliability)

```
Everything stays in Worker. 10,000 subrequests.
No changes needed. Upgrade plan.
```

---

## 3. Implementation: Turbo Layer Endpoint

### 3.1 New Endpoint: `POST /article/generate`

```js
// turbo-server/server.js — ADD

app.post('/article/generate', async function(req, res) {
  const { topic, summary, reviewSummary } = req.body;
  
  // Build prompt
  const prompt = buildArticlePrompt(topic, summary, reviewSummary);
  
  // Call AI (multi-provider)
  const result = await callAI([{ role: 'user', content: prompt }]);
  if (!result) return res.status(503).json({ error: 'All AI providers failed' });
  
  // Parse JSON from AI response
  const article = parseArticleJSON(result.content);
  
  // Return parsable article
  res.json({ article, provider: result.provider, elapsed_ms: Date.now() - startTime });
});
```

### 3.2 Prompt Builder + Parser (reuse from worker)

Copy `buildArticlePrompt` and `parseArticleJSON` from `src/ai/writer.ts` to `turbo-server/prompt.js`.

```js
// turbo-server/prompt.js
function buildArticlePrompt(topic, summary, reviewSummary) { /* same logic */ }
function parseArticleJSON(raw) { /* same logic */ }
```

### 3.3 Worker Client Update

```typescript
// src/turbo/client.ts — ADD

export async function turboGenerateArticle(
  env: Env, 
  topic: string, 
  research: { summary?: string; reviewSummary?: string }
): Promise<Article | null> {
  const result = await callTurbo(env, '/article/generate', {
    topic,
    summary: research.summary || '',
    reviewSummary: research.reviewSummary || '',
  });
  if (result && typeof result === 'object' && 'article' in result) {
    return (result as any).article as Article;
  }
  return null;
}
```

### 3.4 Update Executors

```typescript
// src/services/scheduler/executors.ts

// Replace turboHeavyArticle call with turboGenerateArticle
const turboArticle = await turboGenerateArticle(env, topic, research);
if (turboArticle && turboArticle.title && turboArticle.sections) {
  // Use turbo article, skip worker generation entirely
  article = turboArticle;
}
```

---

## 4. Error Handling Matrix

| Error | Where | Detection | Recovery |
|-------|-------|-----------|----------|
| Vercel timeout (60s) | `/article/generate` | `fetch` timeout/AbortError | Fallback: Worker AI generate (slower, within budget) |
| Vercel 503 (AI down) | `/article/generate` | `res.status >= 500` | Fallback: Worker AI generate |
| Vercel 400 (bad input) | `/article/generate` | `res.status === 400` | Log error, skip task |
| Vercel DNS failure | Network | `fetch` throws TypeError | Fallback: Worker AI generate |
| Vercel cold start (5-10s) | First call | Slow response | Acceptable, pipeline still within budget |
| Image search 403 | Any source | `fetch` throws | Try next source |
| All image sources fail | All 5 | All return null | Skip image, proceed with text only |
| Video search fail | YT/Invidious/DDG | All return null | Skip video, proceed |
| Discord rate limit | `/channels/.../messages` | HTTP 429 | Retry after 1s (or log) |
| Discord 403 (bot no perms) | `/channels/.../messages` | HTTP 403 | Log permanent error, skip section |

### 4.1 Fallback Chain

```
Vercel /article/generate
  ├── Success → return article JSON
  ├── Timeout (>55s) → Worker AI generate (CF Workers AI binding)
  │     ├── Success → return article JSON
  │     └── Fail → return fallback article
  ├── HTTP error → Worker AI generate (same chain)
  └── Network error → Worker AI generate (same chain)
```

### 4.2 Recovery Time Budget

Subrequest budget allocation when Vercel fails (worst case):

```
Worker AI generate:    2 (AI binding)
Research:              4-6 (web search)
Image ×5:              15 (3 sources each)
Video ×2:              6
Discord ×5:            5
────────────────────
Total:                 32-34  ✅ Under 50
```

---

## 5. Files to Change

### turbo-server/ (Vercel — Node.js)

| File | Action | Lines |
|------|--------|-------|
| `server.js` | Add `POST /article/generate` endpoint | +25 |
| `prompt.js` | **NEW** — copy buildArticlePrompt + parseArticleJSON from worker | +120 |
| `package.json` | Add `@anthropic-ai/sdk`? No — plain fetch already works | 0 |

### src/ (Worker — TypeScript)

| File | Action | Lines |
|------|--------|-------|
| `turbo/client.ts` | Add `turboGenerateArticle()` function | +15 |
| `services/scheduler/executors.ts` | Use turboGenerateArticle, add fallback to existing worker AI | +10 |
| `queue/handler.ts` | Increase budget to 75? No — 50 is enough with hybrid | 0 |

### Config

| File | Action |
|------|--------|
| `turbo-server/vercel.json` | No change — `/article/generate` matches existing route pattern |
| `wrangler.jsonc` | No change |

---

## 6. Verification Steps

### 6.1 Unit Tests

```bash
# 1. TypeScript clean
cd discord-ai-bot && npx tsc --noEmit

# 2. Deploy turbo-server
cd turbo-server && npx vercel deploy --prod

# 3. Test /article/generate endpoint
curl -X POST https://turbo-server-mu.vercel.app/article/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"One Piece live action season 2","summary":"Berita terbaru tentang One Piece live action season 2 dari Netflix.","reviewSummary":""}'
# Expected: { article: { title, intro, sections[...] }, provider: "...", elapsed_ms: ... }

# 4. Test full cron pipeline
curl https://discord-ai-bot.luminary-bot.workers.dev/cron/test
# Expected: all sections delivered, no subrequest errors
```

### 6.2 Error Injection Tests

```bash
# 5. Simulate Vercel timeout (set TURBO_SERVICE_URL to bad URL)
# Expected: Worker falls back to AI generate

# 6. Force image search failures (query "zzzznonexistent999")
# Expected: no image, section still published with text only
```

### 6.3 Budget Monitoring

```bash
# Check worker logs for budget warnings
npx wrangler tail
# Expected: no "budget exhausted" warnings
```

---

## 7. Rollback Plan

If anything breaks:

```bash
# 1. Revert executors.ts to use worker AI directly
git checkout v6.1 -- src/services/scheduler/executors.ts

# 2. Redeploy worker
npx wrangler deploy

# 3. (Optional) downgrade turbo-server endpoint
git checkout v6.1 -- turbo-server/server.js
npx vercel deploy --prod
```

---

## 8. Cost Analysis

| Scenario | Worker Plan | Vercel Plan | Total | Subrequest Limit |
|----------|------------|-------------|-------|-----------------|
| Current (v6.1) | Free | Hobby ($0) | **$0** | 50 ❌ |
| Hybrid (v7) | Free | Hobby ($0) | **$0** | ✅ ~28/50 used |
| Workers Paid | Paid ($5) | — | **$5/mo** | ✅ 10,000 |
| Full Vercel | Free | Pro ($20) | **$20/mo** | ✅ 900s timeout |

**Hybrid v7 is cheapest path** — $0, stays on free tier.

---

## 9. Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Create `turbo-server/prompt.js` (copy prompt + parser) | 10 min |
| 2 | Add `POST /article/generate` to `server.js` | 10 min |
| 3 | Add `turboGenerateArticle()` to `src/turbo/client.ts` | 5 min |
| 4 | Update executors.ts fallback chain | 10 min |
| 5 | Deploy turbo-server + worker | 5 min |
| 6 | Test + verify | 10 min |
| | **Total** | **~50 min** |

---

## 10. Decision

| Option | Cost | Effort | Reliability |
|--------|------|--------|-------------|
| **Hybrid v7 (recommended)** | **$0** | 50 min | ✅ 28/50 budget, fallback chains |
| **Workers Paid** | $5/mo | 0 min | ✅ 10,000 budget, no changes |
| **Full Vercel Pro** | $20/mo | 50 min | ✅ 900s timeout but overkill |

**Recommend: Hybrid v7** — $0, 50 min effort, fallback chain covers failures, budget safe at ~28/50.
