# PLAN v6.0 — Discord AI Bot Full Rewrite

> **Date:** 23 Juni 2026
> **Current:** v5.1.2 (b48994b7)
> **Target:** v6.0 — Modular, Queue-based, Zero `any`
> **Author:** OWL

---

## 1. Problem Statement

### 1.1 Monolith Files
| File | Lines | Responsibilities |
|------|-------|------------------|
| `src/workers/scheduler.ts` | 195 | Cron parsing + KV CRUD + 7 executors + AI article pipeline + logging |
| `src/index.ts` | 216 | Routing + cron handler + error handling + MCP registration + interaction handler |
| `src/discord/publisher.ts` | 209 | Audit + media optimizer + keyword builder + media fetch + formatting + Discord send |
| `src/workers/webscout.ts` | 220 | Search + scrape + deep research + cache — ALL in 1 class |

### 1.2 Cron Trigger Limitations
- Cron `*/5 * * * *` langsung invoke `scheduled()` — **no retry on failure**
- If article generation takes 90s, next cron fires anyway (CF Workers allow overlap)
- **No backpressure** — if queue grows, tasks pile up
- **Subrequest budget dipakai bersama** — cron handler + article generation share 50 limit

### 1.2b ✅ Queue Solves All This
Queue **gratis 100%** di Workers Free plan: **10,000 operations/day** included.
Kita butuh cuma ~864 ops/day (288 cron triggers × 3 ops).
Queue handler dapet **fresh 50 subrequest budget sendiri** tiap invocation.
Retry otomatis + no overlap + parallel consumer.

### 1.3 Subrequest Budget
- Cloudflare free plan limit: **50 subrequests per invocation**
- Budget tracked via **mutable global variables** (`let subrequestBudget = 50`)
- No centralized reporting — each module guesses costs

### 1.4 Inconsistent Imports
- MCP tool files import from `src/workers/` but worker files are moving
- Some paths use `../workers/`, some `./`, some absolute — **no convention**

### 1.5 Sequential Bottlenecks
- Research → Generate → Publish runs **sequential**
- Each section media fetch runs **sequential** (image THEN video)
- Could run **parallel** to cut wall-clock time by ~40%

---

## 2. Target Architecture

```
src/
├── index.ts                    # ~80 lines — fetch routing + queue handler
├── queue/
│   └── handler.ts              # Queue consumer (ganti scheduled handler)
├── config/                     # PURE constants — no imports, no I/O
│   ├── discord.ts              # Discord colors, limits
│   └── providers.ts            # AI provider definitions
├── core/                       # INFRASTRUCTURE — zero business logic
│   ├── env.ts                  # Singleton env accessor
│   ├── logger.ts               # Structured console logger
│   ├── errors.ts               # Typed error classes
│   └── subrequest.ts           # BudgetTracker class
├── types/                      # TYPE DEFINITIONS — pure interfaces
│   ├── env.ts                  # Env interface (all bindings)
│   ├── discord.ts              # Discord interaction types
│   ├── article.ts              # Article + audit types
│   └── scheduler.ts            # Task + log types
├── services/                   # SERVICE MODULES — 1 job per module
│   ├── discord/
│   │   ├── client.ts           # REST API calls (rate-limited)
│   │   ├── verify.ts           # Signature verification
│   │   ├── formatter.ts        # Message formatting helpers
│   │   └── publisher.ts        # Orchestrator: audit→optimize→fetch→send
│   ├── ai/
│   │   ├── router.ts           # Multi-provider failover (chat + vision + creative)
│   │   ├── writer.ts           # Article generate + JSON parse + fallback
│   │   ├── auditor.ts          # Quality audit (7 checks)
│   │   └── media-optimizer.ts  # AI keyword optimizer
│   ├── media/
│   │   ├── imagescraper.ts     # Kitsu + AniList anime image search
│   │   └── videoscraper.ts     # YT API v3 + Invidious + DDG video search
│   ├── web/
│   │   ├── webscout.ts         # Web search + scrape (DDG, Wiki, HN)
│   │   └── cache.ts            # KV cache wrapper (get/set with TTL)
│   ├── scheduler/
│   │   ├── engine.ts           # PURE: cron parsing + matching
│   │   ├── storage.ts          # KV: task CRUD operations
│   │   ├── executors.ts        # 7 action executors (1 per action type)
│   │   └── logging.ts          # KV: task log management
│   └── github/
│       └── studio.ts           # GitHub API toolkit (file, PR, issue, release)
├── mcp/                        # MCP PROTOCOL — unchanged architecture
│   ├── server.ts               # SSE HTTP transport
│   ├── registry.ts             # Tool registry (add/get/list)
│   ├── confirm.ts              # Confirmation queue (admin actions)
│   └── tools/
│       ├── ai-tools.ts
│       ├── discord-tools.ts
│       ├── admin-tools.ts
│       ├── scheduler-tools.ts  # ← import dari services/scheduler/
│       ├── web-tools.ts        # ← import dari services/web/
│       ├── media-tools.ts      # ← import dari services/media/
│       └── github-tools.ts     # ← import dari services/github/
├── user/
│   └── config.ts               # User config per-user via KV
└── turbo/
    └── client.ts               # Turbo Layer HTTP client
```

