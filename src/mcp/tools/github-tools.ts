/**
 * github-tools.ts — GitHub Studio MCP tools
 * v5.0
 */

import type { ToolDefinition } from '../registry';
import { getEnv } from '../../core/env';
import { GitHubStudio } from '../../services/github/studio';
import { makeTool, orFail } from './_helpers';

function getStudio(args: Record<string, unknown>): GitHubStudio {
	const env = getEnv(); const token = orFail(env.GITHUB_TOKEN, 'GITHUB_TOKEN not set');
	return new GitHubStudio(token, String(args.owner || 'Netuv'), String(args.repo || ''));
}

export function createGithubTools(): Record<string, ToolDefinition> {
	return {
		'github-file': makeTool('Read/create/update file in repo', { action: { type: 'string', description: 'get/create/update/delete' }, path: { type: 'string' }, content: { type: 'string' }, repo: { type: 'string' }, branch: { type: 'string' } }, ['action', 'path'], async (args) => {
			const studio = getStudio(args); const action = String(args.action); const path = String(args.path);
			if (action === 'get') { const f = await studio.getFile(path, args.branch ? String(args.branch) : undefined); return f ? `📄 ${f.path}\n${f.content.slice(0, 3000)}` : '📁 Not found.'; }
			if (action === 'create') { const r = await studio.createFile(path, String(args.content || '')); return r ? `✅ Created: ${r.html_url}` : '❌ Failed.'; }
			if (action === 'update') { const r = await studio.updateFile(path, String(args.content || '')); return r ? `✅ Updated: ${r.html_url}` : '❌ Failed.'; }
			if (action === 'delete') { const ok = await studio.deleteFile(path); return ok ? '✅ Deleted.' : '❌ Failed.'; }
			return '❌ Unknown action. Use: get/create/update/delete';
		}),
		'github-pr': makeTool('Manage PRs', { action: { type: 'string', description: 'list/create/merge' }, title: { type: 'string' }, body: { type: 'string' }, head: { type: 'string' }, number: { type: 'number' }, repo: { type: 'string' } }, ['action'], async (args) => {
			const studio = getStudio(args); const action = String(args.action);
			if (action === 'list') { const prs = await studio.listPRs(); return prs.length ? prs.map(p => `#${p.number} ${p.title} [${p.state}]`).join('\n') : '📭 No PRs.'; }
			if (action === 'create') { const pr = await studio.createPR(String(args.title), String(args.body || ''), String(args.head)); return pr ? `✅ PR #${pr.number}: ${pr.html_url}` : '❌ Failed.'; }
			if (action === 'merge') { const ok = await studio.mergePR(Number(args.number)); return ok ? '✅ Merged.' : '❌ Failed.'; }
			return '❌ Unknown action.';
		}),
		'github-issue': makeTool('Manage issues', { action: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, number: { type: 'number' }, repo: { type: 'string' } }, ['action'], async (args) => {
			const studio = getStudio(args); const action = String(args.action);
			if (action === 'list') { const issues = await studio.listIssues(); return issues.length ? issues.map(i => `#${i.number} ${i.title} [${i.state}]`).join('\n') : '📭 No issues.'; }
			if (action === 'create') { const issue = await studio.createIssue(String(args.title), String(args.body || '')); return issue ? `✅ Issue #${issue.number}: ${issue.html_url}` : '❌ Failed.'; }
			return '❌ Unknown action.';
		}),
	};
}
