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
      autoFix?: boolean;
      checkLevel?: 'quick' | 'thorough';
    };

    const orchestrator = getOrchestrator();
    const result = await orchestrator.lint({
      autoFix: body.autoFix,
      checkLevel: body.checkLevel ?? 'quick',
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