### 2.1 Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Single Responsibility** | 1 file = 1 job. Scheduler = 4 files (engine/storage/executors/logging) |
| **Pure Functions** | Where possible, no side effects. `cronMatches()` is pure |
| **Dependency Injection** | Services receive `env: Env` as parameter, not singleton |
| **Budget Awareness** | All subrequest costs tracked via `BudgetTracker` |
| **Parallel by Default** | Research + turbo race. Image + video parallel per section |
| **Consistent Logging** | Every entry point logs `[Module] [Function] message {duration, result}` |
| **Zero `any`** | All types explicit. No `as any` in new code |
| **Config-Driven** | Magic strings in `config/`, not inline |

---

## 3. File Changes

### 3.1 Files to CREATE

| # | File | Purpose | Lines (est) |
|---|------|---------|------------|
| 1 | `src/core/subrequest.ts` | `BudgetTracker` class | 40 |
| 2 | `src/queue/handler.ts` | Queue consumer | 60 |
| 3 | `src/services/scheduler/engine.ts` | `cronMatches()` pure function | 30 |
| 4 | `src/services/scheduler/storage.ts` | KV task CRUD | 50 |
| 5 | `src/services/scheduler/executors.ts` | 7 action executors + AI article | 160 |
| 6 | `src/services/scheduler/logging.ts` | KV task log | 30 |
| 7 | `src/services/web/cache.ts` | KV cache wrapper | 25 |
| 8 | `PLAN-v6.md` | This document | — |

### 3.2 Files to MOVE (content unchanged, path only)

| Old Path | New Path | Reason |
|----------|----------|--------|
| `src/workers/scheduler.ts` | _Deleted_ | Split into 4 files |
| `src/workers/webscout.ts` | `src/services/web/webscout.ts` | Consistent path |
| `src/workers/imagescraper.ts` | `src/services/media/imagescraper.ts` | Consistent path |
| `src/workers/videoscraper.ts` | `src/services/media/videoscraper.ts` | Consistent path |
| `src/workers/github-studio.ts` | `src/services/github/studio.ts` | Consistent path |

### 3.3 Files to MODIFY

