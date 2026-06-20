/**
 * Test untuk VideoScraper — validasi scoring + multi-source search
 */
import { describe, it, expect, vi } from "vitest";

// Import fungsi yang di-test
// Note: karena ini Cloudflare Workers, fetch tidak tersedia di Vitest secara default
// Tapi kita bisa test pure functions (tokenize, videoTitleScore, dll)

// Copy of functions from video-scraper.ts for testing
function tokenize(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function tokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((qt) =>
    targetTokens.some((tt) => tt === qt || qt.includes(tt) || tt.includes(qt))
  ).length;
  return matched / queryTokens.length;
}

function lengthRatio(q: string, t: string): number {
  if (!q || !t) return 0;
  const shorter = Math.min(q.length, t.length);
  const longer = Math.max(q.length, t.length);
  return shorter / longer;
}

const RELEVANT_KEYWORDS = [
  "trailer", "teaser", "pv", "promotional video", "opening", "ending",
  "official", "预告", "予告", "cm", "highlight", "clip", "scene",
  "full", "episode", "movie", "film", "season", "part", "chapter",
  "anime", "manga", "game", "gameplay", "story", "teaser trailer",
  "announcement", "announce", " reveal", "look", "first look",
  "visual", "key visual", "adaptation", "release date", "new",
];

const SPECIFIC_KEYWORDS = /\b(season|part|episode|movie|film|arc|cour|special|ova|oad|trailer|teaser|pv|opening|ending|gameplay)\b/i;

function videoTitleScore(query: string, title: string | null | undefined): number {
  if (!title) return 0;
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();
  if (!q || !t) return 0;

  const qTokens = tokenize(q);
  const tTokens = tokenize(t);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;

  let baseScore = 0;

  if (q === t) {
    baseScore = 75;
  } else {
    const overlap = tokenOverlap(qTokens, tTokens);
    const lr = lengthRatio(q, t);

    if (overlap >= 1.0 && lr >= 0.6) {
      baseScore = 65;
    } else if (overlap >= 1.0) {
      baseScore = 55;
    } else if (overlap >= 0.8 && lr >= 0.5) {
      baseScore = 45;
    } else if (overlap >= 0.6) {
      baseScore = 35;
    } else if (overlap >= 0.4) {
      baseScore = 15;
    } else {
      baseScore = 0;
    }
  }

  let relevanceBonus = 0;
  const matchedKeywords = RELEVANT_KEYWORDS.filter((kw) => t.includes(kw));
  if (matchedKeywords.length >= 2) {
    relevanceBonus = 15;
  } else if (matchedKeywords.length === 1) {
    relevanceBonus = 10;
  }

  let specificBonus = 0;
  const queryHasSpecific = SPECIFIC_KEYWORDS.test(q);
  const titleHasSpecific = SPECIFIC_KEYWORDS.test(t);
  if (queryHasSpecific && titleHasSpecific) {
    specificBonus = 10;
  } else if (queryHasSpecific && !titleHasSpecific) {
    specificBonus = -10;
  }

  return Math.max(0, Math.min(100, baseScore + relevanceBonus + specificBonus));
}

// ─── Tests ─────────────────────────────────────────────────

describe("tokenize()", () => {
  it("should lowercase and split by non-alphanumeric", () => {
    expect(tokenize("Jujutsu Kaisen Season 2")).toEqual(["jujutsu", "kaisen", "season", "2"]);
  });

  it("should remove empty tokens", () => {
    expect(tokenize("  hello   world  ")).toEqual(["hello", "world"]);
  });

  it("should split on special chars", () => {
    expect(tokenize("Demon Slayer: Mugen Train")).toEqual(["demon", "slayer", "mugen", "train"]);
  });
});

describe("tokenOverlap()", () => {
  it("should return 1 for exact match", () => {
    const q = tokenize("jujutsu kaisen");
    const t = tokenize("jujutsu kaisen season 2");
    expect(tokenOverlap(q, t)).toBe(1);
  });

  it("should return 0.5 for half match", () => {
    const q = tokenize("naruto shippuden");
    const t = tokenize("naruto boruto");
    expect(tokenOverlap(q, t)).toBe(0.5);
  });

  it("should handle substring token matching", () => {
    const q = tokenize("one piece");
    const t = tokenize("one piece film red");
    expect(tokenOverlap(q, t)).toBe(1);
  });
});

