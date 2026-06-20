# Article Guide — Referensi Cepat

> **Arsip v1.0** — Sekarang pake format **NARASI** v2.0
>
> Panduan lengkap: **`ARTIKEL-GUIDE.md`**

---

## Perubahan v1.0 → v2.0

| Aspek | v1.0 (LAMA) ❌ | v2.0 (BARU) ✅ |
|-------|---------------|----------------|
| Format konten | `fields[]` bullet list | `sections[].body` **narasi** |
| Cari gambar | `image_query` tebak URL | **Jikan API** via `anime_title` |
| Sumber gambar | AnimeCorner (sering 404) | MyAnimeList (100% valid) |
| Embed | `fields` + `description` pendek | Narasi penuh di `description` |

## Warna Embed (sama)

| Kategori | Hex | Warna |
|----------|-----|-------|
| Anime | FF6B6B | Merah muda |
| Manga | 9B59B6 | Ungu |
| Game | 3498DB | Biru |
| Breaking News | E74C3C | Merah |
| Announcement | F39C12 | Kuning |
| General | 5865F2 | Blurple |

## Notes

1. **Batas karakter:** 2000/message, 4096/embed
2. **Gambar:** Max 8MB via Jikan API — **ga perlu OCR**
3. **Upload:** jpg, png, gif, webp

---

*Referensi cepat — panduan lengkap & contoh di `ARTIKEL-GUIDE.md`*
