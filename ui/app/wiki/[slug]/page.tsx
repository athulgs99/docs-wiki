'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { WikiPageView } from '../../../components/WikiPageView';
import Link from 'next/link';

interface WikiPage {
  slug: string;
  title: string;
  content: string;
  status: string;
  sourceCount: number;
  updated: string;
  inboundLinks: string[];
  outboundLinks: string[];
}

export default function WikiPageDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/wiki/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setPage(data as WikiPage); })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-600 p-12">Loading...</div>;
  if (notFound) return (
    <div className="flex flex-col items-center justify-center h-full p-12 gap-3">
      <p className="text-zinc-400">Page not found: <code className="text-zinc-300">{slug}</code></p>
      <Link href="/wiki" className="text-blue-400 text-sm hover:underline">← Back to wiki</Link>
    </div>
  );
  if (!page) return null;

  return (
    <div className="h-screen flex flex-col">
      <div className="px-8 py-3 border-b border-zinc-800 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/wiki" className="hover:text-zinc-300">Wiki</Link>
        <span>/</span>
        <span className="text-zinc-300">{page.title}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <WikiPageView page={page} />
      </div>
    </div>
  );
}
