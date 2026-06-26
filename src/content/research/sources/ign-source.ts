import { BudgetTracker } from '../../../core/budget-tracker';
import { safeFetch } from '../../../core/safe-fetch';

const IGN_FEED_URL = 'https://feeds.feedburner.com/ign/games-all';

export interface IGNNewsItem {
  title: string;
  url: string;
  published: string;
  summary: string;
}

/**
 * IGN Games RSS feed — real-time gaming news, reviews, and features.
 * Free, no API key needed. RSS 2.0 format.
 *
 * Parses standard RSS 2.0 XML with CDATA content.
 */
export class IGNSource {
  constructor(private budget: BudgetTracker) {}

  async fetchLatest(maxItems = 10): Promise<IGNNewsItem[]> {
    this.budget.consume(1, 'IGN:RSS');

    const res = await safeFetch(IGN_FEED_URL, { timeoutMs: 10_000 });
    if (!res || !res.ok) return [];

    const xml = await res.text();
    if (!xml) return [];

    return this.parseFeed(xml, maxItems);
  }

  /**
   * Search IGN feed for items matching a topic/keyword
   */
  async search(topic: string): Promise<IGNNewsItem[]> {
    const items = await this.fetchLatest(30);
    const lower = topic.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.summary.toLowerCase().includes(lower)
    );
  }

  /**
   * Parse RSS 2.0 XML — extracts title, link, pubDate, description from <item> blocks.
   */
  private parseFeed(xml: string, maxItems: number): IGNNewsItem[] {
    const items: IGNNewsItem[] = [];

    // Split by <item> tags
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const block = match[1]!;

      const title = this.extractCData(block, 'title');
      const link = this.extractTagContent(block, 'link');
      const pubDate = this.extractTagContent(block, 'pubDate');
      const description = this.extractCData(block, 'description');

      if (title && link) {
        items.push({
          title: this.stripHtml(title),
          url: link,
          published: pubDate ?? new Date().toISOString(),
          summary: this.stripHtml(description ?? '').slice(0, 300),
        });
      }
    }

    return items;
  }

  /** Extract text content between <tag> and </tag> */
  private extractTagContent(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = regex.exec(xml);
    return m ? m[1]!.trim() : null;
  }

  /** Extract CDATA content from a tag: <tag><![CDATA[...]]></tag> */
  private extractCData(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
    const m = regex.exec(xml);
    if (m) return m[1]!.trim();

    // Fallback: plain text between tags
    return this.extractTagContent(xml, tag);
  }

  private stripHtml(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}