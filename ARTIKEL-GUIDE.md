# Discord Article Scheduler - Prompt & Format Guide

> **Versi:** 3.0 (Embed Headline + Narasi per-Section + Video + Gambar)
> **Terakhir diperbarui:** 20 Juni 2026
> **Target:** Artikel otomatis anime/manga/game untuk Discord
> **Format:** HEADLINE embed warna kategori → [Narasi]→[Video]→[Gambar] per section

---

## Overview

Dokumen ini berisi panduan pembuatan artikel otomatis di Discord.
**Mulai v2.0:** Artikel ditulis dalam format **narasi** seperti blog beneran, bukan lagi poin-poin.

---

## Workflow Pembuatan Artikel

### Step 1: Cari Topik Terupdate + Review Multi-Sumber

**Action:** `webResearch()` → WebScout engine v4.0
**Tools:** DuckDuckGo + Wikipedia + HackerNews + **Review scraper multi-source**

**Cari Berita:**
- "anime news update Juni 2026"
- "manga new release Juni 2026"
- "game release update Juni 2026"
- "Crunchyroll announcement 2026"

**Cari Review & Opini (BARU!):**
- `[judul] review opinion`
- `[judul] community reaction`
- `[judul] reddit discussion`
- `[judul] anime review site`
- `[judul] rating review`

> ⚠️ **PENTING:** Jangan cuma pake MAL (MyAnimeList) sebagai satu-satunya sumber!
> Ambil review dari: Reddit, forum, AnimeNewsNetwork, Twitter/X, review site, blog.
> Rangkum berbagai pendapat — bukan cuma skor/angka!

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

#### 2.2 Struktur Artikel — NARASI v4.0 (Multi-Sumber Review + Break Line)

```json
{
  "title": "🔥 Headline engaging max 100 karakter",
  "intro": "Paragraf hook 2-3 kalimat. Bikin pembaca penasaran!",
  "sections": [
    {
      "heading": "🔍 Sub-judul informatif",
      "body": "Paragraf NARASI 4-6 kalimat. Jelaskan detail, konteks, analisis. BUKAN poin-poin!",
      "image_query": "Judul spesifik untuk cari gambar (via ImageScraper multi-source)",
      "video_query": "Kata kunci YouTube/trailer/PV (via VideoScraper multi-source + validasi)"
    }
  ],
  "category": "anime/manga/game/breaking/announcement/general"
}
```

**📢 UPDATE v4.0 — SUMBER JANGAN CUMA MAL!**
Sekarang sistem riset otomatis mencari **review & opini dari berbagai sumber internet**:
- Reddit discussions & threads
- AnimeNewsNetwork reviews
- Forum anime (MyAnimeList, AniList, MyAnimeLife)
- Twitter/X reactions
- Review site & blog
- **Bukan cuma score/angka — tapi KONTEKS opini publik!**

AI akan merangkum berbagai pendapat dengan gaya:
> "Di Reddit, banyak yang bilang visualnya gila abis..."
> "AnimeNewsNetwork ngasih skor 8.5/10, sementara di MAL agak kontroversial..."
> "Konsensus di Twitter/X pecah jadi dua kubu..."

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
| Sumber | Cuma MAL/score doang | **Multi-sumber: Reddit, ANN, forum, Twitter/X, review site** |
| Review | "Skor MAL 8.5" doang | **Rangkum opini: "Di Reddit banyak yang bilang...", "Tapi di forum X..."** |
| Metafora | Tidak ada | Sesekali pake analogi biar hidup |
| List | `- point 1` di body | Narasi: "Ada beberapa hal menarik..." |
| Kata klise | "Kesimpulannya", "Dapat disimpulkan", "Penting untuk diingat" | **"Intinya...", "Singkatnya...", "Pokoknya..."** |

**Contoh paragraf NARASI dengan review multi-sumber:**
```
Kamu tau gak sih, summer 2026 bakal jadi salah satu season paling gila 
dalam sejarah anime! Di Reddit, banyak yang bilang ini season terpadat 
dalam 5 tahun terakhir. Tapi ada juga yang khawatir kualitasnya turun 
karena terlalu banyak judul sekaligus.

Menurut review dari AnimeNewsNetwork, visualnya 'mind-blowing' dan jadi 
patokan baru buat industri. Tapi di sisi lain, forum MyAnimeLife justru 
ngomongin pacing yang lambat di episode awal. Jadi ya, tergantung selera 
kamu juga sih.

Yang menarik, konsensus di Twitter/X pecah jadi dua kubu. Satu sisi 
praise banget sama soundtrack-nya yang digarap komposer legendaris. 
Sisi lainnya critique soal perubahan karakter design yang katanya terlalu 
mainstream. Tapi one thing we can all agree on — musim ini WAJIB ditonton!
```

---

#---

## ✨ ATURAN BREAK LINE v1.0 — SETIAP JUDUL WAJIB BREAK LINE! ✨

> **Mulai 20 Juni 2026:** Setiap judul/heading dalam artikel WAJIB punya break line setelahnya.
> Ini aturan **WAJIB** — bukan opsional!

