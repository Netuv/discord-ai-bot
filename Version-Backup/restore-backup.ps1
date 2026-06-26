<#
.SYNOPSIS
  Restore workspace from a versioned backup zip.
.DESCRIPTION
  Extracts a specified backup archive back to the workspace root.
  Optionally creates a pre-restore snapshot of current state.
.PARAMETER BackupFile
  Path to the backup .zip file. Defaults to latest in Version-Backup\.
.PARAMETER Target
  Workspace root to restore into. Defaults to script's parent.
.PARAMETER BackupFirst
  If set, zips current workspace before restoring (safety net).
.EXAMPLE
  .\restore-backup.ps1
  .\restore-backup.ps1 -BackupFile "Version-Backup\v4.0.0-20260626_104504.zip"
  .\restore-backup.ps1 -BackupFirst
#>

param(
  [string]$BackupFile = "",
  [string]$Target    = "",
  [switch]$BackupFirst
)

$ErrorActionPreference = "Stop"

# --- resolve paths ---
if (-not $Target) { $Target = Split-Path -Parent $PSScriptRoot }
$backupDir = Join-Path $Target "Version-Backup"
if (-not (Test-Path $backupDir)) { Write-Error "Version-Backup dir not found at $backupDir"; exit 1 }

# --- find backup zip ---
if (-not $BackupFile) {
  $latest = Get-ChildItem "$backupDir\*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { Write-Error "No .zip backups found in $backupDir"; exit 1 }
  $BackupFile = $latest.FullName
}

if (-not (Test-Path $BackupFile)) { Write-Error "Backup file not found: $BackupFile"; exit 1 }

Write-Host "=== Restore Backup ===" -ForegroundColor Cyan
Write-Host "Source: $BackupFile" -ForegroundColor Yellow
Write-Host "Target: $Target"    -ForegroundColor Yellow

# --- optional pre-restore snapshot ---
if ($BackupFirst) {
  $snap = Join-Path $backupDir "pre-restore-snapshot-$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"
  Write-Host "Creating pre-restore snapshot..." -ForegroundColor Magenta
  Compress-Archive -Path "$Target\src", "$Target\Master-Context", "$Target\migrations", "$Target\package.json", "$Target\tsconfig.json", "$Target\wrangler.jsonc" -DestinationPath $snap -CompressionLevel Optimal
  Write-Host "Snapshot saved: $snap" -ForegroundColor Green
}

# --- confirm ---
Write-Host "This will OVERWRITE src/, Master-Context/, migrations/, and root configs." -ForegroundColor Red
$confirm = Read-Host "Continue? (y/N)"
if ($confirm -ne "y") { Write-Host "Aborted."; exit 0 }

# --- restore ---
Write-Host "Extracting..." -ForegroundColor Cyan
Expand-Archive -Path $BackupFile -DestinationPath $Target -Force

Write-Host "=== Restore Complete ===" -ForegroundColor Green
Write-Host "Backup: $BackupFile" -ForegroundColor Green
