import type { FinalContent } from '../../content/types/content';
import type { PlatformAdapter } from '../types';
import { createSocialText, extractHashtags } from '../content-formatter';

export const instagramAdapter: PlatformAdapter = {
  platform: 'instagram',
  actionId: 'INSTAGRAM_CREATE_POST',
  maxLength: 2200,
  format(content: FinalContent, discordMessageId?: string, images?: string[]) {
    const text = createSocialText(content, this.maxLength, extractHashtags(content));
    const input: Record<string, unknown> = { caption: text };
    
    if (images && images.length > 0) {
      input['image_url'] = images[0]; // Instagram usually takes one image or a carousel
    }
    
    return input;
  }
};
