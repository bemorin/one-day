#!/usr/bin/env node
// A tiny static server for public/ that applies the headers from public/_headers, like Cloudflare Pages.
//   node scripts/serve.mjs [port]   (default 8000)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.argv[2] || process.env.PORT || 8000);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// _headers: a path pattern on its own line, then indented "Name: value" lines.
function parseHeaders(text) {
  const rules = [];
  let rule = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push((rule = { pattern: line.trim(), headers: [] }));
    else if (rule) {
      const i = line.indexOf(':');
      rule.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules.map(r => ({
    ...r,
    re: new RegExp('^' + r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'),
  }));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Like Cloudflare Pages: /index.html redirects to /.
    if (url.pathname.endsWith('/index.html')) {
      res.writeHead(308, { Location: url.pathname.slice(0, -'index.html'.length) + url.search });
      return res.end();
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(pub, path));
    if (!file.startsWith(pub + sep)) throw Object.assign(new Error('outside'), { code: 'ENOENT' });
    const st = await stat(file);
    // Like Cloudflare Pages: a folder with a page of its own, asked without its slash, redirects to it (/guide -> /guide/).
    if (st.isDirectory() && (await stat(join(file, 'index.html')).catch(() => null))) {
      res.writeHead(308, { Location: url.pathname + '/' + url.search });
      return res.end();
    }
    if (!st.isFile()) throw Object.assign(new Error('dir'), { code: 'ENOENT' });
    const body = await readFile(file);
    const rules = parseHeaders(await readFile(join(pub, '_headers'), 'utf8').catch(() => ''));
    for (const r of rules) if (r.re.test(url.pathname)) for (const [k, v] of r.headers) res.setHeader(k, v);
    // Local http cannot honour these two; they only make sense on the real https host.
    res.removeHeader('Strict-Transport-Security');
    if (res.hasHeader('Content-Security-Policy'))
      res.setHeader(
        'Content-Security-Policy',
        String(res.getHeader('Content-Security-Policy')).replace(/;\s*upgrade-insecure-requests/, ''),
      );
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (e) {
    // Like Cloudflare Pages: a top-level 404.html answers unknown paths with a real 404.
    res.statusCode = e.code === 'ENOENT' ? 404 : 500;
    const page = res.statusCode === 404 && (await readFile(join(pub, '404.html')).catch(() => null));
    if (page) res.setHeader('Content-Type', TYPES['.html']);
    res.end(page || (res.statusCode === 404 ? 'Not found' : 'Error'));
  }
}).listen(port, () => console.log(`One Day on http://localhost:${port}`));
