// Made-up clouds for tests and for the guide's pictures: Google Drive, Dropbox and OneDrive answer here as their APIs
// do (routed in a browser context with Playwright). Each also checks what One Day sends it: PKCE, no secret, its folder.
import { webcrypto as wc, createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const GS = 'https://www.googleapis.com/auth/drive.appdata';
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' };
const PRE = { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE' };
const json = (route, status, body) =>
  route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

/* the clouds, made up */
export class Drive {
  constructor() {
    this.files = [];
    this.tokens = new Set();
    this.n = 0;
    this.t = 0;
    this.lists = 0;
    this.revoked = [];
    this.asked = [];
    this.bad = [];
    this.down = false;
  }
  async route(ctx) {
    await ctx.route('https://accounts.google.com/o/oauth2/v2/auth**', r => this.auth(r));
    await ctx.route('https://www.googleapis.com/**', r => this.api(r));
    await ctx.route('https://oauth2.googleapis.com/**', r => {
      this.revoked.push(r.request().postData());
      return r.fulfill({ status: 200, body: '' });
    });
  }
  auth(route) {
    const p = new URL(route.request().url()).searchParams,
      tok = 'g-token-' + ++this.t;
    this.asked.push(Object.fromEntries(p));
    if (p.get('response_type') !== 'token' || p.get('scope') !== GS) this.bad.push('authorize: ' + p);
    this.tokens.add(tok);
    const back = new URLSearchParams({ access_token: tok, token_type: 'Bearer', expires_in: '3599', scope: GS, state: p.get('state') });
    return route.fulfill({ status: 302, headers: { location: `${p.get('redirect_uri')}#${back}` } });
  }
  find(id) {
    return this.files.find(f => f.id === id);
  }
  api(route) {
    const req = route.request(),
      u = new URL(req.url()),
      m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: PRE });
    if (this.down) return route.abort('internetdisconnected');
    if (!this.tokens.has((req.headers().authorization || '').replace(/^Bearer /, '')))
      return json(route, 401, { error: { code: 401, message: 'Invalid Credentials' } });
    const id = (u.pathname.match(/\/files\/([^/]+)$/) || [])[1];
    if (u.pathname === '/drive/v3/files' && m === 'GET') {
      this.lists++;
      if (u.searchParams.get('spaces') !== 'appDataFolder') this.bad.push('list outside appDataFolder');
      const name = (/name = '([^']+)'/.exec(u.searchParams.get('q') || '') || [])[1];
      return json(route, 200, { files: this.files.filter(f => !name || f.name === name).map(f => ({ id: f.id, version: String(f.ver) })) });
    }
    if (u.pathname === '/upload/drive/v3/files' && m === 'POST') {
      const bd = /boundary=(.+)$/.exec(req.headers()['content-type'])[1],
        parts = req.postData().split('--' + bd).slice(1, -1),
        meta = JSON.parse(parts[0].split('\r\n\r\n')[1]),
        content = parts[1].slice(parts[1].indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
      if (!(meta.parents || []).includes('appDataFolder')) this.bad.push('created outside appDataFolder');
      const f = { id: 'gf' + ++this.n, name: meta.name, content, ver: 1 };
      this.files.push(f);
      return json(route, 200, { id: f.id, version: String(f.ver) });
    }
    const f = id && this.find(id);
    if (id && !f) return json(route, 404, { error: { code: 404, errors: [{ reason: 'notFound' }] } });
    if (u.pathname.startsWith('/upload/drive/v3/files/') && m === 'PATCH') {
      f.content = req.postData();
      f.ver++;
      return json(route, 200, { id: f.id, version: String(f.ver) });
    }
    if (f && m === 'GET' && u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, headers: CORS, body: f.content });
    if (f && m === 'GET') return json(route, 200, { version: String(f.ver) });
    if (f && m === 'DELETE') {
      this.files = this.files.filter(x => x !== f);
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    }
    this.bad.push(`unknown call ${m} ${u.pathname}`);
    return json(route, 400, {});
  }
  // another device writes over the copy (used to make a conflict): the version moves on
  touch() {
    this.files[0].ver++;
  }
}

