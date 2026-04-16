import path from 'path';
import { KBState } from '../types';
import { FileService } from './fileService';

export interface StateServiceConfig {
  rootDir: string;
  statePath?: string;
}

const DEFAULT_STATE = (rootDir: string): KBState => ({
  rootDir,
  schemaPath: path.join(rootDir, 'CLAUDE.md'),
  lastIngest: '',
  lastQuery: '',
  lastLint: '',
  pagesCount: 0,
  documentsProcessed: [],
  pendingTasks: [],
  config: {
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.5,
    maxContextWindow: 128000,
  },
});

export class StateService {
  private statePath: string;
  private file: FileService;
  private rootDir: string;

  constructor(config: StateServiceConfig) {
    this.rootDir = config.rootDir;
    this.statePath = config.statePath ?? path.join(config.rootDir, '.claude', 'state.json');
    this.file = new FileService({ rootDir: config.rootDir });
  }

  // ─── State Operations ───────────────────────────────────────────────────────

  async getState(): Promise<KBState> {
    const exists = await this.file.fileExists(this.statePath);
    if (!exists) return DEFAULT_STATE(this.rootDir);
    try {
      return await this.file.readJson<KBState>(this.statePath);
    } catch {
      return DEFAULT_STATE(this.rootDir);
    }
  }

  async saveState(state: KBState): Promise<void> {
    await this.file.writeJson(this.statePath, state);
  }

  // ─── Tracking ───────────────────────────────────────────────────────────────

  async updateLastActivity(agent: string, timestamp?: string): Promise<void> {
    const state = await this.getState();
    const ts = timestamp ?? new Date().toISOString();
    if (agent === 'ingest') state.lastIngest = ts;
    else if (agent === 'query') state.lastQuery = ts;
    else if (agent === 'linter') state.lastLint = ts;
    await this.saveState(state);
  }

  async incrementPageCount(): Promise<void> {
    const state = await this.getState();
    state.pagesCount += 1;
    await this.saveState(state);
  }

  async addProcessedDocument(docId: string): Promise<void> {
    const state = await this.getState();
    if (!state.documentsProcessed.includes(docId)) {
      state.documentsProcessed.push(docId);
    }
    await this.saveState(state);
  }

  // ─── Task Management ────────────────────────────────────────────────────────

  async addTask(agent: string, details: unknown): Promise<string> {
    const state = await this.getState();
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    state.pendingTasks.push({
      id,
      agent,
      status: 'pending',
      timestamp: new Date().toISOString(),
    });
    await this.saveState(state);
    void details; // stored in event log, not state
    return id;
  }

  async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const state = await this.getState();
    const task = state.pendingTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      if (error) task.error = error;
    }
    await this.saveState(state);
  }

  async getPendingTasks(): Promise<KBState['pendingTasks']> {
    const state = await this.getState();
    return state.pendingTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress');
  }

  async clearCompletedTasks(): Promise<void> {
    const state = await this.getState();
    state.pendingTasks = state.pendingTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'failed'
    );
    await this.saveState(state);
  }

  // ─── Configuration ──────────────────────────────────────────────────────────

  async getConfig(): Promise<KBState['config']> {
    const state = await this.getState();
    return state.config;
  }

  async updateConfig(updates: Partial<KBState['config']>): Promise<void> {
    const state = await this.getState();
    state.config = { ...state.config, ...updates };
    await this.saveState(state);
  }
}
