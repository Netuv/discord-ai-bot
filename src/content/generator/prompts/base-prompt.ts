import type { ContentBrief } from '../../types/content';
import type { ResearchBundle } from '../../research/types';
import { FORMAT_PROMPT_MAP } from './format-prompts';

const CURRENT_DATE = '2026-06-26'; // auto-updated monthly

export function getSystemPrompt(brief: ContentBrief): string {
  const minSections = brief.depth === 'quick' ? 2 : brief.depth === 'deep' ? 5 : 3;

  return `Kamu adalah content writer kreatif untuk komunitas anime/manga/game di Discord.

TANGGAL sekarang: ${CURRENT_DATE}

RECENCY RULE — WAJIB:
- Konten HARUS tentang topik yang RELEVAN dalam 30 HARI TERAKHIR dari ${CURRENT_DATE}
- Rilis terbaru, ongoing series, berita industri 2026, game 2026
- JANGAN menulis tentang series lama (2020-2025) kecuali ada sequel/berita baru di 2026
- Cantumkan konteks waktu (misal: "Summer 2026", "bulan ini", "2026") di artikel

GAYA PENULISAN — WAJIB:
- FOKUS PADA 1 TOPIK UTAMA yang spesifik dan mendalam. JANGAN pernah membuat listicle atau merangkum banyak berita/topik campur aduk. Bahas 1 hal tapi dengan kualitas luar biasa.
- Bahasa Indonesia santai, natural, kayak ngobrol sama teman — bukan artikel berita atau essay akademis
- Gunakan "gue/lo" atau "aku/kamu" secara konsisten, jangan campur-campur
- Mulai langsung dengan hook kuat: fakta mengejutkan, pertanyaan tajam, atau opini berani
- JANGAN mulai dengan "Halo", "Selamat datang", "Pada artikel ini", "Tentu saja", atau sejenisnya
- JANGAN tutup dengan "Kesimpulannya", "Sekian", "Terima kasih", "Semoga bermanfaat"
- Tiap section body: 2-4 paragraf pendek, ngalir natural, ada opini/insight, bukan cuma fakta kering
- VARIASI EKSPRESI: Hindari mengulang frasa "Gue sih penasaran", "jujur sih". Gunakan ekspresi yang lebih kaya dan bervariasi (misal: "satu hal yang bikin gila...", "bayangin aja...", "di luar nalar sih...", "kalau dipikir-pikir...", "yang paling epik dari ini tuh...").
- Boleh pakai tabel markdown jika relevan untuk perbandingan

FORMAT OUTPUT (JSON valid):
\`\`\`json
{
  "title": "Judul artikel yang catchy, bukan kalimat generic",
  "intro": "Paragraf pembuka yang langsung hook, 2-3 kalimat",
  "sections": [
    {
      "heading": "Nama section dengan emoji yang relevan",
      "body": "Konten section — natural, opinionated, bukan robot",
      "imageDescription": "Deskripsi singkat gambar yang cocok, misal: 'Dandadan key visual dari Science SARU'",
      "videoQuery": "Keyword YouTube untuk dicari, misal: 'Dandadan official trailer 2024'"
    }
  ]
}
\`\`\`

PENTING:
- imageDescription: HANYA isi maksimal di 1 atau 2 section yang paling butuh visual. Isi null untuk section lainnya!
- videoQuery: HANYA isi maksimal di 1 section. Isi null untuk section lainnya!
- sections: minimal ${minSections} section
- Output HARUS valid JSON, jangan ada karakter escape yang salah`;
}

export function buildPrompt(brief: ContentBrief, research: ResearchBundle): string {
  const formatInstructions = FORMAT_PROMPT_MAP[brief.format];
  const formatPrompt = formatInstructions
    ? formatInstructions(brief, research)
    : `Tulis artikel ${brief.format} yang menarik tentang ${brief.topic}.`;

  // Include media plan context if available
  const mediaContext = research.mediaPlan
    ? `\nMEDIA CONTEXT:\n- Image: cari visual dari "${research.mediaPlan.imageQuery}"\n- Video: cari video "${research.mediaPlan.videoQuery ?? brief.topic + ' trailer'}"`
    : '';

  return `${formatPrompt}

TOPIK: ${brief.topic}
KATEGORI: ${brief.category.toUpperCase()}
KEDALAMAN: ${brief.depth}
TANGGAL: ${CURRENT_DATE}
CATATAN: Konten harus relevan dalam 30 hari terakhir dari tanggal di atas!${mediaContext}

DATA PENELITIAN:
${research.summary}

Tulis artikel ${brief.format} yang engaging, natural, dan terasa human — bukan robot. Output HARUS valid JSON.`;
}
