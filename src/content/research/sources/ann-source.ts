import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch } from '../../../core/safe-fetch';

const ANN_FEED_URL = 'https://www.animenewsnetwork.com/all/atom.xml?ann-edition=sea';

export interface ANNNewsItem {
  title: string;
  url: string;
  published: string;
  summary: string;
  category: string;
}

/**
 * Anime News Network RSS (Atom) feed — real-time anime/manga industry news.
 * Free, no API key needed. Updated continuously.
 *
 * Parses Atom XML manually (no heavy XML lib needed — regex + string ops).
 */
export class AnimeNewsNetworkSource {
  constructor(private budget: BudgetTracker) {}

  async fetchLatest(maxItems = 10): Promise<ANNNewsItem[]> {
    this.budget.consume(1, 'ANN:RSS');

    const res = await safeFetch(ANN_FEED_URL, { timeoutMs: 10_000 });
    if (!res || !res.ok) return [];

    const xml = await res.text();
    if (!xml) return [];

    return this.parseFeed(xml, maxItems);
  }

  /**
   * Search ANN feed for items matching a topic/keyword (case-insensitive)
   */
  async search(topic: string): Promise<ANNNewsItem[]> {
    const items = await this.fetchLatest(30);
    const lower = topic.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.summary.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower)
    );
  }

  /**
   * Parse Atom XML without external dependencies.
   * Extracts: title, link, published, summary, category from each <entry>.
   */
  private parseFeed(xml: string, maxItems: number): ANNNewsItem[] {
    const items: ANNNewsItem[] = [];

    // Split by <entry> tags
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1]!;

      const title = this.extractTag(block, 'title');
      const link = this.extractAttr(block, 'link', 'href');
      const published = this.extractTag(block, 'published');
      const summary = this.extractTag(block, 'summary');
      const category = this.extractAttr(block, 'category', 'term');

      if (title && link) {
        items.push({
          title: this.stripHtml(title),
          url: link,
          published: published ?? new Date().toISOString(),
          summary: this.stripHtml(summary ?? ''),
          category: category ?? 'Anime',
        });
      }
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = regex.exec(xml);
    return m ? m[1]!.trim() : null;
  }

  private extractAttr(xml: string, tag: string, attr: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i');
    const m = regex.exec(xml);
    return m ? m[1]!.trim() : null;
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}