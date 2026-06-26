import type { ContentBrief, ContentCategory } from '../../types/content';
import type { Env } from '../../../types/env';
import type { ResearchEngine, ResearchBundle } from '../types';
import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetchJson } from '../../../core/safe-fetch';
import { D1Cache } from '../../../core/d1-cache';
import { D1Client } from '../../../core/d1';

interface JikanAnime {
  mal_id: number;
  title: string;
  synopsis: string;
  score: number;
  scored_by: number;
  genres: Array<{ name: string }>;
  studios: Array<{ name: string }>;
}

interface JikanReview {
  user: { username: string };
  review: string;
  score: number;
}

class ReviewEngine implements ResearchEngine {
  async execute(
    topic: string,
    category: ContentCategory,
    brief: ContentBrief,
    env: Env,
    budget: BudgetTracker
  ): Promise<ResearchBundle> {
    const db = new D1Client(env);
    const cache = new D1Cache(db);

    // Search for anime/manga
    budget.consume(1, 'ReviewEngine:search');
    const searchResults = await safeFetchJson<{ data: JikanAnime[] }>(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(topic)}&limit=1&sfw=true`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    const anime = searchResults.data[0];
    if (!anime) {
      return {
        topic,
        format: brief.format,
        category,
        summary: `Review analysis for "${topic}" - data not found`,
        context: { error: 'not_found' },
        sources: [],
        mediaPlan: { imageQuery: topic },
      };
    }

    // Fetch reviews
    budget.consume(1, 'ReviewEngine:reviews');
    const reviewsData = await safeFetchJson<{ data: JikanReview[] }>(
      `https://api.jikan.moe/v4/anime/${anime.mal_id}/reviews?limit=5`,
      { timeoutMs: 5000 },
      { data: [] }
    );

    // Synthesize research
    const summary = this.buildSummary(anime, reviewsData.data);
    const context = {
      mal_id: anime.mal_id,
      title: anime.title,
      synopsis: anime.synopsis,
      score: anime.score,
      scored_by: anime.scored_by,
      genres: anime.genres.map((g) => g.name),
      studios: anime.studios.map((s) => s.name),
      reviews: reviewsData.data.slice(0, 3).map((r) => ({
        user: r.user.username,
        excerpt: r.review.slice(0, 200),
        score: r.score,
      })),
    };

    return {
      topic: anime.title,
      format: brief.format,
      category,
      summary,
      context,
      sources: [`https://myanimelist.net/anime/${anime.mal_id}`],
      mediaPlan: {
        imageQuery: anime.title,
        preferredSource: 'mal',
      },
    };
  }

  private buildSummary(anime: JikanAnime, reviews: JikanReview[]): string {
    const avgScore = anime.score;
    const reviewCount = anime.scored_by;
    const genres = anime.genres.map((g) => g.name).join(', ');

    const sentiment = reviews.length > 0
      ? `User reviews highlight: ${reviews[0]?.review.slice(0, 150)}...`
      : 'Limited user reviews available.';

    return `${anime.title} is a ${genres} anime with a MAL score of ${avgScore}/10 (${reviewCount} users). ${sentiment} Synopsis: ${anime.synopsis.slice(0, 200)}...`;
  }
}

const engine = new ReviewEngine();
export default engine;
