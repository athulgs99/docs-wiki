import path from 'path';
import matter from 'gray-matter';
import { WikiPage, ValidationError, FileError } from '../types';
import { FileService } from './fileService';

export interface WikiServiceConfig {
  rootDir: string;
  wikiPath?: string;
}

export class WikiService {
  private wikiPath: string;
  private file: FileService;

  constructor(config: WikiServiceConfig) {
    this.wikiPath = config.wikiPath ?? path.join(config.rootDir, 'wiki');
    this.file = new FileService({ rootDir: config.rootDir });
  }

  // ─── Read Operations ────────────────────────────────────────────────────────

  async getPage(pageId: string): Promise<WikiPage | null> {
    const filePath = this.pageFilePath(pageId);
    const exists = await this.file.fileExists(filePath);
    if (!exists) return null;
    const content = await this.file.readFile(filePath);
    return this.parseWikiPage(pageId, content);
  }

  async getAllPages(): Promise<WikiPage[]> {
    const exists = await this.file.fileExists(this.wikiPath);
    if (!exists) return [];
    const files = await this.file.listFiles(this.wikiPath, '*.md');
    const pages: WikiPage[] = [];
    for (const f of files) {
      const slug = path.basename(f, '.md');
      // Skip special files
      if (slug === 'index' || slug === 'log') continue;
      const page = await this.getPage(slug);
      if (page) pages.push(page);
    }
    return pages;
  }

  async getPagesByTopic(topic: string): Promise<WikiPage[]> {
    const all = await this.getAllPages();
    const t = topic.toLowerCase();
    return all.filter(
      (p) =>
        p.title.toLowerCase().includes(t) ||
        p.content.toLowerCase().includes(t)
    );
  }

  async searchPages(query: string): Promise<WikiPage[]> {
    const all = await this.getAllPages();
    const q = query.toLowerCase();

    // Stop-words to strip from keyword search
    const stopWords = new Set([
      'a','an','the','is','it','in','on','at','to','for','of','and','or','but',
      'what','whats','how','why','when','where','who','which','does','do','did',
      'was','were','are','be','been','being','have','has','had','with','from',
      'by','about','this','that','these','those','my','your','his','her','its',
    ]);

    // Extract meaningful keywords from the query
    const keywords = q
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // First try: exact phrase match
    const exact = all.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
    );
    if (exact.length > 0) return exact;

