# 🚀 GitHub Setup — Discord MCP Bot

## Status Sekarang

### ✅ Sudah Selesai

| Item | Detail |
|------|--------|
| **Worker URL** | `https://discord-ai-bot.luminary-bot.workers.dev` |
| **MCP Endpoint** | `https://discord-ai-bot.luminary-bot.workers.dev/mcp` |
| **Secrets set** | `DISCORD_PUBLIC_KEY` ✅, `DISCORD_TOKEN` ✅, `ALLOWED_USER_ID` ✅, `GITHUB_TOKEN` ✅ |
| **Slash command** | `/ask` registered ✅ |
| **Total tools** | ~106 tools (Discord admin + AI + GitHub terminal + Scheduler) |
| **Cron Trigger** | ✅ Setiap menit (`* * * * *`) — menjalankan tugas terjadwal |
| **KV Namespace** | ✅ `SCHEDULER_KV` — menyimpan data scheduler |
| **Git init** | ✅ Repo lokal siap |
| **Git commit** | ✅ `Initial commit: Discord MCP Bot with 99 tools` |
| **Git remote** | ✅ `origin = https://github.com/Netuv/discord-ai-bot.git` |
| **Git push** | ✅ Kode sudah di-push ke `Netuv/discord-ai-bot` |
| **Workflow file** | ✅ `.github/workflows/remote-run.yml` ada di repo |
| **User restriction** | ✅ Hanya user ID `468772891371110411` bisa Discord interaction |
| **Konfirmasi** | ✅ Semua aksi admin butuh kode konfirmasi |

---

## 🔧 Tools GitHub yang Tersedia

| Tool | Fungsi | Butuh Konfirmasi? |
|------|--------|-------------------|
| `github-run` | Jalanin command bash di GitHub Actions runner | ✅ Ya |
| `github-run-status` | Cek status + log dari workflow run | ❌ Tidak |

## 🔒 User Restriction

- Discord `/ask` hanya bisa dipakai oleh user ID: **468772891371110411**
- MCP endpoint tetap bisa diakses oleh AI agent mana pun
- Untuk nonaktifkan: `npx wrangler secret delete ALLOWED_USER_ID`

## ⏰ Scheduler System

Bot sekarang support **tugas terjadwal otomatis** menggunakan Cloudflare Cron Triggers + KV.

### Cara Kerja

1. **Cron Trigger** `* * * * *` (setiap menit) memicu `scheduled()` handler
2. Handler membaca daftar task dari KV, cek cron mana yang cocok dengan waktu sekarang
3. Task yang cocok langsung dieksekusi (send message, AI prompt, purge, dll)
4. Hasil dan log disimpan di KV untuk audit

### Jenis Aksi yang Tersedia

| Aksi | Deskripsi |
|------|-----------|
| `send-message` | Kirim pesan teks ke channel |
| `ai-prompt` | AI generate konten + kirim ke channel |
| `purge-channel` | Bersihkan pesan di channel |
| `custom-webhook` | Panggil webhook URL kustom |
| `update-status` | Kirim status update ke channel |
| `github-run` | Panggil GitHub Actions runner |

### MCP Tools Scheduler

| Tool | Fungsi |
|------|--------|
| `scheduler-list` | Lihat semua tugas terjadwal |
| `scheduler-add` | Tambah tugas baru (wajib: nama, cron, action, channel_id) |
| `scheduler-remove` | Hapus tugas selamanya |
| `scheduler-toggle` | Aktif/nonaktif tugas |
| `scheduler-run` | Test jalanin tugas sekarang |
| `scheduler-logs` | Lihat log eksekusi |
| `scheduler-edit` | Edit parameter tugas |

### Contoh Cron Expression

| Expression | Arti (UTC) |
|------------|-----------|
| `* * * * *` | Setiap menit |
| `0 8 * * *` | Setiap jam 8 pagi UTC |
| `0 0 * * 1` | Setiap Senin tengah malam UTC |
| `*/30 * * * *` | Setiap 30 menit |
| `0 9-17 * * 1-5` | Setiap jam kerja (9-17, Senin-Jumat) |
| `0 0 1 * *` | Tanggal 1 setiap bulan |
| `0 12 * * 6,0` | Setiap akhir pekan jam 12 siang |

### Endpoint HTTP

| Endpoint | Method | Fungsi |
|----------|--------|--------|
| `/cron/test` | GET | Test trigger semua task atau spesifik (`?task_id=xxx`) |
| `/cron/notify` | POST | Kirim notifikasi hasil scheduler ke Discord |

## 📁 File Kunci

| File | Lokasi |
|------|--------|
| Main handler | `src/mcp-handler.ts` (~3900 lines) |
| Confirmation system | `src/mcp-confirm.ts` |
| **Scheduler system** | **`src/scheduler.ts`** (baru) |
| Worker entry | `src/index.ts` |
| Workflow | `.github/workflows/remote-run.yml` |
| Config | `wrangler.jsonc` |

---

> Dibuat: 2026-06-19
