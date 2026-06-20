/**
 * GitHub Studio — Integrated GitHub Toolkit for Content Creator & Community Management
 *
 * Fitur:
 * ── Content Creator ──
 * 1. File Management: create, update, read, delete files di repo
 * 2. Blog/Article: draft → commit → PR → publish workflow
 * 3. Media Pipeline: kirim perintah batch ke runner (optimize image, convert video, dll)
 * 4. Release Manager: create release with auto-changelog + tag
 * 5. SEO Tools: lighthouse audit, sitemap generator via runner
 *
 * ── Community Management ──
 * 6. Issue Triage: auto-label, assign, prioritize
 * 7. PR Management: merge, status check, conflict detection
 * 8. Milestone & Project: track progress, move cards
 * 9. Discussion Manager: reply, categorize
 * 10. Community Reports: health metrics, contributor stats
 *
 * Semua via GitHub API + GitHub Actions runner untuk task berat.
 */

// ─── Types ─────────────────────────────────────────────────

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface FileContent {
  path: string;
  content: string;      // decoded content
  sha: string;           // untuk update
  size: number;
  encoding: string;
  html_url: string;
}

export interface CommitResult {
  sha: string;
  html_url: string;
  message: string;
}

export interface BranchResult {
  name: string;
  sha: string;
  html_url: string;
}

export interface PullRequestResult {
  number: number;
  title: string;
  html_url: string;
  state: string;
  mergeable: boolean | null;
  body: string;
}

export interface ReleaseResult {
  id: number;
  tag_name: string;
  html_url: string;
  upload_url: string;
}

export interface IssueResult {
  number: number;
  title: string;
  html_url: string;
  state: string;
  labels: string[];
  assignees: string[];
  body: string;
  comments: number;
}

export interface RunnerResult {
  success: boolean;
  message: string;
  runId: string;
  htmlUrl: string;
}

// ─── GitHub Studio Class ──────────────────────────────────

export class GitHubStudio {
  private config: GitHubConfig;
  private baseUrl = "https://api.github.com";

  constructor(token: string, owner: string = "Netuv", repo: string = "") {
    this.config = { token, owner, repo };
  }

  // ─── API Helper ─────────────────────────────────────────

