import { AgentResult, WikiPage, Services } from '../types';
import { BaseAgent } from './baseAgent';

export interface LinkerAgentConfig {
  pageId: string;
  allPages: WikiPage[];
}

export interface LinkerResult extends AgentResult {
  result?: {
    pageId: string;
    newBacklinksAdded: number;
    updatedPages: string[];
    suggestedConnections: Array<{ targetPageId: string; reason: string }>;
  };
}

export class LinkerAgent extends BaseAgent {
  constructor(kbRoot: string, services: Services) {
    super(kbRoot, services);
  }

  async execute(config: LinkerAgentConfig): Promise<LinkerResult> {
    const { pageId, allPages } = config;

    try {
      // 1. Read newly created page
      const newPage = await this.services.wiki.getPage(pageId);
      if (!newPage) throw new Error(`Page not found: ${pageId}`);

      // Skip linking if no other pages exist
      const otherPages = allPages.filter((p) => p.slug !== pageId);
      if (otherPages.length === 0) {
        return {
          status: 'success',
          agent: 'linker',
          action: 'add_backlinks',
          result: { pageId, newBacklinksAdded: 0, updatedPages: [], suggestedConnections: [] },
        };
      }

      // 2. LLM: find related pages
      const { linkedPages, reasons } = await this.findConnections(newPage, otherPages);

      // 3. Add bidirectional links
      const updatedPages: string[] = [];
      for (const targetId of linkedPages) {
        const exists = await this.services.wiki.getPage(targetId);
        if (!exists) continue;
        await this.services.wiki.addBacklink(pageId, targetId);
        updatedPages.push(targetId);
      }

      // 4. Validate
      await this.services.wiki.validateBacklinks();

      // 5. Log
      await this.log('add_backlinks', { pageId, linksAdded: updatedPages.length });

      return {
        status: 'success',
        agent: 'linker',
        action: 'add_backlinks',
        result: {
          pageId,
          newBacklinksAdded: updatedPages.length,
          updatedPages,
          suggestedConnections: linkedPages.map((id) => ({
            targetPageId: id,
            reason: (reasons as Record<string, string>)[id] ?? '',
          })),
        },
      };
    } catch (err) {
      const error = err as Error;
      await this.logError('add_backlinks', error);
      return { status: 'failed', agent: 'linker', action: 'add_backlinks', error: error.message };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async findConnections(
    newPage: WikiPage,
    otherPages: WikiPage[]
  ): Promise<{ linkedPages: string[]; reasons: Record<string, string> }> {
    const schema = await this.getSchema();
    const pageList = otherPages
      .map((p, i) => `${i + 1}. [[${p.slug}]] - ${p.title}: ${p.content.slice(0, 200)}`)
      .join('\n');

    const prompt = `${schema ? `CLAUDE.md Schema:\n${schema}\n\n---\n\n` : ''}Here are existing wiki pages:
${pageList}

New page to link:
Title: ${newPage.title}
Content: ${newPage.content.slice(0, 3000)}

Identify which 3-5 existing pages are most related to the new page.
Return ONLY valid JSON:
{
  "linkedPages": ["page-slug-1", "page-slug-2"],
  "reasons": {
    "page-slug-1": "short reason for connection"
  }
}`;

    const result = await this.services.llm.extractJson(prompt) as {
      linkedPages: string[];
      reasons: Record<string, string>;
    };

    return {
      linkedPages: (result.linkedPages ?? []).slice(0, 5),
      reasons: result.reasons ?? {},
    };
  }
}
