import type { FinalContent } from '../content/types/content';

export function createSocialText(content: FinalContent, maxLength: number, hashtags: string[] = []): string {
  const intro = content.intro.slice(0, 200);
  const title = content.title;
  
  // Format based on max length
  let text = `🔥 ${title}\n\n${intro}`;
  
  // Add some bullet points if space permits
  if (content.sections.length > 0 && text.length < maxLength - 300) {
    text += `\n\nHighlights:\n`;
    for (const section of content.sections.slice(0, 2)) {
      text += `👉 ${section.heading}\n`;
    }
  }

  const tagString = hashtags.map(t => `#${t}`).join(' ');
  const finalString = `${text}\n\n${tagString}`;
  
  if (finalString.length > maxLength) {
    return finalString.slice(0, maxLength - 3) + '...';
  }
  
  return finalString;
}

export function extractHashtags(content: FinalContent): string[] {
  return [content.category, content.format.replace('-', ''), 'anime', 'manga'].slice(0, 3);
}
