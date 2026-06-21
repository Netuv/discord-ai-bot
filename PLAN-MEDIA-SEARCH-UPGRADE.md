# 🎯 Plan: Media Search Upgrade — Llama Web Search + Firecrawl Fallback

> **Versi:** 1.0 (Draft)
> **Tanggal:** 21 Juni 2026
> **Tujuan:** Meningkatkan akurasi & konsistensi pencarian gambar/video untuk artikel Discord

---

## 📋 Ringkasan

Masalah: ImageScraper & VideoScraper yang udah ada sering gagal nemuin media karena **query dari AI jelek** alias sumbernya terbatas.

Solusi: Tambah **2 layer baru** di atas scraper yang udah ada:
1. **Llama Web Search** — Generate keyword optimal pake AI (gratis, internal)
2. **Firecrawl API** — Scrape langsung situs anime buat fallback (eksternal)

---

## 🧠 Layer 1: Llama Web Search

### Cara Kerja

```
[Article Title + Section Content]
         ↓
  ┌─────────────────────────────┐
  │  AiRouter.chat()            │
  │  Prompt: "Generate keyword  │
  │  gambar & video terbaik     │
  │  dari judul artikel ini..." │
  └─────────────────────────────┘
         ↓
  ┌─────────────────────────────┐
  │  Output JSON:               │
  │  {                          │
  │    image_keywords: [...],   │
  │    video_keywords: [...],   │
  │    priority: [sumber]       │
  │  }                          │
  └─────────────────────────────┘
         ↓
  → Dikirim ke ImageScraper / VideoScraper
```

### Arsitektur

**File baru:** `src/media-query-optimizer.ts` (modular, terpisah)

```typescript
interface OptimizedQuery {
  image_keywords: string[];    // 3-5 keyword gambar (prioritas)
  video_keywords: string[];    // 3-5 keyword video (prioritas)
  mal_title?: string;          // Exact title untuk MAL/Jikan API
  anilist_title?: string;      // Exact title untuk AniList
  year_hint?: number;          // Tahun rilis (bantu filter)
  preferred_source?: string;   // "youtube" | "mal" | "anilist" | "kitsu"
}
```

### Prompt ke AI

```text
Kamu adalah asisten pencarian media anime. Dari judul artikel dan konten
section di bawah, generate keyword TERBAIK untuk mencari gambar dan video.

ATURAN:
1. Image keyword → spesifik, pake judul Jepang/Inggris + "key visual"
   Contoh: "Demon Slayer Infinity Castle key visual 2026"
2. Video keyword → spesifik, pake judul + "trailer/PV/official"
   Contoh: "Demon Slayer Infinity Castle trailer official"
3. Sertakan exact title untuk MAL/AniList biar pencarian akurat
4. Tahun rilis (kalau ada) bantu filter hasil lebih relevan

FORMAT JSON:
{
  "image_keywords": [...],
  "video_keywords": [...],
  "mal_title": "...",
  "anilist_title": "...",
  "year_hint": 2026
}
```

### AI Model yang Dipakai

| Provider | Model | Priorit |
|----------|-------|---------|
| **Opencode** | deepseek-v4-flash-free | #1 (sama kayak writer) |
| **Cloudflare** | @cf/meta/llama-4-scout-17b-16e-instruct | #2 (karena udah built-in) |
| **OpenRouter** | meta-llama/llama-4-scout:free | #3 (free) |

> **Catatan:** Query generator pake model yang SAMA dengan AI writer — gak perlu setup baru!

### Limitasi 🔒

| Aspek | Limit | Notes |
|-------|-------|-------|
| **Waktu** | ~2-5 detik per generate | Panggilan AI cepat, response pendek |
| **Cost** | 🆓 **Gratis** | Pake model free yang udah ada |
| **Rate limit** | Sama kayak AI writer (OpenCode/Cloudflare) | Ikut limit masing-masing provider |
| **Akurasi** | Tergantung model | DeepSeek Flash cukup akurat buat naming |

---

## 🔥 Layer 2: Firecrawl API (Fallback)

### Cara Kerja