export class Dropbox {
  constructor() {
    this.files = new Map();
    this.codes = new Map();
    this.tokens = new Set();
    this.refresh = new Set();
    this.n = 0;
    this.lists = 0;
    this.revoked = 0;
    this.bad = [];
    this.onUpload = null;
    this.conflicts = 0;
  }
  async route(ctx) {
    await ctx.route('https://www.dropbox.com/oauth2/authorize**', r => this.auth(r));
    await ctx.route('https://api.dropboxapi.com/**', r => this.api(r));
    await ctx.route('https://content.dropboxapi.com/**', r => this.api(r));
  }
  auth(route) {
    const p = new URL(route.request().url()).searchParams,
      code = 'dbx-code-' + ++this.n;
    if (p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge')) this.bad.push('no PKCE');
    if (p.get('token_access_type') !== 'offline') this.bad.push('no refresh asked');
    this.codes.set(code, p.get('code_challenge'));
    return route.fulfill({ status: 302, headers: { location: `${p.get('redirect_uri')}?${new URLSearchParams({ code, state: p.get('state') })}` } });
  }
  async api(route) {
    const req = route.request(),
      u = new URL(req.url()),
      m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: PRE });
    if (u.pathname === '/oauth2/token') {
      const f = new URLSearchParams(req.postData());
      if (f.has('client_secret')) this.bad.push('a secret was sent');
      if (f.get('grant_type') === 'authorization_code') {
        const ch = this.codes.get(f.get('code'));
        this.codes.delete(f.get('code'));
        if (!ch || ch !== createHash('sha256').update(f.get('code_verifier') || '').digest('base64url'))
          return json(route, 400, { error: 'invalid_grant' });
        const a = 'dbx-a-' + ++this.n,
          r = 'dbx-r-' + this.n;
        this.tokens.add(a);
        this.refresh.add(r);
        return json(route, 200, { access_token: a, token_type: 'bearer', expires_in: 14400, refresh_token: r, account_id: 'dbid:x' });
      }
      if (!this.refresh.has(f.get('refresh_token'))) return json(route, 400, { error: 'invalid_grant' });
      const a = 'dbx-a-' + ++this.n;
      this.tokens.add(a);
      return json(route, 200, { access_token: a, token_type: 'bearer', expires_in: 14400 });
    }
    const tok = (req.headers().authorization || '').replace(/^Bearer /, '');
    if (!this.tokens.has(tok)) return json(route, 401, { error_summary: 'expired_access_token/..' });
    const arg = u.host === 'content.dropboxapi.com' ? JSON.parse(req.headers()['dropbox-api-arg']) : JSON.parse(req.postData() || 'null'),
      byPath = p => [...this.files.values()].find(f => f.id === p || f.path === String(p).toLowerCase());
    if (u.pathname === '/2/files/get_metadata') {
      this.lists++;
      const f = byPath(arg.path);
      return f ? json(route, 200, { '.tag': 'file', id: f.id, rev: f.rev, path_lower: f.path }) : json(route, 409, { error_summary: 'path/not_found/..' });
    }
    if (u.pathname === '/2/files/download') {
      const f = byPath(arg.path);
      return f ? route.fulfill({ status: 200, headers: CORS, body: f.content }) : json(route, 409, { error_summary: 'path/not_found/..' });
    }
    if (u.pathname === '/2/files/upload') {
      if (this.onUpload) {
        const h = this.onUpload;
        this.onUpload = null;
        h(this);
      }
      if (arg.autorename !== false || !arg.strict_conflict) this.bad.push('upload may rename');
      const f = byPath(arg.path),
        stale = arg.mode === 'add' ? !!f : !f || arg.mode.update !== f.rev;
      if (stale) {
        this.conflicts++;
        return json(route, 409, { error_summary: 'path/conflict/file/..' });
      }
      const x = f || { id: 'id:' + ++this.n, path: arg.path.toLowerCase() };
      x.rev = 'rev' + ++this.n;
      x.content = req.postData();
      this.files.set(x.id, x);
      return json(route, 200, { id: x.id, rev: x.rev, path_lower: x.path });
    }
    if (u.pathname === '/2/files/delete_v2') {
      const f = byPath(arg.path);
      if (!f) return json(route, 409, { error_summary: 'path_lookup/not_found/..' });
      this.files.delete(f.id);
      return json(route, 200, { metadata: { id: f.id } });
    }
    if (u.pathname === '/2/auth/token/revoke') {
      this.revoked++;
      this.tokens.delete(tok);
      return json(route, 200, null);
    }
    this.bad.push(`unknown call ${u.pathname}`);
    return json(route, 400, {});
  }
  // another device writes the copy in between
  other() {
    const f = [...this.files.values()][0];
    f.rev = 'rev' + ++this.n;
  }
}

