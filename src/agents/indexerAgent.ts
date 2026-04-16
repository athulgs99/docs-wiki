import path from 'path';
import { AgentResult, Services, WikiPage } from '../types';
import { BaseAgent } from './baseAgent';

export interface IndexerAgentConfig {
  action: 'ingest' | 'query' | 'link' | 'full-rebuild';
  details?: { pageId?: string; sourceFile?: string; question?: string };
}

export interface IndexerResult extends AgentResult {
  result?: {
    pagesInIndex: number;
    categoriesInIndex: number;
    lastUpdated: string;
  };
}

export class IndexerAgent extends BaseAgent {
  private wikiPath: string;

  constructor(kbRoot: string, services: Services) {
    super(kbRoot, services);
    this.wikiPath = path.join(kbRoot, 'wiki');
  }

  async execute(config: IndexerAgentConfig): Promise<IndexerResult> {
    const { action, details } = config;

    try {
      // 1. Scan wiki
      const pages = await this.scanWiki();

      // 2. Build index.md
      const { indexContent, categories } = await this.buildIndexMd(pages);
      await this.services.file.writeFile(
        path.join(this.wikiPath, 'index.md'),
        indexContent
      );

      // 3. Append to log.md
      await this.updateLog(action, details ?? {});

      // 4. Update state
      await this.services.state.updateLastActivity('indexer');

      const now = new Date().toISOString();
      await this.log('rebuild_index', { pagesIndexed: pages.length, action });

      return {
        status: 'success',
        agent: 'indexer',
        action: 'rebuild_index',
        result: {
          pagesInIndex: pages.length,
          categoriesInIndex: Object.keys(categories).length,
          lastUpdated: now,
        },
      };
    } catch (err) {
      const error = err as Error;
      await this.logError('rebuild_index', error);
      return { status: 'failed', agent: 'indexer', action: 'rebuild_index', error: error.message };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async scanWiki(): Promise<WikiPage[]> {
    return this.services.wiki.getAllPages();
  }

  private async buildIndexMd(pages: WikiPage[]): Promise<{
    indexContent: string;
    categories: Record<string, WikiPage[]>;
  }> {
    const categories = this.categorizePages(pages);
    const now = new Date().toISOString();

    let content = `# Knowledge Base Index\n\n_Last updated: ${now}_\n\n`;
    content += `**Total pages:** ${pages.length}\n\n`;

    for (const [category, catPages] of Object.entries(categories)) {
      content += `## ${category}\n\n`;
      for (const page of catPages) {
        const desc = page.content.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
        content += `- [[${page.slug}]] — ${page.title}: ${desc.slice(0, 100)}\n`;
      }
      content += '\n';
    }

    return { indexContent: content, categories };
  }

  private categorizePages(pages: WikiPage[]): Record<string, WikiPage[]> {
    const categories: Record<string, WikiPage[]> = {};
    for (const page of pages) {
      // Use first topic from content or fall back to 'General'
      const topicsMatch = page.content.match(/## Topics\n([^\n#]+)/);
      const topic = topicsMatch
        ? topicsMatch[1].split(',')[0].trim()
        : 'General';
      const cat = topic.charAt(0).toUpperCase() + topic.slice(1);
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(page);
    }
    return Object.keys(categories).length > 0 ? categories : { General: pages };
  }

  private async updateLog(action: string, details: Record<string, unknown>): Promise<void> {
    const logPath = path.join(this.wikiPath, 'log.md');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    const detailStr = Object.entries(details)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    const entry = `\n## ${dateStr}\n### ${timeStr} | ${action}${detailStr ? ` | ${detailStr}` : ''}\n`;
    await this.services.file.appendFile(logPath, entry);
  }
}