### Kenapa Break Line?

Discord itu platform chat — semua pesan tampil berurutan. Kalau judul dan body digabung:
```
❌ **🔍 Judul** Paragraf body langsung di sini...
```
Itu jadinya **susah dibaca** karena judul melekat dengan konten.

Dengan break line:
```
✅ **🔍 Judul**          ← MESSAGE PERTAMA

Paragraf body di sini...   ← MESSAGE KEDUA (break line setelah judul!)
```
Ini bikin artikel **jauh lebih rapi, scannable, dan enak dibaca!**

### Aturan Detail

| Aspek | Aturan |
|-------|--------|
| **HEADLINE (Embed)** | Setelah embed headline → kirim **invisible spacer** (`ㅤ`) sebagai break line visual |
| **Section Heading** | Heading dikirim sebagai **MESSAGE TERPISAH** dari body narasi |
| **Body Narasi** | Body dikirim di **message terpisah** setelah heading |
| **Video/Gambar** | Tetap dalam 1 kelompok section, tapi heading + body sudah terpisah |
| **Separator `---`** | Tetap dipakai antar section |

### Visual Output di Discord

```
[EMBED HEADLINE — warna kategori]
🔥 Summer 2026 Bakal Season Tergila!
[deskripsi intro...]
[timestamp] | 🤖 LuminaBot

ㅤ                                   ← break line (invisible)

**🔍 Deretan Sekuel yang Paling Ditunggu**   ← MESSAGE 1: JUDUL

Yang paling bikin heboh tentu aja return-nya   ← MESSAGE 2: BODY
serial favorit yang udah ditunggu...

🎬 [Judul Video]: https://youtu.be/xxxxx        ← VIDEO
📸 [attachment gambar]                           ← GAMBAR

---   ← SEPARATOR

**💡 Anime Original Wajib Watchlist**            ← MESSAGE 1: JUDUL

Terus gak cuma sekuel doang...                    ← MESSAGE 2: BODY

(Berakhir natural)
```

### Implementasi di Code

Di `scheduler.ts` → `executeAiArticle()`:
```javascript
// ── Kirim JUDUL sebagai message TERPISAH (break line setelah judul!) ──
await sendMsg(token, channelId, `**${heading}**`);

// ── Kirim BODY/NARASI sebagai message terpisah ──
await sendMsg(token, channelId, body);
```

### Checklist Break Line

- [ ] HEADLINE embed → ada break line spacer setelahnya ✅
- [ ] Setiap section heading → **message terpisah** (bukan digabung body) ✅
- [ ] Body narasi → message terpisah setelah heading ✅
- [ ] Antar section → separator `---` ✅
- [ ] Tidak ada judul yang menempel dengan kontennya ✅

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

#### Format Output (v3.0 — Embed Headline + per-Section Group)

**HEADLINE → EMBED**
```json
{
  "title": "🔥 Headline Menarik",
  "description": "Paragraf intro hook...",
  "color": "HEX_WARNA_SESUAI_KATEGORI",
  "timestamp": "ISO_TIMESTAMP",
  "footer": { "text": "🤖 LuminaBot • Artikel Otomatis" }
}
```

**Per Section → [Narasi] → [Video] → [Gambar] (dalam 1 kelompok)**
```
1. Kirim teks: **🔍 Sub-judul** + paragraf body narasi
2. Kirim video: 🎬 [Judul]: [YouTube link] (via VideoScraper)
3. Kirim gambar: [attachment gambar] (via ImageScraper + download)
4. Separator: --- (kecuali section terakhir)
```

**⚠️ Perubahan dari v2.0:**
- ~~`fields` / bullet list~~ → Narasi penuh
- ~~`closing` field di JSON~~ → **Dihapus!** Artikel berakhir natural tanpa kesimpulan
- ~~Gambar & Video dikirim terpisah acak~~ → Tiap section: [Narasi] → [Video] → [Gambar] rapi
- ~~Headline teks biasa~~ → **HEADLINE = EMBED** dengan warna kategori

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

## ✅ Contoh Artikel Lengkap (v3.0 — Embed Headline + per-Section Group)

### Contoh 1: Anime News

**Output ke Discord (dengan BREAK LINE v1.0):**

