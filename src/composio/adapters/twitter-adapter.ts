import type { FinalContent } from '../../content/types/content';
import type { PlatformAdapter } from '../types';
import { createSocialText, extractHashtags } from '../content-formatter';

export const twitterAdapter: PlatformAdapter = {
  platform: 'twitter',
  actionId: 'TWITTER_CREATION_OF_A_POST',
  maxLength: 4000,
  format(content: FinalContent, discordMessageId?: string, images?: string[]) {
    const text = createSocialText(content, this.maxLength, extractHashtags(content));
    const input: Record<string, unknown> = { text };
    
    // Composio Twitter creation accepts media_urls or similar depending on the exact action spec
    // We pass it if we have it, although Twitter might require media uploads first in some Composio endpoints
    if (images && images.length > 0) {
      input['media_urls'] = images;
    }
    
    return input;
  }
};
