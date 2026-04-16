import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '../../../../lib/orchestrator';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const orchestrator = getOrchestrator();
    const page = await orchestrator.wiki.getPage(params.slug);
    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
