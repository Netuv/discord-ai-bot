/**
 * prompt.js — AI Article Prompt Builder + JSON Parser
 * Ported from src/ai/writer.ts for Vercel Turbo Layer
 * v6.1 — Same logic as Worker version, plain JavaScript (no TS)
 */

/**
 * Build article prompt from topic + research data.
 * Forces AI to use real data, not examples/dummy content.
 */
function buildArticlePrompt(topic, summary, reviewSummary) {
  const parts = [
    `**ROLE**`,
    ``,
    `Lo jurnalis anime yang nulis kayak ngobrol santai di Discord. Natural, pake "gue/lo/kita", reaktif, kadang pake elipsis buat efek mikir. Bukan wartawan, bukan blog formal.`,
    ``,
    `**HARUS PAKAI DATA INI — JANGAN KARANG FAKTA SENDIRI**`,
    `Topik WAJIB: ${topic}`,
    ``,
    `Data/fakta WAJIB dipakai (ini hasil search real-time, bukan contoh):`,
    `${summary}`,
  ];

  if (reviewSummary) {
    parts.push(`\nOpini publik:\n${reviewSummary}`);
  }

  parts.push(
    ``,
    `**ATURAN KETAT:**`,
    `1. Kalo data research kosong, tulis opini pribadi yang relate based on knowledge. Tapi jangan bikin berita palsu.`,
    `2. Cari angle yang fresh. Jangan copy-paste narasi dari contoh.`,
    ``,
    `**OUTPUT: JSON — WAJIB properti ini:**`,
    `{`,
    `  "title": "🎯 [Emoji] Judul (berdasarkan ${topic})",`,
    `  "intro": "Hook 2-3 kalimat bikin penasaran",`,
    `  "sections": [`,
    `    {`,
    `      "heading": "Sub-topik dari berita aktual",`,
    `      "body": "3-5 paragraf narasi natural",`,
    `      "image_query": "NAMA ANIME/MANGA/GAME EXACT — paling 3 kata",`,
    `      "video_query": "[nama exact] trailer"`,
    `    }`,
    `  ],`,
    `  "category": "anime/manga/game/breaking/announcement/general"`,
    `}`,
    ``,
    `**JUMLAH SECTION: 3-5.** Masing-masing 3-5 paragraf. Minimal 2000 karakter total. No closing section, no kesimpulan.`,
    ``,
    `**GAYA NULIS:**`,
    `- Awalan natural kayak "Oke jadi...", "Nah gini...", "Gue baru tau..."`,
    `- Variasi kalimat: pendek buat emphasis, panjang buat narasi`,
    `- Reaksi dulu baru jelasin fakta`,
    `- Boleh spill opini pribadi, tapi bedain mana fakta mana opini`,
    `- JANGAN pake: "dapat disimpulkan", "oleh karena itu", "dengan demikian"`,
    `- JANGAN pake bullet poin — semua prosa`,
    `- JANGAN karang fakta di luar research`,
    `- NO watermark/footer/AI label/closing`,
    ``,
    `BALAS HANYA JSON, tanpa teks lain!`,
  );

  return parts.filter(Boolean).join('\n');
}

/**
 * Parse AI response into Article object.
 * Handles messy JSON with multiple fallback strategies.
 */
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

  // Strategy 1: Extract JSON object from text
  try {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch { /* fall through */ }

  // Strategy 2: Remove URLs then retry
  if (!parsed) {
    try {
      const r = cleaned.replace(/https?:\/\/[^\s,"}\]]+/g, '[link]');
      const m = r.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch { /* fall through */ }
  }

  // Strategy 3: Fix broken JSON
  if (!parsed) {
    try {
      const fixed = cleaned
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
        .replace(/:\s*'([^']*)'/g, ':"$1"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      const m = fixed.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch { /* fall through */ }
  }

  if (!parsed) {
    throw new Error('AI gagal generate artikel valid — response bukan JSON');
  }

  // Validate sections
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
      parsed.sections = parsed.topics;
      delete parsed.topics;
    } else {
      parsed.sections = [
        {
          heading: '📖 Lanjutan',
          body: parsed.intro || 'Topik ini lagi hangat dibicarakan di komunitas.',
          image_query: '',
          video_query: '',
        },
      ];
    }
  }

  // Normalize each section
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

module.exports = { buildArticlePrompt, parseArticleJSON };
