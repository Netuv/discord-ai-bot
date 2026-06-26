# Backup Restore — System Prompt for AI Agents

> **📖 Full workflow (create + restore):** See `Version-Backup/BACKUP-WORKFLOW-PROMPT.md`

## Latest Backup
```
File: Version-Backup/v4.0.0-20260626_165731.zip
Date: 2026-06-26
Size: ~197 KB
```

**!Always do Check current version and Backup current version before Load Backup!** _READ BACKUP-WORKFLOW-PROMPT (how To backup).md_

## Contents
| Path | What |
|------|------|
| `src/` | All 75+ TS source files |
| `Master-Context/` | MASTER-PLAN-v4.md, PROGRESS-LOG.md, context docs |
| `migrations/` | D1 SQL schema (0001_initial.sql) |
| `package.json` | Dependencies & scripts |
| `tsconfig.json` | TypeScript strict config |
| `wrangler.jsonc` | Cloudflare Workers config |

## Restore Methods

### 1. PowerShell Script (recommended)
```powershell
.\Version-Backup\restore-backup.ps1
# Flags: -BackupFile <path> -Target <dir> -BackupFirst (snapshot before restore)
```

### 2. AI Agent — Manual Restore
If the workspace is corrupted or needs reverting:
1. Delete current `src/`, `Master-Context/`, `migrations/`
2. Extract the zip to project root:
   ```
   Expand-Archive -Path "Version-Backup/v4.0.0-20260626_104504.zip" -DestinationPath . -Force
   ```
3. Run `npm install` (dependencies not in backup)
4. Verify: `npm run typecheck` (should be 0 errors)

### 3. AI Agent — Selective Restore
Pass zip path + target to restore-backup.ps1:
```powershell
.\Version-Backup\restore-backup.ps1 -BackupFile "Version-Backup\v4.0.0-20260626_104504.zip"
```

## Version History
| Version | Date | Notes |
|---------|------|-------|
| v4.0.0-20260626_104504 | 2026-06-26 | Full source snapshot post-Agent-14 |
| v4.0.0-20260626_164436 | 2026-06-26 | Full source snapshot post-Agent-20 |
| v4.0.0-20260626_165731 | 2026-06-26 | Full source snapshot post-deploy |

## Quick Reference
- **Project:** Discord AI Bot — autonomous content engine on Cloudflare Workers
- **Runtime:** Cloudflare Workers (Wrangler)
- **Stack:** TypeScript, Hono.js, D1, KV, Workers AI, Composio
- **Entry:** `src/index.ts`
- **Deploy:** `npm run deploy`
- **Dev:** `npm run dev`
