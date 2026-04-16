/**
 * Fetches a URL and extracts metadata + main text content.
 * Uses regex-based parsing to avoid heavy dependencies.
 */

export interface FetchedUrl {
  url: string;
  title: string;
  description: string;
  siteName: string;
  ogImage: string;
  favicon: string;
  author: string;
  publishedDate: string;
  mainText: string;
  rawHtml: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function extractMeta(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1].trim());
  }
  return '';
}

function stripTags(html: string): string {
  // Remove script/style/nav/header/footer/aside blocks entirely
  html = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Remove all remaining tags
  html = html.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  html = html.replace(/\s+/g, ' ').trim();
  return decodeEntities(html);
}

function extractMainContent(html: string): string {
  // Prefer <article>, then <main>, then <body>
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return stripTags(articleMatch[1]);

  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return stripTags(mainMatch[1]);

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return stripTags(bodyMatch[1]);

  return stripTags(html);
}

export async function fetchUrl(url: string, timeoutMs = 15000): Promise<FetchedUrl> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    html = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const parsedUrl = new URL(url);
  const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

  const title =
    extractMeta(html, [
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]) || parsedUrl.hostname;

  const description = extractMeta(html, [
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
  ]);

  const siteName =
    extractMeta(html, [
      /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i,
    ]) || parsedUrl.hostname.replace(/^www\./, '');

  let ogImage = extractMeta(html, [
    /<meta\s+property=["']og:image:secure_url["']\s+content=["']([^"']+)["']/i,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i,
  ]);
  if (ogImage && ogImage.startsWith('/')) ogImage = origin + ogImage;

  let favicon = extractMeta(html, [
    /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i,
  ]);
  if (!favicon) favicon = `${origin}/favicon.ico`;
  else if (favicon.startsWith('/')) favicon = origin + favicon;
  else if (favicon.startsWith('//')) favicon = parsedUrl.protocol + favicon;

  const author = extractMeta(html, [
    /<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i,
    /<meta\s+property=["']article:author["']\s+content=["']([^"']+)["']/i,
  ]);

  const publishedDate = extractMeta(html, [
    /<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']date["']\s+content=["']([^"']+)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ]);

  const mainText = extractMainContent(html);

  return {
    url,
    title,
    description,
    siteName,
    ogImage,
    favicon,
    author,
    publishedDate,
    mainText,
    rawHtml: html,
  };
}
