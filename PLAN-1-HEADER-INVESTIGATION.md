# 🕵️ Investigation — "1 Header Only" Article Sending Bug

> **Tanggal:** 21 Juni 2026  
> **Investigator:** Kira  
> **Status:** 🔴 Critical — Root causes identified, fixes planned  

---

## 📋 Latar Belakang

User melaporkan bahwa saat test cron article dikirim ke Control Room Discord, yang muncul **"cuma 1 header doang"**. User curiga konten sebenarnya sudah lengkap, tapi tidak kekirim semua.

> "chat yang dikirim juga masih cuma 1 header doang yaa? apa yang sebelumnya itu sebenernya udah lengkap cuma gak kekirim semua gitu?"

---

## 🔍 Root Cause Analysis

### Skenario Reproduksi

1. User call `GET https://discord-ai-bot.luminary-bot.workers.dev/cron/test`
2. Endpoint `handleTestCron()` mencari semua task yang enabled
3. Untuk task dengan action `"ai-article"`, eksekusi masuk ke `executeAiArticle()`
4. Setelah generate artikel, dipanggil `publishArticle(token, channelId, article, env)`
5. Hasil di Discord: **hanya bold title** yang muncul, section lain tidak muncul

---

## A. ALUR KODE SAAT INI (Yang Bermasalah)

### 📤 Di `article-publisher.ts` → `publishArticle()`

```
Phase 1: Kirim HEADLINE sebagai bold message (SYNC — tunggu selesai)
         await sendDiscordMessage(token, channelId, `**${title}**`)
         ↓
Phase 2: Pre-fetch SEMUA media PARALLEL (+ headline sudah dikirim)
         Promise.all([ headline_send, Promise.all(mediaPromises) ])
         ↓
Phase 3: Kirim setiap section secara SEQUENTIAL
         for each section:
           await sendDiscordMessage(heading)   ← DISINI BISA GAGAL
           await sendDiscordMessage(body)      ← DISINI BISA GAGAL
           await sendDiscordMessage(video)     ← DISINI BISA GAGAL
           await sendDiscordImage(image)       ← DISINI BISA GAGAL
           await sendDiscordMessage("---")     ← DISINI BISA GAGAL
```

---

## B. 3 BUG YANG TERIDENTIFIKASI

### 🔴 BUG #1 — `sendDiscordMessage` Gagal Silently (Tidak Noticeable)

**File:** `article-publisher.ts`  
**Fungsi:** `sendDiscordMessage()` → `discordFetch()` → `globalRateLimiter.add()`

**Problem:**
```typescript
export async function sendDiscordMessage(...):
  await discordFetch(token, channelId, { content: content.slice(0, 2000) });
  // ^^^ Tidak ada pengecekan return value!
  // Kalau discordFetch return null (API error), tidak ada yang tahu!
```

**Apa yang terjadi kalau Discord gagal:**
1. `discordFetch` catch error, return `null`
2. `sendDiscordMessage` lanjut (karena null !== throw)
3. Loop tetap lanjut ke section berikutnya
4. Tapi tidak ada ERROR yang di-throw → **tidak ada yang tahu ada message yang gak kekirim!**

---

### 🔴 BUG #2 — Tidak Ada Retry / Recovery

**File:** `article-publisher.ts`  
**Lokasi:** Section loop (`for (let i = 0; i < sections.length; i++)`)

**Problem:**
```typescript
// Kirim JUDUL
await sendDiscordMessage(token, channelId, `**${heading}**`);

// Kirim BODY
if (body) {
  await sendDiscordMessage(token, channelId, body);
}
```

**Gak ada pengecekan:**
- Apakah `sendDiscordMessage` success atau gagal? → Tidak dicek!
- Kalau gagal, harus retry? → Tidak ada retry logic!
- Kalau gagal, harus skip? → Tidak ada skip logic!

---

### 🟡 BUG #3 — `/cron/test` Endpoint Tidak Pakai `ctx.waitUntil`

**File:** `index.ts` → `/cron/test` handler  
**Problem:** Tidak menggunakan ExecutionContext.waitUntil

```typescript
if (url.pathname === "/cron/test" && request.method === "GET") {
  const result = await handleTestCron(env);  // ⚠️ BLOKING, gak ada falllback!
  return new Response(JSON.stringify(result), { ... });
}
```

