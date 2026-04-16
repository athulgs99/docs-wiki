import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '../../../lib/orchestrator';
import path from 'path';
import fs from 'fs/promises';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

// PUT: upload a file into raw/ and return its path
export async function PUT(request: NextRequest) {
  try {
    const kbRoot = process.env.KB_ROOT;
    if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Sanitise the filename — strip any directory components
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._\-]/g, '_');
    const rawDir = path.join(kbRoot, 'raw');
    await fs.mkdir(rawDir, { recursive: true });

    const destPath = path.join(rawDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destPath, buffer);

    return NextResponse.json({
      name: safeName,
      path: destPath,
      relativePath: path.relative(kbRoot, destPath),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { filePath?: string; batch?: string[] };
    const orchestrator = getOrchestrator();
    const kbRoot = process.env.KB_ROOT!;

    if (body.batch && body.batch.length > 0) {
      const files = body.batch.map((f) =>
        path.isAbsolute(f) ? f : path.join(kbRoot, f)
      );
      const results = await orchestrator.ingestBatch(files);
      return NextResponse.json({ results });
    }

    if (!body.filePath) {
      return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
    }

    const resolvedPath = path.isAbsolute(body.filePath)
      ? body.filePath
      : path.join(kbRoot, body.filePath);

    const result = await orchestrator.ingest(resolvedPath);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET: list files in raw/ directory
export async function GET() {
  try {
    const kbRoot = process.env.KB_ROOT;
    if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
    const orchestrator = getOrchestrator();
    const rawDir = path.join(kbRoot, 'raw');
    const exists = await orchestrator.file.fileExists(rawDir);
    if (!exists) return NextResponse.json({ files: [] });
    const files = await orchestrator.file.listFiles(rawDir);
    return NextResponse.json({
      files: files.map((f) => ({
        name: path.basename(f),
        path: f,
        relativePath: path.relative(kbRoot, f),
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
