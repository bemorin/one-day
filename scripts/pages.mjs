// What Cloudflare Pages answers for public/: the file (a folder's own index.html), the headers public/_headers gives
// it, a few redirects (/index.html to /, /guide to /guide/), and 404.html for anything else. Used by serve.mjs and by
// the tests, which open One Day at its real addresses (day.bemorin.com, getone.day) without going online.
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';

export const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const TYPES = {
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

// A pattern of _headers as a test: `*` takes anything, `:name` one part (of a path, or of a host).
const like = (s, part) =>
  s
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/:[a-z]\w*/gi, part);

// _headers: a pattern on its own line, then indented "Name: value" lines, or "! Name" to take off what a rule above
// set. A pattern is a path, for every host, or an address with https:// and a host, for that host alone (Cloudflare
// leaves out the protocol and the port when it compares). As Pages does, one rule is kept per pattern: a later block
// with the same pattern takes the earlier one's place, in the earlier one's position.
export function parseHeaders(text) {
  const rules = new Map();
  let rule = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const p = line.trim(),
        m = /^https:\/\/([^/]+)(\/.*)$/.exec(p);
      rule = {
        pattern: p,
        host: m ? new RegExp('^' + like(m[1], '[^.]+') + '$', 'i') : null,
        path: new RegExp('^' + like(m ? m[2] : p, '[^/]+') + '$'),
        set: new Map(),
        unset: [],
      };
      rules.set(p, rule);
    } else if (rule) {
      const t = line.trim();
      if (t.startsWith('!')) rule.unset.push(t.slice(1).trim().toLowerCase());
      else {
        const i = t.indexOf(':');
        if (i > 0) {
          // a header written twice in a block: both values, joined with a comma, as Pages does
          const k = t.slice(0, i).trim(),
            v = t.slice(i + 1).trim(),
            was = rule.set.get(k.toLowerCase());
          rule.set.set(k.toLowerCase(), was ? [was[0], was[1] + ', ' + v] : [k, v]);
        }
      }
    }
  }
  return [...rules.values()];
}
// The headers a request gets, in their names' own spelling: each matching rule, in order, takes off what it detaches,
// then adds its own; a header set again is joined to the value already there with a comma, as Cloudflare does.
export function headersFor(rules, host, path) {
  const out = new Map();
  for (const r of rules) {
    if (r.host && !r.host.test(host)) continue;
    if (!r.path.test(path)) continue;
    for (const key of r.unset) out.delete(key);
    for (const [key, [k, v]] of r.set) out.set(key, out.has(key) ? [out.get(key)[0], out.get(key)[1] + ', ' + v] : [k, v]);
  }
  return Object.fromEntries([...out.values()]);
}

// The answer for one address: { status, headers, body }. `local` drops what plain http can't honour.
export async function answer(url, { pub = PUB, local = false } = {}) {
  const rules = parseHeaders(await readFile(join(pub, '_headers'), 'utf8').catch(() => ''));
  const res = (status, headers, body) => ({ status, headers, body });
  try {
    // Like Cloudflare Pages: /index.html redirects to /.
    if (url.pathname.endsWith('/index.html'))
      return res(308, { Location: url.pathname.slice(0, -'index.html'.length) + url.search }, '');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(pub, path));
    if (!file.startsWith(pub + sep)) throw Object.assign(new Error('outside'), { code: 'ENOENT' });
    const st = await stat(file);
    // Like Cloudflare Pages: a folder with a page of its own, asked without its slash, redirects to it (/guide -> /guide/).
    if (st.isDirectory() && (await stat(join(file, 'index.html')).catch(() => null)))
      return res(308, { Location: url.pathname + '/' + url.search }, '');
    if (!st.isFile()) throw Object.assign(new Error('dir'), { code: 'ENOENT' });
    const headers = headersFor(rules, url.hostname, url.pathname);
    if (local) {
      // Local http cannot honour these two; they only make sense on the real https host.
      delete headers['Strict-Transport-Security'];
      if (headers['Content-Security-Policy'])
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
    }
    // the file's own type, unless _headers gives one (as Pages lets it)
    if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = TYPES[extname(file)] || 'application/octet-stream';
    return res(200, headers, await readFile(file));
  } catch (e) {
    // Like Cloudflare Pages: a top-level 404.html answers unknown paths with a real 404.
    const status = e.code === 'ENOENT' ? 404 : 500,
      page = status === 404 && (await readFile(join(pub, '404.html')).catch(() => null));
    return res(status, page ? { 'Content-Type': TYPES['.html'] } : {}, page || (status === 404 ? 'Not found' : 'Error'));
  }
}
