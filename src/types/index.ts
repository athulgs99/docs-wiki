// ─── Wiki Page ───────────────────────────────────────────────────────────────

export interface WikiPage {
  id: string;
  title: string;
  slug: string;

  created: string;
  updated: string;
  sourceCount: number;
  status: 'draft' | 'reviewed' | 'needs_update';

  frontmatter: {
    title: string;
    created: string;
    last_updated: string;
    source_count: number;
    status: string;
    source_url?: string;
    og_image?: string;
    site_name?: string;
    description?: string;
    favicon?: string;
  };
  content: string;

  sourceDocuments: string[];
  inboundLinks: string[];
  outboundLinks: string[];
}

// ─── Raw Document ────────────────────────────────────────────────────────────

export interface RawDocument {
  id: string;
  sourceType: 'markdown' | 'pdf' | 'html' | 'text' | 'json';
  title: string;

  sourceUrl?: string;
  authors?: string[];
  datePublished?: string;

  dateIngested: string;
  tags?: string[];

  content: string;
  wordCount: number;

  fileHash: string;

  summary?: string;
  keyTakeaways?: string[];
  extractedTopics?: string[];
}

// ─── KB State ────────────────────────────────────────────────────────────────

export interface KBState {
  rootDir: string;
  schemaPath: string;

  lastIngest: string;
  lastQuery: string;
  lastLint: string;

  pagesCount: number;
  documentsProcessed: string[];

  pendingTasks: Array<{
    id: string;
    agent: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    timestamp: string;
    error?: string;
  }>;

  config: {
    model?: string;
    temperature?: number;
    maxContextWindow?: number;
  };
}

// ─── Event Log ───────────────────────────────────────────────────────────────

export interface EventLogEntry {
  timestamp: string;
  agent: string;
  action: string;
  status: 'success' | 'failed';

  docId?: string;
  pageId?: string;

  details?: Record<string, unknown>;

  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

// ─── Agent Result ────────────────────────────────────────────────────────────

export interface AgentResult {
  status: 'success' | 'failed';
  agent: string;
  action: string;
  result?: unknown;
  error?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class KBError extends Error {
  constructor(public code: string, message: string, public context?: unknown) {
    super(message);
    this.name = 'KBError';
  }
}

export class ValidationError extends KBError {
  constructor(message: string, context?: unknown) {
    super('VALIDATION_ERROR', message, context);
    this.name = 'ValidationError';
  }
}

export class FileError extends KBError {
  constructor(message: string, context?: unknown) {
    super('FILE_ERROR', message, context);
    this.name = 'FileError';
  }
}

export class LLMError extends KBError {
  constructor(message: string, context?: unknown) {
    super('LLM_ERROR', message, context);
    this.name = 'LLMError';
  }
}

export class ParseError extends KBError {
  constructor(message: string, context?: unknown) {
    super('PARSE_ERROR', message, context);
    this.name = 'ParseError';
  }
}

export class TimeoutError extends KBError {
  constructor(message: string, context?: unknown) {
    super('TIMEOUT_ERROR', message, context);
    this.name = 'TimeoutError';
  }
}

// ─── Services Bundle ─────────────────────────────────────────────────────────

export interface Services {
  wiki: import('../services/wikiService').WikiService;
  state: import('../services/stateService').StateService;
  event: import('../services/eventService').EventService;
  llm: import('../services/llmService').LLMService;
  file: import('../services/fileService').FileService;
}
