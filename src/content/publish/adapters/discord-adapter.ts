import type { FinalContent, ContentCategory, ContentFormat } from '../../types/content';
import { safeFetch } from '../../../core/safe-fetch';
import { AppError, ErrorCode } from '../../../core/errors';

const CATEGORY_COLORS: Record<ContentCategory, number> = {
  anime: 0xff6b6b,
  manga: 0x9b59b6,
  game: 0x3498db,
  novel: 0xe67e22,
};

const FORMAT_EMOJI: Record<ContentFormat, string> = {
  review: '⭐',
  'breaking-news': '🔥',
  recommendation: '💎',
  'deep-dive': '🔍',
  'season-preview': '🎌',
  comparison: '⚖️',
  retrospective: '📚',
  industry: '🏭',
  'top-list': '🏆',
  discussion: '💬',
  'character-spotlight': '🎭',
  'lore-explained': '📖',
};

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  image?: { url: string };
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordMessagePayload {
  content?: string;
  embeds?: DiscordEmbed[];
}

export class DiscordAdapter {
  private baseUrl = 'https://discord.com/api/v10';

  constructor(private token: string) {}

  async send(channelId: string, content: FinalContent): Promise<string> {
    const payloads = this.formatToDiscord(content);

    let lastMessageId = '';
    for (const payload of payloads) {
      const res = await safeFetch(`${this.baseUrl}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeoutMs: 10_000,
      });

      if (!res || !res.ok) {
        const errText = await res?.text().catch(() => 'unknown');
        throw new AppError(
          ErrorCode.DISCORD_SEND_FAILED,
          `Discord API error: ${errText}`
        );
      }

      const data = (await res.json()) as { id: string };
      lastMessageId = data.id;

      // Discord rate limit buffer
      await new Promise((r) => setTimeout(r, 600));
    }

    return lastMessageId;
  }

  private formatToDiscord(content: FinalContent): DiscordMessagePayload[] {
    const payloads: DiscordMessagePayload[] = [];
    const emoji = FORMAT_EMOJI[content.format];
    const color = CATEGORY_COLORS[content.category];
    const dateStr = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // ── Message 1: Header Embed (title + intro + footer)
    // Displayed as a rich embed with color bar
    payloads.push({
      embeds: [
        {
          title: `${emoji} ${content.title}`,
          description: content.intro,
          color,
          footer: {
            text: `${content.category.toUpperCase()} · ${content.format} · ${dateStr}`,
          },
          timestamp: content.metadata.generatedAt,
        },
      ],
    });

    // ── Messages 2+: Each section as plain text for natural Discord readability
    // Groups sections in chunks of 2 to stay under Discord's 2000 char message limit
    const chunks = chunkArray(content.sections, 2);

    for (const chunk of chunks) {
      let text = '';

      for (const section of chunk) {
        // Section heading + body
        text += `**${section.heading}**\n${section.body}`;

        // Image description (📸 line) — only text description
        if (section.imageDescription) {
          text += `\n\n📸 *${section.imageDescription}*`;
        }

        // YouTube video link (🎬 line) - real URL from YouTube API
        if (section.videoUrl) {
          if (section.videoTitle) {
            text += `\n🎬 ${section.videoTitle} — \n${section.videoUrl}`;
          } else {
            text += `\n🎬 \n${section.videoUrl}`;
          }
        }

        text += '\n\n';
      }

      // Trim and truncate if needed (Discord limit is 2000 chars per message)
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        payloads.push({ content: trimmed.slice(0, 1999) });
      }
    }

    // ── Final message: HD image gallery embed
    // Collect all real high-res image URLs, add as embed images for proper HD rendering (SD–Full HD)
    const imageSections = content.sections.filter(s => s.imageUrl);
    for (const section of imageSections) {
      if (section.imageUrl) {
        payloads.push({
          embeds: [{
            image: { url: section.imageUrl },
            color,
            footer: { text: section.imageDescription ?? content.title },
          }],
        });
      }
    }

    return payloads;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
