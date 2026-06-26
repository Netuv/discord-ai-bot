export type ImageSource = 'mal' | 'anilist' | 'kitsu' | 'brave' | 'google' | 'ddg';

export type FocalPoint =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface ImageCandidate {
  url: string;
  source: ImageSource;
  title: string;
  width?: number;
  height?: number;
  titleScore: number;
  sourceScore: number;
  aiScore?: number;
  focalPoint?: FocalPoint;
  finalScore?: number;
}

const SOURCE_SCORES: Record<ImageSource, number> = {
  anilist: 100, // AniList extraLarge is usually higher resolution
  mal: 90,
  kitsu: 80,
  brave: 60,
  google: 50,
  ddg: 30,
};

const WEIGHTS = { title: 0.4, source: 0.3, vision: 0.3 };

export function scoreCandidate(c: ImageCandidate): number {
  const visionScore = c.aiScore !== undefined ? c.aiScore * 10 : 50;
  return (
    c.titleScore * WEIGHTS.title +
    c.sourceScore * WEIGHTS.source +
    visionScore * WEIGHTS.vision
  );
}

export function calculateTitleScore(query: string, resultTitle: string): number {
  const q = query.toLowerCase().trim();
  const t = resultTitle.toLowerCase().trim();
  if (t === q) return 100;
  if (t.includes(q) || q.includes(t)) return 85;

  // Word overlap
  const qWords = new Set(q.split(/\s+/));
  const tWords = new Set(t.split(/\s+/));
  const overlap = [...qWords].filter((w) => tWords.has(w)).length;
  return Math.round((overlap / Math.max(qWords.size, tWords.size)) * 65);
}

export function buildCandidate(
  url: string,
  source: ImageSource,
  title: string,
  query: string
): ImageCandidate {
  return {
    url,
    source,
    title,
    titleScore: calculateTitleScore(query, title),
    sourceScore: SOURCE_SCORES[source],
  };
}
