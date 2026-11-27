// Google Drive, Dropbox and OneDrive in One Day's app for iPhone, iPad and Mac, against made-up clouds. The app's bridge
// (apple/Shared/bridge.js) runs as the app runs it; the app's side is played here: its sign-in sheet (SignInSheet.swift)
// opens the cloud's page and hands back the address the cloud sends you to, its keychain (SignIns.swift) keeps the
// sign-in, and its file keeps what the page saves. A device "opening the app again" is a new browser context that
// starts from what the app kept: its file and its keychain.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Drive, Dropbox, OneDrive, openCopy } from './clouds.mjs';

const BRIDGE = readFileSync(new URL('../apple/Shared/bridge.js', import.meta.url), 'utf8');
const PASS = 'a long sync passphrase';
const BACK = 'https://day.bemorin.com/oauth/';
const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const seed = text => ({ days: { [key(new Date())]: { u: 1, tasks: [{ id: 'f1', text, done: false }] } }, rules: {}, tags: {} });
const texts = p => Object.values(p.days).flatMap(d => d.tasks.map(t => t.text));
// the hosts a device may reach: this test's server, and the made-up clouds (nothing else, the real clouds least of all)
const HOSTS = /^(localhost(:\d+)?|www\.googleapis\.com|oauth2\.googleapis\.com|api\.dropboxapi\.com|content\.dropboxapi\.com|login\.microsoftonline\.com|graph\.microsoft\.com|[a-z.]+\.files\.1drv\.com)$/;

/* The app, as the page meets it: its sign-in sheet and its keychain, the same across the times the app opens. */
class App {
  constructor(clouds) {
    this.clouds = clouds;
    // what the keychain holds, and every change the page gave it
    this.auth = null;
    this.keeps = [];
    // the app's file: its number and keys, as the page sent them
    this.seq = 0;
    this.items = {};
    this.sent = [];
    // the sheet: the pages it opened; what happens next ('close': closed by its button; 'tamper': an answer that
    // isn't this sign-in's)
    this.opened = [];
    this.next = null;
    this.cancels = 0;
  }
  // a message from bridge.js, as Bridge.swift takes it
  take(m) {
    this.sent.push(m);
    if (m.op === 'auth.keep') {
      this.keeps.push(m.value);
      this.auth = m.value;
    }
    if (m.op === 'store.set' && m.seq > this.seq) {
      this.items[m.key] = m.value;
      this.seq = m.seq;
    }
    if (m.op === 'store.remove' && m.seq > this.seq) {
      delete this.items[m.key];
      this.seq = m.seq;
    }
    if (m.op === 'store.all' && m.seq > this.seq) {
      this.items = { ...m.items };
      this.seq = m.seq;
    }
  }
  // a question to the clouds' bridge, as CloudBridge.swift answers it
  async answer(q) {
    if (q.op === 'signin.cancel') {
      this.cancels++;
      return true;
    }
    if (q.op !== 'signin') return { error: 'unavailable' };
    this.opened.push(q.url);
    const next = this.next;
    this.next = null;
    if (next === 'close') return { error: 'closed' };
    const u = new URL(q.url);
    let to = null;
    const route = {
      request: () => ({ url: () => q.url, method: () => 'GET', headers: () => ({}), postData: () => null }),
      fulfill: async o => {
        to = o.headers && o.headers.location;
      },
    };
    if (u.host === 'accounts.google.com' && this.clouds.google) await this.clouds.google.auth(route);
    else if (u.host === 'www.dropbox.com' && this.clouds.dropbox) await this.clouds.dropbox.auth(route);
    else if (u.host === 'login.microsoftonline.com' && this.clouds.onedrive) await this.clouds.onedrive.login(route);
    else return { error: 'refused' };
    // the sheet comes back only on One Day's own address, which it hands over without opening it
    if (!to || !to.startsWith(BACK)) return { error: 'signin' };
    return next === 'tamper' ? to.replace(/state=[^&]+/, 'state=another') : to;
  }
  get kept() {
    return this.auth ? JSON.parse(this.auth) : null;
  }
}