| # | File | Changes |
|---|------|---------|
| 1 | `src/index.ts` | Remove `scheduled()` → add `queue()`. Thin routing. Remove direct scheduler imports |
| 2 | `src/discord/publisher.ts` | Inject `BudgetTracker`. Use `services/scheduler/executors` for article pipeline |
| 3 | `src/mcp/tools/scheduler-tools.ts` | Update import paths |
| 4 | `src/mcp/tools/web-tools.ts` | Update import paths |
| 5 | `src/mcp/tools/media-tools.ts` | Update import paths |
| 6 | `src/mcp/tools/github-tools.ts` | Update import paths |
| 7 | `src/mcp/tools/ai-tools.ts` | Update import paths |
| 8 | `src/mcp/tools/discord-tools.ts` | Update import paths |
| 9 | `src/mcp/tools/admin-tools.ts` | Update import paths |
| 10 | `wrangler.jsonc` | Add Queue binding + remove cron? (keep cron, add queue) |
| 11 | `src/types/env.ts` | Add `SCHEDULER_QUEUE: Queue` binding type + Cloudflare Queue import |
| 12 | `wrangler.jsonc` | Add `queues.consumers` binding for `SCHEDULER_QUEUE` + keep cron trigger as producer |

### 3.4 Files to DELETE

| # | File | Replaced By |
|---|------|-------------|
| 1 | `src/workers/scheduler.ts` | `services/scheduler/engine.ts` + `storage.ts` + `executors.ts` + `logging.ts` |
| 2 | `src/workers/webscout.ts` | `services/web/webscout.ts` (moved) |
| 3 | `src/workers/imagescraper.ts` | `services/media/imagescraper.ts` (moved) |
| 4 | `src/workers/videoscraper.ts` | `services/media/videoscraper.ts` (moved) |
| 5 | `src/workers/github-studio.ts` | `services/github/studio.ts` (moved) |

### 3.5 Directory Deletions
| Path | Reason |
|------|--------|
| `src/workers/` | All files moved → directory empty |

---

## 4. Key Code Designs

### 4.1 BudgetTracker (`src/core/subrequest.ts`)

```typescript
export class BudgetTracker {
  private remaining: number;
  public readonly label: string;

  constructor(label: string, public readonly max: number = 50) {
    this.remaining = max;
    this.label = label;
  }

  get remainingBudget(): number { return this.remaining; }
  get consumed(): number { return this.max - this.remaining; }

  /** Attempt to consume `cost` subrequests. Returns false if budget exceeded. */
  tryConsume(cost: number = 1): boolean {
    if (this.remaining < cost) return false;
    this.remaining -= cost;
    return true;
  }

  /** Consume or throw BudgetExceededError */
  consume(cost: number = 1): void {
    if (!this.tryConsume(cost)) throw new BudgetExceededError(this.label, cost, this.remaining);
  }

  /** Wrapper: consume budget before calling fn, skip if budget exceeded */
  async wrap<T>(label: string, cost: number, fn: () => Promise<T>): Promise<T | null> {
    if (!this.tryConsume(cost)) {
      logger.warn('Budget', `Skipped "${label}" — budget exhausted`);
      return null;
    }
    const t0 = Date.now();
    try { return await fn(); }
    finally { logger.debug('Budget', `"${label}" cost ${cost}`, { ms: Date.now() - t0, remaining: this.remaining }); }
  }
}

export class BudgetExceededError extends Error {
  constructor(public readonly label: string, public readonly requested: number, public readonly remaining: number) {
    super(`Subrequest budget exceeded: ${label} needed ${requested} but only ${remaining} remaining`);
    this.name = 'BudgetExceededError';
  }
}
```

### 4.2 Queue Handler (`src/queue/handler.ts`)

**Flow:**
```
Cron */5 * * * *
     ↓  (1 message: {type: "check-tasks", ts: "..."})
env.SCHEDULER_QUEUE.send({ type: "cron-tick" })
     ↓
async queue(batch, env, ctx) → fresh BudgetTracker(50)
     ↓
Read tasks from KV → filter due → execute each
     ↓
Save logs + ack/retry
```

**Biaya Queue:** ~864 ops/day = **GRATIS** (free tier 10,000 ops/day)

### 4.2a Wrangler Config for Queue

