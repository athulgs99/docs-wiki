import path from 'path';
import { AgentResult, Services, WikiPage } from '../types';
import { BaseAgent } from './baseAgent';

export interface QueryAgentConfig {
  question: string;
  scope?: 'full' | 'topic' | 'page';
  topic?: string;
  pageId?: string;
  fileAnswer?: boolean;
}

export interface QueryResult extends AgentResult {
  result?: {
    answer: string;
    sources: Array<{
      pageId: string;
      title: string;
      relevance: 'high' | 'medium' | 'low';
      snippets: string[];
    }>;
    confidence: 'high' | 'medium' | 'low';
    gaps: string[];
    newPageSuggested?: { topic: string; reason: string };
  };
}

export class QueryAgent extends BaseAgent {
  constructor(kbRoot: string, services: Services) {
    super(kbRoot, services);
  }

  async execute(config: QueryAgentConfig): Promise<QueryResult> {
    const { question, scope, topic, pageId, fileAnswer } = config;

    try {
      // 1. Search relevant pages
      const pages = await this.searchWiki(question, scope, topic, pageId);

      if (pages.length === 0) {
        return {
          status: 'success',
          agent: 'query',
          action: 'answer_query',
          result: {
            answer: 'No relevant pages found in the knowledge base for this question.',
            sources: [],
            confidence: 'low',
            gaps: [question],
          },
        };
      }

      // 2. Rank pages
      const ranked = await this.rankPages(pages, question);

      // 3. Use top 10
      const topPages = ranked.slice(0, 10);

      // 4. LLM: synthesize answer
      const { answer, confidence } = await this.synthesizeAnswer(question, topPages);

      // 5. Extract sources
      const sources = this.extractSources(answer, topPages);

      // 6. Detect gaps
      const gaps = await this.detectGaps(answer, topPages);

      // 7. Optionally file answer
      if (fileAnswer) {
        await this.optionallyFileAnswer(question, answer, sources.map((s) => s.pageId));
      }

      // 8. Log
      await this.services.state.updateLastActivity('query');
      await this.log('answer_query', {
        question,
        pagesSearched: pages.length,
        confidence,
        sourcesUsed: sources.length,
      });

      return {
        status: 'success',
        agent: 'query',
        action: 'answer_query',
        result: { answer, sources, confidence, gaps },
      };
    } catch (err) {
      const error = err as Error;
      await this.logError('answer_query', error);
      return { status: 'failed', agent: 'query', action: 'answer_query', error: error.message };
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async searchWiki(
    query: string,
    scope?: 'full' | 'topic' | 'page',
    topic?: string,
    pageId?: string
  ): Promise<WikiPage[]> {
    // Scope by page: return just that one page (it's always relevant since user picked it)
    if (scope === 'page' && pageId) {
      const page = await this.services.wiki.getPage(pageId);
      return page ? [page] : [];
    }
    if (scope === 'topic' && topic) {
      return this.services.wiki.getPagesByTopic(topic);
    }
    return this.services.wiki.searchPages(query);
  }

  private async rankPages(pages: WikiPage[], query: string): Promise<WikiPage[]> {
    const q = query.toLowerCase();
    const stopWords = new Set([
      'a','an','the','is','it','in','on','at','to','for','of','and','or','but',
      'what','whats','how','why','when','where','who','which','does','do','did',
      'was','were','are','be','been','being','have','has','had','with','from',
      'by','about','this','that','these','those','my','your','his','her','its',
    ]);
    const keywords = q
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const score = (p: WikiPage): number => {
      const title = p.title.toLowerCase();
      const content = p.content.toLowerCase();
      const exactBonus = (title.includes(q) ? 10 : 0) + (content.split(q).length - 1) * 2;
      const kwScore = keywords.reduce((acc, kw) =>
        acc + (title.includes(kw) ? 3 : 0) + (content.split(kw).length - 1), 0);
      return exactBonus + kwScore;
    };

    return pages.sort((a, b) => score(b) - score(a));
  }

  private async synthesizeAnswer(
    question: string,
    pages: WikiPage[]
  ): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
    const schema = await this.getSchema();
    const pagesContent = pages
      .map((p) => `[${p.title}]:\n${p.content}`)
      .join('\n\n---\n\n');

    const prompt = `${schema ? `CLAUDE.md Schema:\n${schema}\n\n---\n\n` : ''}Read these wiki pages and answer the question. Cite sources as [Source: page-title].
If the question cannot be answered from these pages, say so clearly.

Wiki pages:
${pagesContent.slice(0, 80000)}

Question: ${question}

Provide a clear, cited answer. End with a confidence assessment: HIGH, MEDIUM, or LOW based on how well the pages cover the question.`;

    const raw = await this.services.llm.synthesize(prompt);

    const confidenceMatch = raw.match(/\b(HIGH|MEDIUM|LOW)\b/i);
    const confidence = (confidenceMatch?.[1]?.toLowerCase() ?? 'medium') as 'high' | 'medium' | 'low';

    return { answer: raw, confidence };
  }

  private extractSources(
    answer: string,
    pages: WikiPage[]
  ): Array<{ pageId: string; title: string; relevance: 'high' | 'medium' | 'low'; snippets: string[] }> {
    return pages
      .filter((p) => answer.toLowerCase().includes(p.title.toLowerCase()))
      .map((p) => ({
        pageId: p.slug,
        title: p.title,
        relevance: answer.toLowerCase().split(p.title.toLowerCase()).length > 2 ? 'high' : 'medium' as 'high' | 'medium',
        snippets: [],
      }));
  }

  private async detectGaps(answer: string, pages: WikiPage[]): Promise<string[]> {
    const gaps: string[] = [];
    if (answer.toLowerCase().includes('cannot answer') || answer.toLowerCase().includes('not found')) {
      gaps.push('Question partially or fully unanswerable from current wiki');
    }
    if (answer.toLowerCase().includes('unclear') || answer.toLowerCase().includes('limited information')) {
      gaps.push('Insufficient detail in wiki pages');
    }
    return gaps;
  }

  private async optionallyFileAnswer(
    question: string,
    answer: string,
    sourceIds: string[]
  ): Promise<void> {
    const now = new Date().toISOString();
    const slug = `query-${Date.now()}`;
    const outputPath = path.join(this.kbRoot, 'outputs', `${slug}.md`);

    const content = `# Query: ${question}\n\n_Asked: ${now}_\n\n## Answer\n\n${answer}\n\n## Sources\n\n${sourceIds.map((id) => `- [[${id}]]`).join('\n')}\n`;
    await this.services.file.writeFile(outputPath, content);
  }
}
