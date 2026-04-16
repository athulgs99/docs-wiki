#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { Orchestrator } from '../orchestrator';

const program = new Command()
  .name('kb')
  .description('Knowledge Base Agent System')
  .version('1.0.0');

// ─── init ────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a new knowledge base')
  .option('--topic <topic>', 'Primary topic for this KB')
  .option('--root <path>', 'Root directory', '.')
  .action(async (options) => {
    const root = path.resolve(options.root);
    const dirs = ['raw', 'wiki', 'outputs', '.claude'];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    }

    // Create CLAUDE.md schema template
    const schemaPath = path.join(root, 'CLAUDE.md');
    if (!fs.existsSync(schemaPath)) {
      const topic = options.topic ?? 'General Research';
      fs.writeFileSync(schemaPath, `# Knowledge Base Schema\n\n**Topic**: ${topic}\n\n## Organization\n- Group pages by topic\n- Use [[backlinks]] for cross-references\n- Cite all claims as [Source: filename]\n\n## Citation Format\n[Source: filename.md]\n\n## Contradiction Handling\nWhen sources contradict, note both views and flag for review.\n`);
    }

    // Create empty log
    const logPath = path.join(root, 'wiki', 'log.md');
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '# Activity Log\n\n');
    }

    console.log(`✅ Knowledge base initialized at: ${root}`);
    console.log('   Drop source documents into the raw/ folder');
    console.log('   Edit CLAUDE.md to customize the schema');
  });

// ─── ingest ──────────────────────────────────────────────────────────────────

program
  .command('ingest [source]')
  .description('Ingest a source document into the knowledge base')
  .option('-b, --batch <pattern>', 'Batch ingest files matching a glob pattern')
  .option('-s, --supervised', 'Show preview before committing')
  .action(async (source, options) => {
    const orchestrator = new Orchestrator(process.cwd());

    if (options.batch) {
      // Batch mode
      const { globSync } = await import('glob');
      const files = globSync(options.batch);
      if (files.length === 0) {
        console.error(`No files matched pattern: ${options.batch}`);
        process.exit(1);
      }
      console.log(`Ingesting ${files.length} files...`);
      const results = await orchestrator.ingestBatch(files, { supervised: options.supervised });
      console.log(`✅ Ingested ${results.filter(Boolean).length}/${files.length} files`);
    } else if (source) {
      const result = await orchestrator.ingest(source, { supervised: options.supervised });
      if (result) {
        console.log(`✅ Ingested: ${result.pageTitle}`);
        console.log(`   Page ID : ${result.pageId}`);
        console.log(`   Topics  : ${result.topics.join(', ')}`);
        console.log(`   Summary : ${result.summary}`);
      }
    } else {
      console.error('Provide a source file or --batch pattern');
      process.exit(1);
    }
  });

// ─── query ───────────────────────────────────────────────────────────────────

program
  .command('query <question>')
  .description('Ask a question about the knowledge base')
  .option('--scope <scope>', 'Query scope: full|topic', 'full')
  .option('--topic <topic>', 'Topic to query within')
  .option('--file', 'Save answer to outputs/')
  .action(async (question, options) => {
    const orchestrator = new Orchestrator(process.cwd());
    const result = await orchestrator.query(question, {
      scope: options.scope,
      topic: options.topic,
      fileAnswer: options.file,
    });

    if (!result) {
      console.error('No result returned');
      process.exit(1);
    }

    console.log('\n' + result.answer);
    console.log(`\nConfidence: ${result.confidence.toUpperCase()}`);
    if (result.sources.length > 0) {
      console.log(`Sources: ${result.sources.map((s) => s.title).join(', ')}`);
    }
    if (result.gaps.length > 0) {
      console.log(`Gaps: ${result.gaps.join('; ')}`);
    }
    if (options.file) {
      console.log('\n✅ Answer saved to outputs/');
    }
  });

// ─── lint ────────────────────────────────────────────────────────────────────