/* a device running the app: its web view's storage empty, as after the app was opened again, or for the first time */
async function appDevice(browser, baseURL, app, o = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 860 } }),
    errors = [],
    hosts = new Set();
  await ctx.exposeFunction('__toApp', m => app.take(m));
  await ctx.exposeFunction('__cloud', q => app.answer(q));
  for (const c of Object.values(app.clouds)) await c.route(ctx);
  ctx.on('request', r => hosts.add(new URL(r.url()).host));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.webkit = {
      messageHandlers: {
        oneday: { postMessage: m => window.__toApp(JSON.parse(JSON.stringify(m))) },
        onedayCloud: {
          async postMessage(q) {
            const r = await window.__cloud(JSON.parse(JSON.stringify(q)));
            if (r && r.error) throw new Error(r.error);
            return r;
          },
        },
      },
    };
  });
  const boot = { platform: 'ios', version: '1.0 (1)', icloud: false, signin: o.signin !== false, auth: app.auth, seq: app.seq, items: app.items };
  await page.addInitScript({ content: BRIDGE.replace('/*BOOT*/null', JSON.stringify(boot)) });
  if (o.seed)
    await page.addInitScript(data => {
      if (!localStorage.getItem('oneday.v1') && !localStorage.getItem('oneday.vault')) localStorage.setItem('oneday.v1', JSON.stringify(data));
    }, o.seed);
  await page.goto(baseURL + '/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  return { ctx, page, errors, hosts };
}
const row = (page, text) => page.locator('#list .row', { hasText: text });
async function openDialog(page) {
  await page.locator('#spill:visible, #syncb:visible').first().click();
  await expect(page.locator('#syncd')).toBeVisible();
}
const idle = async page => {
  await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
  await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
};
// a cloud, its page in the sheet, then the passphrase
async function connect(page, cloud, { join = false } = {}) {
  await openDialog(page);
  await expect(page.locator('#syT')).toHaveText('Sync with your cloud');
  await page.locator(`#syCh [data-c="${cloud}"]`).click();
  await expect(page.locator('#syT')).toHaveText(join ? 'Enter your sync passphrase' : 'Choose a sync passphrase', { timeout: 15000 });
  await page.locator('#syPass').fill(PASS);
  if (!join) {
    await page.locator('#syPass2').fill(PASS);
    await page.locator('#syOk').check();
  }
  await page.locator('#syGo').click();
  await idle(page);
}
async function add(page, text) {
  await page.locator('#input').fill(text);
  await page.locator('#input').press('Enter');
  await expect(row(page, text)).toBeVisible();
}
// nothing a cloud gave the page reaches its storage, nor the app's file
async function noTokens(page, app, marks) {
  const all = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  const toApp = JSON.stringify(app.sent.filter(m => m.op !== 'auth.keep'));
  for (const m of marks) {
    expect(all).not.toContain(m);
    expect(toApp).not.toContain(m);
  }
}

