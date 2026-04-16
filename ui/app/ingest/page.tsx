'use client';

import { useEffect, useRef, useState } from 'react';

interface RawFile { name: string; path: string; relativePath: string; }
interface IngestResult { pageId: string; pageTitle: string; summary: string; keyTakeaways: string[]; topics: string[]; }

type InputType = 'file' | 'url';
type Mode = 'single' | 'batch';

export default function IngestPage() {
  const [inputType, setInputType] = useState<InputType>('file');
  const [mode, setMode] = useState<Mode>('single');

  // File mode state
  const [rawFiles, setRawFiles] = useState<RawFile[]>([]);
  const [filePath, setFilePath] = useState('');
  const [batchPaths, setBatchPaths] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL mode state
  const [url, setUrl] = useState('');
  const [batchUrls, setBatchUrls] = useState('');

  // Shared
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [batchResults, setBatchResults] = useState<Array<IngestResult & { error?: string; url?: string }> | null>(null);
  const [error, setError] = useState('');

  const refreshRawFiles = () => {
    fetch('/api/ingest').then((r) => r.json())
      .then((d) => setRawFiles((d as { files: RawFile[] }).files ?? []))
      .catch(() => null);
  };

  useEffect(() => { refreshRawFiles(); }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/ingest', { method: 'PUT', body: fd });
      const d = await res.json() as RawFile & { error?: string };
      if (d.error) throw new Error(d.error);
      refreshRawFiles();
      if (mode === 'single') {
        setFilePath(d.relativePath);
      } else {
        const next = new Set(selected);
        next.add(d.relativePath);
        setSelected(next);
        setBatchPaths([...next].join('\n'));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (mode === 'batch') Promise.all(Array.from(files).map(uploadFile));
    else uploadFile(files[0]);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    if (mode === 'batch') Promise.all(files.map(uploadFile));
    else uploadFile(files[0]);
  };

  const toggleSelect = (p: string) => {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p); else next.add(p);
    setSelected(next);
    setBatchPaths([...next].join('\n'));
  };

  const handleIngest = async () => {
    setError(''); setResult(null); setBatchResults(null); setLoading(true);
    try {
      if (inputType === 'url') {
        if (mode === 'batch') {
          const urls = batchUrls.split('\n').map((u) => u.trim()).filter(Boolean);
          if (!urls.length) { setError('Enter at least one URL'); setLoading(false); return; }
          const res = await fetch('/api/ingest/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: urls }) });
          const d = await res.json() as { results?: Array<IngestResult & { error?: string; url?: string }>; error?: string };
          if (d.error) throw new Error(d.error);
          setBatchResults(d.results ?? []);
        } else {
          if (!url.trim()) { setError('Enter a URL'); setLoading(false); return; }
          const res = await fetch('/api/ingest/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
          const d = await res.json() as IngestResult & { error?: string };
          if (d.error) throw new Error(d.error);
          setResult(d);
        }
      } else {
        if (mode === 'batch') {
          const paths = batchPaths.split('\n').map((p) => p.trim()).filter(Boolean);
          if (!paths.length) { setError('Select or enter at least one file'); setLoading(false); return; }
          const res = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch: paths }) });
          const d = await res.json() as { results?: IngestResult[]; error?: string };
          if (d.error) throw new Error(d.error);
          setBatchResults(d.results ?? []);
        } else {
          if (!filePath.trim()) { setError('Select or enter a file path'); setLoading(false); return; }
          const res = await fetch('/api/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: filePath.trim() }) });
          const d = await res.json() as IngestResult & { error?: string };
          if (d.error) throw new Error(d.error);
          setResult(d);
        }
      }
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="page-header">
        <h1>Ingest</h1>
        <p>Add source documents to the knowledge base</p>
      </div>

      <div className="page-body">
        {/* Input-type switcher */}
        <div className="tab-row">
          <button className={`btn-ghost${inputType === 'file' ? ' active' : ''}`} onClick={() => setInputType('file')}>📄 File</button>
          <button className={`btn-ghost${inputType === 'url' ? ' active' : ''}`} onClick={() => setInputType('url')}>🔗 URL</button>
        </div>

        {/* Single / Batch toggle */}
        <div className="tab-row" style={{ marginBottom: 20 }}>
          <button className={`btn-ghost${mode === 'single' ? ' active' : ''}`} onClick={() => setMode('single')}>Single</button>
          <button className={`btn-ghost${mode === 'batch' ? ' active' : ''}`} onClick={() => setMode('batch')}>Batch</button>
        </div>

        {inputType === 'file' ? (
          <>
            <div
              className={`upload-zone${dragOver ? ' drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} multiple={mode === 'batch'}
                accept=".md,.txt,.pdf,.doc,.docx,.html,.json,.csv,.rst" onChange={handleFilePick} />
              <div className="upload-zone-icon">{uploading ? '⏳' : '📂'}</div>
              <div className="upload-zone-text">
                {uploading ? 'Uploading…' : dragOver ? 'Drop to upload'
                  : mode === 'batch' ? 'Click or drag files here to upload' : 'Click or drag a file here to upload'}
              </div>
              <div className="upload-zone-hint">Supports .md · .txt · .pdf · .doc · .html · .json · .csv</div>
            </div>

            <div className="or-divider"><span>or enter path manually</span></div>

            {mode === 'single' ? (
              <div>
                <label className="kb-label">File path</label>
                <input className="kb-input" style={{ fontFamily: 'monospace' }} value={filePath} onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/file.md  or  raw/paper.pdf" onKeyDown={(e) => e.key === 'Enter' && handleIngest()} />
              </div>
            ) : (
              <div>
                <label className="kb-label">File paths (one per line)</label>
                <textarea className="kb-textarea" style={{ fontFamily: 'monospace' }} value={batchPaths} onChange={(e) => setBatchPaths(e.target.value)}
                  placeholder={'raw/paper1.md\nraw/paper2.pdf'} rows={4} />
              </div>
            )}

            {rawFiles.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className="kb-label">Files in raw/ — click to select</div>
                <div className="file-list">
                  {rawFiles.map((f) => (
                    <button key={f.path} onClick={() => mode === 'single' ? setFilePath(f.relativePath) : toggleSelect(f.relativePath)}
                      className={`file-item${(mode === 'single' && filePath === f.relativePath) || (mode === 'batch' && selected.has(f.relativePath)) ? ' selected' : ''}`}>
                      {mode === 'batch' && (
                        <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${selected.has(f.relativePath) ? '#2563eb' : '#3f3f46'}`,
                          background: selected.has(f.relativePath) ? '#2563eb' : 'transparent', flexShrink: 0, display: 'inline-block' }} />
                      )}
                      <span className="file-name">{f.name}</span>
                      <span className="file-path">{f.relativePath}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          // URL mode
          <>
            <div className="url-intro">
              <div className="url-intro-icon">🔗</div>
              <div>
                <div className="url-intro-title">Ingest from the web</div>
                <div className="url-intro-text">
                  Paste any URL — an article, doc, blog post. I&apos;ll fetch it, extract the content, and turn it into a wiki page with summary, takeaways, and source attribution.
                </div>
              </div>
            </div>

            {mode === 'single' ? (
              <div>
                <label className="kb-label">URL</label>
                <input className="kb-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article" onKeyDown={(e) => e.key === 'Enter' && handleIngest()} />
              </div>
            ) : (
              <div>
                <label className="kb-label">URLs (one per line)</label>
                <textarea className="kb-textarea" value={batchUrls} onChange={(e) => setBatchUrls(e.target.value)}
                  placeholder={'https://example.com/article1\nhttps://example.com/article2'} rows={5} />
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="btn-primary" onClick={handleIngest} disabled={loading || uploading}>
            {loading
              ? (inputType === 'url' ? 'Fetching & ingesting…' : 'Ingesting…')
              : mode === 'batch' ? 'Ingest all' : 'Ingest'}
          </button>
        </div>

        {error && <div className="error-box">{error}</div>}

        {result && (
          <div className="ingest-result">
            <div className="ingest-result-header">
              <h2>{result.pageTitle}</h2>
              <span className="success-label">✓ Ingested</span>
            </div>
            <p style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 12 }}>{result.summary}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {result.topics.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
            <ul style={{ paddingLeft: '1.2em', fontSize: 13, color: '#71717a', lineHeight: 1.7 }}>
              {result.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            <a href={`/wiki/${result.pageId}`} style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: '#60a5fa' }}>View page →</a>
          </div>
        )}

        {batchResults && (
          <div style={{ marginTop: 20 }}>
            <div className="section-label">{batchResults.filter((r) => r && !r.error).length} / {batchResults.length} ingested</div>
            {batchResults.map((r, i) => (
              <div key={r?.pageId ?? i} className="kb-card" style={{ marginBottom: 8, borderColor: r?.error ? '#7f1d1d' : '#27272a' }}>
                {r?.error ? (
                  <>
                    <div style={{ fontSize: 12, color: '#f87171' }}>{r.url ?? 'Failed'}</div>
                    <div style={{ fontSize: 11, color: '#71717a', marginTop: 2 }}>{r.error}</div>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{r.pageTitle}</div>
                      <div style={{ fontSize: 12, color: '#52525b', marginTop: 4 }}>{r.topics?.join(', ')}</div>
                    </div>
                    <a href={`/wiki/${r.pageId}`} style={{ fontSize: 12, color: '#60a5fa' }}>View →</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
