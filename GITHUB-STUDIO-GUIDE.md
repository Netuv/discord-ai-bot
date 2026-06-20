# 🎯 GitHub Studio Guide

> **Panduan Lengkap Menggunakan GitHub Studio untuk Content Creation & Community Management**
>
> Bot: **Discord AI Bot** — Platform: **Cloudflare Workers**
> MCP Endpoint: `https://discord-ai-bot.luminary-bot.workers.dev/mcp`

---

## Daftar Isi

- [🎯 GitHub Studio Guide](#-github-studio-guide)
  - [Daftar Isi](#daftar-isi)
  - [1. Pengenalan](#1-pengenalan)
    - [Apa itu GitHub Studio?](#apa-itu-github-studio)
    - [Cara Akses](#cara-akses)
  - [2. Tools Overview](#2-tools-overview)
    - [Tools Cepat](#tools-cepat)
    - [Tools Lengkap](#tools-lengkap)
  - [3. Content Creator Workflow](#3-content-creator-workflow)
    - [3.1 Blog Publishing Pipeline](#31-blog-publishing-pipeline)
    - [3.2 File Management](#32-file-management)
    - [3.3 Release Manager dengan Auto-Changelog](#33-release-manager-dengan-auto-changelog)
    - [3.4 Media Pipeline via Runner](#34-media-pipeline-via-runner)
    - [3.5 SEO \& Performance Audit](#35-seo--performance-audit)
  - [4. Community Management Workflow](#4-community-management-workflow)
    - [4.1 Issue Triage Otomatis dengan AI](#41-issue-triage-otomatis-dengan-ai)
    - [4.2 PR Management](#42-pr-management)
    - [4.3 Community Health Report](#43-community-health-report)
    - [4.4 Milestone Tracker](#44-milestone-tracker)
  - [5. Integrasi WebScout + GitHub Studio](#5-integrasi-webscout--github-studio)
    - [Research → Artikel → Publikasi](#research--artikel--publikasi)
  - [6. Scheduler + GitHub Studio](#6-scheduler--github-studio)
    - [Contoh: Auto-Publish / Auto-Merge](#contoh-auto-publish--auto-merge)
  - [7. Cheat Sheet Cepat](#7-cheat-sheet-cepat)
  - [8. Tips \& Best Practices](#8-tips--best-practices)
  - [9. Troubleshooting](#9-troubleshooting)
  - [10. Referensi](#10-referensi)

---

## 1. Pengenalan

### Apa itu GitHub Studio?

**GitHub Studio** adalah modul terintegrasi dalam Discord AI Bot yang mengubah bot Discord kamu menjadi **asisten all-in-one untuk GitHub**. Dengan ~114 tools total, kamu bisa:

- ✍️ **Content Creator**: nulis artikel, publish blog, manage release, proses media, SEO audit
- 👥 **Community Manager**: triage issues, manage PR, pantau kesehatan komunitas, track milestone
- 🤖 **Auto-pilot**: schedule tugas via cron + AI untuk workflow tanpa campur tangan manual

Semua dilakukan **langsung dari Discord / MCP Client** — tanpa perlu buka browser GitHub.

### Cara Akses

Ada **3 cara** menggunakan GitHub Studio:

| Metode | Cara | Cocok Untuk |
|--------|------|-------------|
| **🐦 MCP Tools** | Panggil tool lewat MCP Client (Claude Desktop, VS Code, Cursor) | Power user, AI agent |
| **💬 Discord Chat** | Pakai `/ask` dengan prompt ke AI | Kasual, cepat |
| **⏰ Scheduler** | Set task cron otomatis | Headless automation |

**Contoh MCP:**
```
github-file action:read path:README.md repo:discord-ai-bot
```

**Contoh Discord `/ask`:**
```
/ask tolong cek health report repo discord-ai-bot dan buat release v2.0
```

---

## 2. Tools Overview

### Tools Cepat

| Tool | Fungsi | 1 Baris |
|------|--------|---------|
| `github-file` | Baca/buat/update/hapus file di repo | `action:read path:blog/post.md` |
| `github-pr` | Manage Pull Request | `action:list` |
| `github-issue` | Manage Issue + auto-triage AI | `action:triage number:42` |
| `github-release` | Buat release + changelog | `action:create tag:v1.2.0` |
| `github-community` | Health report & milestone | `action:report` |
| `github-blog` | Blog workflow 1-klik | `title:"My Post" content:"..."` |

### Tools Lengkap

```
📁 FILE MANAGEMENT
  ├── github-file action:read    path:README.md
  ├── github-file action:create  path:blog/post.md  content:"# Hello"
  ├── github-file action:update  path:src/index.ts  content:"..."
  └── github-file action:delete  path:old-file.md

🔀 PULL REQUEST
  ├── github-pr action:list
  ├── github-pr action:create  title:"Fix bug"  head:fix-branch
  ├── github-pr action:merge   number:12
  └── github-pr action:check   number:12

🐛 ISSUES
  ├── github-issue action:list     labels:bug
  ├── github-issue action:create   title:"..." body:"..."
  ├── github-issue action:update   number:5  state:closed
  └── github-issue action:triage   number:5    ← AI auto-label!

📦 RELEASE
  ├── github-release action:list
  └── github-release action:create  tag:v1.2.0  generateNotes:true

📊 COMMUNITY
  ├── github-community action:report
  └── github-community action:milestones

📝 BLOG
  └── github-blog  title:"..."  content:"..."  draft:false   ← 1-klik publish!

🔍 WEB INTELLIGENCE (WebScout)
  ├── web-search           query:"trending anime 2026"
  ├── web-scrape           url:"https://..."
  ├── web-deep-research    topic:"market game 2026"
  └── web-browse           urls:"url1,url2,url3"
```

---

## 3. Content Creator Workflow

### 3.1 Blog Publishing Pipeline

Ini adalah workflow paling powerful — **dari riset sampai publish dalam hitungan menit**.

**Flow:**
```
WebScout Research → Tulis Artikel → github-blog → PR → Merge → Release
```

**Langkah 1: Research topik**
```
web-deep-research topic:"perkembangan anime industry 2026"
```
→ Bot akan: buat sub-queries → search DuckDuckGo + Wikipedia + HN → scrape artikel → AI summary

**Langkah 2: Minta AI tulis artikel**
```
/ask tolong buat artikel blog tentang hasil research tadi dengan gaya santai bahasa Indonesia
```

**Langkah 3: Publish 1-klik**
```
github-blog 
  title:"Perkembangan Anime Industry 2026" 
  content:"# Perkembangan Anime Industry 2026\n\n...konten artikel..." 
  filepath:blog/anime-industry-2026.md 
  draft:false 
  tags:"anime, industry, 2026"
```

Apa yang terjadi di belakang layar:
1. ✅ Branch `blog/anime-industry-2026-xxx` dibuat dari `main`
2. ✅ File `blog/anime-industry-2026.md` di-commit ke branch
3. ✅ Pull Request dibuat: `📝 Perkembangan Anime Industry 2026`
4. Kamu tinggal merge via `github-pr merge number:XX`

**Kalau mau draft dulu:**
```
github-blog title:"..." content:"..." draft:true
```
→ Artikel tersimpan di branch, tanpa PR. Bisa diedit dulu.

### 3.2 File Management

Bisa untuk edit README, konfigurasi, atau file apapun.

**Baca file:**
```
github-file action:read path:README.md repo:discord-ai-bot
```

**Update langsung:**
```
github-file action:update path:README.md content:"# New Title\n\nUpdated description"
```

**Buat file baru:**
```
github-file action:create path:docs/guide.md content:"# Guide\n\n..."
```

**Contoh use case:**
- Edit `README.md` dengan info terbaru
- Tambah `CHANGELOG.md` entry
- Update `package.json` version
- Buat file konfigurasi baru

### 3.3 Release Manager dengan Auto-Changelog

Bikin release profesional dalam 1 perintah:

```
github-release action:create tag:v2.0.0 generateNotes:true prerelease:false
```

Yang terjadi:
1. ⏳ GitHub generate changelog dari **30 hari commits terakhir**
2. 🏷️ Tag `v2.0.0` dibuat
3. 📦 Release dibuat dengan catatan otomatis
4. 🔗 Link release dikirim ke Discord

**Cek release sebelumnya:**
```
github-release action:list
```

### 3.4 Media Pipeline via Runner

Butuh optimize gambar? Convert video? Ini dia solusinya — semua jalan di **GitHub Actions runner**.

**Optimize gambar:**
```
/ask jalanin optimize-images di folder ./assets/images
```
→ Bot dispatch ke runner: `for img in ./assets/images/*.{jpg,png}; do convert "$img" -quality 85 ...`

**Convert video:**
```
/ask convert video ./source/clip.mov ke mp4
```

**Bikin thumbnail:**
```
/ask generate thumbnail semua gambar di ./assets/images
```

**Tambah watermark:**
```
/ask kasih watermark ke semua gambar di ./assets/images pakai logo.png
```

> **Catatan:** Runner butuh Ubuntu + ImageMagick + ffmpeg. Semua sudah include di default GitHub Actions runner.

### 3.5 SEO & Performance Audit

Lighthouse audit langsung dari Discord:

```
/ask jalanin seo audit untuk https://example.com
```
→ Bot dispatch `npx lighthouse` ke runner → hasil audit di `lighthouse-report.json`

---

## 4. Community Management Workflow

### 4.1 Issue Triage Otomatis dengan AI

Ini fitur **paling powerful** untuk community manager. AI akan:

1. 📖 Baca konten issue
2. 🏷️ Suggest labels (bug, enhancement, question, documentation, urgent, dll)
3. 🔥 Tentukan priority (high / medium / low)
4. ✍️ Auto-label issue tanpa perlu buka GitHub

**Cara pakai:**
```
github-issue action:triage number:42
```

**Contoh hasil:**
```
🏷️ Auto-Triage Result
═══════════════════════
#42: Login button not working — Priority: high
🏷️ Labels: bug, urgent
🔥 Priority: high
```

**List issue dengan filter:**
```
github-issue action:list labels:bug,urgent
```

**Buat issue baru dari ide:**
```
github-issue action:create title:"Add dark mode" body:"User request for dark mode theme" labels:"enhancement"
```

### 4.2 PR Management

**Lihat semua open PR:**
```
github-pr action:list
```

**Cek conflict:**
```
github-pr action:check number:12
```
→ Bot cek apakah PR bisa di-merge atau ada conflict.

**Merge dengan squash (default):**
```
github-pr action:merge number:12
```

**Merge dengan metode lain:**
```
github-pr action:merge number:12 mergeMethod:merge
github-pr action:merge number:12 mergeMethod:rebase
```

### 4.3 Community Health Report

Dapatkan snapshot kesehatan repositori:

```
github-community action:report repo:discord-ai-bot
```

**Output:**
```
📊 Community Report: Netuv/discord-ai-bot
════════════════════════════════════════
⭐ Stars: 12
🍴 Forks: 3
🐛 Open Issues: 5
🔀 Open PRs: 2
👥 Top Contributors: Netuv (42), User2 (3)

📅 Latest: PushEvent → IssuesEvent → PullRequestEvent
```

Cocok untuk:
- Report mingguan ke tim
- Cek health repo sebelum release
- Pantau kontributor aktif

### 4.4 Milestone Tracker

Pantau progress milestone dengan visual progress bar:

```
github-community action:milestones
```

**Output:**
```
📊 Milestones
══════════════
📍 v2.0 Release (open)
   ▓▓▓▓▓▓░░░░ 60% (6/10 issues)
   Due: 30 June 2026

📍 v1.0 Launch (closed)
   ▓▓▓▓▓▓▓▓▓▓ 100% (12/12 issues)
   Due: 1 June 2026

---

## 5. Integrasi WebScout + GitHub Studio

### Research → Artikel → Publikasi

Ini adalah **kombinasi paling powerful** — WebScout untuk riset, GitHub Studio untuk publikasi.

**Contoh workflow lengkap:**

```
🗣️ "Aku mau bikin artikel tentang tren AI di industri game"

1. Research:
   web-deep-research topic:"AI tren industri game 2026" depth:4
   
2. AI tulis artikel:
   /ask dari hasil research tadi, buat artikel blog bahasa Indonesia yang engaging
   
3. Publish ke GitHub:
   github-blog 
     title:"Revolusi AI di Industri Game 2026" 
     content:"[copy paste hasil /ask]" 
     filepath:blog/ai-game-industry-2026.md

4. Release:
   github-release action:create tag:v1.1.0 generateNotes:true

Selesai! 🎉
```

**Waktu total:** ~5 menit dari ide → publikasi.

---

## 6. Scheduler + GitHub Studio

Kamu bisa **menjadwalkan** tugas GitHub Studio secara otomatis via Scheduler system.

### Contoh: Auto-Publish / Auto-Merge

**Schedule task untuk auto-merge PR setiap hari:**
```
scheduler-add
  name:"Auto-merge ready PRs"
  cron:"0 9 * * *"        ← Setiap jam 9 pagi UTC
  action:github-run
  channel_id:123456789
  guild_id:123456789
  repo:discord-ai-bot
  command:"echo 'Auto-merge pending PRs...'"
```

**Schedule untuk community report mingguan:**
```
scheduler-add
  name:"Weekly Community Report"
  cron:"0 8 * * 1"         ← Setiap Senin jam 8 pagi
  action:ai-prompt
  channel_id:123456789
  guild_id:123456789
  prompt:"Buat laporan komunitas mingguan untuk repo discord-ai-bot pakai github-community report"
```

**Schedule untuk auto-article dengan riset web:**
```
scheduler-add
  name:"Daily Anime News"
  cron:"0 7 * * *"         ← Setiap hari jam 7 pagi
  action:ai-article
  channel_id:123456789
  guild_id:123456789
  topic:"berita anime terbaru"
  language:"Indonesia"
```

---

## 7. Cheat Sheet Cepat

### Content Creator

```
# Research
web-deep-research  topic:"..." depth:3

# Nulis & Publish
github-blog  title:"..." content:"..." draft:false
github-blog  title:"..." content:"..." draft:true    ← draft mode

# File
github-file  action:read    path:README.md
github-file  action:create  path:blog/post.md content:"..."
github-file  action:update  path:README.md    content:"..."
github-file  action:delete  path:old.md

# Release
github-release  action:create  tag:v2.0  generateNotes:true
github-release  action:list

# Media
dispatch runner: optimize-images   path:./assets
dispatch runner: generate-thumbnails  path:./assets
dispatch runner: convert-video  input:source.mov output:result.mp4
dispatch runner: watermark  path:./assets watermarkFile:logo.png
```

### Community Manager

```
# Issues
github-issue  action:list
github-issue  action:list     labels:bug
github-issue  action:create   title:"..." body:"..."
github-issue  action:update   number:5  state:closed
github-issue  action:update   number:5  labels:"bug, urgent"
github-issue  action:triage   number:5          ← Auto AI

# PR
github-pr     action:list
github-pr     action:check    number:12
github-pr     action:merge    number:12
github-pr     action:merge    number:12  mergeMethod:rebase

# Komunitas
github-community  action:report
github-community  action:milestones
```

### Power Combo 🔥

```
# 1. Research → Blog → Release
web-deep-research topic:"anime industry 2026" depth:3
→ /ask "buat artikel dari research"
→ github-blog title:"Anime 2026" content:"..." 
→ github-release action:create tag:v1.1 generateNotes:true

# 2. Triage → Fix → Merge
github-issue action:triage number:42
→ github-pr action:merge number:12
→ github-release action:create tag:v1.2 generateNotes:true

# 3. Auto-pilot
scheduler-add name:"Daily Report" cron:"0 8 * * *" ...
```

---

## 8. Tips & Best Practices

### Untuk Content Creator

1. **Research dulu sebelum nulis**
   - Pakai `web-deep-research` biar artikelmu berdasarkan data real, bukan cuma pengetahuan AI
   - Set `depth:4-5` untuk topik kompleks

2. **Manfaatkan Draft Mode**
   - `draft:true` — simpan di branch tanpa PR, edit dulu
   - `draft:false` — langsung bikin PR, tinggal merge

3. **Release dengan changelog otomatis**
   - Selalu set `generateNotes:true`
   - Changelog otomatis dari 30 hari commits

4. **Media batch processing**
   - Kumpulin dulu semua gambar di folder, baru optimize sekaligus
   - Runner bisa handle ImageMagick, ffmpeg, dan tools lainnya

### Untuk Community Manager

1. **Auto-triage setiap hari**
   - Jadwalkan `scheduler` untuk triage issue baru setiap jam 9 pagi
   - Prioritaskan yang `high priority` duluan

2. **Pantau health weekly**
   - Schedule `github-community report` tiap Senin pagi
   - Kirim ke channel Discord internal tim

3. **Labels yang konsisten**
   - Pakai labeling system yang jelas: `bug`, `enhancement`, `question`, `documentation`, `urgent`, `discussion`, `good first issue`, `security`
   - Auto-triage AI akan suggest labels yang sesuai

4. **PR auto-merge untuk hal kecil**
   - Typo fix, dokumentasi → bisa auto-merge
   - Fitur baru → tetap manual review

### Power Tips

- **Kombinasi MCP + Discord**: Kamu bisa pakai MCP tools dari Claude Desktop, lalu hasilnya otomatis ke Discord channel
- **WebScout cache**: Hasil search di-cache 1 jam. Kalau mau fresh, set parameter
- **Gunakan `/ask` untuk hal kompleks**: Kadang lebih gampang bilang "tolong buat release v2.0 dengan changelog" daripada isi parameter satu-satu
- **Scheduler = bot kamu kerja 24/7**: Set task cron, bot akan eksekusi otomatis bahkan saat kamu offline

---

## 9. Troubleshooting

### Error: GITHUB_TOKEN belum diset
```
❌ GITHUB_TOKEN belum diset.
```
**Solusi:**
```bash
echo -n "github_pat_xxxx" | npx wrangler secret put GITHUB_TOKEN
```

### Error: File tidak ditemukan
```
❌ GitHub API 404 ...
```
**Solusi:**
- Cek path file (case sensitive!)
- Cek branch yang benar
- Cek repo name

### Error: PR conflict
```
❌ PR #12 tidak bisa di-merge (conflict)
```
**Solusi:**
- Resolve manual via GitHub
- Set `mergeMethod:rebase` kalau perlu

### Error: Runner timeout
```
⚠️ GitHub Actions masih running...
```
**Solusi:**
- Default timeout 15 menit
- Cek status via `github-run-status` atau langsung ke GitHub Actions tab

### Error: AI tidak merespon
```
❌ Semua AI provider gagal.
```
**Solusi:**
- Cek secret `OPENROUTER_API_KEY` atau provider lain
- Fallback otomatis ke provider berikutnya
- Pastikan AI binding aktif di wrangler.jsonc

---

## 10. Referensi

| Resource | Link |
|----------|------|
| **Bot MCP Endpoint** | `https://discord-ai-bot.luminary-bot.workers.dev/mcp` |
| **Discord Bot** | Invite link dari Discord Developer Portal |
| **GitHub Repo** | `https://github.com/Netuv/discord-ai-bot` |
| **WORKSPACE-LOG.md** | Catatan lengkap perubahan & fitur |
| **ARTIKEL-GUIDE.md** | Panduan format artikel untuk scheduler |
| **AGENTS.md** | Petunjuk untuk AI coding agents |

### File Penting di Project

| File | Fungsi |
|------|--------|
| `src/github-studio.ts` | Kode utama GitHub Studio (~800 baris) |
| `src/web-scout.ts` | Web intelligence engine |
| `src/mcp-handler.ts` | ~114 tool definitions |
| `src/ai-router.ts` | AI multi-provider router |
| `src/scheduler.ts` | Cron scheduler system |

---

> **💡 Pro Tip:** Simpan file ini sebagai referensi. Kalau ada tool yang kamu sering pakai, kamu bisa minta bot untuk ngerjain semuanya lewat `/ask` dengan bahasa manusia — bot akan pilih tool yang tepat secara otomatis!
>
> *Dibuat dengan ❤️ oleh Discord AI Bot — 19 Juni 2026*