    // Fallback: any keyword match (OR logic)
    if (keywords.length === 0) return [];
    return all.filter((p) => {
      const haystack = (p.title + ' ' + p.content).toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    });
  }

  async getPageContent(pageId: string): Promise<string> {
    const filePath = this.pageFilePath(pageId);
    return this.file.readFile(filePath);
  }

  async getFrontmatter(pageId: string): Promise<Record<string, unknown>> {
    const raw = await this.getPageContent(pageId);
    const { data } = matter(raw);
    return data;
  }

  // ─── Write Operations ───────────────────────────────────────────────────────

  async createPage(page: WikiPage): Promise<void> {
    const markdown = this.serializeWikiPage(page);
    await this.file.writeFile(this.pageFilePath(page.slug), markdown);
  }

  async updatePageContent(pageId: string, content: string): Promise<void> {
    const existing = await this.getPage(pageId);
    if (!existing) throw new FileError(`Page not found: ${pageId}`);
    existing.content = content;
    existing.updated = new Date().toISOString();
    existing.frontmatter.last_updated = existing.updated;
    await this.file.writeFile(this.pageFilePath(pageId), this.serializeWikiPage(existing));
  }

  async updateFrontmatter(pageId: string, updates: Partial<WikiPage['frontmatter']>): Promise<void> {
    const existing = await this.getPage(pageId);
    if (!existing) throw new FileError(`Page not found: ${pageId}`);
    existing.frontmatter = { ...existing.frontmatter, ...updates };
    existing.updated = new Date().toISOString();
    await this.file.writeFile(this.pageFilePath(pageId), this.serializeWikiPage(existing));
  }

  async deletePage(pageId: string): Promise<void> {
    await this.file.deleteFile(this.pageFilePath(pageId));
  }

  // ─── Backlink Management ────────────────────────────────────────────────────

  async addBacklink(sourcePageId: string, targetPageId: string): Promise<void> {
    const source = await this.getPage(sourcePageId);
    if (!source) throw new FileError(`Source page not found: ${sourcePageId}`);

    const link = `[[${targetPageId}]]`;
    if (!source.outboundLinks.includes(targetPageId)) {
      source.outboundLinks.push(targetPageId);
      if (!source.content.includes(link)) {
        source.content += `\n- ${link}`;
      }
    }
    await this.file.writeFile(this.pageFilePath(sourcePageId), this.serializeWikiPage(source));

    // Update target's inbound links
    const target = await this.getPage(targetPageId);
    if (target && !target.inboundLinks.includes(sourcePageId)) {
      target.inboundLinks.push(sourcePageId);
      await this.file.writeFile(this.pageFilePath(targetPageId), this.serializeWikiPage(target));
    }
  }

  async removeBacklink(sourcePageId: string, targetPageId: string): Promise<void> {
    const source = await this.getPage(sourcePageId);
    if (!source) return;
    source.outboundLinks = source.outboundLinks.filter((l) => l !== targetPageId);
    source.content = source.content.replace(new RegExp(`\\[\\[${targetPageId}\\]\\]`, 'g'), '');
    await this.file.writeFile(this.pageFilePath(sourcePageId), this.serializeWikiPage(source));
  }

  async getBacklinks(pageId: string): Promise<string[]> {
    const page = await this.getPage(pageId);
    return page?.inboundLinks ?? [];
  }

  async getReferredPages(pageId: string): Promise<string[]> {
    const page = await this.getPage(pageId);
    return page?.outboundLinks ?? [];
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  async validateBacklinks(): Promise<{ broken: string[]; orphaned: string[] }> {
    const all = await this.getAllPages();
    const slugSet = new Set(all.map((p) => p.slug));
    const broken: string[] = [];
    const orphaned: string[] = [];

    for (const page of all) {
      for (const link of page.outboundLinks) {
        if (!slugSet.has(link)) {
          broken.push(`${page.slug} → ${link}`);
        }
      }
      if (page.inboundLinks.length === 0) {
        orphaned.push(page.slug);
      }
    }
    return { broken, orphaned };
  }

  async validateFrontmatter(): Promise<{ invalid: string[] }> {
    const all = await this.getAllPages();
    const invalid: string[] = [];
    for (const page of all) {
      if (!page.frontmatter.title || !page.frontmatter.created) {
        invalid.push(page.slug);
      }
    }
    return { invalid };
  }

  // ─── Utility ────────────────────────────────────────────────────────────────

  slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  parseMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string } {
    const { data, content: body } = matter(content);
    return { frontmatter: data, body: body.trim() };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private pageFilePath(pageId: string): string {
    return path.join(this.wikiPath, `${pageId}.md`);
  }

  private parseWikiPage(slug: string, raw: string): WikiPage {
    const { data, content } = matter(raw);

    if (!data.title) throw new ValidationError(`Missing title in frontmatter: ${slug}`);

    // Extract [[links]] from content
    const outboundLinks = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    const inboundLinks: string[] = (data._inbound_links as string[]) ?? [];

    return {
      id: slug,
      title: data.title as string,
      slug,
      created: (data.created as string) ?? new Date().toISOString(),
      updated: (data.last_updated as string) ?? new Date().toISOString(),
      sourceCount: (data.source_count as number) ?? 0,
      status: (data.status as WikiPage['status']) ?? 'draft',
      frontmatter: {
        title: data.title as string,
        created: (data.created as string) ?? '',
        last_updated: (data.last_updated as string) ?? '',
        source_count: (data.source_count as number) ?? 0,
        status: (data.status as string) ?? 'draft',
        source_url: data.source_url as string | undefined,
        og_image: data.og_image as string | undefined,
        site_name: data.site_name as string | undefined,
        description: data.description as string | undefined,
        favicon: data.favicon as string | undefined,
      },
      content: content.trim(),
      sourceDocuments: (data.source_documents as string[]) ?? [],
      inboundLinks,
      outboundLinks: [...new Set(outboundLinks)],
    };
  }

  private serializeWikiPage(page: WikiPage): string {
    const frontmatter: Record<string, unknown> = {
      title: page.frontmatter.title,
      created: page.frontmatter.created,
      last_updated: page.frontmatter.last_updated,
      source_count: page.frontmatter.source_count,
      status: page.frontmatter.status,
      source_documents: page.sourceDocuments,
      _inbound_links: page.inboundLinks,
    };
    // Preserve URL metadata if present
    if (page.frontmatter.source_url) frontmatter.source_url = page.frontmatter.source_url;
    if (page.frontmatter.og_image) frontmatter.og_image = page.frontmatter.og_image;
    if (page.frontmatter.site_name) frontmatter.site_name = page.frontmatter.site_name;
    if (page.frontmatter.description) frontmatter.description = page.frontmatter.description;
    if (page.frontmatter.favicon) frontmatter.favicon = page.frontmatter.favicon;
    return matter.stringify(page.content, frontmatter);
  }
}