**Dampak:**
1. Kalau `handleTestCron()` butuh >30 detik (AI generate + media search bs >60s), client (curl/browser) **timeout**
2. Kalau client timeout, request dibatalkan Cloudflare
3. Dalam beberapa kasus, proses yang sedang running bisa ter-interrupt
4. Hasil: Hanya beberapa message awal yang kekirim (misal: hanya title), sisanya gosong!

---

## C. TEORI KENAPA HANYA "1 HEADER" YANG MUNCUL

### Hipotesis Utama: Process Interrupted ⭐

Timeline kasus "1 header only":

```
T+0s    : Request masuk ke /cron/test
T+0s    : handleTestCron() dijalankan
T+0s    : executeAiArticle() dipanggil untuk task "ai-article"
T+2s    : AI generate artikel (sections = 3, title = "🔥 Solo Leveling...")
T+3s    : publishArticle() dipanggil
T+3.1s  : HEADLINE dikirim ✅ → Discord muncul bold title
T+3.2s  : Section 1 heading dikirim ✅
T+3.3s  : Section 1 body dikirim ✅
T+3.5s  : Section 2 heading dikirim ✅
T+3.6s  : 💥 DISCORD API ERROR (429 rate limit / timeout / invalid token)
        : sendDiscordMessage gagal silently (return null)
        : Loop LANJUT (karena gak throw!)
T+3.7s  : Section 2 body dikirim ❌ (gak kekirim karena rate limit masih aktif)
T+3.8s  : Section 3 heading dikirim ❌ (gak kekirim)
T+5s    : 💥 CLIENT TIMEOUT (curl/browser close connection)
        : Worker process interrupted!
        : Sisanya TIDAK DIKIRIM
```

### Hipotesis Alternatif: AI Hanya Generate 1 Section

Kemungkinan AI generate artikel yang hanya punya 1 section. Tapi berdasarkan prompt:
- Prompt bilang: `1-3 section`
- Dan konten yang mau di-generate cukup panjang (intro + 1-3 sections)

Kemungkinan ini terjadi, tapi **bukan** penyebab utama "1 header only".

---

## D. PERBEDAAN ANTARA SKEMA LAMA VS BARU

### Skenario Lama (Sebelum Audit Integration):

```
Old Flow:
  AI Generate → parseArticleJSON → publishArticle → sendDiscord
  
  - publishArticle pakai EMBED untuk headline
  - Kirim embed (yang include title + intro + color) SEKALI sebagai 1 message
  - Users lihat "1 embed" yang terlihat seperti "1 card" (bukan cuma 1 header)
```

### Skenario Baru (Setelah Audit Integration):

```
Current Flow:
  AI Generate → parseArticleJSON → auditArticle → optimizeMediaQuery → publishArticle → sendDiscord
  
  - publishArticle sekarang kirim HEADLINE sebagai BOLD MESSAGE (bukan embed)
  - Bold message = teks biasa yang di-bold, MUNCUL sebagai pesan text di Discord
  - Kalau process fail setelah headline, user hanya lihat "1 bold message" → SEARANG disebut "1 header"
```

**Key Difference:**
- **Embed** = 1 self-contained message (kalau fail, fail seluruhnya atau gak ada sama sekali)
- **Bold text** = message individual (kalau fail setelah header, hanya header yang muncul)

---

## E. DIAGNOSIS AKHIR

### Masalah #1: Perilaku "1 Header" Adalah Hasil Dari:
1. 🟢 **Headline** (bold text) dikirim SEBAGAI PESAN TEXT (bukan embed)
2. 🟢 **Section heading** juga dikirim sebagai bold text
3. 🔴 Kalau proses ter-interrupt setelah headline, user lihat **"hanya 1 bold message"**
4. 🔴 Ini BUKAN artikel yang "kurang lengkap" — artikel sebenarnya SUDAH LENGKAP di backend

### Masalah #2: Kenapa Interrupt Terjadi?
1. `sendDiscordMessage` gagal silently (gak throw error)
2. Process terus lanjut meski Discord API return error
3. Rate limiter bisa punya delay kumulatif
4. Client timeout mengakhiri request sebelum selesai