export class OneDrive {
  constructor() {
    this.item = null;
    this.codes = new Map();
    this.tokens = new Set();
    this.refresh = new Set();
    this.n = 0;
    this.lists = 0;
    this.bad = [];
    this.stale = 0;
    this.downloads = 0;
  }
  async route(ctx) {
    await ctx.route('https://login.microsoftonline.com/**', r => this.login(r));
    await ctx.route('https://graph.microsoft.com/**', r => this.graph(r));
    await ctx.route('https://*.files.1drv.com/**', r => this.download(r));
  }
  login(route) {
    const req = route.request(),
      u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: PRE });
    if (!u.pathname.startsWith('/consumers/')) this.bad.push('not the personal accounts endpoint');
    if (u.pathname.endsWith('/authorize')) {
      const p = u.searchParams,
        code = 'ms-code-' + ++this.n;
      if (p.get('code_challenge_method') !== 'S256' || p.get('response_mode') !== 'fragment') this.bad.push('authorize: ' + p);
      if (p.get('scope') !== 'Files.ReadWrite.AppFolder offline_access') this.bad.push('scope ' + p.get('scope'));
      this.codes.set(code, p.get('code_challenge'));
      return route.fulfill({ status: 302, headers: { location: `${p.get('redirect_uri')}#${new URLSearchParams({ code, state: p.get('state') })}` } });
    }
    const f = new URLSearchParams(req.postData());
    if (f.has('client_secret')) this.bad.push('a secret was sent');
    if (f.get('grant_type') === 'authorization_code') {
      const ch = this.codes.get(f.get('code'));
      this.codes.delete(f.get('code'));
      if (!ch || ch !== createHash('sha256').update(f.get('code_verifier') || '').digest('base64url'))
        return json(route, 400, { error: 'invalid_grant' });
    } else if (!this.refresh.has(f.get('refresh_token'))) return json(route, 400, { error: 'invalid_grant' });
    const a = 'ms-a-' + ++this.n,
      r = 'ms-r-' + this.n;
    this.tokens.add(a);
    this.refresh.add(r);
    return json(route, 200, { token_type: 'Bearer', access_token: a, expires_in: 3600, refresh_token: r });
  }
  graph(route) {
    const req = route.request(),
      u = new URL(req.url()),
      m = req.method(),
      p = decodeURIComponent(u.pathname);
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: PRE });
    if (!this.tokens.has((req.headers().authorization || '').replace(/^Bearer /, ''))) return json(route, 401, { error: { code: 'InvalidAuthenticationToken' } });
    const it = this.item,
      out = () => ({ id: it.id, eTag: it.eTag, file: {} });
    if (p === '/v1.0/me/drive/special/approot:/one-day.json' && m === 'GET') {
      this.lists++;
      return it ? json(route, 200, out()) : json(route, 404, { error: { code: 'itemNotFound' } });
    }
    if (p === '/v1.0/me/drive/special/approot:/one-day.json:/content' && m === 'PUT') {
      if (u.searchParams.get('@microsoft.graph.conflictBehavior') !== 'fail') this.bad.push('create may replace');
      if (it) return json(route, 409, { error: { code: 'nameAlreadyExists' } });
      this.item = { id: 'ITEM' + ++this.n, eTag: '"{e' + this.n + '},1"', content: req.postData() };
      return json(route, 201, { id: this.item.id, eTag: this.item.eTag });
    }
    if (it && p === `/v1.0/me/drive/items/${it.id}/content` && m === 'PUT') {
      if (req.headers()['if-match'] !== it.eTag) {
        this.stale++;
        return json(route, 412, { error: { code: 'resourceModified' } });
      }
      it.eTag = '"{e' + ++this.n + '},2"';
      it.content = req.postData();
      return json(route, 200, { id: it.id, eTag: it.eTag });
    }
    if (it && p === `/v1.0/me/drive/items/${it.id}` && m === 'GET')
      return json(route, 200, { id: it.id, '@microsoft.graph.downloadUrl': `https://public.dm.files.1drv.com/y4m/${it.id}?tempauth=t${this.n}` });
    if (it && p === `/v1.0/me/drive/items/${it.id}` && m === 'DELETE') {
      this.item = null;
      return route.fulfill({ status: 204, headers: CORS, body: '' });
    }
    if (!it) return json(route, 404, { error: { code: 'itemNotFound' } });
    this.bad.push(`unknown call ${m} ${p}`);
    return json(route, 400, {});
  }
  download(route) {
    this.downloads++;
    if (route.request().headers().authorization) this.bad.push('a token went to the download address');
    return this.item ? route.fulfill({ status: 200, headers: CORS, body: this.item.content }) : route.fulfill({ status: 404, headers: CORS, body: '' });
  }
}

