# Docs Wiki Agent - Knowledge Base System

A powerful knowledge base agent system that ingests documents, builds a structured wiki, and enables intelligent querying - think wikipedia

## Overview

KB Agent is a full-stack system for managing and querying a knowledge base. It combines:

- **CLI Tool** (`ts-node`) - Command-line interface for managing your knowledge base
- **Next.js Web UI** - Modern web interface for browsing and searching wiki pages
- **LLM-Powered Agents** - Claude AI agents for intelligent document processing, linking, and querying
- **File-Based Wiki** - Markdown-based wiki with frontmatter metadata

## Features

### Core Capabilities

- **Document Ingestion** - Ingest markdown, PDF, HTML, text, and JSON documents
- **Automatic Wiki Generation** - Creates structured wiki pages with metadata and cross-references
- **Smart Linking** - Automatically links related pages using Claude AI
- **Full-Text Search** - Search wiki pages by content and metadata
- **Intelligent Querying** - Ask questions about your knowledge base with AI-powered answers
- **Health Checks** - Lint and validate your wiki for consistency and quality
- **Activity Logging** - Track all operations in an activity log

### CLI Commands

```bash
# Initialize a new knowledge base
npm run dev -- init --topic "Your Topic"

# Ingest a single document
npm run dev -- ingest path/to/document.md

# Batch ingest multiple documents
npm run dev -- ingest --batch "docs/**/*.md"

# Query the knowledge base
npm run dev -- query "What is X?"

# Run health checks
npm run dev -- lint --thorough

# List all pages
npm run dev -- list

# Show a specific page
npm run dev -- show page-id

# View the index
npm run dev -- index

# Check status
npm run dev -- status
```

### Web UI

Access the Next.js web interface to:
- Browse all wiki pages
- Search pages by keyword
- View page content with metadata
- See related pages and links

## Architecture

### Directory Structure

```
kb-agent/
├── src/
│   ├── cli/                 # CLI entry point
│   ├── agents/              # LLM agents (ingest, query, lint, etc.)
│   ├── services/            # Core services (wiki, state, file, LLM)
│   ├── types/               # TypeScript interfaces
│   └── orchestrator.ts      # Main orchestrator
├── ui/                      # Next.js web application
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── wiki/           # Wiki pages
│   │   └── ingest/         # Ingest interface
│   └── components/         # React components
└── README.md
```

### Knowledge Base Structure

```
your-kb/
├── raw/                    # Raw source documents
├── wiki/                   # Generated wiki pages (markdown)
│   ├── index.md           # Table of contents
│   ├── log.md             # Activity log
│   └── *.md               # Wiki pages
├── outputs/               # Query results and exports
├── .claude/               # Internal state
│   ├── state.json         # KB state
│   └── event_log.jsonl    # Event log
└── CLAUDE.md              # KB schema and guidelines
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- ANTHROPIC_API_KEY (Claude API key)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Quick Start

```bash
# Initialize a new knowledge base
npm run dev -- init --topic "My Knowledge Base"

# Ingest a document
npm run dev -- ingest path/to/document.md

# Query the knowledge base
npm run dev -- query "What does the document say about X?"

# Start the web UI (in another terminal)
cd ui
npm run dev
# Visit http://localhost:3000/wiki
```

## Configuration

### Environment Variables

```env
# Required
ANTHROPIC_API_KEY=your-api-key

# Optional
KB_ROOT=./my-kb                          # Knowledge base root directory
KB_MODEL=claude-sonnet-4-5-20250929     # Claude model to use
KB_TEMPERATURE=0.5                       # LLM temperature (0-1)
KB_MAX_TOKENS=4096                       # Max tokens per response
KB_TIMEOUT=30000                         # Request timeout in ms
```

### Knowledge Base Schema

Edit `CLAUDE.md` in your knowledge base to define:
- Organization structure
- Citation format
- Contradiction handling
- Custom guidelines for the AI

## How It Works

### Ingestion Pipeline

1. **Parse Document** - Extract content and metadata from source file
2. **Generate Page** - Create wiki page with frontmatter and content
3. **Link Pages** - Find and create cross-references to related pages
4. **Update Index** - Rebuild the table of contents
5. **Log Event** - Record the ingestion in the activity log

### Query Pipeline

1. **Retrieve Context** - Find relevant wiki pages
2. **Synthesize Answer** - Use Claude to generate an answer
3. **Cite Sources** - Include source pages in the response
4. **Identify Gaps** - Note missing information
5. **Log Query** - Record the query in the activity log

### Linting Pipeline

1. **Quick Checks** - Validate markdown, links, and metadata
2. **Thorough Checks** - Use Claude to detect contradictions
3. **Auto-Fix** - Optionally fix simple issues
4. **Suggest Articles** - Recommend new pages to create

## Development

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Run Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

### Lint

```bash
npm run lint
```

## API Routes

The Next.js backend provides REST APIs:

- `GET /api/wiki` - List all pages (with optional search/topic filters)
- `GET /api/wiki/[pageId]` - Get a specific page
- `POST /api/ingest` - Ingest a new document
- `POST /api/query` - Query the knowledge base

## Tech Stack

- **Backend**: Node.js, TypeScript, Claude API
- **Frontend**: Next.js 14, React, Tailwind CSS, Shadcn UI
- **Storage**: File system (markdown + JSON)
- **CLI**: Commander.js

## Contributing

This is a personal project. Feel free to fork and customize for your needs.

## License

MIT

## Support

For issues or questions, check the documentation or review the source code in the `src/` directory.