```jsonc
// wrangler.jsonc — add to existing config
{
  "queues": {
    "consumers": [{
      "queue": "scheduler-queue",
      "max_batch_size": 1,
      "max_batch_timeout": 5
    }]
  }
  // Cron trigger tetap ada sebagai PRODUCER:
  // "triggers": { "crons": ["*/5 * * * *"] }
}
```

### 4.2b Queue Setup (1-time CLI)
```bash
npx wrangler queues create scheduler-queue
# → ✅ Created queue "scheduler-queue"
```

### 4.2c Env Type Update
```typescript
// src/types/env.ts — add:
export interface Env {
  // ... existing ...
  SCHEDULER_QUEUE: Queue;  // Queue binding
}
```

### 4.2d Index.ts — Cron Producer
```typescript
// src/index.ts — scheduled handler becomes THIN producer:
async scheduled(controller, env, ctx) {
  await env.SCHEDULER_QUEUE.send({ type: 'cron-tick', ts: Date.now() });
}
```

```typescript
import type { Env } from '../types/env';
import { logger } from '../core/logger';
import { BudgetTracker } from '../core/subrequest';
import { getTasks, updateTask, addLog } from '../services/scheduler/storage';
import { executeTask } from '../services/scheduler/executors';
import { cronMatches } from '../services/scheduler/engine';

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const budget = new BudgetTracker('Queue', 50);
    for (const msg of batch.messages) {
      const t0 = Date.now();
      try {
        const tasks = await getTasks(env);
        const due = tasks.filter(t => t.enabled && cronMatches(t.cron));
        for (const task of due) {
          const result = await executeTask(task, env, budget);
          await updateTask(env, task.id, {
            last_run: new Date().toISOString(),
            last_status: result.success ? 'success' : 'failed',
            run_count: task.run_count + 1,
          });
          await addLog(env, {
            task_id: task.id,
            task_name: task.name,
            timestamp: new Date().toISOString(),
            status: result.success ? 'success' : 'failed',
            message: result.msg,
            duration_ms: Date.now() - t0,
          });
        }
        msg.ack();
      } catch (e: any) {
        logger.error('Queue', 'Handler error', { error: e.message });
        msg.retry({ delaySeconds: 30 });
      }
    }
  }
};
```

### 4.3 Scheduler — 4 File Separation

**engine.ts** — Pure cron parsing:
```typescript
export function cronMatches(cron: string, date: Date = new Date()): boolean { ... }
export function parseField(field: string, min: number, max: number): number[] { ... }
```

**storage.ts** — KV CRUD (no logic):
```typescript
export async function getTasks(env: Env): Promise<ScheduledTask[]> { ... }
export async function saveTasks(env: Env, tasks: ScheduledTask[]): Promise<void> { ... }
export async function addTask(env: Env, input: ScheduledTask): Promise<ScheduledTask> { ... }
export async function updateTask(env: Env, id: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask | null> { ... }
export async function deleteTask(env: Env, id: string): Promise<boolean> { ... }
export async function addLog(env: Env, log: TaskLogEntry): Promise<void> { ... }
export async function getLogs(env: Env, taskId: string): Promise<TaskLogEntry[]> { ... }
```

