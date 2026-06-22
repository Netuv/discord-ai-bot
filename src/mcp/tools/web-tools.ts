/**
 * web-tools.ts — Web intelligence MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { WebScout } from '../../workers/webscout';
import { makeTool } from './_helpers';

export function createWebTools(): Record<string, ToolDefinition> {
	return {
		'web-search': makeTool('Search the web for information', { query: { type: 'string' }, max_results: { type: 'number' } }, ['query'], async (args) => {
			const env = getEnv(); const scout = new WebScout(env);
			const results = await scout.search(String(args.query), { maxResults: Number(args.max_results) || 5 });
			if (results.length === 0) return '📭 No results.';
			return `**🔍 Results: "${args.query}"**\n${results.map((r, i) => `**${i + 1}. ${r.title}**\n   ${r.url}\n   ${r.snippet.slice(0, 200)}`).join('\n')}`;
		}),
		'web-scrape': makeTool('Scrape a URL for content', { url: { type: 'string' } }, ['url'], async (args) => {
			const scout = new WebScout(getEnv());
			const page = await scout.scrapePage(String(args.url));
			if (!page) return '❌ Failed to scrape.';
			return `**📄 ${page.title}**\n${page.snippet.slice(0, 1500)}`;
		}),
	};
}
