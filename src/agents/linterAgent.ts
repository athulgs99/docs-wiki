import path from 'path';
import { AgentResult, Services, WikiPage } from '../types';
import { BaseAgent } from './baseAgent';

export interface LinterAgentConfig {
  autoFix?: boolean;
  checkLevel?: 'quick' | 'thorough';
}

export interface Issue {
  type: 'broken_link' | 'contradiction' | 'unsourced_claim' | 'orphaned_page' | 'duplicate';
  severity: 'error' | 'warning' | 'info';
  pageId: string;
  lineNumber?: number;
  description: string;
  suggestedFix?: string;
}

export interface LintResult extends AgentResult {
  result?: {
    timestamp: string;
    totalPages: number;
    issues: Issue[];
    summary: { errors: number; warnings: number; info: number };
    suggestedArticles: Array<{ topic: string; reason: string; suggestedPages: string[] }>;
    autoFixedCount: number;
  };
}

export class LinterAgent extends BaseAgent {
  constructor(kbRoot: string, services: Services) {
    super(kbRoot, services);
  }

  async execute(config: LinterAgentConfig): Promise<LintResult> {
    const { autoFix = false, checkLevel = 'quick' } = config;

    try {
      const pages = await this.services.wiki.getAllPages();
      const issues: Issue[] = [];

      // 1. Broken links
      issues.push(...(await this.checkBrokenLinks(pages)));

      // 2. Unsourced claims
      issues.push(...(await this.findUnsourcedClaims(pages)));

      // 3. Orphaned pages
      issues.push(...(await this.findOrphanedPages(pages)));

      // 4. Thorough checks
      if (checkLevel === 'thorough') {
        issues.push(...(await this.findContradictions(pages)));
        issues.push(...(await this.findDuplicates(pages)));
      }

      // 5. Suggested articles
      const suggestedArticles = await this.suggestNewArticles(pages);

      // 6. Auto-fix
      let autoFixedCount = 0;
      if (autoFix) {
        autoFixedCount = await this.autoFixSimpleIssues(issues);
      }

      // 7. Save report
      const report = {
        timestamp: new Date().toISOString(),
        totalPages: pages.length,
        issues,
        suggestedArticles,
        autoFixedCount,
      };
      await this.services.file.writeJson(
        path.join(this.kbRoot, '.claude', 'lint_report.json'),
        report
      );

      const summary = {
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        info: issues.filter((i) => i.severity === 'info').length,
      };

      await this.services.state.updateLastActivity('linter');
      await this.log('lint_wiki', { totalPages: pages.length, issues: issues.length, ...summary });

      return {
        status: 'success',
        agent: 'linter',
        action: 'lint_wiki',
        result: { ...report, summary },
      };
    } catch (err) {
      const error = err as Error;
      await this.logError('lint_wiki', error);
      return { status: 'failed', agent: 'linter', action: 'lint_wiki', error: error.message };
    }
  }

  // ─── Checks ─────────────────────────────────────────────────────────────────