**executors.ts** — Action executors (1 function per action):
```typescript
export interface TaskResult { success: boolean; msg: string; }

export async function executeTask(task: ScheduledTask, env: Env, budget: BudgetTracker): Promise<TaskResult> {
  switch (task.action) {
    case 'send-message': return execSendMsg(task, env, budget);
    case 'ai-prompt':    return execAiPrompt(task, env, budget);
    case 'ai-article':   return executeAiArticle(task, env, budget);
    case 'purge-channel': return execPurge(task, env, budget);
    case 'custom-webhook': return execWebhook(task, env, budget);
    case 'update-status':  return execUpdateStatus(task, env, budget);
    case 'github-run':    return execGithub(task, env, budget);
    default: throw new Error(`Unknown action: ${task.action}`);
  }
}

export async function executeAiArticle(task: ScheduledTask, env: Env, budget: BudgetTracker): Promise<TaskResult> {
  // Parallel: research + turbo race
  const [research, turboArticle] = await Promise.all([
    researchArticle(task.params.topic, env).catch(() => ({ summary: '', reviewSummary: '' })),
    turboHeavyArticle(env, task.params.topic).catch(() => null),
  ]);
  // Generate
  const article = turboArticle ?? await generateArticle(task.params.topic, research, env);
  // Publish
  const result = await publishArticle(env.DISCORD_TOKEN, task.channel_id, article, env, budget);
  if (!result.success) return { success: false, msg: `⚠️ Gagal: ${result.error}` };
  return { success: true, msg: `✅ ${result.sectionsPublished} section${result.imagesPublished ? ` • ${result.imagesPublished} gambar` : ''}${result.videosPublished ? ` • ${result.videosPublished} video` : ''}` };
}
```

### 4.4 Publisher — Orchestrator Only

```typescript
export async function publishArticle(
  token: string, channelId: string, article: Article, env: Env, budget: BudgetTracker
): Promise<PublishResult> {
  // Phase 0: Audit (no subrequest cost)
  const audit = auditArticle(article);
  // Phase 1: Optimize media queries (1 AI subrequest)
  const optimized = await budget.wrap('optimizeMediaQuery', 1, () =>
    optimizeMediaQuery(audit.article.title, audit.article.sections.map(s => s.heading), audit.article.sections.map(s => s.body), env)
  );
  // Phase 2: Send headline embed (1 Discord API subrequest)
  await budget.wrap('sendHeadline', 1, () =>
    sendEmbed(token, channelId, { title: audit.article.title, description: audit.article.intro, color: getColor(audit.article.category) })
  );
  // Phase 3: Per section — parallel image + video fetch
  for (let i = 0; i < audit.article.sections.length; i++) {
    const sec = audit.article.sections[i];
    const [imgResult, vidResult] = await Promise.all([
      budget.wrap(`image[${i}]`, 2, () => searchAnimeImage(keyword, { env })),
      budget.wrap(`video[${i}]`, 1, () => findYouTubeVideo(keyword, env)),
    ]);
    // ... format + send
  }
}
```

---

## 5. Execution Plan

### Phase 1: Core Infrastructure
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 1.1 | Create `src/core/subrequest.ts` | 1 new | `npx tsc --noEmit` |
| 1.2 | Create `src/services/web/cache.ts` | 1 new | `npx tsc --noEmit` |

### Phase 2: Scheduler Breakup
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 2.1 | Extract `engine.ts` (cron parsing) | 1 new | `npx tsc --noEmit` |
| 2.2 | Extract `storage.ts` (KV CRUD) | 1 new | `npx tsc --noEmit` |
| 2.3 | Extract `logging.ts` (task log) | 1 new | `npx tsc --noEmit` |
| 2.4 | Create `executors.ts` (7 action executors + AI article) | 1 new | `npx tsc --noEmit` |
| 2.5 | Delete `src/workers/scheduler.ts` | 1 delete | `npx tsc --noEmit` |

### Phase 3: Move Workers → Services
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 3.1 | Copy `webscout.ts` → `services/web/webscout.ts` | 1 move | `npx tsc --noEmit` |
| 3.2 | Copy `imagescraper.ts` → `services/media/imagescraper.ts` | 1 move | `npx tsc --noEmit` |
| 3.3 | Copy `videoscraper.ts` → `services/media/videoscraper.ts` | 1 move | `npx tsc --noEmit` |
| 3.4 | Copy `github-studio.ts` → `services/github/studio.ts` | 1 move | `npx tsc --noEmit` |
| 3.5 | Delete all files under `src/workers/` | 4 delete | `npx tsc --noEmit` |
| 3.6 | Delete `src/workers/` directory | 1 delete | `dir src/` |