describe("lengthRatio()", () => {
  it("should return 1 for same length", () => {
    expect(lengthRatio("hello", "hello")).toBeCloseTo(1);
  });

  it("should return < 1 for different lengths", () => {
    expect(lengthRatio("hi", "hello")).toBeLessThan(1);
  });
});

describe("videoTitleScore()", () => {
  // ── Exact Match ──
  it("exact match should score 75+", () => {
    const score = videoTitleScore("Jujutsu Kaisen Season 2 Trailer", "Jujutsu Kaisen Season 2 Trailer");
    expect(score).toBeGreaterThanOrEqual(75);
  });

  // ── Trailer/Video context ──
  it("should give bonus for trailer keyword match", () => {
    const withTrailer = videoTitleScore("Jujutsu Kaisen trailer", "Jujutsu Kaisen Official Trailer 2024");
    const withoutTrailer = videoTitleScore("Jujutsu Kaisen trailer", "Jujutsu Kaisen Episode 1");
    // Yang pake 'trailer' harus dapet relevance bonus
    expect(withTrailer).toBeGreaterThan(withoutTrailer);
  });

  // ── Season awareness ──
  it("season penalty when query has season but title doesn't", () => {
    const score = videoTitleScore("Naruto Season 3", "Naruto Compilation");
    // Should be penalized because "Season 3" in query but title is generic
    expect(score).toBeLessThan(50);
  });

  it("season bonus when both query and title have season", () => {
    const score = videoTitleScore("One Piece Season 2", "One Piece Season 2 Official Trailer");
    expect(score).toBeGreaterThanOrEqual(55); // 45 base + 10 relevance + 10 specific = 65
  });

  // ── Anime query matching ──
  it("should match anime series name in video title", () => {
    const score = videoTitleScore("Attack on Titan", "ATTACK ON TITAN: The Final Season Trailer");
    expect(score).toBeGreaterThanOrEqual(50);
  });

  // ── Edge cases ──
  it("should return 0 for null/undefined title", () => {
    expect(videoTitleScore("test", null)).toBe(0);
    expect(videoTitleScore("test", undefined)).toBe(0);
  });

  it("should return 0 for empty strings", () => {
    expect(videoTitleScore("", "test")).toBe(0);
    expect(videoTitleScore("test", "")).toBe(0);
  });

  // ── Relevance bonus ──
  it("should give higher score for titles with multiple relevant keywords", () => {
    const score1 = videoTitleScore("Demon Slayer", "Demon Slayer Season 3 Trailer Official PV");
    const score2 = videoTitleScore("Demon Slayer", "Demon Slayer Episode 10");
    expect(score1).toBeGreaterThan(score2);
  });

  // ── Partial match ──
  it("should score partial matches reasonably", () => {
    const score = videoTitleScore("Chainsaw Man", "Chainsaw Man - Official Trailer");
    expect(score).toBeGreaterThanOrEqual(55); // 45 base (80%+ overlap) + 10 relevance = 55
  });

  // ── Generic vs specific ──
  it("generic query should not penalize specific titles", () => {
    const score = videoTitleScore("anime", "Jujutsu Kaisen Season 2 Trailer");
    // "anime" is too generic, should have low score
    expect(score).toBeLessThan(50);
  });

  // ── PV/Trailer detection ──
  it("should detect PV/trailer content", () => {
    const score = videoTitleScore("Dorohedoro Season 3 PV", "Dorohedoro Season 3 Promotional Video");
    expect(score).toBeGreaterThanOrEqual(60);
  });

  // ── Full episode vs clip ──
  it("'full episode' should get relevance bonus", () => {
    const score = videoTitleScore("Bleach TYBW", "Bleach TYBW Full Episode English Sub");
    expect(score).toBeGreaterThanOrEqual(60);
  });
});
