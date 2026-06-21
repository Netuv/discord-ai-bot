/**
 * 🚀 Turbo Layer — Heavy AI Processing Server
 * 
 * Multi-provider AI server untuk Discord AI Bot.
 * Priority: OpenRouter → NVIDIA → Cloudflare AI (fallback)
 * 
 * Endpoints:
 *   GET  /health           — Health check
 *   POST /ai/chat          — Heavy AI chat processing
 *   POST /article/heavy    — Generate artikel berat
 *   POST /discord/followup — Kirim follow-up ke Discord
 * 
 * Semua error di-handle gracefully — balik { error: "..." } atau null.
 */

const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// ─── Konfigurasi AI Provider ────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN || '';

const AI_TIMEOUT = 45000; // 45 detik per provider

// ─── AI Multi-Provider Call ────────────────────────────────

/**
 * Coba OpenRouter → NVIDIA → Cloudflare AI.
 * Return { content } atau null.
 */
async function callAI(messages, model) {
  // Priority 1: OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      const content = await callOpenRouter(messages, model);
      if (content) return { content, provider: 'openrouter' };
    } catch (e) {
      console.warn(`[Turbo] OpenRouter gagal: ${e.message}`);
    }
  }

  // Priority 2: NVIDIA
  if (NVIDIA_API_KEY) {
    try {
      const content = await callNVIDIA(messages, model);
      if (content) return { content, provider: 'nvidia' };
    } catch (e) {
      console.warn(`[Turbo] NVIDIA gagal: ${e.message}`);
    }
  }

  // Priority 3: Cloudflare AI (via REST API)
  if (CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID) {
    try {
      const content = await callCloudflareAI(messages, model);
      if (content) return { content, provider: 'cloudflare' };
    } catch (e) {
      console.warn(`[Turbo] Cloudflare AI gagal: ${e.message}`);
    }
  }

  return null;
}

