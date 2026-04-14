import { BadGatewayException, Injectable } from '@nestjs/common';

export interface CreateIssueParams {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  token: string;
}

export interface CreateIssueResult {
  url: string;
  number: number;
  htmlUrl: string;
}

@Injectable()
export class GithubService {
  async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
    const { owner, repo, title, body, token } = params;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body: body || '' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new BadGatewayException(err.message || `GitHub API error: ${res.status}`);
    }
    const data = await res.json();
    return {
      url: data.url,
      number: data.number,
      htmlUrl: data.html_url,
    };
  }

  parseRepoFullName(fullName: string): { owner: string; repo: string } | null {
    const parts = fullName.trim().split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    }
    return null;
  }
}
