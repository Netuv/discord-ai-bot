# Discord Article Scheduler - Prompt & Format Guide

> **Versi:** 2.0 (Narasi Format)
> **Terakhir diperbarui:** 19 Juni 2026
> **Target:** Artikel otomatis anime/manga/game untuk Discord
> **Format:** NARASI mengalir (BUKAN bullet list/fields)

---

## Overview

Dokumen ini berisi panduan pembuatan artikel otomatis di Discord.
**Mulai v2.0:** Artikel ditulis dalam format **narasi** seperti blog beneran, bukan lagi poin-poin.

---

## Workflow Pembuatan Artikel

### Step 1: Cari Topik Terupdate

**Action:** `webResearch()` → WebScout engine  
**Tools:** DuckDuckGo + Wikipedia + HackerNews (WebScout)

**Query examples:**
- "anime news update Juni 2026"
- "manga new release Juni 2026"
- "game release update Juni 2026"
- "Crunchyroll announcement 2026"

**Filter topik:**
- Hype tinggi (anime populer, sekuel ditunggu)
- Rilis dalam 1-2 minggu ke depan
- Breaking news (pengumuman resmi)
- Skip berita lama dan konten NSFW

---

### Step 2: Buat Konten (NEW — Narasi Format)

#### 2.1 Header yang Menarik

**Contoh headline menarik:**
- `🔥 Summer 2026 Anime Season: Crunchyroll Umumkan Daftar Lengkap!`
- `💥 Re:ZERO Season 4 Part 2: Tanggal Rilis & Key Visual Terungkap!`
- `🎮 GTA 6 Rilis Bulan Depan? Ini Bocoran Terbarunya!`
- `😱 Plot Twist! Manga Favorite Kamu Bakal Tamat Minggu Ini`

**Rumus headline:** [Emoji reaksi] + [Judul] + [Info penting] + [Tanda seru]

#### 2.2 Struktur Artikel — NARASI (v2.0)

```json
{
  "title": "🔥 Headline engaging max 100 karakter",
  "intro": "Paragraf hook 2-3 kalimat. Bikin pembaca penasaran!",
  "sections": [
    {
      "heading": "🔍 Sub-judul informatif",
      "body": "Paragraf NARASI 4-6 kalimat. Jelaskan detail, konteks, analisis. BUKAN poin-poin!"
    }
  ],
  "closing": "Paragraf penutup 2-3 kalimat. Kesimpulan atau ajakan.",
  "category": "anime/manga/game/breaking/announcement/general",
  "anime_title": "Judul valid untuk cari gambar via Jikan API",
  "keywords": ["kata", "kunci", "untuk", "gambar"]
}
```

**⚠️ JANGAN GUNAKAN format lama (fields/bullet):**
```json
❌ "fields": [ { "name": "...", "value": "- poin\n- poin" } ]  ← FORMAT LAMA, JANGAN DIPAKAI!
```

#### 2.3 Gaya Penulisan

| Aspek | ❌ Hindari | ✅ Gunakan |
|-------|-----------|-----------|
| Format | Fields/bullet/list/poin | **Paragraf narasi** mengalir |
| Tone | Kaku, formal, robotik | **Kasual, santai, akrab** (kayak ngobrol di Discord) |
| Paragraf | > 3 kalimat (tembok teks) | **2-3 kalimat** pendek per paragraf |
| Hook | "Halo, pada artikel ini..." | **Pertanyaan relatable** atau pernyataan berani |
| Transisi | "Selain itu", "Di sisi lain" | **"Nah...", "Bayangin deh...", "Tapi tunggu dulu..."** |
| Emoji | Terlalu banyak (>10) | Cukup 3-5 untuk visual cue |
| Sudut pandang | Pasif, impersonal | **"Aku-Kamu"** atau **"Kita"** natural |
| Metafora | Tidak ada | Sesekali pake analogi biar hidup |
| List | `- point 1` di body | Narasi: "Ada beberapa hal menarik..." |
| Kata klise | "Kesimpulannya", "Dapat disimpulkan", "Penting untuk diingat" | **"Intinya...", "Singkatnya...", "Pokoknya..."** |

**Contoh paragraf NARASI dengan gaya baru:**
```
Kamu tau gak sih, summer 2026 bakal jadi salah satu season paling gila 
dalam sejarah anime! Aku udah liat lineup-nya dan jujur — ini gila 
 banget. Crunchyroll baru aja ngumumin daftar lengkapnya, dan ada 
beberapa judul yang langsung bikin aku tepuk jidat.

Nah, yang paling bikin heboh tentu aja return-nya serial favorit yang 
udah ditunggu dari jaman kuliah. Kamu tau sendiri kan gimana rasanya 
nunggu season lanjutan bertahun-tahun? Tahun ini akhirnya beneran tayang!
```

---

### Step 3: Cari Gambar (NEW — via Jikan API, bukan tebak URL)

**Cara baru:** AI kasih `anime_title` → cari ke **Jikan API (MyAnimeList)** → dapat image_url VALID.

#### Sumber Gambar (Prioritas)

| Prioritas | Sumber | Method | Akurasi |
|-----------|--------|--------|---------|
| 1 | **Jikan API** (anime) | `api.jikan.moe/v4/anime?q=title` | ✅ Tinggi |
| 2 | **Jikan API** (manga) | `api.jikan.moe/v4/manga?q=title` | ✅ Tinggi |

**Cara kerja:**
1. AI generate `anime_title` dari artikel (contoh: "Jujutsu Kaisen")
2. Bot cari ke `https://api.jikan.moe/v4/anime?q=Jujutsu+Kaisen`
3. Response: `{ title, images: { jpg: { image_url } } }`
4. **100% valid** — gambar asli dari MyAnimeList!