async function callOpenRouter(messages, customModel) {
  const model = customModel || 'meta-llama/llama-3.3-70b-instruct:free';
  const body = {
    model,
    messages,
    max_tokens: 4096,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Netuv/discord-ai-bot',
      'X-Title': 'Discord AI Bot - Turbo Layer',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter: respons kosong');
  return content;
}

async function callNVIDIA(messages, customModel) {
  const model = customModel || 'meta/llama-3.1-8b-instruct';
  const body = {
    model,
    messages,
    max_tokens: 4096,
  };

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`NVIDIA ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('NVIDIA: respons kosong');
  return content;
}

async function callCloudflareAI(messages, customModel) {
  const model = customModel || '@cf/meta/llama-4-scout-17b-16e-instruct';
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_AI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(AI_TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`Cloudflare AI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.result?.response;
  if (!content) throw new Error('Cloudflare AI: respons kosong');
  return content;
}

// ─── Article Prompt Builder (like article-writer.ts) ──────

function buildArticlePrompt(topic, summary, reviewSummary) {
  return (
    `Kamu adalah jurnalis anime yang asik dan santai. Buat artikel singkat dari data di bawah.\n` +
    `\n` +
    `## TOPIK: ${topic}\n` +
    `## DATA BERITA:\n${summary || 'Gunakan pengetahuan umum.'}\n` +
    (reviewSummary ? `\n## OPINI PUBLIK:\n${reviewSummary}\n` : '') +
    `\n` +
    `## TUGAS:\n` +
    `Buat artikel JSON dengan 1-3 section. TIDAK ADA closing.\n` +
    `\n` +
    `FORMAT JSON:\n` +
    `{\n` +
    `  "title": "[Emoji] Headline max 100 karakter",\n` +
    `  "intro": "Hook 2 kalimat — bikin penasaran!",\n` +
    `  "sections": [{\n` +
    `    "heading": "🔍 Sub-judul",\n` +
    `    "body": "Narasi 4-6 kalimat. Santai, mengalir, bukan poin-poin!",\n` +
    `    "image_query": "Kata kunci gambar spesifik (atau kosongkan)",\n` +
    `    "video_query": "Kata kunci video/trailer YouTube (atau kosongkan)"\n` +
    `  }],\n` +
    `  "category": "anime/manga/game/breaking/announcement/general"\n` +
    `}\n` +
    `\n` +
    `## ATURAN DISCORD (WAJIB DIINGAT!):\n` +
    `- 🔴 HEADLINE dikirim sebagai EMBED (title + intro + warna kategori)\n` +
    `- 🔴 BREAK LINE: Setiap JUDUL/HEADING WAJIB punya break line setelahnya!\n` +
    `- 🔴 Judul dikirim sebagai MESSAGE TERPISAH dari body narasi (JANGAN digabung!)\n` +
    `- 🔴 Tiap section format: [Judul message] → [Narasi body message] → [Video link] → [Gambar]\n` +
    `- 🔴 Antar section dipisah separator "---"\n` +
    `- 🔴 TIDAK ADA closing/kesimpulan — artikel berakhir natural\n` +
    `\n` +
    `## ATURAN GAYA BAHASA:\n` +
    `- Gaya santai kayak ngobrol di Discord ("aku-kamu")\n` +
    `- Paragraf pendek 2-3 kalimat, mengalir alami\n` +
    `- Hook kuat di intro — bikin penasaran!\n` +
    `- Sertakan opini dari berbagai sumber (Reddit, forum, ANN) — kutip sumbernya!\n` +
    `- Cari konsensus publik: "Mayoritas setuju...", "Yang bikin ramai adalah..."\n` +
    `- TIDAK ADA bullet list di body — semua narasi!\n` +
    `- TIDAK ADA "Kesimpulannya" atau kata penutup formal\n` +
    `- JANGAN ngarang fakta — pake data real dari berita\n` +
    `- JANGAN tambah teks lain di luar JSON\n` +
    `\n` +
    `- ⛔ DILARANG KERAS: Tambahkan watermark, footer, "generated by AI", "Scheduled content", atau teks promosi APAPUN!\n` +
    `BALAS HANYA JSON, tanpa teks lain!`
  );
}

// ─── JSON Parser (like article-writer.ts) ─────────────────

function parseArticleJSON(raw) {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Response AI kosong');
  }

  let cleaned = raw
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();

  let parsed = null;

  // Strategy 1: Extract JSON
  try {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch {}

  // Strategy 2: Hapus URLs
  if (!parsed) {
    try {
      const r = cleaned.replace(/https?:\/\/[^\s,\\\"}\]]+/g, '[link]');
      const m = r.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  // Strategy 3: Fix broken JSON
  if (!parsed) {
    try {
      const fixed = cleaned
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*)'/g, ':"$1"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']');
      const m = fixed.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
  }

  if (!parsed) {
    throw new Error('AI gagal generate artikel valid — response bukan JSON');
  }

  // Validasi sections
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      parsed.sections = parsed.topics;
      delete parsed.topics;
    } else {
      parsed.sections = [{
        heading: '📖 Lanjutan',
        body: parsed.intro || 'Topik ini lagi hangat dibicarakan di komunitas.',
        image_query: '',
        video_query: '',
      }];
    }
  }

  parsed.sections = parsed.sections.map(function(s) {
    return {
      heading: s.heading || '📖',
      body: s.body || s.text || s.content || '',
      image_query: s.image_query || '',
      video_query: s.video_query || '',
    };
  });

  return parsed;
}

// ─── Health Check ─────────────────────────────────────────

app.get('/health', function(req, res) {
  const providers = [];
  if (OPENROUTER_API_KEY) providers.push('openrouter');
  if (NVIDIA_API_KEY) providers.push('nvidia');
  if (CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID) providers.push('cloudflare');

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providers: providers.length > 0 ? providers : ['none'],
  });
});

// ─── POST /ai/chat — Heavy AI Chat ────────────────────────

