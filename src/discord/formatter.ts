/**
 * formatter.ts — Discord message formatting helpers
 * v5.0 — Pure functions, no side effects
 */

export function bold(text: string): string { return `**${text}**`; }
export function italic(text: string): string { return `*${text}*`; }
export function inlineCode(text: string): string { return `\`${text}\``; }
export function codeBlock(lang: string, code: string): string { return `\`\`\`${lang}\n${code}\n\`\`\``; }
export function bulletList(items: string[]): string { return items.map(i => `• ${i}`).join('\n'); }
export function numberedList(items: string[]): string { return items.map((i, idx) => `${idx + 1}. ${i}`).join('\n'); }
export function divider(): string { return '───'; }
export function header(lvl: 1 | 2 | 3, text: string): string { return `${'#'.repeat(lvl)} ${text}`; }

export function sanitizeForDiscord(text: string): string {
	if (!text) return '';
	return text.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function truncate(text: string, max: number): string {
	return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

export const SPACER = 'ㅤ';