  private async checkBrokenLinks(pages: WikiPage[]): Promise<Issue[]> {
    const slugSet = new Set(pages.map((p) => p.slug));
    const issues: Issue[] = [];

    for (const page of pages) {
      const linkMatches = [...page.content.matchAll(/\[\[([^\]]+)\]\]/g)];
      for (const match of linkMatches) {
        const target = match[1];
        if (!slugSet.has(target)) {
          issues.push({
            type: 'broken_link',
            severity: 'error',
            pageId: page.slug,
            description: `Broken link [[${target}]] in page "${page.title}"`,
            suggestedFix: `Create page "${target}" or remove the link`,
          });
        }
      }
    }
    return issues;
  }

  private async findUnsourcedClaims(pages: WikiPage[]): Promise<Issue[]> {
    const issues: Issue[] = [];
    for (const page of pages) {
      const lines = page.content.split('\n');
      let lineNum = 0;
      for (const line of lines) {
        lineNum++;
        // Skip headings, empty lines, link-only lines
        if (!line.trim() || line.startsWith('#') || line.startsWith('-') || line.startsWith('!')) continue;
        // Check if line has a factual statement without a citation
        if (line.length > 30 && !line.includes('[Source:') && !line.includes('[[') && !line.startsWith('>')) {
          issues.push({
            type: 'unsourced_claim',
            severity: 'warning',
            pageId: page.slug,
            lineNumber: lineNum,
            description: `Unsourced claim on line ${lineNum} of "${page.title}": "${line.slice(0, 80)}..."`,
            suggestedFix: 'Add [Source: filename] citation',
          });
        }
      }
    }
    return issues;
  }

  private async findOrphanedPages(pages: WikiPage[]): Promise<Issue[]> {
    const issues: Issue[] = [];
    for (const page of pages) {
      if (page.inboundLinks.length === 0) {
        issues.push({
          type: 'orphaned_page',
          severity: 'info',
          pageId: page.slug,
          description: `Page "${page.title}" has no inbound links`,
          suggestedFix: 'Link to this page from related pages',
        });
      }
    }
    return issues;
  }

  private async findContradictions(pages: WikiPage[]): Promise<Issue[]> {
    if (pages.length < 2) return [];

    const schema = await this.getSchema();
    const pagesSummary = pages
      .map((p) => `[${p.slug}]: ${p.content.slice(0, 500)}`)
      .join('\n\n');

    const prompt = `${schema ? `CLAUDE.md Schema:\n${schema}\n\n---\n\n` : ''}Review these wiki pages and identify any factual contradictions between them.

Pages:
${pagesSummary.slice(0, 30000)}

Return ONLY valid JSON listing contradictions:
{
  "contradictions": [
    {
      "page1": "slug1",
      "page2": "slug2",
      "description": "Page1 says X but page2 says Y"
    }
  ]
}
If no contradictions, return: {"contradictions": []}`;

    const result = await this.services.llm.extractJson(prompt) as {
      contradictions: Array<{ page1: string; page2: string; description: string }>;
    };

    return (result.contradictions ?? []).map((c) => ({
      type: 'contradiction' as const,
      severity: 'warning' as const,
      pageId: c.page1,
      description: `Contradiction between "${c.page1}" and "${c.page2}": ${c.description}`,
      suggestedFix: 'Review and reconcile both pages',
    }));
  }

  private async findDuplicates(pages: WikiPage[]): Promise<Issue[]> {
    const issues: Issue[] = [];
    const seen = new Map<string, string>();

    for (const page of pages) {
      const normalized = page.title.toLowerCase().replace(/\s+/g, '-');
      if (seen.has(normalized)) {
        issues.push({
          type: 'duplicate',
          severity: 'warning',
          pageId: page.slug,
          description: `"${page.title}" may duplicate "${seen.get(normalized)}"`,
          suggestedFix: 'Consider merging these pages',
        });
      } else {
        seen.set(normalized, page.slug);
      }
    }
    return issues;
  }

  private async suggestNewArticles(
    pages: WikiPage[]
  ): Promise<Array<{ topic: string; reason: string; suggestedPages: string[] }>> {
    // Find topics mentioned multiple times but with no dedicated page
    const topicMentions = new Map<string, string[]>();
    const slugSet = new Set(pages.map((p) => p.slug));

    for (const page of pages) {
      const linkMatches = [...page.content.matchAll(/\[\[([^\]]+)\]\]/g)];
      for (const match of linkMatches) {
        const topic = match[1];
        if (!slugSet.has(topic)) {
          if (!topicMentions.has(topic)) topicMentions.set(topic, []);
          topicMentions.get(topic)!.push(page.slug);
        }
      }
    }

    const suggestions: Array<{ topic: string; reason: string; suggestedPages: string[] }> = [];
    for (const [topic, mentionedIn] of topicMentions.entries()) {
      if (mentionedIn.length >= 2) {
        suggestions.push({
          topic,
          reason: `Mentioned in ${mentionedIn.length} pages but no dedicated article exists`,
          suggestedPages: mentionedIn,
        });
      }
    }
    return suggestions;
  }

  private async autoFixSimpleIssues(issues: Issue[]): Promise<number> {
    let fixed = 0;
    for (const issue of issues) {
      if (issue.type === 'broken_link') {
        // Remove broken link from page content
        const page = await this.services.wiki.getPage(issue.pageId);
        if (!page) continue;
        const linkMatch = issue.description.match(/\[\[([^\]]+)\]\]/);
        if (linkMatch) {
          const newContent = page.content.replace(
            new RegExp(`\\[\\[${linkMatch[1]}\\]\\]`, 'g'),
            linkMatch[1]
          );
          await this.services.wiki.updatePageContent(issue.pageId, newContent);
          fixed++;
        }
      }
    }
    return fixed;
  }
}