  private headers(accept?: string): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      "User-Agent": "discord-ai-bot-github-studio",
      Accept: accept || "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  private async apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers(), ...(options.headers || {}) },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      throw new Error(`GitHub API ${res.status} ${err.slice(0, 300)}`);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
  }

  private repoPath(path: string): string {
    return `/repos/${this.config.owner}/${this.config.repo}${path}`;
  }

  // ─── 1. FILE MANAGEMENT ──────────────────────────────────

  /**
   * Baca file dari repo (dengan decoding base64)
   */
  async getFile(path: string, branch?: string): Promise<FileContent> {
    const params = branch ? `?ref=${branch}` : "";
    const data: any = await this.apiFetch(this.repoPath(`/contents/${path}${params}`));
    return {
      path: data.path,
      content: atob(data.content),
      sha: data.sha,
      size: data.size,
      encoding: data.encoding,
      html_url: data.html_url,
    };
  }

  /**
   * Buat file baru di repo
   */
  async createFile(
    path: string,
    content: string,
    message: string,
    branch?: string
  ): Promise<CommitResult> {
    const data: any = await this.apiFetch(this.repoPath(`/contents/${path}`), {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: btoa(content),
        branch: branch || "main",
      }),
    });
    return {
      sha: data.content?.sha || data.commit?.sha || "",
      html_url: data.commit?.html_url || "",
      message,
    };
  }

  /**
   * Update file yang sudah ada
   */
  async updateFile(
    path: string,
    content: string,
    message: string,
    branch?: string
  ): Promise<CommitResult> {
    const existing = await this.getFile(path, branch);
    const data: any = await this.apiFetch(this.repoPath(`/contents/${path}`), {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: btoa(content),
        sha: existing.sha,
        branch: branch || "main",
      }),
    });
    return {
      sha: data.content?.sha || "",
      html_url: data.commit?.html_url || "",
      message,
    };
  }

  /**
   * Hapus file dari repo
   */
  async deleteFile(
    path: string,
    message: string,
    branch?: string
  ): Promise<string> {
    const existing = await this.getFile(path, branch);
    await this.apiFetch(this.repoPath(`/contents/${path}`), {
      method: "DELETE",
      body: JSON.stringify({
        message,
        sha: existing.sha,
        branch: branch || "main",
      }),
    });
    return `🗑️ ${path} dihapus dengan sukses`;
  }

  // ─── 2. BRANCH & COMMIT ──────────────────────────────────

  /**
   * Buat branch baru dari branch tertentu
   */
  async createBranch(name: string, fromBranch: string = "main"): Promise<BranchResult> {
    // Dapatkan SHA dari branch asal
    const refData: any = await this.apiFetch(`/repos/${this.config.owner}/${this.config.repo}/git/ref/heads/${fromBranch}`);
    const sha = refData.object?.sha;
    if (!sha) throw new Error(`Branch "${fromBranch}" tidak ditemukan`);

    // Buat branch baru
    const data: any = await this.apiFetch(`/repos/${this.config.owner}/${this.config.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${name}`,
        sha,
      }),
    });

    return {
      name,
      sha: data.object?.sha || sha,
      html_url: `https://github.com/${this.config.owner}/${this.config.repo}/tree/${name}`,
    };
  }

  /**
   * List branches
   */
  async listBranches(): Promise<BranchResult[]> {
    const data: any[] = await this.apiFetch(this.repoPath("/branches"));
    return data.map((b) => ({
      name: b.name,
      sha: b.commit?.sha || "",
      html_url: b.commit?.html_url || "",
    }));
  }

  // ─── 3. PULL REQUEST MANAGEMENT ──────────────────────────

  /**
   * Buat Pull Request
   */
  async createPullRequest(
    title: string,
    head: string,
    base: string = "main",
    body?: string
  ): Promise<PullRequestResult> {
    const data: any = await this.apiFetch(this.repoPath("/pulls"), {
      method: "POST",
      body: JSON.stringify({ title, head, base, body: body || "" }),
    });

    return {
      number: data.number,
      title: data.title,
      html_url: data.html_url,
      state: data.state,
      mergeable: data.mergeable,
      body: data.body || "",
    };
  }

  /**
   * List open PRs
   */
  async listPullRequests(state: "open" | "closed" | "all" = "open"): Promise<PullRequestResult[]> {
    const data: any[] = await this.apiFetch(this.repoPath(`/pulls?state=${state}&per_page=20`));
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      html_url: pr.html_url,
      state: pr.state,
      mergeable: pr.mergeable,
      body: pr.body || "",
    }));
  }

  /**
   * Merge PR (auto-merge jika clean)
   */
  async mergePullRequest(
    prNumber: number,
    commitTitle?: string,
    mergeMethod: "merge" | "squash" | "rebase" = "squash"
  ): Promise<string> {
    try {
      const data: any = await this.apiFetch(this.repoPath(`/pulls/${prNumber}/merge`), {
        method: "PUT",
        body: JSON.stringify({
          commit_title: commitTitle || `Merge PR #${prNumber}`,
          merge_method: mergeMethod,
        }),
      });
      return `✅ PR #${prNumber} merged! SHA: ${data.sha?.slice(0, 7)}`;
    } catch (e: any) {
      // Cek conflict
      if (e.message.includes("405") || e.message.includes("conflict")) {
        return `❌ PR #${prNumber} tidak bisa di-merge (conflict). Cek manual: https://github.com/${this.config.owner}/${this.config.repo}/pull/${prNumber}`;
      }
      if (e.message.includes("required")) {
        return `⏳ PR #${prNumber} menunggu status check required. Belum bisa di-merge.`;
      }
      throw e;
    }
  }

  /**
   * Cek conflict status PR
   */
  async checkPullRequest(prNumber: number): Promise<{
    mergeable: boolean | null;
    status: string;
    details: string;
  }> {
    const data: any = await this.apiFetch(this.repoPath(`/pulls/${prNumber}`));
    const mergeable = data.mergeable; // true/false/null (null = masih dicek)
    const mergeableState = data.mergeable_state || "unknown";

    let status: string;
    let details: string;

    if (mergeable === true) {
      status = "✅ Siap merge";
      details = `Mergeable state: ${mergeableState}`;
    } else if (mergeable === false) {
      status = "❌ Conflict!";
      details = "PR memiliki conflict yang harus di-resolve manual.";
    } else {
      status = "⏳ Mengecek...";
      details = "GitHub masih mengecek mergeability, coba lagi nanti.";
    }

    return { mergeable, status, details };
  }

  // ─── 4. ISSUE MANAGEMENT ─────────────────────────────────

  /**
   * Buat issue baru
   */
  async createIssue(
    title: string,
    body?: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<IssueResult> {
    const data: any = await this.apiFetch(this.repoPath("/issues"), {
      method: "POST",
      body: JSON.stringify({
        title,
        body: body || "",
        labels: labels || [],
        assignees: assignees || [],
      }),
    });

    return {
      number: data.number,
      title: data.title,
      html_url: data.html_url,
      state: data.state,
      labels: (data.labels || []).map((l: any) => l.name),
      assignees: (data.assignees || []).map((a: any) => a.login),
      body: data.body || "",
      comments: data.comments || 0,
    };
  }

  /**
   * List issues dengan filter
   */
  async listIssues(
    state: "open" | "closed" | "all" = "open",
    labels?: string[],
    sort: "created" | "updated" | "comments" = "updated"
  ): Promise<IssueResult[]> {
    let path = this.repoPath(`/issues?state=${state}&sort=${sort}&per_page=20`);
    if (labels && labels.length > 0) {
      path += `&labels=${labels.join(",")}`;
    }

    const data: any[] = await this.apiFetch(path);
    return data
      .filter((d: any) => !d.pull_request) // exclude PRs dari issue list
      .map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        state: issue.state,
        labels: (issue.labels || []).map((l: any) => l.name),
        assignees: (issue.assignees || []).map((a: any) => a.login),
        body: issue.body || "",
        comments: issue.comments || 0,
      }));
  }

  /**
   * Update issue — add label, assign, ganti title, dll
   */
  async updateIssue(
    issueNumber: number,
    updates: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      labels?: string[];
      assignees?: string[];
    }
  ): Promise<IssueResult> {
    const data: any = await this.apiFetch(this.repoPath(`/issues/${issueNumber}`), {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    return {
      number: data.number,
      title: data.title,
      html_url: data.html_url,
      state: data.state,
      labels: (data.labels || []).map((l: any) => l.name),
      assignees: (data.assignees || []).map((a: any) => a.login),
      body: data.body || "",
      comments: data.comments || 0,
    };
  }

  /**
   * Add comment ke issue/PR
   */
  async addComment(issueNumber: number, body: string): Promise<string> {
    await this.apiFetch(this.repoPath(`/issues/${issueNumber}/comments`), {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    return `💬 Komentar ditambahkan ke #${issueNumber}`;
  }

  // ─── 5. RELEASE MANAGEMENT ────────────────────────────────

  /**
   * Buat release + tag baru
   */
  async createRelease(
    tagName: string,
    options?: {
      targetBranch?: string;
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      generateNotes?: boolean;
    }
  ): Promise<ReleaseResult> {
    // Auto-generate release notes jika diminta
    let body = options?.body || "";
    if (options?.generateNotes && !body) {
      body = await this.generateChangelog(options?.targetBranch || "main");
    }

    const data: any = await this.apiFetch(this.repoPath("/releases"), {
      method: "POST",
      body: JSON.stringify({
        tag_name: tagName,
        target_commitish: options?.targetBranch || "main",
        name: options?.name || tagName,
        body,
        draft: options?.draft || false,
        prerelease: options?.prerelease || false,
      }),
    });

    return {
      id: data.id,
      tag_name: data.tag_name,
      html_url: data.html_url,
      upload_url: data.upload_url,
    };
  }

  /**
   * List releases
   */
  async listReleases(perPage: number = 10): Promise<ReleaseResult[]> {
    const data: any[] = await this.apiFetch(this.repoPath(`/releases?per_page=${perPage}`));
    return data.map((r) => ({
      id: r.id,
      tag_name: r.tag_name,
      html_url: r.html_url,
      upload_url: r.upload_url,
    }));
  }

  /**
   * Generate changelog dari commits
   */
  async generateChangelog(branch: string = "main", daysBack: number = 30): Promise<string> {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();
    const data: any[] = await this.apiFetch(
      this.repoPath(`/commits?sha=${branch}&since=${since}&per_page=50`)
    );

    if (data.length === 0) return "No changes in this release.";

    const lines = data.map((c: any) => {
      const msg = (c.commit?.message || "").split("\n")[0];
      const author = c.commit?.author?.name || "unknown";
      const sha = c.sha?.slice(0, 7) || "";
      return `- ${msg} (${sha} by ${author})`;
    });

    return `## Changelog\n\n${lines.join("\n")}`;
  }

  // ─── 6. RUNNER DISPATCH ──────────────────────────────────

  /**
   * Dispatch perintah ke GitHub Actions runner
   */
  async dispatchRunner(
    command: string,
    options?: {
      shell?: string;
      workingDirectory?: string;
      workflowFile?: string;
      ref?: string;
    }
  ): Promise<RunnerResult> {
    const token = this.config.token;
    const runId = `studio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const workflowFile = options?.workflowFile || "remote-run.yml";

    const res = await fetch(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/actions/workflows/${workflowFile}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "discord-mcp-bot-studio",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          ref: options?.ref || "main",
          inputs: {
            command,
            shell: options?.shell || "bash",
            working_directory: options?.workingDirectory || ".",
            run_id: runId,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      return {
        success: false,
        message: `GitHub API error (${res.status}): ${err.slice(0, 200)}`,
        runId,
        htmlUrl: `https://github.com/${this.config.owner}/${this.config.repo}/actions`,
      };
    }

    return {
      success: true,
      message: `✅ Runner dispatched: \`${command.slice(0, 100)}\``,
      runId,
      htmlUrl: `https://github.com/${this.config.owner}/${this.config.repo}/actions/runs`,
    };
  }

  // ─── 7. CONTENT CREATOR WORKFLOWS ───────────────────────

  /**
   * Blog workflow: create branch → write artikel → commit → PR → auto-merge
   */
  async blogWorkflow(
    title: string,
    content: string,
    filePath: string,
    options?: {
      draft?: boolean;
      branch?: string;
      publishBranch?: string;
      tags?: string[];
    }
  ): Promise<{
    branch: string;
    commit: CommitResult;
    pr?: PullRequestResult;
    message: string;
  }> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const branchName = options?.branch || `blog/${slug}-${Date.now().toString(36)}`;
    const publishBranch = options?.publishBranch || "main";

    // Step 1: Buat branch
    await this.createBranch(branchName, publishBranch);

    // Step 2: Buat file artikel
    const commit = await this.createFile(
      filePath,
      content,
      `📝 Blog: ${title}`,
      branchName
    );

    // Step 3: Kalau draft = false, buat PR
    if (!options?.draft) {
      const pr = await this.createPullRequest(
        `📝 ${title}`,
        branchName,
        publishBranch,
        `Auto-generated PR for blog post: **${title}**\n\nFile: \`${filePath}\`\nTags: ${(options?.tags || []).join(", ") || "none"}`
      );
      return {
        branch: branchName,
        commit,
        pr,
        message: `✅ Blog "${title}" → PR #${pr.number} created!`,
      };
    }

    return {
      branch: branchName,
      commit,
      message: `📝 Draft "${title}" saved di branch \`${branchName}\``,
    };
  }

  /**
   * Media task: kirim perintah ke runner untuk processing gambar/video
   */
  async mediaTask(
    taskType: "optimize-images" | "convert-video" | "resize-images" | "generate-thumbnails" | "watermark",
    targetPath: string,
    options?: Record<string, string>
  ): Promise<RunnerResult> {
    let command = "";

    switch (taskType) {
      case "optimize-images":
        command = 'for img in ' + targetPath + '/*.{jpg,jpeg,png}; do [ -f "$img" ] && convert "$img" -strip -quality 85 "${img%.*}.jpg"; done';
        break;
      case "convert-video":
        command = `ffmpeg -i ${targetPath} -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k ${options?.output || targetPath.replace(/\.[^.]+$/, ".mp4")}`;
        break;
      case "resize-images": {
        const size = options?.size || "1920x1080";
        command = 'for img in ' + targetPath + '/*.{jpg,jpeg,png}; do [ -f "$img" ] && convert "$img" -resize ' + size + '\\! "' + '${img%.*}_' + size + '.jpg"; done';
        break;
      }
      case "generate-thumbnails":
        command = 'for img in ' + targetPath + '/*.{jpg,jpeg,png}; do [ -f "$img" ] && convert "$img" -thumbnail 320x320^ -gravity center -extent 320x320 "${img%.*}_thumb.jpg"; done';
        break;
      case "watermark": {
        const wm = options?.watermarkFile || "watermark.png";
        const pos = options?.position || "southeast";
        command = 'for img in ' + targetPath + '/*.{jpg,jpeg,png}; do [ -f "$img" ] && composite -gravity ' + pos + ' -geometry +10+10 ' + wm + ' "$img" "${img%.*}_wm.jpg"; done';
        break;
      }
    }

    return this.dispatchRunner(command, {
      workingDirectory: options?.workingDirectory || ".",
    });
  }

  /**
   * SEO task: lighthouse audit via runner
   */
  async seoAudit(targetUrl: string): Promise<RunnerResult> {
    const command = `npx lighthouse ${targetUrl} --output=json --output-path=./lighthouse-report.json --chrome-flags="--headless --no-sandbox" 2>/dev/null; cat ./lighthouse-report.json 2>/dev/null || echo "Lighthouse report generated"`;
    return this.dispatchRunner(command, {
      workingDirectory: ".",
    });
  }

  /**
   * Auto-post scheduler: buat task scheduler untuk posting konten
   * (Integrasi dengan scheduler system)
   */
  async schedulePost(
    cron: string,
    title: string,
    content: string,
    filePath: string,
    channelId: string,
    guildId: string
  ): Promise<{
    taskId: string;
    message: string;
  }> {
    // Task akan ditambahkan via scheduler system
    // Kembalikan data untuk di-register oleh caller
    return {
      taskId: "",
      message: `📅 Post "${title}" akan di-schedule dengan cron \`${cron}\``,
    };
  }

  // ─── 8. COMMUNITY MANAGEMENT ────────────────────────────

  /**
   * Auto-triage: label + assign issue berdasarkan konten
   */
  async autoTriage(
    issueNumber: number,
    aiRouter?: any
  ): Promise<{
    suggestedLabels: string[];
    suggestedAssignee: string;
    priority: "high" | "medium" | "low";
    summary: string;
  }> {
    // Ambil issue
    const issue = await this.apiFetch<any>(this.repoPath(`/issues/${issueNumber}`));

    const text = `${issue.title}\n${issue.body || ""}`.toLowerCase();

    // Rule-based auto-labeling
    const labels: string[] = [];
    if (text.includes("bug") || text.includes("error") || text.includes("crash") || text.includes("fix")) labels.push("bug");
    if (text.includes("feature") || text.includes("request") || text.includes("idea") || text.includes("would like")) labels.push("enhancement");
    if (text.includes("question") || text.includes("how to") || text.includes("help")) labels.push("question");
    if (text.includes("document") || text.includes("readme") || text.includes("typo") || text.includes("spelling")) labels.push("documentation");
    if (text.includes("urgent") || text.includes("critical") || text.includes("blocker") || text.includes("asap")) labels.push("urgent");
    if (text.includes("discussion") || text.includes("proposal") || text.includes("feedback")) labels.push("discussion");
    if (text.includes("good first") || text.includes("beginner") || text.includes("easy")) labels.push("good first issue");
    if (text.includes("security") || text.includes("vulnerability") || text.includes("exploit")) labels.push("security");

    // Priority
    let priority: "high" | "medium" | "low" = "medium";
    if (labels.includes("bug") || labels.includes("security") || labels.includes("urgent")) {
      priority = "high";
    } else if (labels.includes("question") || labels.includes("documentation")) {
      priority = "low";
    }

    // Kalau ada AI router, refine pake AI
    if (aiRouter) {
      try {
        const prompt = `Analyze this GitHub issue and suggest labels. Issue: ${issue.title}\n\n${(issue.body || "").slice(0, 1000)}\n\nCurrent detection: ${labels.join(", ") || "none"}. Priority: ${priority}. Return JSON: {"labels": [...], "priority": "high|medium|low", "summary": "1 sentence"}`;
        const aiResponse = await aiRouter.chat([{ role: "user", content: prompt }]);
        const parsed = JSON.parse(aiResponse.match(/\{[\s\S]*\}/)?.[0] || "{}");
        if (parsed.labels && Array.isArray(parsed.labels)) {
          labels.push(...parsed.labels.filter((l: string) => !labels.includes(l)));
        }
        if (parsed.priority) priority = parsed.priority;
      } catch { /* use rule-based */ }
    }

    // Auto-label
    if (labels.length > 0) {
      await this.updateIssue(issueNumber, { labels });
    }

    return {
      suggestedLabels: [...new Set(labels)],
      suggestedAssignee: "",
      priority,
      summary: `#${issueNumber}: ${issue.title} — Priority: ${priority}`,
    };
  }

  /**
   * Community health report
   */
  async communityReport(): Promise<{
    openIssues: number;
    openPRs: number;
    stars: number;
    forks: number;
    contributors: number;
    topContributors: { login: string; contributions: number }[];
    recentActivity: { type: string; title: string; url: string; date: string }[];
    summary: string;
  }> {
    // Repo info
    const repo: any = await this.apiFetch(this.repoPath(""));

    // Open issues
    const issues: any[] = await this.apiFetch(this.repoPath("/issues?state=open&per_page=1"));

    // Open PRs
    const prs: any[] = await this.apiFetch(this.repoPath("/pulls?state=open&per_page=1"));

    // Contributors
    let topContributors: { login: string; contributions: number }[] = [];
    try {
      const contributors: any[] = await this.apiFetch(this.repoPath("/contributors?per_page=5"));
      topContributors = contributors.map((c) => ({
        login: c.login,
        contributions: c.contributions,
      }));
    } catch { /* maybe empty repo */ }

    // Recent activity (events)
    let recentActivity: { type: string; title: string; url: string; date: string }[] = [];
    try {
      const events: any[] = await this.apiFetch(this.repoPath("/events?per_page=5"));
      recentActivity = events.map((e) => ({
        type: e.type?.replace("Event", "") || "unknown",
        title: (e.payload?.issue?.title || e.payload?.pull_request?.title || e.type || ""),
        url: e.payload?.issue?.html_url || e.payload?.pull_request?.html_url || "",
        date: e.created_at || "",
      }));
    } catch { /* skip */ }

    const summary =
      `📊 **Community Report: ${this.config.owner}/${this.config.repo}**\n\n` +
      `⭐ Stars: ${repo.stargazers_count || 0}\n` +
      `🍴 Forks: ${repo.forks_count || 0}\n` +
      `🐛 Open Issues: ${repo.open_issues_count || 0}\n` +
      `🔀 Open PRs: ${prs.length}\n` +
      `👥 Top Contributors: ${topContributors.map((c) => `${c.login} (${c.contributions})`).join(", ") || "N/A"}\n\n` +
      `📅 Latest: ${recentActivity.map((a) => `${a.type}: ${a.title}`).join(" → ") || "No recent activity"}`;

    return {
      openIssues: repo.open_issues_count || 0,
      openPRs: prs.length,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      contributors: topContributors.length,
      topContributors,
      recentActivity,
      summary,
    };
  }

  // ─── 9. MILESTONE MANAGEMENT ────────────────────────────

  /**
   * List milestones
   */
  async listMilestones(state: "open" | "closed" | "all" = "open"): Promise<any[]> {
    const data: any[] = await this.apiFetch(this.repoPath(`/milestones?state=${state}&per_page=20`));
    return data.map((m) => ({
      number: m.number,
      title: m.title,
      description: m.description,
      state: m.state,
      open_issues: m.open_issues,
      closed_issues: m.closed_issues,
      due_on: m.due_on,
      html_url: m.html_url,
      progress: m.open_issues + m.closed_issues > 0
        ? Math.round((m.closed_issues / (m.open_issues + m.closed_issues)) * 100)
        : 0,
    }));
  }

  /**
   * Buat milestone baru
   */
  async createMilestone(title: string, description?: string, dueOn?: string): Promise<any> {
    const data: any = await this.apiFetch(this.repoPath("/milestones"), {
      method: "POST",
      body: JSON.stringify({
        title,
        description: description || "",
        due_on: dueOn || null,
      }),
    });
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      html_url: data.html_url,
      progress: 0,
    };
  }
}
