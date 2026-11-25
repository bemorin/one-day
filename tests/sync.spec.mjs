// Sync with your cloud, against made-up clouds: Google Drive, Dropbox and OneDrive answer here, in the test, as their
// APIs do. Each test's devices are browser contexts of their own (their own storage), talking to the same cloud.
import { test, expect } from '@playwright/test';
import { Drive, Dropbox, OneDrive, openCopy as openWith, resealCopy, GS } from './clouds.mjs';
import AxeBuilder from '@axe-core/playwright';

const PASS = 'a long sync passphrase';
const openCopy = (text, pass = PASS) => openWith(text, pass);
const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => key(new Date());
const plus = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return key(d);
};
const seed = () => ({
  days: {
    [today()]: {
      u: 1,
      tasks: [
        { id: 'a1', text: 'Write the report #work', done: false },
        { id: 'b2', text: 'Plan the trip', done: false, note: 'Bring the <b>passports</b>', subs: [{ id: 's1', text: 'Book the train', done: false }] },
        { id: 'c3', text: 'Water the plants', done: true, at: 1 },
      ],
    },
  },
});
const texts = p => Object.values(p.days).flatMap(d => d.tasks.map(t => t.text));

/* a device: a browser of its own, One Day's ids at each cloud set as a registration would set them */
async function device(browser, baseURL, clouds, o = {}) {
  const ctx = await browser.newContext({
      serviceWorkers: o.sw ? 'allow' : 'block',
      viewport: o.phone ? { width: 390, height: 844 } : { width: 1280, height: 860 },
      ...(o.phone ? { hasTouch: true, isMobile: true } : {}),
    }),
    errors = [],
    hosts = new Set();
  await ctx.route(/\/app\.js$/, async route => {
    const res = await route.fetch(),
      body = await res.text(),
      out = body.replace(/CLOUD_IDS = \{[^}]*\}/, "CLOUD_IDS = { google: 'test.apps.googleusercontent.com', dropbox: 'testappkey', onedrive: '00000000-test' }");
    if (out === body) throw new Error('CLOUD_IDS not found in app.js');
    await route.fulfill({ response: res, body: out });
  });
  for (const c of [].concat(clouds)) await c.route(ctx);
  ctx.on('request', r => hosts.add(new URL(r.url()).host));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce', ...(o.scheme ? { colorScheme: o.scheme } : {}) });
  if (o.seed !== false)
    await page.addInitScript(data => {
      if (!localStorage.getItem('oneday.v1') && !localStorage.getItem('oneday.vault')) localStorage.setItem('oneday.v1', JSON.stringify(data));
    }, o.seed || seed());
  await page.goto(baseURL + '/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  return { ctx, page, errors, hosts };
}
const row = (page, text) => page.locator('#list .row', { hasText: text });
// all in, as the dialog says once sync is on (what an earlier step left hidden there doesn't count)
const idle = async page => {
  await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
  await expect(page.locator('#sySt .syd')).toBeVisible();
  await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
};
// the cloud beside the lock: a pill above the card on a large screen, a button in the card's bar otherwise
async function openDialog(page) {
  await page.locator('#spill:visible, #syncb:visible').first().click();
  await expect(page.locator('#syncd')).toBeVisible();
}
// on a computer: the cloud beside the lock, a cloud to keep the copy, its window, then the passphrase
async function connect(page, cloud, { join = false, pass = PASS } = {}) {
  await openDialog(page);
  await expect(page.locator('#syT')).toHaveText('Sync with your cloud');
  const pop = page.waitForEvent('popup');
  await page.locator(`#syCh [data-c="${cloud}"]`).click();
  const w = await pop;
  await expect.poll(() => w.isClosed(), { timeout: 15000 }).toBe(true);
  await expect(page.locator('#syT')).toHaveText(join ? 'Enter your sync passphrase' : 'Choose a sync passphrase', { timeout: 15000 });
  await page.locator('#syPass').fill(pass);
  if (!join) {
    await page.locator('#syPass2').fill(pass);
    await page.locator('#syOk').check();
  }
  await page.locator('#syGo').click();
  await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
  await idle(page);
}
const done = async page => {
  await page.locator('#syGo').click();
  await expect(page.locator('#syncd')).toBeHidden();
};
// Sync now, from the dialog, and wait until the cloud was asked and all is in
async function syncNow(page, cloud) {
  await openDialog(page);
  await idle(page);
  const n = cloud.lists;
  await page.locator('#sySt [data-sy="now"]').click();
  await expect.poll(() => cloud.lists, { timeout: 10000 }).toBeGreaterThan(n);
  await idle(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#syncd')).toBeHidden();
}
async function add(page, text) {
  await page.locator('#input').fill(text);
  await page.locator('#input').press('Enter');
  await expect(row(page, text)).toBeVisible();
  await page.locator('#input').evaluate(n => n.blur());
}
const tick = (page, text) => row(page, text).locator('.in .ck').click();
const stored = page =>
  page.evaluate(() => ({
    plain: localStorage.getItem('oneday.v1'),
    vault: localStorage.getItem('oneday.vault'),
    keys: Object.keys(localStorage).sort(),
    all: Object.values(localStorage).join(' '),
  }));

test.describe('sync with your cloud', () => {
  test.describe.configure({ timeout: 90000 });

  test('Google Drive: only a sealed copy reaches it, in One Day’s hidden folder, and it opens with the passphrase', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    // off until you turn it on: nothing goes anywhere
    await A.page.waitForTimeout(600);
    expect([...A.hosts].filter(h => !h.startsWith('localhost'))).toEqual([]);
    await connect(A.page, 'google');
    await expect(A.page.locator('#syLi')).toContainText('Google sees one file and when it changes, never a task.');
    await done(A.page);
    expect(drive.files.map(f => f.name)).toEqual(['one-day.json']);
    const text = drive.files[0].content;
    for (const w of ['Plan the trip', 'passports', 'Write the report', 'work']) expect(text).not.toContain(w);
    const env = JSON.parse(text);
    expect(env).toMatchObject({ app: 'one-day', kind: 'sync', vault: { v: 1, z: 1, kdf: { iter: 600000 } } });
    const copy = await openCopy(text);
    expect(texts(copy).sort()).toEqual(['Plan the trip', 'Water the plants', 'Write the report #work']);
    await expect(openCopy(text, 'not the passphrase at all')).rejects.toThrow();
    // what the sign-in asked for: a token for One Day's hidden folder, and nothing else
    expect(drive.asked[0]).toMatchObject({ response_type: 'token', scope: GS, redirect_uri: `${baseURL}/oauth/` });
    expect(drive.asked[0].state).toMatch(/\.p$/);
    expect(drive.bad).toEqual([]);
    // only the cloud's API, and its sign-in page, were contacted
    expect([...A.hosts].filter(h => !h.startsWith('localhost')).sort()).toEqual(['accounts.google.com', 'www.googleapis.com']);
    // with sync on and no lock, its key is kept with the tasks; the sign-in apart
    const s = await stored(A.page);
    expect(JSON.parse(s.plain).sync).toMatchObject({ v: 1, cloud: 'google', file: { id: 'gf1' } });
    expect(JSON.parse(s.plain).sync.auth).toMatchObject({ a: 'g-token-1' });
    expect(s.keys).toEqual(['oneday.v1']);
    // on a large screen, a cloud beside the lock says it is all in
    await expect(A.page.locator('#spill')).toBeVisible();
    await expect(A.page.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive');
    const [t, sp, l] = await Promise.all(['#theme', '#spill', '#lpill'].map(x => A.page.locator(x).boundingBox()));
    expect(t.x < sp.x && sp.x < l.x).toBe(true);
    await A.page.keyboard.press('/');
    await expect(A.page.locator('#slist .sdata .shint')).toHaveText('Your tasks are stored in this browser, and encrypted in your Google Drive.');
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('the cloud waits beside the lock: above the card on a large screen, in the card’s bar in a narrower window; search keeps the backups', async ({ browser, baseURL }) => {
    const A = await device(browser, baseURL, new Drive()),
      sp = A.page.locator('#spill'),
      b = A.page.locator('#syncb');
    await expect(sp).toBeVisible();
    await expect(sp).toHaveAttribute('aria-label', 'Sync with your cloud');
    await expect(sp).toHaveAttribute('data-s', 'off');
    const [t, s, l] = await Promise.all(['#theme', '#spill', '#lpill'].map(x => A.page.locator(x).boundingBox()));
    expect(t.x < s.x && s.x < l.x).toBe(true);
    // search before you type: where the tasks are, and the two backups; the cloud and the lock have buttons of their own
    await A.page.keyboard.press('/');
    await expect(A.page.locator('#slist .sdata .chip')).toHaveText(['Import backup', 'Export backup']);
    await A.page.keyboard.press('Escape');
    // narrower: a button in the card's bar, between the sun and the lock
    await A.page.setViewportSize({ width: 700, height: 860 });
    await expect(sp).toBeHidden();
    await expect(b).toBeVisible();
    await expect(A.page.locator('.bar')).not.toHaveClass(/\bfolded\b/);
    const [bt, bs, bl] = await Promise.all(['.bar #theme', '#syncb', '#lockb'].map(x => A.page.locator(x).boundingBox()));
    expect(bt.x < bs.x && bs.x < bl.x).toBe(true);
    await b.click();
    await expect(A.page.locator('#syncd')).toBeVisible();
    await expect(A.page.locator('#syT')).toHaveText('Sync with your cloud');
    // each cloud with its own logo where its owner lets apps show it, beside its name
    for (const [c, f, name] of [
      ['google', 'clouds/google-drive.svg', 'Google Drive'],
      ['dropbox', 'clouds/dropbox.svg', 'Dropbox'],
      // Microsoft's icon comes with the product's full name beside it
      ['onedrive', 'clouds/onedrive.svg', 'Microsoft OneDrive'],
    ]) {
      const img = A.page.locator(`#syCh [data-c="${c}"] .syl img`);
      await expect(img).toHaveAttribute('src', f);
      await expect.poll(() => img.evaluate(n => n.complete && n.naturalWidth > 0)).toBe(true);
      await expect(A.page.locator(`#syCh [data-c="${c}"] b`)).toHaveText(name);
    }
    await A.page.keyboard.press('Escape');
    await expect(A.page.locator('#syncd')).toBeHidden();
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('a second device joins with the passphrase, and both edit the same day', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    // B is new: only the first day's examples, which it doesn't bring
    const B = await device(browser, baseURL, drive, { seed: false });
    await expect(row(B.page, 'Open One Day')).toBeVisible();
    await openDialog(B.page);
    const pop = B.page.waitForEvent('popup');
    await B.page.locator('#syCh [data-c="google"]').click();
    await pop;
    await expect(B.page.locator('#syT')).toHaveText('Enter your sync passphrase', { timeout: 15000 });
    await B.page.locator('#syPass').fill('not the right one!');
    await B.page.locator('#syGo').click();
    await expect(B.page.locator('#syErr')).toHaveText('That passphrase doesn’t open the tasks in your Google Drive');
    await B.page.locator('#syPass').fill(PASS);
    await B.page.locator('#syGo').click();
    await idle(B.page);
    await done(B.page);
    await expect(row(B.page, 'Plan the trip')).toBeVisible();
    await expect(row(B.page, 'Open One Day')).toHaveCount(0);
    // the same day, changed on both
    await add(A.page, 'Call the bank');
    await syncNow(A.page, drive);
    await tick(B.page, 'Write the report');
    await add(B.page, 'Buy bread');
    await syncNow(B.page, drive);
    await expect(row(B.page, 'Call the bank')).toBeVisible();
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Buy bread')).toBeVisible();
    await expect(row(A.page, 'Write the report')).toHaveClass(/\bdone\b/);
    const copy = await openCopy(drive.files[0].content);
    expect(texts(copy).sort()).toEqual(['Buy bread', 'Call the bank', 'Plan the trip', 'Water the plants', 'Write the report #work']);
    expect(drive.files).toHaveLength(1);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('a task changed on both sides takes each change; an edit beats a deletion; offline, changes wait', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      B = await device(browser, baseURL, drive, { seed: false });
    await connect(A.page, 'google');
    await done(A.page);
    await connect(B.page, 'google', { join: true });
    await done(B.page);
    await expect(row(B.page, 'Plan the trip')).toBeVisible();
    // B goes offline: its changes wait, and it says so
    await B.ctx.setOffline(true);
    await expect(B.page.locator('#spill')).toHaveAttribute('aria-label', 'Offline: your changes will sync later');
    // A renames one task and deletes two
    await row(A.page, 'Write the report').locator('.t').dblclick();
    await A.page.keyboard.press('End');
    await A.page.keyboard.type(' by Friday');
    await A.page.keyboard.press('Enter');
    await expect(row(A.page, 'by Friday')).toBeVisible();
    for (const t of ['Plan the trip', 'Water the plants']) {
      await row(A.page, t).hover();
      await row(A.page, t).locator('.rm').click();
      await expect(row(A.page, t)).toHaveCount(0);
    }
    await syncNow(A.page, drive);
    // B, offline, ticks the renamed task and adds a sub-task to a task A deleted
    await tick(B.page, 'Write the report');
    await row(B.page, 'Plan the trip').locator('.t').click();
    const sub = row(B.page, 'Plan the trip').locator('.sadd input');
    await sub.fill('Pack the bags');
    await sub.press('Enter');
    await sub.evaluate(n => n.blur());
    await B.page.waitForTimeout(3000);
    expect(await B.page.evaluate(() => navigator.onLine)).toBe(false);
    await B.ctx.setOffline(false);
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Plan the trip');
    await expect(row(B.page, 'Write the report #work by Friday')).toHaveClass(/\bdone\b/);
    // the task A deleted but B changed stays; the one nobody else touched is gone everywhere
    await expect(row(B.page, 'Plan the trip')).toBeVisible();
    await expect(row(B.page, 'Water the plants')).toHaveCount(0);
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Plan the trip')).toBeVisible();
    await expect(row(A.page, 'by Friday')).toHaveClass(/\bdone\b/);
    const copy = await openCopy(drive.files[0].content),
      trip = copy.days[today()].tasks.find(t => t.id === 'b2');
    expect(trip.subs.map(s => s.text)).toEqual(['Book the train', 'Pack the bags']);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('a repeat made and shown on two devices makes one task a day, not two', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      B = await device(browser, baseURL, drive, { seed: false });
    await connect(A.page, 'google');
    await done(A.page);
    await A.page.locator('#dchip').click();
    await A.page.locator('#drep').click();
    await A.page.locator('#rseg [data-f="day"]').click();
    await A.page.locator('#rdone').click();
    await add(A.page, 'Stretch');
    await syncNow(A.page, drive);
    await connect(B.page, 'google', { join: true });
    await done(B.page);
    await expect(row(B.page, 'Stretch')).toHaveCount(1);
    // tomorrow, seen on both before either syncs: each makes its occurrence
    for (const P of [A.page, B.page]) {
      await P.keyboard.press('ArrowRight');
      await expect(row(P, 'Stretch')).toHaveCount(1);
    }
    await tick(B.page, 'Stretch');
    await syncNow(B.page, drive);
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Stretch')).toHaveCount(1);
    await expect(row(A.page, 'Stretch')).toHaveClass(/\bdone\b/);
    const copy = await openCopy(drive.files[0].content);
    expect(copy.days[plus(1)].tasks.filter(t => t.text === 'Stretch')).toHaveLength(1);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('with the lock on, sync’s key is sealed with the tasks; locked, nothing syncs; unlocked, it goes on', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await A.page.locator('#lpill').click();
    await A.page.locator('#lsPass').fill('correct horse battery');
    await A.page.locator('#lsPass2').fill('correct horse battery');
    await A.page.locator('#lsOk').check();
    await A.page.locator('#lsGo').click();
    await expect(A.page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await A.page.keyboard.press('Escape');
    await connect(A.page, 'google');
    await expect(A.page.locator('#syHint')).toBeHidden();
    await done(A.page);
    const s = await stored(A.page);
    expect(s.plain).toBeNull();
    expect(JSON.parse(s.vault).sync).toMatchObject({ iv: expect.any(String), ct: expect.any(String) });
    expect(s.vault).not.toContain('Plan the trip');
    // nothing of sync in clear: its key, its copy and the sign-in are all sealed with the tasks
    expect(s.keys).toEqual(['oneday.vault']);
    expect(s.all).not.toContain('g-token');
    // locked: the key and the tasks leave the page, and the cloud hears nothing from it
    await A.page.keyboard.press('l');
    await expect(A.page.locator('#lock')).toBeVisible();
    await expect(A.page.locator('#spill')).toBeHidden();
    const B = await device(browser, baseURL, drive, { seed: false });
    await connect(B.page, 'google', { join: true });
    await done(B.page);
    await add(B.page, 'Sent while A was locked');
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Sent while A was locked');
    const lists = drive.lists;
    await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await A.page.waitForTimeout(1500);
    expect(drive.lists).toBe(lists);
    await A.page.locator('#lockPass').fill('correct horse battery');
    await A.page.locator('#lockPass').press('Enter');
    await expect(A.page.locator('#lock')).toBeHidden({ timeout: 20000 });
    await expect(row(A.page, 'Sent while A was locked')).toBeVisible({ timeout: 15000 });
    // turning the lock off keeps sync on, its key now with the tasks in clear, like them
    await A.page.keyboard.press('/');
    await A.page.locator('#slist [data-act="lockoff"]').click();
    await A.page.locator('#lsOld').fill('correct horse battery');
    await A.page.locator('#lsGo').click();
    await expect(A.page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    expect(JSON.parse((await stored(A.page)).plain).sync).toMatchObject({ cloud: 'google' });
    await A.page.reload();
    await expect(A.page.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive', { timeout: 15000 });
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('Google’s hour is up: sync asks for a sign-in, keeps the changes, and goes on after it', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    drive.tokens.clear();
    await add(A.page, 'Written after the hour');
    await expect(A.page.locator('#toast')).toContainText('Sign in to Google Drive again to sync', { timeout: 15000 });
    await expect(A.page.locator('#spill')).toHaveAttribute('aria-label', 'Sign in to Google Drive again to sync');
    const pop = A.page.waitForEvent('popup');
    await A.page.locator('#undo').click();
    await pop;
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Written after the hour');
    await expect(A.page.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive');
    expect(drive.asked).toHaveLength(2);
    await A.ctx.close();
  });

  test('in a narrow window the bar is folded: sync waits behind ⋮, with a red dot there while it waits on you', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      dot = () => A.page.locator('#kb').evaluate(n => n.classList.contains('att') && getComputedStyle(n, '::after').content !== 'none');
    await connect(A.page, 'google');
    await done(A.page);
    await A.page.setViewportSize({ width: 320, height: 700 });
    await expect(A.page.locator('.bar')).toHaveClass(/\bfolded\b/);
    expect(await dot()).toBe(false);
    drive.tokens.clear();
    await add(A.page, 'Written in a side panel');
    await expect(A.page.locator('#toast')).toContainText('Sign in to Google Drive again to sync', { timeout: 15000 });
    await expect.poll(dot).toBe(true);
    await A.page.locator('#kb').click();
    const mb = A.page.locator('#moreList [data-act="sync"]');
    await expect(mb).toHaveText('Sign in to Google Drive again to sync');
    await expect(mb).toHaveClass(/\batt\b/);
    await mb.click();
    await expect(A.page.locator('#syncd')).toBeVisible();
    await expect(A.page.locator('#sySt')).toContainText('Sign in to Google Drive again to keep syncing.');
    await A.page.keyboard.press('Escape');
    await expect(A.page.locator('#syncd')).toBeHidden();
    // wide again, ⋮ goes, and its dot with it
    await A.page.setViewportSize({ width: 1280, height: 860 });
    await expect(A.page.locator('.bar')).not.toHaveClass(/\bfolded\b/);
    await expect(A.page.locator('#kb')).toBeHidden();
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('stop syncing keeps the tasks and the copy; erasing takes the copy away and gives Google its access back', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await A.page.locator('#syNo').click();
    await expect(A.page.locator('#syT')).toHaveText('Stop syncing here?');
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#syncd')).toBeHidden();
    await expect(A.page.locator('#toast')).toContainText('Sync is off on this device');
    const s = await stored(A.page);
    expect(s.all).not.toContain('g-token');
    expect(JSON.parse(s.plain).sync).toBeUndefined();
    expect(drive.files).toHaveLength(1);
    expect(drive.revoked).toEqual([]);
    // the cloud stays beside the lock, plain again: the way to turn sync back on
    await expect(A.page.locator('#spill')).toHaveAttribute('data-s', 'off');
    await expect(A.page.locator('#spill')).toHaveAttribute('aria-label', 'Sync with your cloud');
    await expect(row(A.page, 'Plan the trip')).toBeVisible();
    // on again: the copy there opens with the same passphrase; then off, and erased
    await connect(A.page, 'google', { join: true });
    await A.page.locator('#syNo').click();
    await A.page.locator('#syErase').check();
    await expect(A.page.locator('#syHint')).toContainText('Stop syncing on your other devices first');
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#toast')).toContainText('One Day’s copy is gone from your Google Drive');
    expect(drive.files).toEqual([]);
    expect(drive.revoked).toHaveLength(1);
    expect(drive.revoked[0]).toMatch(/^token=g-token-2$/);
    await A.ctx.close();
  });

  test('forgot the sync passphrase: the copy is erased and this device starts it again; the other asks for the new one', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const B = await device(browser, baseURL, drive, { seed: { days: { [today()]: { u: 5, tasks: [{ id: 'z9', text: 'Only on B', done: false }] } } } });
    await openDialog(B.page);
    const pop = B.page.waitForEvent('popup');
    await B.page.locator('#syCh [data-c="google"]').click();
    await pop;
    await expect(B.page.locator('#syT')).toHaveText('Enter your sync passphrase', { timeout: 15000 });
    await B.page.locator('#syHint [data-sy="forgot"]').click();
    await expect(B.page.locator('#syT')).toHaveText('Start over in your Google Drive?');
    await B.page.locator('#syGo').click();
    await expect(B.page.locator('#syErr')).toHaveText('Tick the box to erase it');
    await B.page.locator('#syErase').check();
    await B.page.locator('#syGo').click();
    await expect(B.page.locator('#syT')).toHaveText('Choose a sync passphrase', { timeout: 15000 });
    await B.page.locator('#syPass').fill('a brand new sync phrase');
    await B.page.locator('#syPass2').fill('a brand new sync phrase');
    await B.page.locator('#syOk').check();
    await B.page.locator('#syGo').click();
    await idle(B.page);
    await done(B.page);
    expect(texts(await openCopy(drive.files[0].content, 'a brand new sync phrase'))).toEqual(['Only on B']);
    // A finds the copy sealed with a passphrase it doesn't hold: it asks, then keeps both sides
    await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(A.page.locator('#toast')).toContainText('Your sync passphrase changed on another device', { timeout: 15000 });
    await A.page.locator('#undo').click();
    await expect(A.page.locator('#syT')).toHaveText('Your sync passphrase changed');
    await A.page.locator('#syPass').fill('a brand new sync phrase');
    await A.page.locator('#syGo').click();
    await idle(A.page);
    await done(A.page);
    await expect(row(A.page, 'Only on B')).toBeVisible();
    await expect(row(A.page, 'Plan the trip')).toBeVisible();
    expect(texts(await openCopy(drive.files[0].content, 'a brand new sync phrase')).sort()).toEqual(['Only on B', 'Plan the trip', 'Water the plants', 'Write the report #work']);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('Dropbox: PKCE without a secret, its app folder, and a write over another device’s is refused and merged again', async ({ browser, baseURL }) => {
    const dbx = new Dropbox(),
      A = await device(browser, baseURL, dbx);
    await connect(A.page, 'dropbox');
    await expect(A.page.locator('#sySub')).toHaveText('Your tasks are kept in One Day’s own folder of your Dropbox, under Apps, encrypted with your sync passphrase.');
    await done(A.page);
    expect([...dbx.files.values()].map(f => f.path)).toEqual(['/one-day.json']);
    // another device writes the copy just before this one does: Dropbox refuses, One Day reads it again and merges
    dbx.onUpload = d => d.other();
    await add(A.page, 'After a conflict');
    await expect.poll(async () => texts(await openCopy([...dbx.files.values()][0].content)), { timeout: 15000 }).toContain('After a conflict');
    expect(dbx.conflicts).toBe(1);
    // its token runs out: renewed without a sign-in
    dbx.tokens.clear();
    await add(A.page, 'With a renewed token');
    await expect.poll(async () => texts(await openCopy([...dbx.files.values()][0].content)), { timeout: 15000 }).toContain('With a renewed token');
    await expect(A.page.locator('#toast')).not.toContainText('Sign in');
    // stopping gives this device's token back
    await openDialog(A.page);
    await A.page.locator('#syNo').click();
    await A.page.locator('#syGo').click();
    await expect.poll(() => dbx.revoked).toBe(1);
    expect(dbx.bad).toEqual([]);
    expect([...A.hosts].filter(h => !h.startsWith('localhost')).sort()).toEqual(['api.dropboxapi.com', 'content.dropboxapi.com', 'www.dropbox.com']);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('OneDrive: a personal account, its app folder, the file read from its download address, a stale eTag refused', async ({ browser, baseURL }) => {
    const od = new OneDrive(),
      A = await device(browser, baseURL, od),
      B = await device(browser, baseURL, od, { seed: false });
    await connect(A.page, 'onedrive');
    await done(A.page);
    await connect(B.page, 'onedrive', { join: true });
    await done(B.page);
    await expect(row(B.page, 'Plan the trip')).toBeVisible();
    expect(od.downloads).toBeGreaterThan(0);
    // B writes in between A's look and A's write: the If-Match A sends no longer matches
    await add(A.page, 'From A');
    await add(B.page, 'From B');
    await expect.poll(async () => texts(await openCopy(od.item.content)), { timeout: 20000 }).toEqual(expect.arrayContaining(['From A', 'From B']));
    await syncNow(A.page, od);
    await syncNow(B.page, od);
    for (const P of [A.page, B.page]) for (const t of ['From A', 'From B']) await expect(row(P, t)).toBeVisible();
    expect(od.bad).toEqual([]);
    expect([...A.hosts].filter(h => !h.startsWith('localhost')).sort()).toEqual(['graph.microsoft.com', 'login.microsoftonline.com', 'public.dm.files.1drv.com']);
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('the copy in the cloud is an encrypted backup: Import backup opens it with the passphrase', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const C = await device(browser, baseURL, new Drive(), { seed: false });
    await C.page.locator('#impf').setInputFiles({ name: 'one-day.json', mimeType: 'application/json', buffer: Buffer.from(drive.files[0].content) });
    await expect(C.page.locator('#lsT')).toHaveText('Encrypted backup');
    await C.page.locator('#lsOld').fill(PASS);
    await C.page.locator('#lsGo').click();
    await expect(C.page.locator('#toast')).toContainText('Imported 3 tasks', { timeout: 20000 });
    await expect(row(C.page, 'Plan the trip')).toBeVisible();
    await A.ctx.close();
    await C.ctx.close();
  });

  test('on a phone: in More, and the cloud’s page opens in One Day’s own window, then comes back', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive, { phone: true });
    await A.page.locator('#mbMore').tap();
    await expect(A.page.locator('#more [data-act="sync"]')).toHaveText('Sync with your cloud');
    await A.page.locator('#more [data-act="sync"]').tap();
    await expect(A.page.locator('#syncd')).toBeVisible();
    await A.page.locator('#syCh [data-c="google"]').tap();
    // away to Google, and back to One Day with the answer
    await expect(A.page.locator('#syT')).toHaveText('Choose a sync passphrase', { timeout: 20000 });
    expect(drive.asked[0].state).toMatch(/\.r$/);
    expect(new URL(A.page.url()).pathname).toBe('/');
    expect(A.page.url()).not.toContain('token');
    await A.page.locator('#syPass').fill(PASS);
    await A.page.locator('#syPass2').fill(PASS);
    await A.page.locator('#syOk').check();
    await A.page.locator('#syGo').tap();
    await idle(A.page);
    await A.page.locator('#syGo').tap();
    expect(texts(await openCopy(drive.files[0].content)).sort()).toEqual(['Plan the trip', 'Water the plants', 'Write the report #work']);
    await A.page.locator('#mbMore').tap();
    await expect(A.page.locator('#more [data-act="sync"]')).toHaveText('Synced with Google Drive');
    // a sign-in answer that isn't the one this tab asked for is left alone
    await A.page.evaluate(() => sessionStorage.setItem('oneday.signedin', JSON.stringify({ type: 'one-day-oauth', state: 'made-up.r', token: 'stolen' })));
    await A.page.reload();
    await expect(A.page.locator('#syncd')).toBeHidden();
    expect(JSON.parse((await stored(A.page)).plain).sync.auth.a).toBe('g-token-1');
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('connect-src lets in the three clouds and nothing else; the service worker keeps none of their answers', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive, { sw: true }),
      res = await A.page.request.get(baseURL + '/');
    const csp = res.headers()['content-security-policy'],
      cs = csp.split(';').find(x => x.trim().startsWith('connect-src')).trim().split(/\s+/).slice(1);
    expect([...cs].sort()).toEqual(
      [
        "'self'",
        'https://www.googleapis.com',
        'https://oauth2.googleapis.com',
        'https://api.dropboxapi.com',
        'https://content.dropboxapi.com',
        'https://graph.microsoft.com',
        'https://login.microsoftonline.com',
        'https://*.files.1drv.com',
        'https://my.microsoftpersonalcontent.com',
      ].sort(),
    );
    // the page's own policy says the same, for hosts that ignore _headers
    const meta = await A.page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(meta).toContain(cs.join(' '));
    const blocked = await A.page.evaluate(() => fetch('https://example.com/').then(() => 'sent', () => 'blocked'));
    expect(blocked).toBe('blocked');
    await expect.poll(() => A.page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10000 }).toBe(true);
    await connect(A.page, 'google');
    await done(A.page);
    await add(A.page, 'Cached? Never');
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Cached? Never');
    const cached = await A.page.evaluate(async () => {
      const out = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url);
      return out;
    });
    expect(cached.filter(u => !u.startsWith(baseURL + '/'))).toEqual([]);
    expect(cached).toContain(baseURL + '/oauth/');
    await A.ctx.close();
  });

  test('away for longer than a copy remembers (70 writes): a deletion made elsewhere goes, a rename made here stays', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      B = await device(browser, baseURL, drive, { seed: false });
    await connect(A.page, 'google');
    await done(A.page);
    await connect(B.page, 'google', { join: true });
    await done(B.page);
    await B.ctx.setOffline(true);
    await row(A.page, 'Plan the trip').hover();
    await row(A.page, 'Plan the trip').locator('.rm').click();
    await syncNow(A.page, drive);
    // seventy more writes elsewhere: past the 64 ids a copy keeps of the ones before it
    drive.files[0].content = await resealCopy(drive.files[0].content, PASS, p => {
      for (let i = 0; i < 70; i++) {
        p.hist = [p.pid, ...p.hist].slice(0, 64);
        p.pid = 'w' + i;
        p.rev++;
      }
      return p;
    });
    drive.files[0].ver++;
    await row(B.page, 'Write the report').locator('.t').dblclick();
    await B.page.keyboard.press('End');
    await B.page.keyboard.type(' today');
    await B.page.keyboard.press('Enter');
    await B.ctx.setOffline(false);
    await expect
      .poll(async () => texts(await openCopy(drive.files[0].content)).sort(), { timeout: 15000 })
      .toEqual(['Water the plants', 'Write the report #work today']);
    await expect(row(B.page, 'Plan the trip')).toHaveCount(0);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('Google Drive: a write another device wrote over unseen is merged again, from the copy it came from', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const before = drive.files[0].content;
    // one write: a tick and a deletion
    await tick(A.page, 'Write the report');
    await row(A.page, 'Plan the trip').hover();
    await row(A.page, 'Plan the trip').locator('.rm').click();
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).not.toContain('Plan the trip');
    // another device read the copy before that write and wrote over it just after: its own task in, A's changes out
    drive.files[0].content = await resealCopy(before, PASS, p => ({
      ...p,
      hist: [p.pid, ...p.hist].slice(0, 64),
      pid: 'racer1',
      rev: p.rev + 1,
      days: { ...p.days, [today()]: { u: Date.now(), tasks: [...p.days[today()].tasks, { id: 'zz1', text: 'From the other device', done: false }] } },
    }));
    drive.files[0].ver++;
    await syncNow(A.page, drive);
    await expect(row(A.page, 'From the other device')).toBeVisible();
    await expect(row(A.page, 'Plan the trip')).toHaveCount(0);
    await expect(row(A.page, 'Write the report')).toHaveClass(/\bdone\b/);
    const copy = await openCopy(drive.files[0].content);
    expect(texts(copy).sort()).toEqual(['From the other device', 'Water the plants', 'Write the report #work']);
    expect(copy.days[today()].tasks.find(t => t.id === 'a1').done).toBe(true);
    await A.ctx.close();
  });

  test('a repeat changed from its task today keeps that task today', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      wd = d => (d.getDay() + 6) % 7,
      now = new Date(),
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    await connect(A.page, 'google');
    await done(A.page);
    await A.page.locator('#dchip').click();
    await A.page.locator('#drep').click();
    await A.page.locator('#rseg [data-f="day"]').click();
    await A.page.locator('#rdone').click();
    await add(A.page, 'Stretch');
    await syncNow(A.page, drive);
    // from its card: weekly, on tomorrow's weekday only
    await row(A.page, 'Stretch').locator('.mt').click();
    await row(A.page, 'Stretch').locator('.rbtn').click();
    await A.page.locator('#rseg [data-f="week"]').click();
    await A.page.locator(`#rdays [data-d="${wd(next)}"]`).click();
    await A.page.locator(`#rdays [data-d="${wd(now)}"]`).click();
    await A.page.locator('#rdone').click();
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Stretch')).toHaveCount(1);
    const copy = await openCopy(drive.files[0].content);
    expect(copy.days[today()].tasks.filter(t => t.text === 'Stretch')).toHaveLength(1);
    await A.ctx.close();
  });

  test('forgot the new passphrase, where this device asks for it: the copy is started again from here', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    // another device sealed the copy again with a passphrase A doesn't know
    drive.files[0].content = await resealCopy(drive.files[0].content, PASS, p => p);
    const env = JSON.parse(drive.files[0].content);
    env.vault.kid = 'another-key-id';
    drive.files[0].content = JSON.stringify(env);
    drive.files[0].ver++;
    await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(A.page.locator('#toast')).toContainText('Your sync passphrase changed on another device', { timeout: 15000 });
    await A.page.locator('#undo').click();
    await expect(A.page.locator('#syT')).toHaveText('Your sync passphrase changed');
    await A.page.locator('#syHint [data-sy="forgot"]').click();
    await A.page.locator('#syErase').check();
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#syT')).toHaveText('Choose a sync passphrase', { timeout: 15000 });
    await A.page.locator('#syPass').fill('a third sync phrase');
    await A.page.locator('#syPass2').fill('a third sync phrase');
    await A.page.locator('#syOk').check();
    await A.page.locator('#syGo').click();
    await idle(A.page);
    expect(drive.files).toHaveLength(1);
    expect(texts(await openCopy(drive.files[0].content, 'a third sync phrase')).sort()).toEqual(['Plan the trip', 'Water the plants', 'Write the report #work']);
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('two tabs of one browser: sync turned off in one is off in the other, which puts nothing back', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const tab = await A.ctx.newPage();
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.goto(baseURL + '/');
    await expect(tab.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive', { timeout: 15000 });
    await openDialog(A.page);
    await A.page.locator('#syNo').click();
    await A.page.locator('#syErase').check();
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#toast')).toContainText('One Day’s copy is gone from your Google Drive');
    await expect(tab.locator('#spill')).toHaveAttribute('data-s', 'off', { timeout: 10000 });
    await add(tab, 'Written in the other tab');
    await tab.waitForTimeout(3500);
    expect(drive.files).toEqual([]);
    expect(JSON.parse(await tab.evaluate(() => localStorage.getItem('oneday.v1'))).sync).toBeUndefined();
    await A.ctx.close();
  });

  test('an older tab that turns sync on doesn’t take away what a newer tab added: that tab syncs it too', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive),
      tab = await A.ctx.newPage();
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.goto(baseURL + '/');
    await expect(tab.locator('#app')).not.toHaveClass(/\bpre\b/);
    await add(tab, 'Added in the newer tab');
    // the first tab, opened before it, turns sync on with what it holds
    await connect(A.page, 'google');
    await done(A.page);
    await expect(row(tab, 'Added in the newer tab')).toBeVisible();
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Added in the newer tab');
    await expect(tab.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive');
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Added in the newer tab')).toBeVisible();
    expect(drive.files).toHaveLength(1);
    await A.ctx.close();
  });

  test('signed in again in one tab, the other tabs sync again too', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const tab = await A.ctx.newPage();
    await tab.emulateMedia({ reducedMotion: 'reduce' });
    await tab.goto(baseURL + '/');
    await expect(tab.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive', { timeout: 15000 });
    // the hour is up
    drive.tokens.clear();
    await add(tab, 'Waiting in the other tab');
    await expect(tab.locator('#spill')).toHaveAttribute('aria-label', 'Sign in to Google Drive again to sync', { timeout: 15000 });
    await add(A.page, 'Written here');
    await expect(A.page.locator('#toast')).toContainText('Sign in to Google Drive again to sync', { timeout: 15000 });
    const pop = A.page.waitForEvent('popup');
    await A.page.locator('#undo').click();
    await pop;
    await expect(tab.locator('#spill')).toHaveAttribute('aria-label', 'Synced with Google Drive', { timeout: 15000 });
    await expect
      .poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 })
      .toEqual(expect.arrayContaining(['Waiting in the other tab', 'Written here']));
    await A.ctx.close();
  });

  test('an older version restored in the cloud, then written on: a task made after it is kept, not deleted', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await done(A.page);
    const old = drive.files[0].content;
    // two writes after it, so this device keeps no copy from before them
    await add(A.page, 'Made after the old copy');
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('Made after the old copy');
    await add(A.page, 'And another one');
    await expect.poll(async () => texts(await openCopy(drive.files[0].content)), { timeout: 15000 }).toContain('And another one');
    // the old version comes back (the cloud's version history), and another device writes on it three times
    drive.files[0].content = await resealCopy(old, PASS, p => {
      for (let i = 0; i < 3; i++) {
        p.hist = [p.pid, ...p.hist].slice(0, 64);
        p.pid = 'back' + i;
        p.rev++;
      }
      return p;
    });
    drive.files[0].ver++;
    const before = JSON.parse(await openCopy(old).then(x => JSON.stringify(x)));
    await syncNow(A.page, drive);
    await expect(row(A.page, 'Made after the old copy')).toBeVisible();
    const copy = await openCopy(drive.files[0].content);
    expect(texts(copy)).toEqual(expect.arrayContaining(['Made after the old copy', 'And another one']));
    // a line of its own from here: devices on the old one keep both sides too
    expect(copy.epoch).not.toBe(before.epoch);
    await A.ctx.close();
  });

  test('a cloud that never answers while the copy is erased: One Day gives up, says so, and the dialog can be closed', async ({ browser, baseURL }) => {
    test.slow();
    const drive = new Drive(),
      A = await device(browser, baseURL, drive);
    await connect(A.page, 'google');
    await A.ctx.route('https://www.googleapis.com/drive/v3/files/**', route => (route.request().method() === 'DELETE' ? new Promise(() => {}) : route.fallback()));
    await A.page.locator('#syNo').click();
    await A.page.locator('#syErase').check();
    await A.page.locator('#syGo').click();
    await expect(A.page.locator('#syGo')).toHaveText('Erasing…');
    // at work, the dialog stays
    await A.page.keyboard.press('Escape');
    await expect(A.page.locator('#syncd')).toBeVisible();
    await expect(A.page.locator('#syErr')).toHaveText('Google Drive couldn’t be reached. One Day tries again in a moment.', { timeout: 60000 });
    await A.page.keyboard.press('Escape');
    await expect(A.page.locator('#syncd')).toBeHidden();
    // nothing was stopped: sync is still on, the copy still there
    await expect(A.page.locator('#spill')).toBeVisible();
    expect(drive.files).toHaveLength(1);
    expect(await A.page.evaluate(() => document.getElementById('home').inert)).toBe(false);
    await A.ctx.close();
  });

  test('the same task id on two days (an old backup imported after a move): both copies sync', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      t = { id: 'dup', text: 'Pay the rent', done: false },
      A = await device(browser, baseURL, drive, { seed: { days: { [today()]: { u: 1, tasks: [t] }, [plus(1)]: { u: 1, tasks: [t] } } } });
    await connect(A.page, 'google');
    await done(A.page);
    const copy = await openCopy(drive.files[0].content);
    expect(copy.days[today()].tasks.map(x => x.text)).toEqual(['Pay the rent']);
    expect(copy.days[plus(1)].tasks.map(x => x.text)).toEqual(['Pay the rent']);
    await expect(row(A.page, 'Pay the rent')).toHaveCount(1);
    await A.page.keyboard.press('ArrowRight');
    await expect(row(A.page, 'Pay the rent')).toHaveCount(1);
    await A.ctx.close();
  });

  test('a day whose open tasks were carried on stays out of the full days on the other device, after a merge', async ({ browser, baseURL }) => {
    const drive = new Drive(),
      y = plus(-1),
      seed = {
        days: {
          [y]: {
            u: 1,
            tasks: [
              { id: 'y1', text: 'Done yesterday', done: true, at: 1 },
              { id: 'y2', text: 'Left yesterday', done: false },
            ],
          },
          [today()]: { u: 1, tasks: [{ id: 't1', text: 'Today’s own task', done: false }] },
        },
      },
      A = await device(browser, baseURL, drive, { seed }),
      B = await device(browser, baseURL, drive, { seed }),
      days = page => page.evaluate(() => JSON.parse(localStorage.getItem('oneday.v1')).days);
    await connect(A.page, 'google');
    await done(A.page);
    await connect(B.page, 'google', { join: true });
    await done(B.page);
    // on A, yesterday's open task comes to today: yesterday keeps its mark, and its one ticked task makes no full day
    await A.page.locator('#bring').click();
    await expect(row(A.page, 'Left yesterday')).toBeVisible();
    expect((await days(A.page))[y].moved).toBe(1);
    await expect(A.page.locator('#dd')).toBeHidden();
    await syncNow(A.page, drive);
    // B changed something of its own meanwhile: the two are merged, task by task, and the mark comes with them
    await add(B.page, 'Written on B');
    await syncNow(B.page, drive);
    await expect(row(B.page, 'Left yesterday')).toBeVisible();
    await expect(row(B.page, 'Written on B')).toBeVisible();
    const b = await days(B.page);
    expect(b[y].tasks.map(t => t.text)).toEqual(['Done yesterday']);
    expect(b[y].moved).toBe(1);
    await expect(B.page.locator('#dd')).toBeHidden();
    // and the copy in the cloud keeps it, sealed with the rest
    const copy = await openCopy(drive.files[0].content);
    expect(copy.days[y].moved).toBe(1);
    expect(copy.days[today()].moved).toBeUndefined();
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });
});

test.describe('sync, scanned (axe, WCAG 2.2 AA)', () => {
  test.describe.configure({ timeout: 60000 });
  const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const states = {
    'the clouds': async page => openDialog(page),
    'a new passphrase': async page => {
      await openDialog(page);
      const pop = page.waitForEvent('popup');
      await page.locator('#syCh [data-c="google"]').click();
      await pop;
      await expect(page.locator('#syT')).toHaveText('Choose a sync passphrase', { timeout: 15000 });
      await page.locator('#syGo').click();
      await expect(page.locator('#syErr')).toHaveText('Use 12 characters or more');
    },
    'sync on': async page => connect(page, 'google'),
    'stopping, with the copy erased': async page => {
      await connect(page, 'google');
      await page.locator('#syNo').click();
      await page.locator('#syErase').check();
    },
    'search with sync on': async page => {
      await connect(page, 'google');
      await done(page);
      await page.keyboard.press('/');
    },
  };
  for (const scheme of ['light', 'dark'])
    for (const [name, go] of Object.entries(states))
      test(`${name}, ${scheme}`, async ({ browser, baseURL }) => {
        const A = await device(browser, baseURL, new Drive(), { scheme });
        await go(A.page);
        await A.page.waitForTimeout(450);
        const { violations } = await scan(A.page);
        expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
        await A.ctx.close();
      });
  test('More on a phone with sync on, light', async ({ browser, baseURL }) => {
    const A = await device(browser, baseURL, new Drive(), { phone: true });
    await A.page.locator('#mbMore').tap();
    await A.page.waitForTimeout(450);
    const { violations } = await scan(A.page);
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await A.ctx.close();
  });
});
