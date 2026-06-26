import type { FinalContent } from '../../content/types/content';
import type { PlatformAdapter } from '../types';
import { createSocialText, extractHashtags } from '../content-formatter';

export const telegramAdapter: PlatformAdapter = {
  platform: 'telegram',
  actionId: 'TELEGRAM_SEND_MESSAGE',
  maxLength: 4096,
  format(content: FinalContent, discordMessageId?: string, images?: string[]) {
    const text = createSocialText(content, this.maxLength, extractHashtags(content));
    return { text };
  }
};
