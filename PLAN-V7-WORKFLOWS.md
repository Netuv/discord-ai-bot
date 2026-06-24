# PLAN v7 — Cloudflare Workflows Integration

> **Date:** 23 Juni 2026
> **Current:** v6.1 — Image accuracy overhaul + Turbo Layer
> **Target:** v7.0 — Workflows-powered durable article pipeline
> **Status:** Draft — Requires Workers Paid plan (Free plan = 10ms CPU/step, useless for AI)

---

## 1. Problem Analysis

### 1.1 Current Architecture (Queue-based)

```
Cron */5 * * * *
  → QUEUE.send({ type: "scheduled-tick" })
    → queue() consumer
      → handleScheduled() → loop tasks → executeTask()
        → research (3-5 subreq)
        → AI generate (2 subreq)
        → publishArticle()
          → per section: image search + video search
```

### 1.2 Pain Points

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| **Section[4] budget error** | 50 subrequest limit → exhausted by image/video search | ❌ 2/5 sections gagal |
| **No retry on failure** | Queue retry = re-run ALL sections | ❌ Waste 100s + budget |
| **State chaos** | Manual KV writes for task logs, last_run | ⚠️ Fragile |
| **Wall time limit** | Cron/Queue max 15 min | ⚠️ Artikel 100s → OK, tapi skala gak |
| **No progress visibility** | No built-in observability | ❌ Debug susah |
| **No human approval** | MCP admin tools manual | ❌ Gak bisa review artikel sebelum publish |

### 1.3 Root Cause: Budget

50 subrequests per Queue invocation. Artikel 5 section × 2 image keywords × multiple sources = mudah 30+ subreq. + AI gen + research + video = > 50.

---

## 2. Workflows Key Benefits

### 2.1 Subrequest Limit (Paid)

| Metric | Current (Queue) | Workflows (Paid) |
|--------|----------------|-----------------|
| Subrequests/invocation | 50 | **10,000** (config 10M) |
| CPU time | 30s | **5 min** configurable |
| Wall time | 15 min | **Unlimited** per step |
| Retries | Manual | **Automatic** with backoff |

### 2.2 Durable Execution

```typescript
// Current: if section 4 fails, all succeed sections 1-3 are already sent
// → can't retry, can't recover, can't resume

// Workflows: each section = 1 step
// → section 4 fails → retry section 4 only
// → or skip to next section and report partial
```

### 2.3 Built-in Features

- **`step.do()`** — Durable step with retries + timeout
- **`step.sleep()`** — Schedule next run without cron
- **`step.waitForEvent()`** — Human approval before publishing
- **`step.sleepUntil()`** — Exact timestamp scheduling
- **Automatic state persistence** — No manual KV writes
- **Wrangler tail / dashboard** — Built-in observability

---

## 3. Proposed Architecture

### 3.1 High-Level Flow

```
Cron */5 * * * *
  → WorkflowInstance.create({ type: "scheduled-tick" })
    ↓
[Step 1] Check due tasks (read KV)
    ↓
[Step 2] Research topic (parallel web search)
    ↓
[Step 3] Generate article (AI → JSON parse)
    |── Retry: 3x, exponential backoff, 30s timeout
    ↓
[Step 4] Find images (per section, parallel)
    |── Each image search = independent sub-step
    |── Max 10,000 subrequests → no more budget error!
    ↓
[Step 5] Find videos (per section, parallel)
    ↓
[Step 6] Publish to Discord (per section)
    |── Retry: 3x, 5s delay
    ↓
[Step 7] Save logs (KV)
    ↓
[Step 8] Schedule next run (step.sleepUntil)
```

### 3.2 File Structure

```
src/
├── index.ts                  # fetch + cron (create Workflow instance)
├── workflows/
│   └── article-pipeline.ts   # WorkflowEntrypoint — full pipeline
├── queue/
│   └── handler.ts            # KEEP for MCP-triggered tasks
├── services/
│   ├── scheduler/
│   │   ├── engine.ts         # KEEP — cronMatches pure function
│   │   ├── storage.ts        # KEEP — KV CRUD for task config
│   │   ├── executors.ts      # KEEP — individual action executors
│   │   └── logging.ts        # KEEP — KV log management
│   ├── ai/
│   │   ├── writer.ts         # KEEP — prompt builder + parser
│   │   └── ...
│   ├── media/
│   │   ├── imagescraper.ts   # KEEP
│   │   └── videoscraper.ts   # KEEP
│   └── web/
│       └── webscout.ts       # KEEP
├── discord/
│   ├── client.ts             # KEEP
│   └── publisher.ts          # KEEP
└── types/
    └── env.ts                # + Workflow binding type
```

### 3.3 Wrangler Config

```jsonc
{
  "workflows": [{
    "name": "article-pipeline-workflow",
    "binding": "ARTICLE_PIPELINE",
    "class_name": "ArticlePipelineWorkflow"
  }],
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
  // KEEP: queues for MCP tasks
}
```

### 3.4 Workflow Code Structure

