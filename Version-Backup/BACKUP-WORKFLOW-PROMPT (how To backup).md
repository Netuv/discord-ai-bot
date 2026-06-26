# Backup Versioning — AI Agent System Prompt

## Purpose
Standardized workflow for AI agents to **create** new workspace backup versions and **restore** from existing ones. Both operations share the same `Version-Backup/` directory and conventions.

---

## 1. CREATE — New Backup Version

### Trigger
User says: "create backup", "save version", "backup now", "version snapshot"

### Steps

**Step 1: Determine version label**
```
v{MAJOR}.{MINOR}.{PATCH}-{YYYYMMDD}_{HHMMSS}
```
- Read `package.json` → `version` field for MAJOR.MINOR.PATCH
- Timestamp = current UTC time
- Example: `v4.0.0-20260626_104504`

**Step 2: Create folder + zip**
```powershell
$label = "v4.0.0-20260626_104504"
$backupRoot = "C:\Users\arghi\Documents\.dev\ai-bot\Version-Backup"
$dir = Join-Path $backupRoot $label
New-Item -ItemType Directory -Path $dir -Force

# Copy source + configs
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\src"              -Destination "$dir\" -Recurse -Container
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\Master-Context"    -Destination "$dir\" -Recurse -Container
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\migrations"        -Destination "$dir\" -Recurse -Container
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\package.json"      -Destination "$dir\"
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\tsconfig.json"     -Destination "$dir\"
Copy-Item -Path "C:\Users\arghi\Documents\.dev\ai-bot\wrangler.jsonc"    -Destination "$dir\"

# Compress
Compress-Archive -Path "$dir\*" -DestinationPath "$dir.zip" -CompressionLevel Optimal

# Cleanup uncompressed folder (optional)
Remove-Item -Path $dir -Recurse -Force
```

**Step 3: Log in PROGRESS-LOG.md**
Add Agent entry:
```markdown
### Agent N: Backup v{label}
**Status:** 100% Complete ✅
**Files:** Versioned snapshot
**Priority:** 🟢 MEDIUM

| Action | Detail |
|--------|--------|
| **Version** | v4.0.0-20260626_104504 |
| **Backup Path** | `Version-Backup/v4.0.0-20260626_104504.zip` |
| **Backed Up** | `src/`, `Master-Context/`, `migrations/`, `package.json`, `tsconfig.json`, `wrangler.jsonc` |

**What Was Done:**
- Full source snapshot
- Config files included
- Compressed to ~0.18 MB
```

**Step 4: Update PROGRESS-LOG.md metadata**
- Bump `**Last Updated:**` date
- Bump stats if changed

---

## 2. RESTORE — Load Backup Version

### Trigger
User says: "restore backup", "load version", "revert", "rollback", "restore [label]"

### Steps

**Step 1: Identify target backup**
- If label specified → use `Version-Backup\{label}.zip`
- If not → find latest: `Get-ChildItem "Version-Backup\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1`

**Step 2: Select method**

| Method | When | Command |
|--------|------|---------|
| **Script** | Recommended | `.\Version-Backup\restore-backup.ps1` |
| **Script (pre-snapshot)** | Risky restore | `.\Version-Backup\restore-backup.ps1 -BackupFirst` |
| **Script (specific)** | Named backup | `.\Version-Backup\restore-backup.ps1 -BackupFile "Version-Backup\v4.0.0-20260626_104504.zip"` |
| **Manual (AI agent)** | No user interaction | See Step 3 below |

**Step 3: AI Agent — Manual Restore (no user prompts)**
```powershell
# 1. Pre-restore snapshot (safety)
$snap = "Version-Backup\pre-restore-$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"
Compress-Archive -Path "src", "Master-Context", "migrations", "package.json", "tsconfig.json", "wrangler.jsonc" -DestinationPath $snap -CompressionLevel Optimal

# 2. Extract backup
Expand-Archive -Path "Version-Backup\v4.0.0-20260626_104504.zip" -DestinationPath . -Force

# 3. Reinstall deps
npm install

# 4. Verify
npm run typecheck
```

**Step 4: Verify restore**
- `npm run typecheck` → 0 errors
- Check key files exist: `src/index.ts`, `wrangler.jsonc`, `Master-Context/MASTER-PLAN-v4.md`

---

## 3. Version History Management

### List all backups
```powershell
Get-ChildItem "Version-Backup\*.zip" | Select-Object Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB,2)}}, LastWriteTime | Format-Table
```

### Update RESTORE-PROMPT.md
After each CREATE or RESTORE, append/update the version table:
```markdown
| Version | Date | Notes |
|---------|------|-------|
| v4.0.0-20260626_104504 | 2026-06-26 | Full source snapshot post-Agent-14 |
```

---

## 4. File Reference

| File | Role | 
|------|------|
| `Version-Backup/restore-backup.ps1` | PowerShell restore script (interactive) |
| `Version-Backup/RESTORE-PROMPT.md` | Static restore instructions (for AI agents) |
| `Version-Backup/BACKUP-WORKFLOW-PROMPT.md` | **THIS FILE** — full create+restore workflow |
| `Version-Backup/*.zip` | Compressed versioned snapshots |
| `Version-Backup/*/` | Uncompressed versioned snapshots (legacy) |
| `Master-Context/PROGRESS-LOG.md` | Version log + agent history |

---

## 5. Convention Summary

| Aspect | Rule |
|--------|------|
| **Label format** | `v{MAJOR}.{MINOR}.{PATCH}-{YYYYMMDD}_{HHMMSS}` |
| **Backup scope** | `src/`, `Master-Context/`, `migrations/`, root configs |
| **Not backed up** | `node_modules/`, `.wrangler/`, `.git/`, `Version-Backup/` itself |
| **Compression** | Always zip after folder copy |
| **Logging** | Always add Agent entry to PROGRESS-LOG.md |
| **Verify after restore** | `npm run typecheck` → 0 errors |
| **Safety net** | Use `-BackupFirst` flag before destructive restore |