// The copy, changed here as another device would change it: opened with the passphrase, edited, sealed again with the
// same key (a new IV). Used to make what a race or a long absence leaves in the cloud.
export async function resealCopy(text, pass, edit) {
  const env = JSON.parse(text),
    v = env.vault,
    b = s => Buffer.from(s, 'base64'),
    base = await wc.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']),
    kek = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b(v.kdf.salt), iterations: v.kdf.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']),
    raw = new Uint8Array(await wc.subtle.decrypt({ name: 'AES-GCM', iv: b(v.pass.iv) }, kek, b(v.pass.ct))),
    dek = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  let u8 = Buffer.from(await wc.subtle.decrypt({ name: 'AES-GCM', iv: b(v.data.iv) }, dek, b(v.data.ct)));
  if (v.z) u8 = inflateRawSync(u8);
  const next = edit(JSON.parse(u8.toString('utf8'))),
    iv = wc.getRandomValues(new Uint8Array(12)),
    ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, dek, deflateRawSync(Buffer.from(JSON.stringify(next))));
  return JSON.stringify({ ...env, vault: { ...v, z: 1, data: { iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') } } });
}

// the copy, opened here as a new device would: the passphrase, its key, then the tasks
export async function openCopy(text, pass) {
  const v = JSON.parse(text).vault,
    b = s => Buffer.from(s, 'base64'),
    base = await wc.subtle.importKey('raw', new TextEncoder().encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']),
    kek = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b(v.kdf.salt), iterations: v.kdf.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']),
    raw = new Uint8Array(await wc.subtle.decrypt({ name: 'AES-GCM', iv: b(v.pass.iv) }, kek, b(v.pass.ct))),
    dek = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  let u8 = Buffer.from(await wc.subtle.decrypt({ name: 'AES-GCM', iv: b(v.data.iv) }, dek, b(v.data.ct)));
  if (v.z) u8 = inflateRawSync(u8);
  return JSON.parse(u8.toString('utf8'));
}
