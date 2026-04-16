'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface WikiPage {
  slug: string;
  title: string;
  content: string;
  status: string;
  sourceCount: number;
  updated: string;
  created?: string;
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

function processBacklinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, slug) => `[${slug}](/wiki/${slug})`);
}

const statusClass: Record<string, string> = {
  draft: 'badge badge-draft',
  reviewed: 'badge badge-reviewed',
  needs_update: 'badge badge-needs-update',
};

/** Parse the generated wiki markdown into structured sections. */
function parseSections(content: string): {
  overview: string;
  takeaways: string[];
  topics: string[];
  other: string; // anything beyond recognised sections
} {
  const sections: Record<string, string> = {};
  let current = '_intro';
  sections[current] = '';

  for (const line of content.split('\n')) {
    const h = line.match(/^##\s+(.+)\s*$/);
    if (h) {
      current = h[1].trim().toLowerCase();
      sections[current] = '';
      continue;
    }
    sections[current] = (sections[current] ?? '') + line + '\n';
  }

  const overview = (sections['overview'] ?? '').trim();

  const takeawaysRaw = (sections['key takeaways'] ?? sections['takeaways'] ?? '').trim();
  const takeaways = takeawaysRaw
    .split('\n')
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  const topicsRaw = (sections['topics'] ?? '').trim();
  const topics = topicsRaw
    .split(/[,\n]/)
    .map((t) => t.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);

  // Collect any sections other than the 4 known ones
  const known = new Set(['_intro', 'overview', 'key takeaways', 'takeaways', 'topics', 'related']);
  let other = '';
  for (const [name, body] of Object.entries(sections)) {
    if (known.has(name)) continue;
    other += `## ${name[0].toUpperCase() + name.slice(1)}\n${body}\n`;
  }

  return { overview, takeaways, topics, other };
}

function hostFromUrl(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function WikiPageView({ page }: { page: WikiPage }) {
  const [imgOk, setImgOk] = useState(true);
  const [faviconOk, setFaviconOk] = useState(true);

  const { overview, takeaways, topics, other } = parseSections(page.content);
  const fm = page.frontmatter ?? {};

  return (
    <div className="wiki-page-root">
      {/* Hero image from OG */}
      {fm.og_image && imgOk && (
        <div className="wiki-hero">
          <img src={fm.og_image} alt={page.title} onError={() => setImgOk(false)} />
          <div className="wiki-hero-overlay" />
        </div>
      )}

      <div className="wiki-page-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          {fm.site_name && (
            <div className="wiki-site-chip">
              {fm.favicon && faviconOk && (
                <img src={fm.favicon} alt="" onError={() => setFaviconOk(false)} />
              )}
              <span>{fm.site_name}</span>
            </div>
          )}
          <h1>{page.title}</h1>
          {fm.description && <p className="wiki-page-description">{fm.description}</p>}
          <div className="wiki-page-meta">
            <span>{page.sourceCount} source{page.sourceCount !== 1 ? 's' : ''}</span>
            <span>Updated {new Date(page.updated).toLocaleDateString()}</span>
            <span style={{ fontFamily: 'monospace', color: '#3f3f46' }}>{page.slug}</span>
          </div>
        </div>
        <span className={statusClass[page.status] ?? 'badge'}>{page.status}</span>
      </div>

      <div className="wiki-page-body">
        {/* Source URL card */}
        {fm.source_url && (
          <a href={fm.source_url} target="_blank" rel="noopener noreferrer" className="wiki-source-card">
            <div className="wiki-source-card-left">
              {fm.favicon && faviconOk ? (
                <img src={fm.favicon} alt="" className="wiki-source-favicon" onError={() => setFaviconOk(false)} />
              ) : (
                <div className="wiki-source-fallback">🔗</div>
              )}
            </div>
            <div className="wiki-source-card-mid">
              <div className="wiki-source-label">Source</div>
              <div className="wiki-source-host">{hostFromUrl(fm.source_url)}</div>
              <div className="wiki-source-url">{fm.source_url}</div>
            </div>
            <div className="wiki-source-card-arrow">→</div>
          </a>
        )}

        {/* Overview lead paragraph */}
        {overview && (
          <section className="wiki-section">
            <h2 className="wiki-section-title">Overview</h2>
            <div className="wiki-lead">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p>{children}</p> }}>
                {processBacklinks(overview)}
              </ReactMarkdown>
            </div>
          </section>
        )}

        {/* Key takeaways as cards */}
        {takeaways.length > 0 && (
          <section className="wiki-section">
            <h2 className="wiki-section-title">Key Takeaways</h2>
            <div className="takeaway-grid">
              {takeaways.map((t, i) => (
                <div key={i} className="takeaway-card">
                  <div className="takeaway-number">{String(i + 1).padStart(2, '0')}</div>
                  <div className="takeaway-text">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{ p: ({ children }) => <span>{children}</span> }}
                    >
                      {processBacklinks(t)}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Topics as chips */}
        {topics.length > 0 && (
          <section className="wiki-section">
            <h2 className="wiki-section-title">Topics</h2>
            <div className="topic-chips">
              {topics.map((t) => (
                <span key={t} className="topic-chip">{t}</span>
              ))}
            </div>
          </section>
        )}

        {/* Any remaining sections */}
        {other.trim() && (
          <section className="wiki-section">
            <div className="kb-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ a: ({ href, children }) => <Link href={href ?? '#'}>{children}</Link> }}
              >
                {processBacklinks(other)}
              </ReactMarkdown>
            </div>
          </section>
        )}
      </div>

      {(page.inboundLinks.length > 0 || page.outboundLinks.length > 0) && (
        <div className="wiki-backlinks">
          {page.inboundLinks.length > 0 && (
            <div>
              <div className="backlink-group-label">Linked from</div>
              {page.inboundLinks.map((link) => (
                <Link key={link} href={`/wiki/${link}`} className="backlink-tag">{link}</Link>
              ))}
            </div>
          )}
          {page.outboundLinks.length > 0 && (
            <div>
              <div className="backlink-group-label">Links to</div>
              {page.outboundLinks.map((link) => (
                <Link key={link} href={`/wiki/${link}`} className="backlink-tag">{link}</Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
