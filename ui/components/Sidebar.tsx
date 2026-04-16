'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface KBStatus {
  pagesCount: number;
  lastIngest: string;
  config?: { model?: string };
}

const navItems = [
  { href: '/wiki',   label: 'Wiki',   icon: '📚' },
  { href: '/ingest', label: 'Ingest', icon: '📥' },
  { href: '/query',  label: 'Query',  icon: '🔍' },
  { href: '/lint',   label: 'Lint',   icon: '🔧' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<KBStatus | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setStatus(data as KBStatus))
      .catch(() => null);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>KB Agent</h1>
        <p>Knowledge Base</p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? ' active' : ''}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {status && (
        <div className="sidebar-footer">
          <div><span>{status.pagesCount}</span> pages</div>
          {status.lastIngest && (
            <div>Last ingest {new Date(status.lastIngest).toLocaleDateString()}</div>
          )}
          {status.config?.model && (
            <div title={status.config.model}>
              {status.config.model.split('-').slice(0, 2).join('-')}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
