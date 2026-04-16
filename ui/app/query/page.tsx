'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface QueryResult {
  answer: string;
  sources: Array<{
    pageId: string;
    title: string;
    relevance: 'high' | 'medium' | 'low';
  }>;
  confidence: 'high' | 'medium' | 'low';
  gaps: string[];
}

interface PageSummary {
  slug: string;
  title: string;
  frontmatter?: { site_name?: string; favicon?: string };
}

type Scope = 'full' | 'topic' | 'page';

export default function QueryPage() {
  const [question, setQuestion] = useState('');
  const [scope, setScope] = useState<Scope>('full');
  const [topic, setTopic] = useState('');
  const [pageId, setPageId] = useState('');
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [fileAnswer, setFileAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');

  // Load ingested pages for the dropdown
  useEffect(() => {
    fetch('/api/wiki')
      .then((r) => r.json())
      .then((d) => {
        const list = (Array.isArray(d) ? d : []) as PageSummary[];
        setPages(list);
      })
      .catch(() => setPages([]));
  }, []);

  const handleQuery = async () => {
    if (!question.trim()) return;
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          scope,
          topic: scope === 'topic' ? topic : undefined,
          pageId: scope === 'page' ? pageId : undefined,
          fileAnswer,
        }),
      });
      const data = (await res.json()) as QueryResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedPage = pages.find((p) => p.slug === pageId);

  return (
    <>
      <div className="page-header">
        <h1>Query</h1>
        <p>Ask a question about your knowledge base</p>
      </div>

      <div className="page-body">
        <textarea
          className="kb-textarea"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            scope === 'page' && selectedPage
              ? `Ask about "${selectedPage.title}"…`
              : 'What is scaling law? How does chinchilla differ from GPT-4?'
          }
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleQuery();
          }}
        />

        {/* Scope toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
          <div className="tab-row" style={{ marginBottom: 0 }}>
            <button className={`btn-ghost${scope === 'full' ? ' active' : ''}`} onClick={() => setScope('full')}>
              Full KB
            </button>
            <button className={`btn-ghost${scope === 'topic' ? ' active' : ''}`} onClick={() => setScope('topic')}>
              By topic
            </button>
            <button className={`btn-ghost${scope === 'page' ? ' active' : ''}`} onClick={() => setScope('page')}>
              By page
            </button>
          </div>

          {scope === 'topic' && (
            <input
              className="kb-input"
              style={{ width: 'auto', flex: 1, maxWidth: 240 }}
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic name..."
            />
          )}

          {scope === 'page' && (
            <select
              className="kb-select"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
            >
              <option value="">— Select a page —</option>
              {pages.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#a1a1aa', marginLeft: 'auto', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={fileAnswer}
              onChange={(e) => setFileAnswer(e.target.checked)}
            />
            Save to outputs/
          </label>
        </div>

        {/* Page preview chip when scoped to a page */}
        {scope === 'page' && selectedPage && (
          <div className="query-page-chip">
            {selectedPage.frontmatter?.favicon && (
              <img src={selectedPage.frontmatter.favicon} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div>
              <div className="query-page-chip-title">{selectedPage.title}</div>
              {selectedPage.frontmatter?.site_name && (
                <div className="query-page-chip-site">{selectedPage.frontmatter.site_name}</div>
              )}
            </div>
            <Link href={`/wiki/${selectedPage.slug}`} className="query-page-chip-link">View →</Link>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button
            className="btn-primary"
            onClick={handleQuery}
            disabled={loading || !question.trim() || (scope === 'page' && !pageId)}
          >
            {loading ? 'Thinking…' : 'Ask'}
          </button>
          <span style={{ fontSize: 11, color: '#52525b' }}>⌘+Enter</span>
        </div>

        {error && <div className="error-box">{error}</div>}

        {result && (
          <div style={{ marginTop: 28 }}>
            <div className="confidence-bar">
              <h2>Answer</h2>
              <span className={`badge badge-${result.confidence === 'high' ? 'high' : result.confidence === 'medium' ? 'medium' : 'low'}`}>
                {result.confidence} confidence
              </span>
            </div>

            <div className="answer-box">
              <div className="kb-prose">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
              </div>
            </div>

            {result.sources.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className="section-label">Sources used</div>
                <div className="source-chips">
                  {result.sources.map((s) => (
                    <Link key={s.pageId} href={`/wiki/${s.pageId}`} className="source-chip">
                      <span className="source-chip-title">{s.title}</span>
                      <span className={`badge badge-${s.relevance}`}>{s.relevance}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {result.gaps.length > 0 && (
              <div className="gaps-box">
                <h3>Knowledge gaps</h3>
                <ul>
                  {result.gaps.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
            )}

            {fileAnswer && <p style={{ fontSize: 11, color: '#52525b', marginTop: 12 }}>✓ Answer saved to outputs/</p>}
          </div>
        )}
      </div>
    </>
  );
}