---

## F. FIX PLAN

### Fix 1: `sendDiscordMessage` Harus Return Status

**File:** `article-publisher.ts`  
**Target:** `sendDiscordMessage()` function

```typescript
export async function sendDiscordMessage(
  token: string,
  channelId: string,
  content: string
): Promise<boolean> {  // ← Return boolean sukses/gagal
  const res = await discordFetch(token, channelId, {
    content: content.slice(0, 2000),
  });
  return res !== null && res.ok;  // ← Return apakah berhasil
}
```

---

### Fix 2: Publisher Loop Harus Handle Failure

**File:** `article-publisher.ts`  
**Target:** Section loop di `publishArticle()`

```typescript
for (let i = 0; i < sections.length; i++) {
  const sec = sections[i];
  if (!sec.heading && !sec.body) continue;

  const heading = sec.heading || "📖";
  const body = (sec.body || "").slice(0, 1900);
  const sectionMedia = mediaBySection.get(i);

  // Kirim JUDUL
  const headingOk = await sendDiscordMessage(token, channelId, `**${heading}**`);
  if (!headingOk) {
    console.error(`❌ Gagal kirim heading section ${i}, retry sekali...`);
    // Retry sekali
    const retry = await sendDiscordMessage(token, channelId, `**${heading}**`);
    if (!retry) {
      console.error(`❌ Heading section ${i} gagal total, skip section ini`);
      continue;  // ← Skip section ini, lanjut ke section berikutnya
    }
  }

  // Kirim BODY
  if (body) {
    const bodyOk = await sendDiscordMessage(token, channelId, body);
    if (!bodyOk) {
      console.warn(`⚠️ Body section ${i} gagal dikirim`);
    }
  }

  // ... dan seterusnya ...
}
```

---

### Fix 3: `/cron/test` Endpoint Harus Pakai `ctx.waitUntil`

**File:** `index.ts`  
**Target:** `/cron/test` handler

```typescript
if (url.pathname === "/cron/test" && request.method === "GET") {
  // Gunakan ctx.waitUntil agar process tetap jalan meski client disconnect
  const resultPromise = handleTestCron(env).then(result => {
    // Log result ke console/KV
    console.log("📋 Cron test result:", result);
    return result;
  }).catch(e => {
    console.error("❌ Cron test error:", e);
  });

  // Tunggu sebentar untuk fast response, tapi process tetap jalan
  const fastResult = await Promise.race([
    resultPromise,
    new Promise(resolve => setTimeout(() => resolve({ status: "running" }), 5000))
  ]);

  return new Response(JSON.stringify(fastResult), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Atau lebih baik lagi (recommended):**

```typescript
if (url.pathname === "/cron/test" && request.method === "GET") {
  const resultPromise = handleTestCron(env);

  // Response awal (Accepted), tapi process tetap running
  ctx.waitUntil(
    resultPromise.then(result => {
      console.log("📋 Cron test complete:", result);
      // Kirim status ke Discord channel log (opsional)
    }).catch(e => {
      console.error("❌ Cron test error:", e);
    })
  );

  return new Response(
    JSON.stringify({ status: "accepted", message: "Cron test sedang dijalankan" }),
    { status: 202, headers: { "Content-Type": "application/json" } }
  );
}
```

---

### Fix 4: Fallback Kalau Sections Kosong

**File:** `article-publisher.ts`  
**Target:** Awal `publishArticle`

```typescript
// Kalau sections kosong, tetap tulis konten yang ada (meski cuma intro)
if (sections.length === 0) {
  console.warn("⚠️ Artikel tidak punya sections, fallback ke intro-only");
  await sendDiscordMessage(token, channelId, `**${title}**`);
  if (article.intro) {
    await sendDiscordMessage(token, channelId, article.intro);
  } else {
    await sendDiscordMessage(token, channelId, "_(Artikel ini belum memiliki konten)_");
  }
  return { ...result, error: "No sections generated" };
}
```

---

### Fix 5: Publisher Return Status More Detailed

**File:** `article-publisher.ts`  
**Target:** `publishArticle` return type

```typescript
export interface PublishResult {
  success: boolean;
  sectionsPublished: number;    // Berapa section yang BERHASIL dikirim
  sectionsFailed: number;     // ← NEW: Berapa section yang GAGAL
  imagesPublished: number;
  videosPublished: number;
  errors: string[];            // ← NEW: List error per section
  error?: string;              // Error utama (kalau ada)
}
```

---

## G. TESTING PLAN

### Test Case 1: Verify Full Article Delivery

```
Preparation:
1. Buat task test dengan action "ai-article" dan topic "Solo Leveling anime"
2. Jalankan via /cron/test
3. Monitor Discord Control Room