program
  .command('lint')
  .description('Run health check on the wiki')
  .option('--fix', 'Auto-fix simple issues')
  .option('--thorough', 'Run detailed checks (slower, uses LLM for contradictions)')
  .action(async (options) => {
    const orchestrator = new Orchestrator(process.cwd());
    const result = await orchestrator.lint({
      autoFix: options.fix,
      checkLevel: options.thorough ? 'thorough' : 'quick',
    });

    if (!result) {
      console.error('Lint failed');
      process.exit(1);
    }

    console.log(`\n📋 Lint Report — ${result.totalPages} pages checked`);
    console.log(`   Errors   : ${result.summary.errors}`);
    console.log(`   Warnings : ${result.summary.warnings}`);
    console.log(`   Info     : ${result.summary.info}`);

    if (result.issues.length > 0) {
      console.log('\nIssues:');
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️ ' : 'ℹ️ ';
        console.log(`  ${icon} [${issue.pageId}] ${issue.description}`);
        if (issue.suggestedFix) console.log(`      Fix: ${issue.suggestedFix}`);
      }
    }

    if (result.suggestedArticles.length > 0) {
      console.log('\nSuggested new articles:');
      for (const s of result.suggestedArticles) {
        console.log(`  📝 ${s.topic}: ${s.reason}`);
      }
    }

    if (options.fix && result.autoFixedCount > 0) {
      console.log(`\n✅ Auto-fixed ${result.autoFixedCount} issues`);
    }
  });

// ─── list ────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all wiki pages')
  .option('--topic <topic>', 'Filter by topic')
  .action(async (options) => {
    const orchestrator = new Orchestrator(process.cwd());
    const pages = options.topic
      ? await orchestrator.wiki.getPagesByTopic(options.topic)
      : await orchestrator.wiki.getAllPages();

    if (pages.length === 0) {
      console.log('No pages found.');
      return;
    }

    console.log(`\n📚 ${pages.length} page(s):\n`);
    for (const p of pages) {
      console.log(`  ${p.slug.padEnd(30)} ${p.title}`);
    }
  });

// ─── show ────────────────────────────────────────────────────────────────────

program
  .command('show <pageId>')
  .description('Display a wiki page')
  .action(async (pageId) => {
    const orchestrator = new Orchestrator(process.cwd());
    const page = await orchestrator.wiki.getPage(pageId);
    if (!page) {
      console.error(`Page not found: ${pageId}`);
      process.exit(1);
    }
    console.log(`\n# ${page.title}\n`);
    console.log(page.content);
    console.log(`\n---`);
    console.log(`Status: ${page.status} | Sources: ${page.sourceCount} | Updated: ${page.updated}`);
  });

// ─── index ───────────────────────────────────────────────────────────────────

program
  .command('index')
  .description('Show the knowledge base table of contents')
  .action(async () => {
    const orchestrator = new Orchestrator(process.cwd());
    const indexPath = path.join(orchestrator.kbRootDir, 'wiki', 'index.md');
    const exists = await orchestrator.file.fileExists(indexPath);
    if (!exists) {
      console.log('No index found. Run `kb ingest` first.');
      return;
    }
    const content = await orchestrator.file.readFile(indexPath);
    console.log(content);
  });

// ─── log ─────────────────────────────────────────────────────────────────────

program
  .command('log')
  .description('Show activity log')
  .option('--lines <n>', 'Number of recent lines to show', '50')
  .action(async (options) => {
    const orchestrator = new Orchestrator(process.cwd());
    const logPath = path.join(orchestrator.kbRootDir, 'wiki', 'log.md');
    const exists = await orchestrator.file.fileExists(logPath);
    if (!exists) {
      console.log('No activity log found.');
      return;
    }
    const content = await orchestrator.file.readFile(logPath);
    const lines = content.split('\n');
    const n = parseInt(options.lines, 10);
    console.log(lines.slice(-n).join('\n'));
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show knowledge base statistics')
  .action(async () => {
    const orchestrator = new Orchestrator(process.cwd());
    const state = await orchestrator.state.getState();
    const tokenStats = await orchestrator.wiki.getAllPages();

    console.log('\n📊 Knowledge Base Status');
    console.log(`   Pages          : ${state.pagesCount}`);
    console.log(`   Docs processed : ${state.documentsProcessed.length}`);
    console.log(`   Last ingest    : ${state.lastIngest || 'never'}`);
    console.log(`   Last query     : ${state.lastQuery || 'never'}`);
    console.log(`   Last lint      : ${state.lastLint || 'never'}`);
    console.log(`   Model          : ${state.config.model ?? 'claude-sonnet-4-5-20250929'}`);
  });

program.parse(process.argv);
