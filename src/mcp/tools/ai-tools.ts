/**
 * ai-tools.ts — General AI productivity MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { AiRouter } from '../../ai/router';
import { makeTool } from './_helpers';

export function createAiTools(): Record<string, ToolDefinition> {
	const R = () => new AiRouter(getEnv());
	return {
		status: makeTool('Check bot AI status and active providers', {}, [], async () => {
			const router = R();
			const active = router.getActiveProviders('chat');
			const vision = router.getActiveProviders('vision');
			return [
				'**🤖 AI Router Status**', '',
				`📡 **Chat Providers:** ${active.length} active`,
				...active.map(p => `  • ${p.name} (${p.type}) — \`${p.model}\``), '',
				`👁️ **Vision Providers:** ${vision.length} active`,
				...vision.map(p => `  • ${p.name} (${p.type}) — \`${p.model}\``),
			].join('\n');
		}),
		'ai-chat': makeTool('Chat with AI assistant', { prompt: { type: 'string', description: 'Your message for the AI' } }, ['prompt'], async (args) => await R().chat([{ role: 'user', content: String(args.prompt || '') }])),
		translate: makeTool('Translate text to a target language', { text: { type: 'string', description: 'Text to translate' }, language: { type: 'string', description: 'Target language' } }, ['text', 'language'], async (args) => await R().chat([{ role: 'system', content: `Translate to ${String(args.language)}. ONLY the translation.` }, { role: 'user', content: String(args.text) }])),
		summarize: makeTool('Summarize a long text into key points', { text: { type: 'string', description: 'Text to summarize' }, maxPoints: { type: 'number', description: 'Max bullet points (default 5)' } }, ['text'], async (args) => await R().chat([{ role: 'system', content: `Summarize in ${Number(args.maxPoints) || 5} bullet points.` }, { role: 'user', content: String(args.text) }])),
		brainstorm: makeTool('Brainstorm ideas on a topic', { topic: { type: 'string', description: 'Topic' }, count: { type: 'number', description: 'Number of ideas (default 5)' } }, ['topic'], async (args) => await R().chat([{ role: 'system', content: `Brainstorm ${Number(args.count) || 5} creative ideas about: ${args.topic}` }, { role: 'user', content: 'Generate ideas.' }])),
	};
}
