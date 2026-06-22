/**
 * github-studio.ts — GitHub API Toolkit
 * v5.0 — File, PR, Issue, Release, Community management
 */

import type { Env } from '../types/env';
import { logger } from '../core/logger';

const GITHUB_API = 'https://api.github.com';

export interface GitHubConfig { token: string; owner: string; repo: string; }
export interface FileContent { path: string; content: string; sha: string; size: number; encoding: string; html_url: string; }
export interface CommitResult { sha: string; html_url: string; message: string; }
export interface PullRequestResult { number: number; title: string; html_url: string; state: string; mergeable: boolean | null; body: string; }
export interface ReleaseResult { id: number; tag_name: string; html_url: string; upload_url: string; }
export interface IssueResult { number: number; title: string; html_url: string; state: string; labels: string[]; assignees: string[]; body: string; }
export interface RunnerResult { success: boolean; message: string; runId?: number; htmlUrl?: string; }

export class GitHubStudio {
	private config: GitHubConfig;
	constructor(token: string, owner?: string, repo?: string) {
		this.config = { token, owner: owner || 'Netuv', repo: repo || 'discord-ai-bot' };
	}
	private get headers(): Record<string, string> { return { Authorization: `Bearer ${this.config.token}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'discord-ai-bot' }; }
	private url(path: string): string { return `${GITHUB_API}/repos/${this.config.owner}/${this.config.repo}${path}`; }

	async getFile(path: string, branch?: string): Promise<FileContent | null> {
		try {
			const res = await fetch(this.url(`/contents/${path}${branch ? `?ref=${branch}` : ''}`), { headers: this.headers });
			if (!res.ok) return null;
			const d: any = await res.json();
			if (d.type === 'file') return { path: d.path, content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha, size: d.size, encoding: d.encoding, html_url: d.html_url };
			return null;
		} catch { return null; }
	}

	async createFile(path: string, content: string, message?: string): Promise<CommitResult | null> { return this.putFile(path, content, message || `chore: create ${path}`); }
	async updateFile(path: string, content: string, message?: string): Promise<CommitResult | null> { const f = await this.getFile(path); if (!f) return null; return this.putFile(path, content, message || `chore: update ${path}`, f.sha); }
	async deleteFile(path: string, message?: string): Promise<boolean> {
		try {
			const f = await this.getFile(path); if (!f) return false;
			const res = await fetch(this.url(`/contents/${path}`), { method: 'DELETE', headers: this.headers, body: JSON.stringify({ message: message || `chore: delete ${path}`, sha: f.sha }) });
			return res.ok;
		} catch { return false; }
	}

	private async putFile(path: string, content: string, message: string, sha?: string): Promise<CommitResult | null> {
		try {
			const body: any = { message, content: Buffer.from(content).toString('base64') };
			if (sha) body.sha = sha;
			const res = await fetch(this.url(`/contents/${path}`), { method: 'PUT', headers: this.headers, body: JSON.stringify(body) });
			if (!res.ok) return null;
			const d: any = await res.json();
			return { sha: d.content?.sha || '', html_url: d.content?.html_url || '', message };
		} catch { return null; }
	}

	async createPR(title: string, body: string, head: string, base: string = 'master'): Promise<PullRequestResult | null> {
		try {
			const res = await fetch(this.url('/pulls'), { method: 'POST', headers: this.headers, body: JSON.stringify({ title, body, head, base }) });
			if (!res.ok) return null;
			const d: any = await res.json();
			return { number: d.number, title: d.title, html_url: d.html_url, state: d.state, mergeable: d.mergeable, body: d.body };
		} catch { return null; }
	}

	async listPRs(state: string = 'open'): Promise<PullRequestResult[]> {
		try {
			const res = await fetch(this.url(`/pulls?state=${state}`), { headers: this.headers });
			if (!res.ok) return [];
			const d: any[] = await res.json();
			return d.map((pr: any) => ({ number: pr.number, title: pr.title, html_url: pr.html_url, state: pr.state, mergeable: pr.mergeable, body: pr.body || '' }));
		} catch { return []; }
	}

	async mergePR(number: number, method: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> {
		try {
			const res = await fetch(this.url(`/pulls/${number}/merge`), { method: 'PUT', headers: this.headers, body: JSON.stringify({ merge_method: method }) });
			return res.ok;
		} catch { return false; }
	}

	async createIssue(title: string, body?: string, labels?: string[]): Promise<IssueResult | null> {
		try {
			const res = await fetch(this.url('/issues'), { method: 'POST', headers: this.headers, body: JSON.stringify({ title, body: body || '', labels: labels || [] }) });
			if (!res.ok) return null;
			const d: any = await res.json();
			return { number: d.number, title: d.title, html_url: d.html_url, state: d.state, labels: d.labels?.map((l: any) => l.name) || [], assignees: d.assignees?.map((a: any) => a.login) || [], body: d.body || '' };
		} catch { return null; }
	}

	async listIssues(state: string = 'open'): Promise<IssueResult[]> {
		try {
			const res = await fetch(this.url(`/issues?state=${state}&per_page=20`), { headers: this.headers });
			if (!res.ok) return [];
			const d: any[] = await res.json();
			return d.map((i: any) => ({ number: i.number, title: i.title, html_url: i.html_url, state: i.state, labels: i.labels?.map((l: any) => l.name) || [], assignees: i.assignees?.map((a: any) => a.login) || [], body: i.body || '' }));
		} catch { return []; }
	}

	async createRelease(tag: string, name?: string, body?: string): Promise<ReleaseResult | null> {
		try {
			const res = await fetch(this.url('/releases'), { method: 'POST', headers: this.headers, body: JSON.stringify({ tag_name: tag, name: name || tag, body: body || `Release ${tag}`, draft: false, prerelease: false }) });
			if (!res.ok) return null;
			const d: any = await res.json();
			return { id: d.id, tag_name: d.tag_name, html_url: d.html_url, upload_url: d.upload_url };
		} catch { return null; }
	}

	async listReleases(perPage: number = 10): Promise<ReleaseResult[]> {
		try {
			const res = await fetch(this.url(`/releases?per_page=${perPage}`), { headers: this.headers });
			if (!res.ok) return [];
			const d: any[] = await res.json();
			return d.map((r: any) => ({ id: r.id, tag_name: r.tag_name, html_url: r.html_url, upload_url: r.upload_url }));
		} catch { return []; }
	}

	async getCommunityProfile(): Promise<Record<string, unknown>> {
		try {
			const res = await fetch(this.url('/community/profile'), { headers: this.headers });
			if (!res.ok) return { health_percentage: 0, files: [] };
			return await res.json();
		} catch { return { health_percentage: 0, files: [] }; }
	}

	async runWorkflow(workflowId: string, ref: string = 'master', inputs?: Record<string, string>): Promise<RunnerResult> {
		try {
			const res = await fetch(this.url(`/actions/workflows/${workflowId}/dispatches`), { method: 'POST', headers: { ...this.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, inputs: inputs || {} }) });
			if (!res.ok) return { success: false, message: `GitHub ${res.status}: ${await res.text().catch(() => '')}` };
			return { success: true, message: `✅ Workflow ${workflowId} triggered on ${ref}` };
		} catch (e: any) { return { success: false, message: e.message }; }
	}
}
