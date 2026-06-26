import type { FinalContent } from '../../content/types/content';
import type { PlatformAdapter } from '../types';
import { createSocialText, extractHashtags } from '../content-formatter';

export const linkedinAdapter: PlatformAdapter = {
  platform: 'linkedin',
  actionId: 'LINKEDIN_CREATE_LINKED_IN_POST',
  maxLength: 3000,
  format(content: FinalContent, discordMessageId?: string, images?: string[]) {
    const text = createSocialText(content, this.maxLength, extractHashtags(content));
    return { text };
  }
};
