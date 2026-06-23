/**
 * media-tools.ts — Media search MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { searchAnimeImage, downloadImage } from '../../services/media/imagescraper';
import { findYouTubeVideo } from '../../services/media/videoscraper';
import { makeTool } from './_helpers';

export function createMediaTools(): Record<string, ToolDefinition> {
	return {
		'search-image': makeTool('Search anime/manga image', { query: { type: 'string' } }, ['query'], async (args) => {
			const result = await searchAnimeImage(String(args.query), { env: getEnv() });
			if (!result) return `📭 No image found for "${args.query}".`;
			return `**🖼️ Image Found**\nQuery: ${args.query}\nSource: ${result.source}\nURL: ${result.url}`;
		}),
		'search-video': makeTool('Search YouTube video', { query: { type: 'string' } }, ['query'], async (args) => {
			const url = await findYouTubeVideo(String(args.query), getEnv());
			return url ? `**🎬 Video Found**\nQuery: ${args.query}\nURL: ${url}` : `📭 No video found.`;
		}),
	};
}
