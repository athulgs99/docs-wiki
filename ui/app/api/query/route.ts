import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '../../../lib/orchestrator';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      question: string;
      scope?: 'full' | 'topic' | 'page';
      topic?: string;
      pageId?: string;
      fileAnswer?: boolean;
    };

    if (!body.question?.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.query(body.question, {
      scope: body.scope,
      topic: body.topic,
      pageId: body.pageId,
      fileAnswer: body.fileAnswer,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