app.post('/ai/chat', async function(req, res) {
  const startTime = Date.now();
  const { messages, model } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Field "messages" diperlukan (array)' });
  }

  try {
    const result = await callAI(messages, model || undefined);
    if (!result) {
      return res.status(503).json({
        error: 'Semua AI provider gagal',
        providers: {
          openrouter: !!OPENROUTER_API_KEY,
          nvidia: !!NVIDIA_API_KEY,
          cloudflare: !!(CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID),
        },
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Turbo] AI chat selesai dalam ${elapsed}ms via ${result.provider}`);

    res.json({
      content: result.content,
      provider: result.provider,
      elapsed_ms: elapsed,
    });
  } catch (e) {
    console.error(`[Turbo] /ai/chat error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /article/heavy — Generate Artikel Berat ─────────

app.post('/article/heavy', async function(req, res) {
  const startTime = Date.now();
  const { topic, research } = req.body;

  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Field "topic" diperlukan (string)' });
  }

  const summary = research?.summary || '';
  const reviewSummary = research?.reviewSummary || '';

  // Attempt 1: Full prompt dengan research
  try {
    const prompt = buildArticlePrompt(topic, summary, reviewSummary);
    const result = await callAI([{ role: 'user', content: prompt }]);
    if (result) {
      const article = parseArticleJSON(result.content);
      const elapsed = Date.now() - startTime;
      console.log(`[Turbo] Artikel selesai dalam ${elapsed}ms via ${result.provider}`);
      return res.json({ ...article, _meta: { provider: result.provider, elapsed_ms: elapsed } });
    }
  } catch (e) {
    console.warn(`[Turbo] Article attempt 1 gagal: ${e.message}`);
  }

  // Attempt 2: Simplified prompt tanpa review
  try {
    const simplePrompt = buildArticlePrompt(topic, summary, '');
    const result = await callAI([{ role: 'user', content: simplePrompt }]);
    if (result) {
      const article = parseArticleJSON(result.content);
      const elapsed = Date.now() - startTime;
      return res.json({ ...article, _meta: { provider: result.provider, elapsed_ms: elapsed } });
    }
  } catch (e) {
    console.warn(`[Turbo] Article attempt 2 gagal: ${e.message}`);
  }

  // Attempt 3: Minimal prompt
  try {
    const minimalPrompt = (
      `Buat artikel anime pendek tentang: ${topic}\n` +
      `BALAS HANYA JSON ini:\n` +
      `{\n` +
      `  "title": "[Emoji] Judul",\n` +
      `  "intro": "Hook 2 kalimat",\n` +
      `  "sections": [{"heading":"📖 Sub-judul","body":"Narasi singkat 3-4 kalimat","image_query":"","video_query":""}],\n` +
      `  "category": "anime"\n` +
      `}\n` +
      `Gaya santai, tanpa kesimpulan. JANGAN tambah teks lain!`
    );
    const result = await callAI([{ role: 'user', content: minimalPrompt }]);
    if (result) {
      const article = parseArticleJSON(result.content);
      const elapsed = Date.now() - startTime;
      return res.json({ ...article, _meta: { provider: result.provider, elapsed_ms: elapsed } });
    }
  } catch (e) {
    console.warn(`[Turbo] Article attempt 3 gagal: ${e.message}`);
  }

  // Semua gagal
  res.status(503).json({
    error: 'Gagal generate artikel setelah 3 percobaan',
    topic,
    fallback: {
      title: `📰 ${topic.slice(0, 80)}`,
      intro: `Halo! Berikut ini rangkuman singkat tentang ${topic} yang lagi ramai dibahas.`,
      sections: [{
        heading: '📖 Yang Perlu Kamu Tahu',
        body: `${topic} adalah salah satu topik yang lagi hangat dibicarakan di komunitas anime.`,
        image_query: topic,
        video_query: topic,
      }],
      category: 'general',
    },
  });
});

// ─── POST /discord/followup — Kirim Follow-up ke Discord ──

app.post('/discord/followup', async function(req, res) {
  const { applicationId, interactionToken, content } = req.body;

  if (!applicationId || !interactionToken || !content) {
    return res.status(400).json({
      error: 'Field diperlukan: applicationId, interactionToken, content',
    });
  }

  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  try {
    // Discord follow-up webhook: potong konten per 2000 char
    const chunks = chunkText(content, 2000);

    // Kirim chunk pertama sebagai PATCH (edit pesan original)
    const res1 = await fetch(webhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunks[0] }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res1.ok) {
      const err = await res1.text().catch(() => 'unknown');
      throw new Error(`Discord PATCH ${res1.status}: ${err.slice(0, 200)}`);
    }

    // Kirim chunk sisanya sebagai follow-up messages baru
    const followUpBase = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
    for (let i = 1; i < chunks.length; i++) {
      await fetch(followUpBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chunks[i] }),
        signal: AbortSignal.timeout(10000),
      });
    }

    res.json({ ok: true, chunks: chunks.length });
  } catch (e) {
    console.error(`[Turbo] /discord/followup error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: Chunk Text untuk Discord ─────────────────────

function chunkText(text, maxLength) {
  if (!text) return [''];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n', maxLength);
    if (cut === -1) cut = remaining.lastIndexOf('. ', maxLength);
    if (cut === -1 || cut < maxLength / 2) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

// ─── Export for Vercel Serverless ─────────────────────────
// Vercel butuh app di-export, bukan di-listen.
// Di Vercel, serverless function handle request langsung.
module.exports = app;

// ─── Start Server (Local / Docker only) ───────────────────
// Kalau jalan langsung (bukan via Vercel), pake listen.
const isVercel = process.env.VERCEL === '1';
if (!isVercel) {
  app.listen(PORT, function() {
    const providers = [];
    if (OPENROUTER_API_KEY) providers.push('OpenRouter');
    if (NVIDIA_API_KEY) providers.push('NVIDIA');
    if (CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID) providers.push('Cloudflare AI');

    console.log(`🚀 Turbo Layer running on port ${PORT}`);
    console.log(`📡 AI Providers: ${providers.length > 0 ? providers.join(' → ') : '⚠️  NONE (set env vars!)'}`);
    console.log(`⏰ Started at ${new Date().toISOString()}`);
  });
}
