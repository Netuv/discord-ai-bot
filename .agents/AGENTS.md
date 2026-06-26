# Discord AI Bot — Workspace Rules (AGENTS.md)

> Berlaku untuk semua agent/AI yang bekerja di workspace ini.
**WAJIB UNTUK SESI PERTAMA CHAT!**
Hal paling pertama yang harus dilakukan Agent adalah membaca seluruh
isi dokumen di dalam folder /Master-Context

---

## 🔴 STRICT RULE: Konten Artikel Harus Selalu Up-to-Date

**Ini adalah aturan PALING KETAT dalam proyek ini. Tidak ada pengecualian.**

### Definisi "Up-to-Date"

Konten artikel yang dihasilkan bot WAJIB merujuk pada informasi yang **baru dalam 30 hari terakhir** (minimal 1 bulan terakhir dari tanggal eksekusi).

### Cakupan Aturan

Aturan ini berlaku di seluruh lapisan pipeline:

| Lapisan | Aturan |
|---------|--------|
| **Topic Generation** | Topik yang di-generate AI harus relevan dengan tren/rilis 30 hari terakhir. Prompt ke AI wajib menyertakan konteks tanggal dan requirement recency. |
| **Research Engines** | Setiap engine wajib memfilter data yang lebih tua dari 30 hari kecuali format retrospective, lore-explained, character-spotlight. Data yang digunakan sebagai main source HARUS punya aired_date, published_at, atau date dalam 30 hari terakhir. |
| **Fallback Topic Pools** | Pool statis di topic-generator.ts HANYA boleh berisi judul/event yang masih relevan secara komunitas saat ini. Pool harus diperbarui setiap ada revisi kode. |
| **Prompt System** | Prompt di base-prompt.ts dan format-prompts.ts WAJIB menyertakan instruksi recency: AI tidak boleh mengarang data lama sebagai fakta baru. |
| **Auditor** | auditor.ts WAJIB menolak konten yang mengklaim sesuatu sebagai "terbaru" / "baru rilis" tanpa data penelitian yang valid dan berumur < 30 hari. |

### Format yang Dikecualikan (Partial Exemption)

Format berikut boleh membahas karya lama sebagai SUBJEK UTAMA, TAPI tetap harus ada anchor recency — yaitu alasan kontemporer mengapa topik lama ini relevan sekarang:

- retrospective — wajib ada trigger recency (anniversary, film, remake, dll.)
- lore-explained — wajib dikaitkan dengan chapter/episode terbaru
- character-spotlight — wajib ada momentum terkini (arc baru, collab, dll.)
- comparison — wajib ada konteks mengapa perbandingan ini relevan sekarang

### Format yang WAJIB 100% Up-to-Date

Konten harus membahas rilis/event dalam 30 hari terakhir tanpa terkecuali:

- breaking-news
- season-preview
- industry
- review (review karya yang sedang airing/baru rilis)
- discussion (topik yang sedang dibahas komunitas)
- recommendation (berdasarkan tren komunitas saat ini)
- top-list (list yang relevan dengan periode saat ini)

### Implementasi Teknis Wajib

Ketika menulis atau memodifikasi kode di proyek ini, agent WAJIB memastikan:

1. topic-generator.ts — Prompt AI generation HARUS menyertakan currentDate dan instruksi topik harus relevan dalam 30 hari terakhir.
2. base-prompt.ts — System prompt HARUS menyertakan TODAY_DATE dan instruksi: Jangan buat klaim terbaru atau baru rilis untuk konten yang rilis lebih dari 30 hari lalu. Gunakan data riset yang disediakan sebagai sumber kebenaran.
3. Format prompts breaking-news, season-preview, industry — WAJIB ada kalimat eksplisit bahwa topik harus dari kurang dari 30 hari yang lalu.
4. Research engines — Semua engine yang fetch dari Jikan/AniList/WebScout WAJIB menambahkan filter date range di query atau di hasil yang di-return ke generator.
5. auditor.ts — Tambahkan pengecekan: jika konten mengandung kata-kata seperti baru saja rilis, baru keluar, episode terbaru minggu ini, dll., tapi tidak ada data riset yang mendukung recency tersebut, artikel HARUS di-reject atau di-flag.

### Larangan Absolut

- DILARANG mengisi fallback topic pool dengan judul yang sudah tayang lebih dari 1 tahun lalu KECUALI format yang diizinkan di atas.
- DILARANG menghapus atau memperlemah recency check di auditor.
- DILARANG membuat prompt yang tidak menyertakan konteks tanggal saat ini.
- DILARANG mereturn riset tanpa metadata tanggal (publishedAt / airingDate / dll.).
- DILARANG melewati recency filter atas nama kenyamanan atau performa.

### Pelanggaran

Jika agent melakukan perubahan kode yang melemahkan atau menghilangkan recency enforcement, perubahan tersebut harus di-revert dan rule ini harus ditegakkan kembali sebelum melanjutkan.

---

## Aturan Umum Proyek

- Semua file TypeScript wajib dalam strict mode (sudah dikonfigurasi di tsconfig.json).
- Setiap file maksimal 300 baris — jika lebih, split menjadi file terpisah.
- Gunakan Cloudflare Workers pattern — tidak ada node: built-ins.
- Semua async calls wajib menggunakan safeFetch dari core/safe-fetch.ts.
- Jangan pernah hardcode secret — selalu via env.*.
- TraceId wajib ada di setiap log (via TraceLogger).
- Budget tracker (BudgetTracker) wajib dicek sebelum setiap subrequest external.

---

## DEPLOYMENT RULES!

- Lakukan Version Backup (read Folder Version-Backup) sebelum Logging dan Deployment!
- Lakukan Deploy Setelah Logging!
