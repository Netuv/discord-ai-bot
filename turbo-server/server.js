/**
 * 🚀 Turbo Layer — Heavy AI Processing Server
 * 
 * Multi-provider AI server untuk Discord AI Bot.
 * Priority: Cloudflare AI → OpenCode → Step 3.7 Flash → OpenRouter
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
const { buildArticlePrompt, parseArticleJSON } = require('./prompt');
// node-fetch removed — Node.js 18+ has native fetch

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// ─── Konfigurasi AI Provider ────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN || '';
const OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || '';

const AI_TIMEOUT = 12000; // 12 detik per provider (Vercel Hobby max ~60s total)

// ─── AI Multi-Provider Call ────────────────────────────────

/**
 * Coba Cloudflare AI → OpenCode → Step 3.7 Flash → OpenRouter.
 * Return { content } atau null.
 */
async function callAI(messages, model) {
  // Priority 1: Cloudflare AI (fastest, our key)
  if (CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID) {
    try {
      const content = await callCloudflareAI(messages, model);
      if (content) return { content, provider: 'cloudflare' };
    } catch (e) {
      console.warn(`[Turbo] CF AI gagal: ${e.message}`);
    }
  }

  // Priority 2: OpenCode
  if (OPENCODE_API_KEY) {
    try {
      const content = await callOpenCode(messages, model);
      if (content) return { content, provider: 'opencode' };
    } catch (e) {
      console.warn(`[Turbo] OpenCode gagal: ${e.message}`);
    }
  }

  // Priority 2: Step 3.7 Flash — 198B MoE via NVIDIA NIM (free tier)
  if (NVIDIA_API_KEY) {
    try {
      const content = await callStep37Flash(messages, model);
      if (content) return { content, provider: 'step-3.7-flash' };
    } catch (e) {
      console.warn(`[Turbo] Step 3.7 Flash gagal: ${e.message}`);
    }
  }

  // Priority 3: OpenRouter
  if (OPENROUTER_API_KEY) {
    try {
      const content = await callOpenRouter(messages, model);
      if (content) return { content, provider: 'openrouter' };
    } catch (e) {
      console.warn(`[Turbo] OpenRouter gagal: ${e.message}`);
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

async function callOpenCode(messages, customModel) {
  const model = customModel || 'deepseek-v4-flash-free';
  const body = {
    model,
    messages,
    max_tokens: 4096,
  };

  const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENCODE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`OpenCode ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenCode: respons kosong');
  return content;
}

async function callStep37Flash(messages, customModel) {
  const model = customModel || 'stepfun-ai/step-3.7-flash';
  const body = {
    model,
    messages,
    max_tokens: 16384,
    temperature: 1.00,
    top_p: 0.95,
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
    throw new Error(`Step 3.7 Flash ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Step 3.7 Flash: respons kosong');
  return content;
}

async function callCloudflareAI(messages, customModel) {
  const model = customModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
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


// ─── GET /health — Health Check ──────────────────────────

app.get('/health', function(_req, res) {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    providers: {
      openrouter: !!OPENROUTER_API_KEY,
      nvidia: !!NVIDIA_API_KEY,
      opencode: !!OPENCODE_API_KEY,
      cloudflare: !!(CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID),
    },
  });
});

// ─── POST /ai/chat — Heavy AI Chat ───────────────────────

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
          opencode: !!OPENCODE_API_KEY,
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

// ─── POST /article/heavy — Simple AI Proxy ───────────────
// Worker handle prompt building & JSON parsing (src/article-writer.ts).
// Turbo Layer hanya call AI dengan prompt yang sudah jadi dari Worker.

app.post('/article/heavy', async function(req, res) {
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
          opencode: !!OPENCODE_API_KEY,
          cloudflare: !!(CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID),
        },
      });
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Turbo] Article AI selesai dalam ${elapsed}ms via ${result.provider}`);

    res.json({
      content: result.content,
      provider: result.provider,
      elapsed_ms: elapsed,
    });
  } catch (e) {
    console.error(`[Turbo] /article/heavy error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /article/generate — Full Generation ──
// Prompt builder & parser di ./prompt.js (imported at top)

app.post('/article/generate', async function(req, res) {
  const startTime = Date.now();
  const { topic, summary, reviewSummary } = req.body;

  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'Field "topic" diperlukan (string)' });
  }

  try {
    const prompt = buildArticlePrompt(topic, summary || '', reviewSummary || '');
    const result = await callAI([{ role: 'user', content: prompt }]);

    if (!result) {
      return res.status(503).json({
        error: 'Semua AI provider gagal generate artikel',
        providers: {
          openrouter: !!OPENROUTER_API_KEY,
          nvidia: !!NVIDIA_API_KEY,
          opencode: !!OPENCODE_API_KEY,
          cloudflare: !!(CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID),
        },
      });
    }

    const article = parseArticleJSON(result.content);
    const elapsed = Date.now() - startTime;

    console.log(`[Turbo] Article generate ${elapsed}ms via ${result.provider}: "${(article.title || '').slice(0, 60)}"`);

    res.json({
      article,
      provider: result.provider,
      elapsed_ms: elapsed,
    });
  } catch (e) {
    console.error(`[Turbo] /article/generate error: ${e.message}`);
    res.status(500).json({ error: e.message, fallback: true });
  }
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
    if (OPENCODE_API_KEY) providers.push('OpenCode');
    if (NVIDIA_API_KEY) providers.push('Step 3.7 Flash');
    if (OPENROUTER_API_KEY) providers.push('OpenRouter');
    if (CLOUDFLARE_AI_TOKEN && CLOUDFLARE_ACCOUNT_ID) providers.push('Cloudflare AI');

    console.log(`🚀 Turbo Layer running on port ${PORT}`);
    console.log(`📡 AI Priority: Cloudflare → OpenCode → Step 3.7 Flash → OpenRouter`);
    console.log(`📡 Active Providers: ${providers.length > 0 ? providers.join(' → ') : '⚠️  NONE (set env vars!)'}`);
    console.log(`⏰ Started at ${new Date().toISOString()}`);
  });
}