```typescript
// src/workflows/article-pipeline.ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

export class ArticlePipelineWorkflow extends WorkflowEntrypoint<Env, TaskPayload> {
  async run(event: WorkflowEvent<TaskPayload>, step: WorkflowStep) {
    const { env } = this;
    const task = event.payload;

    // Step 1: Research
    const research = await step.do('research', {
      retries: { limit: 2, delay: '5s', backoff: 'exponential' },
      timeout: '30s',
    }, async () => {
      return await researchArticle(task.topic, env);
    });

    // Step 2: Generate article
    const article = await step.do('generate', {
      retries: { limit: 3, delay: '10s', backoff: 'exponential' },
      timeout: '60s',
    }, async () => {
      const workerArticle = await generateArticle(task.topic, research, env);
      const turboArticle = await turboHeavyArticle(env, task.topic, research);
      return turboArticle || workerArticle;
    });

    // Step 3: Find media (parallel sub-steps)
    const sections = article.sections || [];
    const mediaResults = await Promise.all(sections.map((sec, i) =>
      step.do(`media-section-${i}`, {
        retries: { limit: 1, delay: '3s' },
        timeout: '30s',
      }, async () => {
        const img = await searchAnimeImage(sec.image_query || article.title, { env });
        const vid = i <= 1 ? await findYouTubeVideo(sec.video_query || '', env) : null;
        return { image: img, video: vid };
      })
    ));

    // Step 4: Publish
    const result = await step.do('publish', {
      retries: { limit: 3, delay: '5s' },
      timeout: '120s',
    }, async () => {
      return await publishArticle(env.DISCORD_TOKEN, task.channel_id, article, env, mediaResults);
    });

    // Step 5: Log
    await step.do('log', async () => {
      await addLog(env, {
        task_id: task.id,
        task_name: task.name,
        status: result.success ? 'success' : 'partial',
        message: `${result.sectionsPublished} published, ${result.sectionsFailed} failed`,
        duration_ms: Date.now() - start,
      });
    });
  }
}
```

---

## 4. Impact Analysis

### 4.1 Benefits

| Aspect | Current | With Workflows |
|--------|---------|---------------|
| **Subrequest limit** | 50 → ❌ Section 4 fails | 10,000 → ✅ All 5 sections |
| **Retry** | Manual full re-run | Auto per-step with backoff |
| **State persistence** | Manual KV writes | Automatic |
| **Observability** | Custom logger | Built-in + wrangler tail |
| **Human approval** | Gak ada | `step.waitForEvent()` |
| **CPU time** | 30s | 5 min per step |
| **Scheduling** | Cron every 5 min | `step.sleepUntil()` dynamic |
| **Tolerance** | 1 section fail = full fail | Fail 1 step, retry/skip others |

### 4.2 Costs (Workers Paid)

| Item | Current | With Workflows |
|------|---------|---------------|
| Plan | Free | **Paid** (~$5/mo min) |
| Requests | 100k/day free | Same (shared pool) |
| CPU time | 10M/mo free | Same (shared) |
| Storage | KV only | + Workflow state (1GB free) |
| **Subrequest limit** | 50 | **10,000** ← BIGGEST WIN |

Total delta: **~$5-10/mo** for Workers Paid.

### 4.3 Trade-offs

- **Workers Free gak bisa** — 10ms CPU/step useless. Must upgrade to Paid.
- **Learning curve** — Workflow API baru, but simple
- **Migration effort** — ~2-3h rewrite index.ts + new workflow file
- **Queue can stay** — for MCP-triggered tasks (not cron)

### 4.4 What Stays on Queue

MCP admin tools (manual task triggers) masih pake Queue handler. Workflows **cuma untuk cron pipeline**.

```
Workflows: Cron → Article Pipeline (heavy, long)
Queue:     MCP → Quick tasks (send-message, purge, webhook)
```

---

## 5. Migration Plan

### Phase 1: Setup (30 min)
1. Upgrade Workers Free → Paid di dashboard
2. `npx wrangler workflows create article-pipeline-workflow`
3. Add `workflows` binding to `wrangler.jsonc`
4. Install `cloudflare:workers` types

### Phase 2: Workflow Class (1-2h)
1. Create `src/workflows/article-pipeline.ts`
2. Move article pipeline logic into `step.do()` blocks
3. Add retry config per step
4. Wire `scheduled()` handler → `WORKFLOW.create()`

### Phase 3: Test (30 min)
1. `npx wrangler deploy`
2. `curl /cron/test` → trigger workflow
3. `wrangler tail` → observe steps
4. Force section fail → verify retry

### Phase 4: Polish (optional)
1. Add `step.waitForEvent('human-approval')` for review
2. Dynamic scheduling via `step.sleepUntil()`
3. Remove task loop from executors (Workflow handles 1 task/instance)

---

## 6. Verdict

| | |
|---|-----|
| **Can it fix budget errors?** | ✅ **YES** — 10,000 subrequests vs 50 |
| **Can it fix retry?** | ✅ **YES** — Auto retry per step with backoff |
| **Worth on Free plan?** | ❌ **NO** — 10ms CPU, 50 subreq same as Queue |
| **Worth on Paid plan?** | ✅ **YES** — Game changer for reliability |
| **Priority?** | Medium — fix budget first via keyword optimization (done in v6.1), then upgrade & migrate |

### Recommendation

**Jangan migrasi sekarang** unless lo upgrade ke Workers Paid. Di Free plan, Workflows kena limit 10ms CPU + 50 subrequests — sama aja kaya Queue.

Tapi kalo lo rencana upgrade ke Paid (~$5/mo):

1. ✅ **Budget error hilang** — 10,000 subrequest limit
2. ✅ **Auto retry** — Section gagal → retry 3x, bukan full restart
3. ✅ **Observability** — Built-in dashboard + wrangler tail
4. ✅ **State otomatis** — Gak perlu manual KV writes

**Estimated effort:** 2-3 jam coding + testing.