```
[EMBED — warna FF6B6B (Anime)]
🔥 Summer 2026 Bakal Season Tergila! Crunchyroll Umumkan Lineup Lengkap
Kamu tau gak sih, summer 2026 bakal jadi salah satu season paling gila 
dalam sejarah anime! Crunchyroll baru aja ngumumin lineup lengkapnya 
dan jujur — ada beberapa judul yang langsung bikin aku tepuk jidat.
[timestamp] | 🤖 LuminaBot • Artikel Otomatis

ㅤ ← break line (invisible spacer)

**🔍 Deretan Sekuel yang Paling Ditunggu**   ← MESSAGE TERPISAH (judul)

Yang paling bikin heboh tentu aja return-nya serial favorit yang udah   ← MESSAGE TERPISAH (body)
ditunggu dari jaman kuliah. Kamu tau sendiri kan gimana rasanya nunggu 
season lanjutan bertahun-tahun? Nah tahun ini, beberapa di antaranya 
akhirnya beneran tayang. Bayangin deh, ada yang sempet vakum 3 tahun 
lebih, tiba-tiba muncul lagi dengan trailer bikin merinding.

🎬 Mushoku Tensei Season 3: https://youtu.be/xxxxx
📸 [gambar Mushoku Tensei S3 — attachment]

--- (separator)

**💡 Anime Original yang Wajib Masuk Watchlist**   ← MESSAGE TERPISAH (judul)

Terus gak cuma sekuel doang. Beberapa studio kaya MAPPA sama Kyoto   ← MESSAGE TERPISAH (body)
Animation ternyata punya kejutan spesial. Mereka siap ngerilis anime 
original baru — bukan adaptasi, bukan sekuel, tapi cerita yang 
bener-bener fresh. Ini tuh kayak waktu kamu nemu hidden gem di Spotify, 
tapi versi anime.

🎬 MAPPA Original Trailer: https://youtu.be/yyyyy
📸 [gambar MAPPA original — attachment]

(Berakhir natural — tanpa "Kesimpulannya")
```

### Contoh 2: Game News

**Output ke Discord:**

```
[EMBED — warna 3498DB (Game)]
Judul: 🎮 GTA 6 Rilis Bulan Depan? Ini Bocoran Terbaru Yang Bikin Gamer Geleng-Geleng!
Deskripsi: Aku yakin kamu udah denger bocorannya. Tapi kali ini beda — Rockstar 
Games akhirnya buka suara secara resmi! Dan jujur, apa yang mereka 
omongin bikin aku sampe geleng-geleng kepala.
[timestamp] | 🤖 LuminaBot • Artikel Otomatis

--- (break) ---

📌 Detail yang Terungkap
Konon katanya, GTA 6 bakal jadi game paling ambisius yang pernah 
Rockstar buat. Map-nya dikabarin 2x lebih besar dari GTA 5. Dua 
protagonis yang bisa kamu mainin. Dan yang bikin makin gila — online 
mode-nya bakal terintegrasi dari awal, bukan tambahan kayak GTA Online 
dulu.

🎬 GTA 6 Trailer: https://youtu.be/zzzzz
📸 [gambar GTA 6 — attachment]

--- (break) ---

🔥 Yang Bikin Publik Heboh
Yang paling bikin spekulan pada heboh adalah grafisnya. Katanya mereka 
pake mesin RAGE yang udah diupgrade total. Bayangin aja, game open 
world sebesar itu tapi bisa jalan di 60fps di konsol. Kalau ini bener, 
PC gaming build kamu mungkin perlu diupgrade lagi!

(Berakhir natural — tanpa "Sebagai penutup" atau "Kesimpulannya")
```

---

## Checklist Sebelum Kirim (v4.0 — Multi-Sumber Review + Break Line)

- [ ] **HEADLINE = EMBED** dengan warna sesuai kategori (bukan teks biasa)
- [ ] ✅ **ATURAN BREAK LINE:** Setiap judul/heading WAJIB punya break line setelahnya!
- [ ] ✅ HEADLINE embed → break line spacer (`ㅤ`) setelahnya
- [ ] ✅ Section heading → **message terpisah** (bukan digabung body!)
- [ ] ✅ Body narasi → **message terpisah** setelah heading
- [ ] ✅ **SUMBER REVIEW MULTI-SUMBER:** Bukan cuma MAL/MyAnimeList!
- [ ] ✅ Review dari Reddit, forum, ANN, Twitter/X, review site — dirangkum
- [ ] ✅ Ada perbandingan opini: "Ada yang bilang... tapi di sisi lain..."
- [ ] ✅ Sitasi sumber natural: "Menurut review di Reddit...", "Di forum X..."
- [ ] Artikel **NARASI** mengalir, bukan poin-poin/bullet
- [ ] Intro hook bikin pembaca penasaran
- [ ] Body section min 4-6 kalimat narasi, gaya santai "aku-kamu"
- [ ] Tiap section: **Judul → Narasi → Video → Gambar** dalam 1 kelompok rapi
- [ ] Gambar dicari via **ImageScraper** (AniList + MAL + Kitsu, bukan tebak URL)
- [ ] Video dicari via **VideoScraper** (DDG + Invidious, bukan halusinasi)
- [ ] **TIDAK ADA** closing/kesimpulan — artikel berakhir natural
- [ ] Antar section dipisah **---** separator
- [ ] Warna embed sesuai kategori (Anime=FF6B6B, Manga=9B59B6, dll)

---

## Notes

1. **Batas karakter Discord:** Max 2000 per message
2. **Embed max:** 6000 karakter total
3. **Gambar:** Max 8MB untuk file
4. **Upload:** jpg, png, gif, webp

---

*Document created for Lumina Discord Bot Scheduler*
