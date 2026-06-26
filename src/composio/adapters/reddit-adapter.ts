import type { FinalContent } from '../../content/types/content';
import type { PlatformAdapter } from '../types';
import { createSocialText, extractHashtags } from '../content-formatter';

export const redditAdapter: PlatformAdapter = {
  platform: 'reddit',
  actionId: 'REDDIT_CREATE_POST',
  maxLength: 40000,
  format(content: FinalContent, discordMessageId?: string, images?: string[]) {
    const text = createSocialText(content, this.maxLength, extractHashtags(content));
    return { title: content.title, text };
  }
};