```
[Kalau ImageScraper + VideoScraper gagal total]
         ↓
  ┌─────────────────────────────┐
  │  Firecrawl.search()         │
  │  Query: "Demon Slayer       │
  │  Infinity Castle key        │
  │  visual site:animecorner.me │
  │  OR site:crunchyroll.com"   │
  └─────────────────────────────┘
         ↓
  ┌─────────────────────────────┐
  │  Firecrawl.scrape()         │
  │  Ambil halaman → extract    │
  │  semua <img> dan <video>    │
  │  tags + OpenGraph metadata  │
  └─────────────────────────────┘
         ↓
  ┌─────────────────────────────┐
  │  Filter & Validasi          │
  │  - Cuma .jpg/.png/.webp     │
  │  - Skip iklan/logo          │
  │  - Prioritaskan og:image    │
  │  - YouTube links → validasi │
  └─────────────────────────────┘
         ↓
  → URL gambar/video siap dikirim ke Discord
```

### Arsitektur

**Integrasi:** Tambah fungsi `firecrawlFallback()` di `article-publisher.ts` atau buat file `src/firecrawl-scraper.ts`.

```typescript
interface FirecrawlConfig {
  apiKey: string;         // FIRECRAWL_API_KEY dari env
  maxPages: number;       // Max halaman yang di-scrape per artikel (default: 2)
  timeoutMs: number;      // Timeout per request (default: 10000)
}

interface FirecrawlResult {
  images: { url: string; source: string; alt?: string }[];
  videos: { url: string; source: string; title?: string }[];
}
```

### Situs Target

| Prioritas | Situs | Type | Kenapa? |
|-----------|-------|------|---------|
| 1 | `animecorner.me` | Berita anime | Banyak gambar key visual |
| 2 | `crunchyroll.com` | Official | Gambar resmi, video trailer |
| 3 | `animenewsnetwork.com` | Berita anime | Screenshot, key visual |
| 4 | `myanimelist.net` | Database | Gambar anime/manga official |
| 5 | `anilist.co` | Database | Gambar HQ |

### Limitasi Firecrawl API 🔒

| Aspek | Free Tier | Notes |
|-------|-----------|-------|
| **Halaman/bulan** | **500 pages** 🔴 | Abis cepet kalau tiap artikel 5 halaman = 100 artikel/bulan |
| **Concurrent req** | 10 req/menit | Aman, kita cuma 1-2 req per artikel |
| **Max page size** | 100KB per halaman | Cukup buat extract gambar |
| **JS Rendering** | ✅ Yes | Bisa scrape SPA modern |
| **API Key** | Required | Simpan sebagai secret `FIRECRAWL_API_KEY` |
| **Cost overage** | $19/bulan (5000 halaman) | Kalau free habis, bisa upgrade |
| **Response time** | ~3-8 detik | Tergantung halaman |

### Strategi Hemat Kuota 💡

| Strategi | Hemat | Cara |
|----------|-------|------|
| **Pake Firecrawl sebagai fallback SAJA** | 🔥 Banyak | Hanya dipanggil kalau ImageScraper+VideoScraper gagal total |
| **Batch search dulu, bukan scrape** | Sedang | `search()` API lebih murah dari `scrape()` |
| **Cache hasil Firecrawl ke KV** | Banyak | Cache 24 jam biar gak scrape ulang topik yang sama |
| **Prioritas situs tertentu** | Sedang | Cuma scrape situs dengan rating gambar tinggi |
| **Max 2 halaman per artikel** | Sedang | Batasi jumlah scraping per eksekusi |

---

## 🔄 Flow Lengkap (Usulan)

