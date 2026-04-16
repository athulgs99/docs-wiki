import Anthropic from '@anthropic-ai/sdk';
import { LLMError, ParseError, TimeoutError } from '../types';

export interface LLMServiceConfig {
  apiKey: string;
  model?: string;
  timeout?: number;
  temperature?: number;
  maxTokens?: number;
}

interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  cost: number;
}

// Sonnet 4.5 pricing (per million tokens)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

export class LLMService {
  private client: Anthropic;
  private model: string;
  private timeout: number;
  private temperature: number;
  private maxTokens: number;
  private stats: TokenStats = { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, cost: 0 };

  constructor(config: LLMServiceConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-5-20250929';
    this.timeout = config.timeout ?? 30000;
    this.temperature = config.temperature ?? 0.5;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  // ─── Core Methods ────────────────────────────────────────────────────────────

  async processWithSchema(
    prompt: string,
    schema: string,
    options?: { temperature?: number; maxTokens?: number; responseFormat?: 'text' | 'json' }
  ): Promise<Record<string, unknown>> {
    const fullPrompt = this.formatPrompt(prompt, schema);
    const raw = await this.call(fullPrompt, options);
    return this.parseResponse(raw, options?.responseFormat ?? 'json') as Record<string, unknown>;
  }

  async synthesize(
    input: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    return this.call(input, options);
  }

  async extractJson(prompt: string): Promise<Record<string, unknown>> {
    const raw = await this.call(prompt);
    return this.parseResponse(raw, 'json') as Record<string, unknown>;
  }

  // ─── Token / Cost Tracking ───────────────────────────────────────────────────

  async getTokenStats(): Promise<{ totalTokens: number; cost: number }> {
    return { totalTokens: this.stats.totalTokens, cost: this.stats.cost };
  }

  async resetStats(): Promise<void> {
    this.stats = { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, cost: 0 };
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async call(
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        temperature: options?.temperature ?? this.temperature,
        messages: [{ role: 'user', content: prompt }],
      });

      // Track usage
      const usage = response.usage;
      this.stats.totalInputTokens += usage.input_tokens;
      this.stats.totalOutputTokens += usage.output_tokens;
      this.stats.totalTokens += usage.input_tokens + usage.output_tokens;
      this.stats.cost +=
        (usage.input_tokens / 1_000_000) * INPUT_COST_PER_M +
        (usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_M;

      const block = response.content[0];
      if (block.type !== 'text') throw new LLMError('Unexpected response type from LLM');
      return block.text;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new TimeoutError(`LLM call timed out after ${this.timeout}ms`);
      }
      if (err instanceof LLMError || err instanceof TimeoutError) throw err;
      throw new LLMError(`LLM API error: ${(err as Error).message}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  private formatPrompt(prompt: string, schema: string): string {
    return `CLAUDE.md Schema:\n${schema}\n\n---\n\n${prompt}`;
  }

  private parseResponse(response: string, format: 'text' | 'json'): unknown {
    if (format === 'text') return response;

    // Strip markdown code fences if present
    const cleaned = response.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to extract JSON object/array from the text
      const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // fall through
        }
      }
      throw new ParseError(`Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`);
    }
  }
}
