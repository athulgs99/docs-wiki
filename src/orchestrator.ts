import path from 'path';
import { Services } from './types';
import { WikiService } from './services/wikiService';
import { StateService } from './services/stateService';
import { EventService } from './services/eventService';
import { LLMService } from './services/llmService';
import { FileService } from './services/fileService';
import { IngestAgent, IngestResult } from './agents/ingestAgent';
import { LinkerAgent } from './agents/linkerAgent';
import { IndexerAgent } from './agents/indexerAgent';
import { QueryAgent, QueryResult } from './agents/queryAgent';
import { LinterAgent, LintResult } from './agents/linterAgent';
import { fetchUrl } from './utils/urlFetcher';
import fs from 'fs/promises';

export class Orchestrator {
  private services: Services;
  private kbRoot: string;

  constructor(kbRoot: string) {
    this.kbRoot = path.resolve(kbRoot);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is required');

    this.services = {
      wiki: new WikiService({
        rootDir: this.kbRoot,
        wikiPath: path.join(this.kbRoot, 'wiki'),
      }),
      state: new StateService({
        rootDir: this.kbRoot,
        statePath: path.join(this.kbRoot, '.claude', 'state.json'),
      }),
      event: new EventService({
        rootDir: this.kbRoot,
        logPath: path.join(this.kbRoot, '.claude', 'event_log.jsonl'),
      }),
      llm: new LLMService({
        apiKey,
        model: process.env.KB_MODEL ?? 'claude-sonnet-4-5-20250929',
        temperature: Number(process.env.KB_TEMPERATURE ?? 0.5),
        maxTokens: Number(process.env.KB_MAX_TOKENS ?? 4096),
        timeout: Number(process.env.KB_TIMEOUT ?? 30000),
      }),
      file: new FileService({ rootDir: this.kbRoot }),
    };
  }

  // ─── kb ingest <source> ──────────────────────────────────────────────────────

  async ingest(
    sourceFile: string,
    options: { supervised?: boolean } = {}
  ): Promise<IngestResult['result']> {
    const ingestResult = await new IngestAgent(this.kbRoot, this.services).execute({
      sourceFile,
      supervised: options.supervised,
    });

    if (ingestResult.status === 'failed') throw new Error(`Ingest failed: ${ingestResult.error}`);

    const { pageId } = ingestResult.result!;

    // Link to related pages
    const allPages = await this.services.wiki.getAllPages();
    const linkerResult = await new LinkerAgent(this.kbRoot, this.services).execute({
      pageId,
      allPages,
    });

    if (linkerResult.status === 'failed') {
      console.warn(`Warning: Linking failed: ${linkerResult.error}`);
    }

    // Rebuild index
    await new IndexerAgent(this.kbRoot, this.services).execute({
      action: 'ingest',
      details: { pageId, sourceFile },
    });

    return ingestResult.result;
  }

  // ─── kb ingest --url ─────────────────────────────────────────────────────────

  async ingestUrl(url: string, options: { supervised?: boolean } = {}): Promise<IngestResult['result']> {
    // 1. Fetch and parse the URL
    const fetched = await fetchUrl(url);

    // 2. Save the fetched content to raw/ for provenance
    const rawDir = path.join(this.kbRoot, 'raw');
    await fs.mkdir(rawDir, { recursive: true });
    const safeSlug = this.services.wiki.slugify(fetched.title).slice(0, 60) || 'url';
    const rawPath = path.join(rawDir, `${safeSlug}-${Date.now()}.txt`);

    const savedContent = `# ${fetched.title}
URL: ${fetched.url}
Site: ${fetched.siteName}
${fetched.author ? `Author: ${fetched.author}` : ''}
${fetched.publishedDate ? `Published: ${fetched.publishedDate}` : ''}

${fetched.description ? `## Description\n${fetched.description}\n` : ''}

## Content
${fetched.mainText}
`;
    await fs.writeFile(rawPath, savedContent, 'utf-8');

    // 3. Run the normal ingest pipeline with URL metadata
    const ingestResult = await new IngestAgent(this.kbRoot, this.services).execute({
      sourceFile: rawPath,
      supervised: options.supervised,
      urlMetadata: {
        sourceUrl: fetched.url,
        siteName: fetched.siteName,
        ogImage: fetched.ogImage,
        favicon: fetched.favicon,
        description: fetched.description,
        title: fetched.title,
        author: fetched.author,
        publishedDate: fetched.publishedDate,
      },
    });

    if (ingestResult.status === 'failed') throw new Error(`URL ingest failed: ${ingestResult.error}`);

    const { pageId } = ingestResult.result!;

    // 4. Link to related pages
    const allPages = await this.services.wiki.getAllPages();
    const linkerResult = await new LinkerAgent(this.kbRoot, this.services).execute({ pageId, allPages });
    if (linkerResult.status === 'failed') {
      console.warn(`Warning: Linking failed: ${linkerResult.error}`);
    }

    // 5. Rebuild index
    await new IndexerAgent(this.kbRoot, this.services).execute({
      action: 'ingest',
      details: { pageId, sourceFile: `${rawPath} (from ${url})` },
    });

    return ingestResult.result;
  }

  // ─── kb ingest --batch ───────────────────────────────────────────────────────

  async ingestBatch(
    files: string[],
    options: { supervised?: boolean } = {}
  ): Promise<Array<IngestResult['result']>> {
    const results: Array<IngestResult['result']> = [];
    for (const file of files) {
      try {
        const result = await this.ingest(file, options);
        results.push(result);
      } catch (err) {
        console.error(`Skipping ${file}: ${(err as Error).message}`);
      }
    }
    return results;
  }

  // ─── kb query ───────────────────────────────────────────────────────────────

  async query(
    question: string,
    options: { scope?: 'full' | 'topic' | 'page'; topic?: string; pageId?: string; fileAnswer?: boolean } = {}
  ): Promise<QueryResult['result']> {
    const result = await new QueryAgent(this.kbRoot, this.services).execute({
      question,
      ...options,
    });

    if (result.status === 'failed') throw new Error(`Query failed: ${result.error}`);

    // Log query in wiki log
    await new IndexerAgent(this.kbRoot, this.services).execute({
      action: 'query',
      details: { question },
    });

    return result.result;
  }

  // ─── kb lint ─────────────────────────────────────────────────────────────────

  async lint(
    options: { autoFix?: boolean; checkLevel?: 'quick' | 'thorough' } = {}
  ): Promise<LintResult['result']> {
    const result = await new LinterAgent(this.kbRoot, this.services).execute(options);

    if (result.status === 'failed') throw new Error(`Lint failed: ${result.error}`);

    // Rebuild index after auto-fix (pages may have changed)
    if (options.autoFix) {
      await new IndexerAgent(this.kbRoot, this.services).execute({ action: 'full-rebuild' });
    }

    return result.result;
  }

  // ─── Accessors for CLI read commands ────────────────────────────────────────

  get wiki() { return this.services.wiki; }
  get state() { return this.services.state; }
  get file() { return this.services.file; }
  get kbRootDir() { return this.kbRoot; }
}
