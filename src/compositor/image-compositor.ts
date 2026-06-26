import { ImageResponse } from 'cf-workers-og';
import type { ContentCategory, ContentFormat } from '../content/types/content';
import type { Env } from '../types/env';
import { loadFont } from './font-loader';
import { buildTemplate, FocalPoint } from './templates';
import type { PlatformType } from '../composio/types';
import { traceLog } from '../core/trace-logger';

const PLATFORM_SIZES: Record<PlatformType, { width: number; height: number }> = {
  twitter:   { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1080 },
  linkedin:  { width: 1200, height: 627 },
  reddit:    { width: 1200, height: 600 },
  telegram:  { width: 512,  height: 512 },
};

export async function composeImage(
  imageUrl: string,
  title: string,
  category: ContentCategory,
  format: ContentFormat,
  platform: PlatformType,
  focalPoint: FocalPoint = 'center',
  env: Env
): Promise<Uint8Array> {
  const { width, height } = PLATFORM_SIZES[platform];
  
  let fontBuffer: ArrayBuffer | undefined;
  try {
    fontBuffer = await loadFont(env);
  } catch (e) {
    traceLog('warn', 'Compositor', `Failed to load font`, { error: (e as Error).message });
  }

  try {
    const template = buildTemplate({ imageUrl, title, category, format, width, height, focalPoint });
    
    const options: any = { width, height };
    if (fontBuffer) {
      options.fonts = [{ name: 'Inter', data: fontBuffer, weight: 700 }];
    }

    const response = await ImageResponse.create(template, options);
    return new Uint8Array(await response.arrayBuffer());
  } catch (e) {
    traceLog('warn', 'Compositor', `Composition failed, using original fallback`, {
      error: (e as Error).message,
    });
    // Fallback: return empty buffer, caller will decide what to do
    return new Uint8Array(0);
  }
}