```
[executeAiArticle()]
       ↓
  Research → Generate Artikel
       ↓
  ┌────────────────────────────────────────────────┐
  │  publishArticle()                              │
  │                                                │
  │  ┌─────────────────────┐                       │
  │  │  PHASE 1: Parallel  │                       │
  │  │  ┌─────────────────┐│                       │
  │  │  │ Headline Embed   ││                       │
  │  │  └─────────────────┘│                       │
  │  │  ┌─────────────────┐│                       │
  │  │  │ Media Search     ││  (BARU! 🆕)          │
  │  │  │                  ││                       │
  │  │  │ 1. Llama Query   ││ ← Generate keyword   │
  │  │  │    Optimizer 🦙  ││    optimal pake AI    │
  │  │  │                  ││                       │
  │  │  │ 2. ImageScraper  ││ ← Pake keyword baru   │
  │  │  │    + VideoScraper││                       │
  │  │  │                  ││                       │
  │  │  │ 3. Firecrawl API ││ ← Fallback scraper    │
  │  │  │    (jika gagal)🔥││    langsung ke situs   │
  │  │  └─────────────────┘│                       │
  │  └─────────────────────┘                       │
  │                                                │
  │  ┌─────────────────────┐                       │
  │  │  PHASE 2: Sequential│                       │
  │  │  Kirim per-section  │                       │
  │  │  dengan media       │                       │
  │  └─────────────────────┘                       │
  └────────────────────────────────────────────────┘
```

---

## 📦 File yang Akan Diubah/Dibuat

| File | Status | Deskripsi |
|------|--------|-----------|
| `src/media-query-optimizer.ts` | 🆕 **BARU** | Llama Web Search — generate keyword optimal dari judul artikel |
| `src/article-publisher.ts` | 🔧 **UBAH** | Integrasi `media-query-optimizer` sebagai langkah awal pre-fetch media |
| `src/video-scraper.ts` | 🔧 **UBAH** (minor) | Terima multiple keywords, coba satu-satu sampai ketemu |
| `src/image-scraper.ts` | 🔧 **UBAH** (minor) | Terima multiple keywords, coba satu-satu sampai ketemu |
| `src/firecrawl-scraper.ts` | 🆕 **BARU** (opsional) | Firecrawl API integration sebagai fallback |
| `.env.local` | 🔧 **UBAH** | Tambah `FIRECRAWL_API_KEY` |
| `wranger.jsonc` | 🔧 **UBAH** | Tambah secret binding `FIRECRAWL_API_KEY` (kalau jadi pake Firecrawl) |

---

## ⏱️ Estimasi Waktu Implementasi

| Step | Estimasi | Dependency |
|------|----------|------------|
| 1. Buat `media-query-optimizer.ts` | ~30 menit | AiRouter (udah ada) |
| 2. Update `article-publisher.ts` | ~15 menit | Step 1 |
| 3. Update video-scraper multi-keyword | ~15 menit | - |
| 4. Update image-scraper multi-keyword | ~15 menit | - |
| 5. Buat `firecrawl-scraper.ts` | ~45 menit | Firecrawl API key |
| 6. Deploy & test | ~15 menit | All steps |
| **Total** | **~2 jam** | |

---

## 🎯 Rekomendasi

**Mulai dari Step 1-4 dulu** (Llama Query Optimizer) karena:
- 🆓 **Gratis** — pake model AI yang udah ada
- 🚀 **Cepet** — response AI ~2-5 detik
- 🎯 **High impact** — banyak kasus media gagal karena query jelek
- 🔧 **No external API** — gak perlu setup key baru

**Firecrawl (Step 5)** bisa nanti kalau masih kurang:
- 💰 Ada cost (walau kecil)
- ⏱️ Tambah delay 3-8 detik
- 🔌 Dependency eksternal
- 📊 Butuh monitoring kuota 500 hal/bulan

---

## ✅ Checklist Implementasi

- [ ] **Step 1:** `media-query-optimizer.ts` — Llama generate keyword
- [ ] **Step 2:** Integrasi ke `article-publisher.ts` — panggil optimizer sebelum pre-fetch
- [ ] **Step 3:** VideoScraper — terima multiple keywords, fallback query
- [ ] **Step 4:** ImageScraper — terima multiple keywords, fallback query
- [ ] **Step 5:** Test — verifikasi keyword lebih relevan dari sebelumnya
- [ ] **Step 6:** (Opsional) Firecrawl fallback integration
- [ ] **Step 7:** Deploy + monitoring

---

*Dibuat untuk Lumina Discord Bot — Media Search Upgrade Plan*