test.describe('the other clouds in the app', () => {
  // two launches of the app in some tests, each with its sync: a busy machine needs the time
  test.describe.configure({ timeout: 150000 });

  test('the app offers iCloud first, then Google Drive, Dropbox and OneDrive, each with its logo', async ({ browser, baseURL }) => {
    const app = new App({}),
      A = await appDevice(browser, baseURL, app);
    await openDialog(A.page);
    const clouds = A.page.locator('#syCh .syc');
    await expect(clouds.locator('b')).toHaveText(['iCloud', 'Google Drive', 'Dropbox', 'Microsoft OneDrive']);
    await expect(A.page.locator('#syCh .syc:not([disabled])')).toHaveCount(3);
    // this build has no iCloud (icloud: false): named, not set up
    await expect(A.page.locator('#syCh [data-c="icloud"]')).toBeDisabled();
    await expect(A.page.locator('#syCh [data-c="google"] img')).toHaveCount(1);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('Dropbox: signed in through the sheet, its sign-in kept by the app alone; the app opens again and goes on', async ({ browser, baseURL }) => {
    const dropbox = new Dropbox(),
      app = new App({ dropbox }),
      A = await appDevice(browser, baseURL, app, { seed: seed('Water the fern') });
    await connect(A.page, 'dropbox');
    // the sheet opened Dropbox's own page, which sends you back to One Day's address on the web, with PKCE
    expect(app.opened).toHaveLength(1);
    const asked = new URL(app.opened[0]).searchParams;
    expect(asked.get('redirect_uri')).toBe(BACK);
    expect(asked.get('code_challenge_method')).toBe('S256');
    expect(dropbox.bad).toEqual([]);
    expect(dropbox.files.size).toBe(1);
    expect(texts(await openCopy([...dropbox.files.values()][0].content, PASS))).toContain('Water the fern');
    // the keychain holds the sign-in, and only the keychain
    expect(app.kept).toMatchObject({ v: 1, cloud: 'dropbox', a: expect.stringMatching(/^dbx-a-/), r: expect.stringMatching(/^dbx-r-/), acct: 'dbid:x' });
    await noTokens(A.page, app, ['dbx-a-', 'dbx-r-']);
    const sync = JSON.parse(app.items['oneday.v1']).sync;
    expect(sync).toMatchObject({ v: 1, cloud: 'dropbox', acct: 'dbid:x' });
    expect(sync.auth).toBeUndefined();
    expect(A.errors).toEqual([]);
    await A.ctx.close();

    // the app opens again: its file and its keychain, no sign-in
    const B = await appDevice(browser, baseURL, app);
    await expect(row(B.page, 'Water the fern')).toBeVisible();
    await add(B.page, 'Written after the app opened again');
    await expect
      .poll(async () => texts(await openCopy([...dropbox.files.values()][0].content, PASS)), { timeout: 15000 })
      .toContain('Written after the app opened again');
    expect(app.opened).toHaveLength(1);
    await openDialog(B.page);
    await idle(B.page);
    expect(B.errors).toEqual([]);
    expect([...A.hosts, ...B.hosts].filter(h => !HOSTS.test(h))).toEqual([]);
    await B.ctx.close();
  });

  test('Google Drive: an hour’s sign-in; when it is up, the sheet signs in again and sync goes on', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      app = new App({ google: drive }),
      A = await appDevice(browser, baseURL, app, { seed: seed('Call the plumber') });
    await connect(A.page, 'google');
    const first = new URL(app.opened[0]).searchParams;
    expect(first.get('redirect_uri')).toBe(BACK);
    expect(first.get('response_type')).toBe('token');
    expect(first.get('prompt')).toBe('select_account');
    expect(app.kept).toMatchObject({ cloud: 'google', a: 'g-token-1', acct: 'g-user-1' });
    await noTokens(A.page, app, ['g-token-']);
    await A.page.keyboard.press('Escape');
    // the hour is up
    drive.tokens.clear();
    await add(A.page, 'Written after the hour');
    await expect(A.page.locator('#toast')).toContainText('Sign in to Google Drive again to sync', { timeout: 15000 });
    await A.page.locator('#undo').click();
    await expect.poll(async () => texts(await openCopy(drive.files[0].content, PASS)), { timeout: 15000 }).toContain('Written after the hour');
    // signing in again goes straight back, to the same account
    expect(app.opened).toHaveLength(2);
    expect(new URL(app.opened[1]).searchParams.get('prompt')).toBeNull();
    expect(app.kept).toMatchObject({ cloud: 'google', a: 'g-token-2' });
    await noTokens(A.page, app, ['g-token-']);
    expect(drive.bad).toEqual([]);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('OneDrive: signed in, then renewed with what the app keeps, when the app opens again', async ({ browser, baseURL }) => {
    const onedrive = new OneDrive(),
      app = new App({ onedrive }),
      A = await appDevice(browser, baseURL, app, { seed: seed('Book the dentist') });
    await connect(A.page, 'onedrive');
    expect(new URL(app.opened[0]).searchParams.get('redirect_uri')).toBe(BACK);
    expect(app.kept).toMatchObject({ cloud: 'onedrive', r: expect.stringMatching(/^ms-r-/), acct: 'od-drive-1' });
    await noTokens(A.page, app, ['ms-a-', 'ms-r-']);
    await A.ctx.close();
    // an hour later: the token is spent, what renews it is not
    const spent = app.kept.a;
    app.auth = JSON.stringify({ ...app.kept, ax: Date.now() - 1000 });
    const B = await appDevice(browser, baseURL, app);
    await add(B.page, 'Written an hour later');
    await expect.poll(async () => texts(await openCopy(onedrive.item.content, PASS)), { timeout: 15000 }).toContain('Written an hour later');
    expect(app.opened).toHaveLength(1);
    expect(app.kept.a).not.toBe(spent);
    expect(app.kept.ax).toBeGreaterThan(Date.now());
    await noTokens(B.page, app, ['ms-a-', 'ms-r-']);
    expect(onedrive.bad).toEqual([]);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await B.ctx.close();
  });

  test('a sign-in the keychain kept from before (the app deleted, then installed again) goes as the app opens without sync', async ({ browser, baseURL }) => {
    const app = new App({});
    app.auth = JSON.stringify({ v: 1, cloud: 'dropbox', a: 'dbx-a-old', ax: Date.now() + 3600e3, r: 'dbx-r-old', rx: 0, acct: 'dbid:x' });
    const A = await appDevice(browser, baseURL, app);
    await expect.poll(() => app.auth).toBeNull();
    expect(app.keeps).toEqual([null]);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('the sheet closed without signing in: back to the clouds, nothing said, nothing kept', async ({ browser, baseURL }) => {
    const dropbox = new Dropbox(),
      app = new App({ dropbox }),
      A = await appDevice(browser, baseURL, app);
    await openDialog(A.page);
    app.next = 'close';
    await A.page.locator('#syCh [data-c="dropbox"]').click();
    await expect.poll(() => app.opened.length).toBe(1);
    await expect(A.page.locator('#syT')).toHaveText('Sync with your cloud');
    await expect(A.page.locator('#syErr')).toBeHidden();
    expect(app.keeps).toEqual([]);
    // tried again, it goes
    await A.page.locator('#syCh [data-c="dropbox"]').click();
    await expect(A.page.locator('#syT')).toHaveText('Choose a sync passphrase', { timeout: 15000 });
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('an answer that isn’t this sign-in’s is refused, and nothing is kept', async ({ browser, baseURL }) => {
    const dropbox = new Dropbox(),
      app = new App({ dropbox }),
      A = await appDevice(browser, baseURL, app);
    await openDialog(A.page);
    app.next = 'tamper';
    await A.page.locator('#syCh [data-c="dropbox"]').click();
    await expect(A.page.locator('#syErr')).toHaveText('Signing in to Dropbox didn’t finish. Try again.', { timeout: 15000 });
    await expect(A.page.locator('#syT')).toHaveText('Sync with your cloud');
    // the code was never traded for tokens
    expect(dropbox.tokens.size).toBe(0);
    expect(app.keeps).toEqual([]);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('stopping sync forgets the sign-in: the keychain is emptied, and Dropbox gets its access back', async ({ browser, baseURL }) => {
    const dropbox = new Dropbox(),
      app = new App({ dropbox }),
      A = await appDevice(browser, baseURL, app, { seed: seed('Return the books') });
    await connect(A.page, 'dropbox');
    expect(app.kept).not.toBeNull();
    await A.page.locator('#syNo').click();
    await expect(A.page.locator('#syT')).toHaveText('Stop syncing here?');
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#toast')).toContainText('Sync is off on this device');
    expect(app.auth).toBeNull();
    expect(app.keeps.at(-1)).toBeNull();
    await expect.poll(() => dropbox.revoked).toBe(1);
    expect(JSON.parse(app.items['oneday.v1']).sync).toBeUndefined();
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('with the lock on, the sign-in stays out of the vault too; locked, the keychain keeps it; unlocked, sync goes on', async ({ browser, baseURL }) => {
    const dropbox = new Dropbox(),
      app = new App({ dropbox }),
      A = await appDevice(browser, baseURL, app, { seed: seed('Feed the cat') });
    await A.page.locator('#lpill').click();
    await A.page.locator('#lsPass').fill('correct horse battery');
    await A.page.locator('#lsPass2').fill('correct horse battery');
    await A.page.locator('#lsOk').check();
    await A.page.locator('#lsGo').click();
    await expect(A.page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await A.page.keyboard.press('Escape');
    await connect(A.page, 'dropbox');
    await A.page.keyboard.press('Escape');
    // the vault holds sync's key and base, sealed; its sign-in isn't there, sealed or not
    const vault = JSON.parse(await A.page.evaluate(() => localStorage.getItem('oneday.vault')));
    const sync = await openCopy(JSON.stringify({ vault: { ...vault, data: vault.sync, z: 0 } }), 'correct horse battery');
    expect(sync).toMatchObject({ v: 1, cloud: 'dropbox', acct: 'dbid:x' });
    expect(sync.auth).toBeUndefined();
    await noTokens(A.page, app, ['dbx-a-', 'dbx-r-']);
    expect(app.kept).toMatchObject({ cloud: 'dropbox', r: expect.stringMatching(/^dbx-r-/) });
    await A.page.keyboard.press('l');
    await expect(A.page.locator('#lock')).toBeVisible();
    expect(app.kept).not.toBeNull();
    await A.page.locator('#lockPass').fill('correct horse battery');
    await A.page.locator('#lockPass').press('Enter');
    await expect(A.page.locator('#lock')).toBeHidden({ timeout: 20000 });
    await add(A.page, 'Written after unlocking');
    await expect
      .poll(async () => texts(await openCopy([...dropbox.files.values()][0].content, PASS)), { timeout: 15000 })
      .toContain('Written after unlocking');
    expect(app.opened).toHaveLength(1);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });
});