### Phase 4: Queue Handler + Wrangler Config
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 4.1 | Create `src/queue/handler.ts` | 1 new | `npx tsc --noEmit` |
| 4.2 | Update `wrangler.jsonc` — add `queues.consumers` + keep cron trigger | 1 edit | `npx tsc --noEmit` |
| 4.3 | Update `src/types/env.ts` — add `SCHEDULER_QUEUE: Queue` | 1 edit | `npx tsc --noEmit` |
| 4.4 | Create queue via CLI: `npx wrangler queues create scheduler-queue` | — | CLI success |

### Phase 5: Thin Index.ts — Cron Producer + Queue Export
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 5.1 | Rewrite `src/index.ts` — cron trigger sends queue message instead of direct execution | 1 edit | `npx tsc --noEmit` |
| 5.2 | Add `export default { fetch, scheduled, queue }` | same | `npx tsc --noEmit` |
| 5.3 | Remove direct scheduler imports (import from `services/scheduler/` instead) | same | `npx tsc --noEmit` |

### Phase 6: Update MCP Tool Imports
| Step | Action | Files | Verification |
|------|--------|-------|-------------|
| 6.1 | Update all MCP tool files to import from `services/` instead of `workers/` | 7 edits | `npx tsc --noEmit` |

### Phase 7: Integration
| Step | Action | Verification |
|------|--------|-------------|
| 7.1 | `npx tsc --noEmit` | Zero errors |
| 7.2 | `npm run deploy` | Worker deployed |
| 7.3 | `curl /cron/test` | Article generated |
| 7.4 | `curl /debug/media` | Media search works |

### Phase 8: Documentation
| Step | Action | Files |
|------|--------|-------|
| 8.1 | Update `WORKSPACE-LOG.md` with v6 changes | 1 edit |
| 8.2 | Update `PLAN-v6.md` with final notes | same |
| 8.3 | `git add . && git commit -m "v6.0 rewrite"` | — |

---

## 6. Rollback Plan

If any phase fails:
1. **Phase 1-3 failure (TS errors):** Fix type errors, don't deploy broken code
2. **Phase 4-5 failure (Queue not working):** Revert to cron trigger — `<5 min fix`
3. **Phase 7 failure (Deploy broken):** 
   ```bash
   npx wrangler rollback  # back to previous version
   git checkout -- src/   # restore original files
   ```
4. **Phase 8 failure:** Manual edit, no risk

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Queue need manual `wrangler queues create` | High | Low | 1-time CLI command, documented in Phase 4 |
| Queue not available on CF free plan | Low | High | Keep cron as fallback, queue as optional. Pricing page confirms 10k ops/day free |
| Import path mistakes in MCP tools | High | Medium | `npx tsc --noEmit` catches all — DO THIS every phase |
| Worker startup time increases >50ms | Medium | Low | Bundle size stays <200 KiB |
| Broken article formatting | Low | High | Test with `/cron/test` before leaving |

---

## 8. Success Criteria

- [ ] `npx tsc --noEmit` = **zero errors**
- [ ] `npm run deploy` = **success** (<15s upload)
- [ ] `curl /cron/test` = **article with images** (<90s)
- [ ] `curl /debug/media?q=test` = **image + video results**
- [ ] No `as any` in new/modified code
- [ ] Every function has single responsibility
- [ ] `src/index.ts` ≤ 100 lines
- [ ] `src/workers/` directory **deleted**
- [ ] All MCP tools work after import path changes

---

## 9. Action Items (for User)

After plan approved:
1. Confirm to proceed with **Phase 1**
2. Review after each phase completion
3. If Queue binding confirmation needed from Cloudflare dashboard
4. Test `/cron/test` after deploy to validate

---

*End of PLAN-v6.md — Ready for review*
