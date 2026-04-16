import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '../../../lib/orchestrator';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

export async function GET(request: NextRequest) {
  try {
    const orchestrator = getOrchestrator();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const topic = searchParams.get('topic');

    let pages;
    if (topic) {
      pages = await orchestrator.wiki.getPagesByTopic(topic);
    } else if (search) {
      pages = await orchestrator.wiki.searchPages(search);
    } else {
      pages = await orchestrator.wiki.getAllPages();
    }

    return NextResponse.json(Array.isArray(pages) ? pages : []);
  } catch (err) {
    console.error('Wiki API error:', err);
    return NextResponse.json([], { status: 200 });
  }
}
