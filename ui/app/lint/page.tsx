'use client';

import { useState } from 'react';

interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  pageId: string;
  lineNumber?: number;
  description: string;
  suggestedFix?: string;
}

interface LintResult {
  timestamp: string;
  totalPages: number;
  issues: Issue[];
  summary: { errors: number; warnings: number; info: number };
  suggestedArticles: Array<{ topic: string; reason: string; suggestedPages: string[] }>;
  autoFixedCount: number;
}

const severityColors = {
  error: 'text-red-400 bg-red-950/60 border-red-900',
  warning: 'text-yellow-400 bg-yellow-950/60 border-yellow-900',
  info: 'text-blue-400 bg-blue-950/60 border-blue-900',
};

const severityIcons = { error: '❌', warning: '⚠️', info: 'ℹ️' };

const typeLabels: Record<string, string> = {
  broken_link: 'Broken link',
  contradiction: 'Contradiction',
  unsourced_claim: 'Unsourced claim',
  orphaned_page: 'Orphaned page',
  duplicate: 'Duplicate',
};

export default function LintPage() {
  const [checkLevel, setCheckLevel] = useState<'quick' | 'thorough'>('quick');
  const [autoFix, setAutoFix] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LintResult | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const handleLint = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkLevel, autoFix }),
      });
      const data = await res.json() as LintResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = result?.issues.filter(
    (i) => filter === 'all' || i.severity === filter
  ) ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-1">Lint</h1>
      <p className="text-sm text-zinc-500 mb-6">Health check your knowledge base</p>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap mb-6">
        <div className="flex gap-2">
          {(['quick', 'thorough'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setCheckLevel(level)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                checkLevel === level ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {level === 'quick' ? '⚡ Quick' : '🔬 Thorough'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoFix}
            onChange={(e) => setAutoFix(e.target.checked)}
          />
          Auto-fix simple issues
        </label>

        <button
          onClick={handleLint}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          {loading ? 'Running...' : 'Run Lint'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950 border border-red-800 rounded-md text-sm text-red-300 mb-4">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex gap-4 flex-wrap">
            {[
              { label: 'Errors', count: result.summary.errors, color: 'text-red-400' },
              { label: 'Warnings', count: result.summary.warnings, color: 'text-yellow-400' },
              { label: 'Info', count: result.summary.info, color: 'text-blue-400' },
              { label: 'Pages', count: result.totalPages, color: 'text-zinc-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 min-w-24">
                <p className={`text-xl font-bold ${color}`}>{count}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            ))}
            {result.autoFixedCount > 0 && (
              <div className="bg-green-950 border border-green-900 rounded-lg px-4 py-3 min-w-24">
                <p className="text-xl font-bold text-green-400">{result.autoFixedCount}</p>
                <p className="text-xs text-green-600">Auto-fixed</p>
              </div>
            )}
          </div>

          {/* Filter tabs */}
          {result.issues.length > 0 && (
            <>
              <div className="flex gap-2">
                {(['all', 'error', 'warning', 'info'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      filter === f ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? `All (${result.issues.length})` : f}
                  </button>
                ))}
              </div>

              {/* Issues list */}
              <div className="space-y-2">
                {filteredIssues.map((issue, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg px-4 py-3 ${severityColors[issue.severity]}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm shrink-0">{severityIcons[issue.severity]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium opacity-80">
                            {typeLabels[issue.type] ?? issue.type}
                          </span>
                          <code className="text-xs opacity-60 font-mono">{issue.pageId}</code>
                          {issue.lineNumber && (
                            <span className="text-xs opacity-50">line {issue.lineNumber}</span>
                          )}
                        </div>
                        <p className="text-xs mt-1 opacity-90">{issue.description}</p>
                        {issue.suggestedFix && (
                          <p className="text-xs mt-1 opacity-60">Fix: {issue.suggestedFix}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {result.issues.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm">No issues found</p>
            </div>
          )}

          {/* Suggested articles */}
          {result.suggestedArticles.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Suggested new articles</h2>
              <div className="space-y-2">
                {result.suggestedArticles.map((s, i) => (
                  <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <p className="text-sm font-medium text-zinc-200">📝 {s.topic}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.reason}</p>
                    {s.suggestedPages.length > 0 && (
                      <p className="text-xs text-zinc-600 mt-1">Mentioned in: {s.suggestedPages.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-zinc-600">
            Ran {new Date(result.timestamp).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
