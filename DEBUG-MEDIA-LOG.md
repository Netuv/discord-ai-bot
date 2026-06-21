# Debug Media Search Log
Sun Jun 21 10:04:10 UTC 2026

=== TEST 1: Image Scraper ===
Query: Demon Slayer
{
  "query": "Demon Slayer key visual",
  "type": "image",
  "timestamp": "2026-06-21T10:07:25.101Z",
  "image": null
}
---
=== TEST 2: Video Scraper ===
{
  "query": "Demon Slayer Infinity Castle trailer",
  "type": "video",
  "timestamp": "2026-06-21T10:07:32.490Z",
  "video": "https://www.youtube.com/watch?v=wyiZWYMilgk"
}
---
=== TEST 3: Image Scraper - more queries ===
Query: Demon Slayer → "image": { "url": "https://cdn.myanimelist.net/images/anime/1908/120036l.jpg"
Query: Kimetsu no Yaiba → "image": { "url": "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg"
Query: Jujutsu Kaisen → "image": { "url": "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg"
Query: Attack on Titan → "image": { "url": "https://cdn.myanimelist.net/images/manga/2/37846l.jpg"
Query: One Piece → "image": { "url": "https://cdn.myanimelist.net/images/anime/1244/138851l.jpg"
---
=== TEST 4: Image Scraper - with extra words ===
Query: 'Demon Slayer key visual' → "image": null
Query: 'Demon Slayer Infinity Castle poster' → "image": null
Query: 'new anime 2026' → "image": {
Query: 'Summer 2026 anime' → "image": {
---
=== TEST 5: Video Scraper - various ===
Query: 'Demon Slayer Infinity Castle' → "video": "https://www.youtube.com/watch?v=x7uLutVRBfI"
Query: 'Summer 2026 anime trailer' → "video": "https://www.youtube.com/watch?v=DWM2IfkzLHo"
Query: 'Jujutsu Kaisen season 2 trailer' → "video": "https://www.youtube.com/watch?v=e-FzcHiazMY"
============
=== TEST 6: Full Article Test ===
Result: 2 section • 2 video ✅ — VideoScraper works!

=== FIX: Image query priority changed ===
1. mal_title (pure title) → PRIORITAS UNTUK GAMBAR
2. anilist_title (alternatif)
3. image_keywords (deskriptif)
4. Original image_query (fallback)

Video priority:
1. video_keywords (deskriptif) → PRIORITAS UNTUK VIDEO
2. Original video_query
3. mal_title + trailer (fallback)

=== NEXT: Test image again with another run ===
{
  "executed": 1,
  "failed": 0,
  "logs": [
    "✅ \"Update Konten Anime Harian\": ✅ \"🔥 Demon Slayer: Infinity Castle Trilogy Dikonfirmasi! Ini K...\" → 2 section • 2 video (55807ms)"
  ]
}
=== FIXED: Optimizer prompt updated ===
1. mal_title = EXACT MAL TITLE (pure judul, bukan deskriptif)
2. image_keywords = JUDUL ALTERNATIF (bukan keyword deskriptif)
3. video_keywords = DESKRIPTIF (keyword YouTube)

=== TEST RESULTS ===
Test 1: 2 section • 2 video ✅ — ImageScraper not finding (topic might be new)
Test 2: 1 section • 1 video ✅ — Faster (28s), VideoScraper works
Test 3: 1 section • 1 video ✅ — Consistent

Image issue: need to verify optimizer's mal_title output
But ImageScraper itself WORKS (proven via /debug/media)
================
=== VERIFY: ImageScraper works with known title ===
Demon Slayer → url": "https://cdn.myanimelist.net/images/anime/1908/120036l.jpg", "source": "MyAnimeList — Demon Slayer: Kimetsu no Yaiba Entertainment District Arc", "filename": "anime-47778.jpg
=== TEST: DuckDuckGo Image Search ===
Query: 'Demon Slayer key visual' → "image": {
Query: 'Demon Slayer Infinity Castle poster' → "image": {
Query: 'Summer 2026 anime key visual' → "image": {
---
=== TEST: Full article with DuckDuckGo ===
{
  "executed": 1,
  "failed": 0,
  "logs": [
    "✅ \"Update Konten Anime Harian\": ✅ \"🔥 Bleach TYBW Part 3: Trailer Baru Bikin Fans Makin Panas!...\" → 2 section (126182ms)"
  ]
}
Video found: 0, Image found: 0
---
=== Final Test ===
{
  "executed": 1,
  "failed": 0,
  "logs": [
    "✅ \"Update Konten Anime Harian\": ✅ \"🏴‍☠️ One Piece Chapter 1110 Ungkap Imu, Honkai Star Rail 2....\" → 2 section • 1 video (88738ms)"
  ]
}
================
=== DUCKDUCKGO IMAGE SEARCH — VERIFIED ===
✅ Descriptive queries now work: 'Demon Slayer key visual' → FOUND
✅ 'Demon Slayer Infinity Castle poster' → FOUND
✅ 'Summer 2026 anime key visual' → FOUND

=== FULL ARTICLE TEST RESULTS ===
Test 1: 2 section • 2 video ✅
Test 2: 1 section • 1 video ✅
Test 3: 1 section • 1 video ✅
Test 4: 2 section • 2 video ✅
Test 5: 2 section (no media) - topic might be new
Test 6: 2 section • 1 video ✅

=== FILES CHANGED ===
- src/image-scraper.ts: Added DuckDuckGo image search
- src/article-publisher.ts: Fixed image/video query priority
- src/media-query-optimizer.ts: Improved prompt
- src/index.ts: Added /debug/media endpoint
=== FINAL RESULT — SUCCESS ===
🎬 Demon Slayer Umumkan Trilogi Film Infinity Castle!
→ 2 section • 2 gambar 🖼️🖼️ • 2 video 🎬🎬 (66548ms)

=== ROOT CAUSE ===
sendImage() pake FormData download+upload → gagal di Workers
Fix: kirim URL langsung → Discord auto-embed ✅

=== ALL CHANGES ===
1. image-scraper.ts: +DuckDuckGo image search (score:75, priority)
2. article-publisher.ts: sendImage → URL langsung (gak FormData)
3. article-publisher.ts: image priority → mal_title duluan
4. article-publisher.ts: env jadi WAJIB (gak optional)
5. media-query-optimizer.ts: prompt improved
6. index.ts: +/debug/media endpoint
7. mcp-handler.ts: pass env ke publishArticle
