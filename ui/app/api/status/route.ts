import { NextResponse } from 'next/server';
import { Orchestrator } from '../../../lib/orchestrator';

function getOrchestrator() {
  const kbRoot = process.env.KB_ROOT;
  if (!kbRoot) throw new Error('KB_ROOT environment variable is not set');
  return new Orchestrator(kbRoot);
}

export async function GET() {
  try {
    const orchestrator = getOrchestrator();
    const state = await orchestrator.state.getState();
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