**Fallback:**
- Jika `anime_title` kosong → cari dari `keywords` array
- Jika masih gagal → cari dari `topic` asli
- Jika semua gagal → kirim embed tanpa gambar

---

### Step 4: Kirim ke Discord

#### Format Embed (v2.0 — Narasi)

```json
{
  "title": "🔥 Headline Menarik",
  "description": "Paragraf intro...\n\n**🔍 Sub-judul**\n\nParagraf body narasi...\n\n**Penutup**\n\nKesimpulan...",
  "color": "HEX_WARNA",
  "timestamp": "ISO_TIMESTAMP",
  "footer": { "text": "🤖 LuminaBot • Gambar via MyAnimeList" }
}
```

**⚠️ Perubahan dari v1.0:**
- ~~`fields`~~ → Sekarang pake `description` narasi panjang
- ~~`image_query` tebak URL~~ → Sekarang `anime_title` + `keywords` cari via Jikan API
- ~~`description` 2 kalimat~~ → Sekarang `intro` + `sections[].body` + `closing`

---

## Warna Embed

| Kategori | Hex | Warna |
|----------|-----|-------|
| Anime | FF6B6B | Merah muda |
| Manga | 9B59B6 | Ungu |
| Game | 3498DB | Biru |
| Breaking News | E74C3C | Merah |
| Announcement | F39C12 | Kuning |
| General | 5865F2 | Blurple |

---

## ✅ Contoh Artikel Lengkap (Narasi Format v2.0 — Gaya Santai)

### Contoh 1: Anime News

**Embed Output:**
```
Judul: 🔥 Summer 2026 Bakal Season Tergila! Crunchyroll Umumkan Lineup Lengkap

Isi Embed (narasi santai):
Kamu tau gak sih, summer 2026 bakal jadi salah satu season paling gila 
dalam sejarah anime! Crunchyroll baru aja ngumumin lineup lengkapnya 
dan jujur — ada beberapa judul yang langsung bikin aku tepuk jidat.

🔍 Deretan Sekuel yang Paling Ditunggu
Yang paling bikin heboh tentu aja return-nya serial favorit yang udah 
ditunggu dari jaman kuliah. Kamu tau sendiri kan gimana rasanya nunggu 
season lanjutan bertahun-tahun? Nah tahun ini, beberapa di antaranya 
akhirnya beneran tayang. Bayangin deh, ada yang sempet vakum 3 tahun 
lebih, tiba-tiba muncul lagi dengan trailer bikin merinding.

💡 Anime Original yang Wajib Masuk Watchlist
Terus gak cuma sekuel doang. Beberapa studio kaya MAPPA sama Kyoto 
Animation ternyata punya kejutan spesial. Mereka siap ngerilis anime 
original baru — bukan adaptasi, bukan sekuel, tapi cerita yang 
bener-bener fresh. Ini tuh kayak waktu kamu nemu hidden gem di Spotify, 
tapi versi anime.

Pokoknya summer 2026 ini jangan sampai kelewatan! Siap-siap aja 
watchlist kalian bakal penuh banget. Mana nih judul yang paling 
kalian tunggu?

Gambar: (via Jikan API + Vision verified) — Mushoku Tensei S3
```

### Contoh 2: Game News

**Embed Output:**
```
Judul: 🎮 GTA 6 Rilis Bulan Depan? Ini Bocoran Terbaru Yang Bikin Gamer Geleng-Geleng!

Isi Embed (narasi santai):
Aku yakin kamu udah denger bocorannya. Tapi kali ini beda — Rockstar 
Games akhirnya buka suara secara resmi! Dan jujur, apa yang mereka 
omongin bikin aku sampe geleng-geleng kepala.

📌 Detail yang Terungkap
Konon katanya, GTA 6 bakal jadi game paling ambisius yang pernah 
Rockstar buat. Map-nya dikabarin 2x lebih besar dari GTA 5. Dua 
protagonis yang bisa kamu mainin. Dan yang bikin makin gila — online 
mode-nya bakal terintegrasi dari awal, bukan tambahan kayak GTA Online 
dulu.

🔥 Yang Bikin Publik Heboh
Yang paling bikin spekulan pada heboh adalah grafisnya. Katanya mereka 
pake mesin RAGE yang udah diupgrade total. Bayangin aja, game open 
world sebesar itu tapi bisa jalan di 60fps di konsol. Kalau ini bener, 
PC gaming build kamu mungkin perlu diupgrade lagi!

Pokoknya kalau bocoran ini bener, tahun 2026 bakal jadi tahun emas 
para gamer. Siap-siap nabung dari sekarang ya, karena aku yakin harga 
game-nya juga bakal bikin dompet nangis.

Gambar: (via Jikan API fallback) — GTA V for reference
```

Gambar: (via Jikan API fallback) — GTA 5 search result
```

---

## Checklist Sebelum Kirim

- [ ] Header menarik, bukan generik
- [ ] Artikel **NARASI** mengalir, bukan poin-poin
- [ ] Intro hook bikin pembaca penasaran
- [ ] Body section min 4-6 kalimat narasi
- [ ] Gambar dicari via **Jikan API** (bukan tebak URL)
- [ ] Warna embed sesuai kategori
- [ ] Tidak ada text yang terlalu panjang

---

## Notes

1. **Batas karakter Discord:** Max 2000 per message
2. **Embed max:** 6000 karakter total
3. **Gambar:** Max 8MB untuk file
4. **Upload:** jpg, png, gif, webp

---

*Document created for Lumina Discord Bot Scheduler*