Expected Result:
- ✅ Bold title (1 message)
- ✅ Section 1 heading (1 message)
- ✅ Section 1 body (1 message)  
- ✅ Section 1 media (image/video)
- ✅ --- separator
- ✅ Section 2 heading (1 message)
- ✅ ... dan seterusnya

If any section FAILS:
- Log showing which section failed and why
- Process continues with next section (not blocking)
```

### Test Case 2: Simulate Discord API Failure

```
Setup:
1. Temporarily set invalid DISCORD_TOKEN
2. Trigger /cron/test

Expected Result:
- ❌ Title message fails (logged)
- ❌ Section messages fail (logged)
- ✅ Errors are logged without crashing
- ✅ Result shows detailed failure info
```

### Test Case 3: Client Timeout Test

```
Setup:
1. Trigger /cron/test via curl
2. Immediately terminate curl (Ctrl+C)

Expected Result (with ctx.waitUntil):
- ✅ Process continues running in background
- ✅ All messages still reach Discord (eventually)
- ✅ Result is logged to console/KV
```

---

## H. TIMELINE & PRIORITY

| # | Fix | Priority | File | Estimasi |
|---|-----|----------|------|----------|
| 1 | `sendDiscordMessage` return status | 🔴 HIGH | `article-publisher.ts` | 5 min |
| 2 | Publisher loop handle failure | 🔴 HIGH | `article-publisher.ts` | 15 min |
| 3 | `/cron/test` pakai `ctx.waitUntil` | 🔴 HIGH | `index.ts` | 10 min |
| 4 | Fallback sections kosong | 🟡 MED | `article-publisher.ts` | 5 min |
| 5 | PublishResult detailed errors | 🟡 MED | `article-publisher.ts` | 10 min |
| 6 | Testing & deploy | 🔴 HIGH | All | 15 min |

**Total Estimasi:** ~60 menit  
**Risk:** Rendah — fixes are defensive, additive, tidak merubah logika utama  

---

## I. ALTERNATIVE: Revert Ke Embed untuk Headline? 🤔

Kalau kita ingin menghilangkan fenomena "1 header" COMPLETELY, kita bisa revert ke embed approach:

```typescript
// Option: Kirim headline sebagai embed (bukan bold text)
await sendDiscordEmbed(token, channelId, {
  title: article.title,
  description: article.intro,
  color: getArticleColor(article.category),
});
```

**Pro:**
- Embed = 1 self-contained message
- Kalau embed gagal, gagal semua (tidakan "1 header only")

**Contra:**
- Embed = gak sesuai dengan aturan "MESSAGE TERPISAH" yang sudah kita define
- Embed memiliki format yang rigid (fixed title + description + color)
- User sudah minta bold text approach (dari audit integration)

**Verdict:**  
Keep bold text approach, tapi FIX error handling.

---

## J. POST-MORTEM INSIGHT

**Kenapa bug ini tidak tercatat di ISSUES-LOG.md?**

Bug ini adalah bug **BEHAVIORAL** — tidak crash, tidak throw error, tidak terlihat di log. Artikel sebenarnya ada dan complete di backend, tapi hanya sebagian yang sampai ke Discord.

Karena tidak ada error yang ter-throw, sistem terlihat "aman". Padahal user experience rusak.

**Lesson Learned:**
- Log SUCCESS/FAILURE per message
- Return status dari setiap Discord API call harus dicek
- Gunakan `ctx.waitUntil` untuk proses lama
- Retry logic adalah must-have untuk external API calls

---

> **Signed:** 21 Juni 2026, 22:00 WIB — 1-Header Investigation Complete  
> **Updated by Kira**  
> **Next Step:** Apply fixes & deploy  
