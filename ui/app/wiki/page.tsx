'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { WikiPageView } from '../../components/WikiPageView';

interface WikiPage {
  slug: string;
  title: string;
  content: string;
  status: string;
  sourceCount: number;
  updated: string;
  inboundLinks: string[];
  outboundLinks: string[];
  frontmatter?: {
    source_url?: string;
    og_image?: string;
    site_name?: string;
    description?: string;
    favicon?: string;
  };
  sourceDocuments?: string[];
}

export default function WikiPage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selected, setSelected] = useState<WikiPage | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPages = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q ? `/api/wiki?search=${encodeURIComponent(q)}` : '/api/wiki';
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data) ? data as WikiPage[] : [];
      setPages(list);
      if (!q && list.length > 0 && !selected) setSelected(list[0]);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { fetchPages(); }, []);

  useEffect(() => {
    const t = setTimeout(() => { fetchPages(search || undefined); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="wiki-layout">
      {/* Page list */}
      <div className="wiki-list">
        <div className="wiki-list-header">
          <input
            className="kb-input"
            type="text"
            placeholder="Search pages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="wiki-list-items">
          {loading && (
            <div style={{ padding: '16px', fontSize: '12px', color: '#52525b' }}>Loading...</div>
          )}
          {!loading && pages.length === 0 && (
            <div className="empty-state">
              <span className="icon">📭</span>
              <p>No pages yet</p>
              <Link href="/ingest">Ingest a document →</Link>
            </div>
          )}
          {pages.map((page) => (
            <button
              key={page.slug}
              onClick={() => setSelected(page)}
              className={`wiki-list-item${selected?.slug === page.slug ? ' selected' : ''}`}
            >
              <div className="item-title">{page.title}</div>
              <div className="item-slug">{page.slug}</div>
            </button>
          ))}
        </div>

        <div className="wiki-list-footer">{pages.length} page{pages.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Content */}
      <div className="wiki-content">
        {selected ? (
          <WikiPageView page={selected} />
        ) : (
          <div className="empty-state">
            <span className="icon">👈</span>
            <p>Select a page to read</p>
          </div>
        )}
      </div>
    </div>
  );
}
