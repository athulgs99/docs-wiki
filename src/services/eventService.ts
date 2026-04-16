import path from 'path';
import { EventLogEntry, FileError } from '../types';
import { FileService } from './fileService';

export interface EventServiceConfig {
  rootDir: string;
  logPath?: string;
}

export class EventService {
  private logPath: string;
  private file: FileService;

  constructor(config: EventServiceConfig) {
    this.logPath = config.logPath ?? path.join(config.rootDir, '.claude', 'event_log.jsonl');
    this.file = new FileService({ rootDir: config.rootDir });
  }

  // ─── Logging ────────────────────────────────────────────────────────────────

  async logEvent(entry: Omit<EventLogEntry, 'timestamp'>): Promise<void> {
    const full: EventLogEntry = { timestamp: new Date().toISOString(), ...entry };
    await this.file.appendJson(this.logPath, full);
  }

  async logSuccess(
    agent: string,
    action: string,
    details?: Record<string, unknown>,
    context?: { docId?: string; pageId?: string }
  ): Promise<void> {
    await this.logEvent({ agent, action, status: 'success', details, ...context });
  }

  async logError(agent: string, action: string, error: Error, context?: { docId?: string; pageId?: string }): Promise<void> {
    await this.logEvent({
      agent,
      action,
      status: 'failed',
      ...context,
      error: {
        message: error.message,
        code: (error as NodeJS.ErrnoException).code,
        stack: error.stack,
      },
    });
  }

  // ─── Querying ───────────────────────────────────────────────────────────────

  async getEvents(filter?: { agent?: string; action?: string; status?: string }): Promise<EventLogEntry[]> {
    const entries = await this.readAll();
    if (!filter) return entries;
    return entries.filter((e) => {
      if (filter.agent && e.agent !== filter.agent) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }

  async getEventsSince(timestamp: string): Promise<EventLogEntry[]> {
    const since = new Date(timestamp).getTime();
    const entries = await this.readAll();
    return entries.filter((e) => new Date(e.timestamp).getTime() >= since);
  }

  async getAgentEvents(agent: string): Promise<EventLogEntry[]> {
    return this.getEvents({ agent });
  }

  async getEventCount(agent?: string): Promise<number> {
    const entries = agent ? await this.getAgentEvents(agent) : await this.readAll();
    return entries.length;
  }

  // ─── Analysis ───────────────────────────────────────────────────────────────

  async getLastEvent(agent: string): Promise<EventLogEntry | null> {
    const entries = await this.getAgentEvents(agent);
    return entries.at(-1) ?? null;
  }

  async getEventTimeline(agent: string): Promise<Array<{ timestamp: string; action: string }>> {
    const entries = await this.getAgentEvents(agent);
    return entries.map((e) => ({ timestamp: e.timestamp, action: e.action }));
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async readAll(): Promise<EventLogEntry[]> {
    const exists = await this.file.fileExists(this.logPath);
    if (!exists) return [];
    const raw = await this.file.readFile(this.logPath);
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as EventLogEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is EventLogEntry => e !== null);
  }
}
