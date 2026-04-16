import { AgentResult, KBState, Services } from '../types';

export abstract class BaseAgent {
  protected kbRoot: string;
  protected services: Services;

  constructor(kbRoot: string, services: Services) {
    this.kbRoot = kbRoot;
    this.services = services;
  }

  abstract execute(...args: unknown[]): Promise<AgentResult>;

  protected async log(action: string, details?: Record<string, unknown>): Promise<void> {
    await this.services.event.logSuccess(this.agentName(), action, details);
  }

  protected async logError(action: string, error: Error): Promise<void> {
    await this.services.event.logError(this.agentName(), action, error);
  }

  protected async updateState(updates: Partial<KBState>): Promise<void> {
    const state = await this.services.state.getState();
    await this.services.state.saveState({ ...state, ...updates });
  }

  protected async getSchema(): Promise<string> {
    const state = await this.services.state.getState();
    const exists = await this.services.file.fileExists(state.schemaPath);
    if (!exists) return '';
    return this.services.file.readFile(state.schemaPath);
  }

  protected agentName(): string {
    return this.constructor.name.replace('Agent', '').toLowerCase();
  }
}
