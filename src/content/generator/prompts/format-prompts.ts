import type { ContentBrief, ContentFormat } from '../../types/content';
import type { ResearchBundle } from '../../research/types';

type PromptFunction = (brief: ContentBrief, research: ResearchBundle) => string;

export const FORMAT_PROMPT_MAP: Record<ContentFormat, PromptFunction> = {
  review: (brief, research) => `Tulis review mendalam tentang "${brief.topic}" dari perspektif seorang penikmat anime/manga/game yang genuine.

Struktur yang diinginkan:
1. Hook pembuka yang langsung tarik perhatian (bukan synopsis biasa)
2. Apa yang bikin "${brief.topic}" beda dari yang lain? (USP-nya)
3. Analisis kualitas — cerita, karakter, visual/art, pacing
4. Perdebatan komunitas: apa yang dipuji vs dikritik?
5. Verdict: layak atau tidak, untuk siapa, dan kenapa

Data riset: ${research.summary}

Ingat: bukan reviewer robot, tapi teman yang genuine excited (atau kecewa) tentang karya ini.`,

  'breaking-news': (brief) => `Tulis artikel breaking news tentang "${brief.topic}".

Format: cepat, to the point, tapi tetap ada angle yang menarik.
- Headline: angka/fakta yang bikin orang baca lebih lanjut
- Apa dampaknya ke industri atau komunitas?
- Reaksi dari komunitas (Reddit, Twitter, forum)
- Kenapa ini penting sekarang?

Tone: informatif tapi antusias, bukan artikel koran.`,

  recommendation: (brief) => `Tulis artikel rekomendasi untuk "${brief.topic}".

Yang dicari pembaca:
- Kenapa gue harus nonton/baca ini sekarang?
- Mirip sama apa yang udah gue tau?
- Apa yang bikin unik/spesial dibanding yang lain?
- Tips: harus sabar di episode/chapter berapa?

Tone: kayak rekomendasi dari teman yang udah nonton, bukan review formal.`,

  'deep-dive': (brief) => `Tulis analisis mendalam tentang "${brief.topic}".

Ini bukan review — ini analisis yang beneran mikir:
- Latar belakang konteks yang mungkin gak banyak orang tau
- Breakdown sistem/filosofi/tema secara detail
- Contoh spesifik yang mendukung analisis
- Implikasi: apa artinya untuk industri/karya ini ke depan?

Tone: analitis tapi accessible, kayak video essay YouTube yang bagus.`,

  'season-preview': (brief) => `Tulis preview musim untuk "${brief.topic}".

Buat pembaca excited dengan:
- Highlight 3-5 judul paling anticipated, kenapa mereka harus nonton
- Ada yang underrated/dark horse yang wajib diwaspadai?
- Perbandingan dengan season-season sebelumnya
- Prediksi: mana yang bakal jadi GOTY/AOTY contender?

Tone: hype tapi honest, bukan sekadar listing anime.`,

  comparison: (brief) => `Tulis comparison analysis tentang "${brief.topic}".

Bukan sekedar daftar kelebihan/kekurangan:
- Konteks: kenapa perbandingan ini relevan sekarang?
- Fair assessment dari kedua sisi dengan bukti konkret
- Tabel perbandingan jika membantu
- Verdict: mana yang lebih worth it, untuk siapa, dalam konteks apa?

Tone: objektif tapi tetap punya opini yang jelas.`,

  retrospective: (brief) => `Tulis retrospective tentang "${brief.topic}".

Bukan sekedar nostalgia — tapi analisis legacy yang thoughtful:
- Kenapa ini penting waktu pertama kali keluar?
- Bagaimana reaksi komunitas berubah seiring waktu?
- Legacy dan impact ke karya-karya setelahnya
- Masih relevan atau sudah jadi artefak sejarah?

Tone: reflektif, nostalgis tapi kritis.`,

  industry: (brief) => `Tulis artikel industry insight tentang "${brief.topic}".

Behind-the-scenes yang jarang dibahas:
- Fakta bisnis/produksi yang menarik
- Kenapa keputusan ini dibuat oleh studio/publisher?
- Dampak ke industri secara keseluruhan
- Apa yang bisa kita expect ke depan berdasarkan tren ini?

Tone: informatif, inside baseball, tapi tidak boring.`,

  'top-list': (brief) => `Tulis top list untuk "${brief.topic}".

Bukan sekedar daftar dengan skor:
- Setiap entry: kenapa masuk list ini, apa yang bikin memorable
- Ada dark horse/underrated yang patut surprise?
- Kriteria selection yang jelas (bukan random)
- Honorable mentions yang hampir masuk

Tone: fun, debatable, bikin orang mau reply "eh kenapa X gak masuk?".`,

  discussion: (brief) => `Tulis discussion article tentang "${brief.topic}".

Bikin diskusi yang genuine:
- Present masalah/pertanyaan dengan jelas dan menarik
- Argumen dari beberapa sudut pandang — bukan cuma satu sisi
- Data atau evidence yang mendukung setiap sisi
- Ajak pembaca untuk share pendapat mereka

Tone: opinionated tapi open-minded, spark debate yang produktif.`,

  'character-spotlight': (brief) => `Tulis character spotlight untuk "${brief.topic}".

Lebih dalam dari sekadar bio karakter:
- Apa yang bikin karakter ini memorable/iconic?
- Character arc: bagaimana mereka berkembang?
- Momen terbaik/paling impactful
- Kenapa fans suka atau benci karakter ini?
- Perbandingan dengan karakter serupa dari karya lain

Tone: passionate, kayak fans yang genuinely suka karakter ini.`,

  'lore-explained': (brief) => `Tulis lore explanation untuk "${brief.topic}".

Bukan copas wiki — tapi penjelasan yang bikin "oh gitu ternyata!":
- Breakdown sistem/dunia dengan bahasa yang mudah dipahami
- Koneksi antara berbagai elemen lore yang mungkin gak obvious
- Implikasi lore ke plot dan karakter
- Teori atau spekulasi yang menarik berdasarkan lore yang ada

Tone: antusias lore enthusiast, bukan kering seperti ensiklopedia.`,
};
