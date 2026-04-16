import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '../../../../lib/orchestrator';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string; batch?: string[] };
    const orchestrator = getOrchestrator();

    // Batch mode
    if (body.batch && body.batch.length > 0) {
      const results = [];
      for (const url of body.batch) {
        try {
          const r = await orchestrator.ingestUrl(url);
          results.push({ url, ...r });
        } catch (err) {
          results.push({ url, error: (err as Error).message });
        }
      }
      return NextResponse.json({ results });
    }

    if (!body.url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const result = await orchestrator.ingestUrl(body.url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
