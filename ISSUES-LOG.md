# ISSUES LOG — Discord AI Bot (v3)

> 21 Juni 2026 | Auditor: Kira | 26 issues found

## FIXED (7 issues)

- C1: article-auditor.ts — already integrated in article-publisher.ts
- C2: media-query-optimizer.ts — already integrated in article-publisher.ts
- C3: Cron — already */5 * * * *
- C4: Timeout — wall time 15 min is safe (network calls dont count CPU)
- H5: sendImageToDiscord — already URL direct approach
- L5: node-fetch — removed from turbo-server (native fetch)
- L7: optimizeMediaQuerySimple + getPrimaryKeywords — removed (unused)
- Cleanup: unused imports in scheduler.ts (searchAnimeImage, downloadImage, videoScraperFindVideo, parseArticleJSON, buildArticlePrompt, getArticleColor)

## REMAINING (19 issues, lower priority)

### HIGH (Maintenance)
- H1: Duplikasi kode article writer (Worker vs Turbo Layer)
- H2: mcp-handler.ts 4669 baris
- H3: YouTube HTML scraping rawan break
- H4: ImageScraper tanpa web scraping fallback (C2 helps)
- H6: Global mutable state _env

### MEDIUM
- M1: .env.local token plaintext
- M2: Dual deployment config (Koyeb + Vercel)
- M3: Video query fallback simplistik
- M4: Tidak ada rate limiting external API
- M5: WORKSPACE-LOG.md 43K chars
- M6: Duplicate fallback logic video-scraper
- M7: Test coverage minim
- M8: expandAbbreviations regex escape

### LOW
- L1: worker-configuration.d.ts 542K
- L2: Invidious instances outdated
- L3: TURBO-LAYER-PLAN.md usang
- L4: discordFetchFormData unused
- L6: Missing .env documentation
- L8: Category colors hardcoded

## CPU Time vs Wall Time (Cloudflare 2026)

Cron */5 = 30s CPU, 15min wall. Network calls (fetch, KV) dont count CPU time.
executeAiArticle = mostly network wait = CPU time < 5 detik. Wall time ~60-120s = safe.

> Signed: 21 Juni 2026, 20:30 WIB — Phase 1 Complete
> Updated by Kira
