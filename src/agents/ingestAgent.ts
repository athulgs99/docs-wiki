import path from 'path';
import { AgentResult, RawDocument, WikiPage, Services } from '../types';
import { BaseAgent } from './baseAgent';

export interface IngestAgentConfig {
  sourceFile: string;
  supervised?: boolean;
  /** Optional: metadata when ingesting from a URL */
  urlMetadata?: {
    sourceUrl: string;
    siteName?: string;
    ogImage?: string;
    favicon?: string;
    description?: string;
    title?: string;
    author?: string;
    publishedDate?: string;
  };
}

export interface IngestResult extends AgentResult {
  result?: {
    docId: string;
    pageId: string;
    pageTitle: string;
    summary: string;
    keyTakeaways: string[];
    topics: string[];
    sourcePageCount: number;
  };
}

export class IngestAgent extends BaseAgent {
  constructor(kbRoot: string, services: Services) {
    super(kbRoot, services);
  }

  async execute(config: IngestAgentConfig): Promise<IngestResult> {
    const { sourceFile, supervised, urlMetadata } = config;

    try {
      // 1. Read source file
      const { content, type } = await this.readSourceFile(sourceFile);

      // 2. Extract metadata
      const metadata = await this.extractMetadata(content, sourceFile);

      // Merge URL metadata if provided
      if (urlMetadata) {
        metadata.sourceUrl = urlMetadata.sourceUrl;
        if (urlMetadata.title) metadata.title = urlMetadata.title;
        if (urlMetadata.author) metadata.authors = [urlMetadata.author];
        if (urlMetadata.publishedDate) metadata.datePublished = urlMetadata.publishedDate;
      }

      // 3. LLM: summarize, extract topics
      const { summary, keyTakeaways, topics } = await this.generateSummary(content);

      metadata.summary = summary;
      metadata.keyTakeaways = keyTakeaways;
      metadata.extractedTopics = topics;

      // 4. Supervised mode: show summary before committing
      if (supervised) {
        console.log('\n--- Ingest Preview ---');
        console.log('Title:', metadata.title);
        console.log('Summary:', summary);
        console.log('Topics:', topics.join(', '));
        console.log('Key Takeaways:', keyTakeaways.map((t) => `\n  - ${t}`).join(''));
        console.log('----------------------\n');
      }

      // 5. Create wiki page
      const page = await this.createWikiPage(summary, metadata, topics, urlMetadata);

      // 6. Validate page content
      await this.validatePageContent(page);

      // 7. Write to wiki/
      await this.services.wiki.createPage(page);

      // 8. Update state
      await this.services.state.incrementPageCount();
      await this.services.state.addProcessedDocument(metadata.id);
      await this.services.state.updateLastActivity('ingest');

      // 9. Log success
      await this.log('ingest_source', {
        docId: metadata.id,
        pageId: page.slug,
        topics,
        sourceFile,
      });

      return {
        status: 'success',
        agent: 'ingest',
        action: 'ingest_source',
        result: {
          docId: metadata.id,
          pageId: page.slug,
          pageTitle: page.title,
          summary,
          keyTakeaways,
          topics,
          sourcePageCount: 1,
        },
      };
    } catch (err) {
      const error = err as Error;
      await this.logError('ingest_source', error);
      return {
        status: 'failed',
        agent: 'ingest',
        action: 'ingest_source',
        error: error.message,
      };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async readSourceFile(sourceFile: string): Promise<{ content: string; type: string }> {
    const ext = path.extname(sourceFile).toLowerCase().slice(1);
    const typeMap: Record<string, RawDocument['sourceType']> = {
      md: 'markdown',
      pdf: 'pdf',
      html: 'html',
      htm: 'html',
      txt: 'text',
      json: 'json',
    };
    const type = typeMap[ext] ?? 'text';
    const content = await this.services.file.readFile(sourceFile);
    return { content, type };
  }

  private async extractMetadata(content: string, sourceFile: string): Promise<RawDocument> {
    const now = new Date().toISOString();
    const fileName = path.basename(sourceFile, path.extname(sourceFile));
    const ext = path.extname(sourceFile).toLowerCase().slice(1);
    const typeMap: Record<string, RawDocument['sourceType']> = {
      md: 'markdown', pdf: 'pdf', html: 'html', htm: 'html', txt: 'text', json: 'json',
    };

    const fileHash = await this.services.file.fileHash(sourceFile);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sourceType: typeMap[ext] ?? 'text',
      title: fileName.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      dateIngested: now,
      content,
      wordCount,
      fileHash,
    };
  }

  private async generateSummary(content: string): Promise<{
    summary: string;
    keyTakeaways: string[];
    topics: string[];
  }> {
    const schema = await this.getSchema();
    const prompt = `${schema ? `CLAUDE.md Schema:\n${schema}\n\n---\n\n` : ''}Read this source document and extract:
1. A 1-2 sentence summary
2. Key takeaways (3-5 bullets)
3. Main topics/concepts (2-4 topics)

Source document:
${content.slice(0, 12000)}

Return ONLY valid JSON with this exact structure:
{
  "summary": "...",
  "keyTakeaways": ["...", "..."],
  "topics": ["topic1", "topic2"]
}`;

    const result = await this.services.llm.extractJson(prompt) as {
      summary: string;
      keyTakeaways: string[];
      topics: string[];
    };

    return {
      summary: result.summary ?? '',
      keyTakeaways: result.keyTakeaways ?? [],
      topics: result.topics ?? [],
    };
  }

  private async createWikiPage(
    summary: string,
    metadata: RawDocument,
    topics: string[],
    urlMetadata?: IngestAgentConfig['urlMetadata']
  ): Promise<WikiPage> {
    const slug = this.services.wiki.slugify(metadata.title);
    const now = new Date().toISOString();

    const takeawayLines = metadata.keyTakeaways
      ?.map((t) => `- ${t} [Source: ${path.basename(metadata.id)}]`)
      .join('\n') ?? '';

    const content = `## Overview
${summary} [Source: ${metadata.title}]

## Key Takeaways
${takeawayLines}

## Topics
${topics.join(', ')}

## Related
`;

    const frontmatter: WikiPage['frontmatter'] = {
      title: metadata.title,
      created: now,
      last_updated: now,
      source_count: 1,
      status: 'draft',
    };

    // Add URL-related frontmatter if available
    if (urlMetadata) {
      if (urlMetadata.sourceUrl) frontmatter.source_url = urlMetadata.sourceUrl;
      if (urlMetadata.ogImage) frontmatter.og_image = urlMetadata.ogImage;
      if (urlMetadata.siteName) frontmatter.site_name = urlMetadata.siteName;
      if (urlMetadata.description) frontmatter.description = urlMetadata.description;
      if (urlMetadata.favicon) frontmatter.favicon = urlMetadata.favicon;
    }

    return {
      id: slug,
      title: metadata.title,
      slug,
      created: now,
      updated: now,
      sourceCount: 1,
      status: 'draft',
      frontmatter,
      content,
      sourceDocuments: [metadata.id],
      inboundLinks: [],
      outboundLinks: [],
    };
  }

  private async validatePageContent(page: WikiPage): Promise<void> {
    if (!page.title) throw new Error('Page missing title');
    if (!page.content) throw new Error('Page missing content');
    if (!page.slug) throw new Error('Page missing slug');
  }
}
