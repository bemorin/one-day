// Moving to getone.day: One Day's old address (day.bemorin.com) and its new one (getone.day), each at its real
// origin inside the test's browser (tests/hosts.mjs), nothing online. A browser with nothing kept at the old address
// goes on at once; one with tasks moves them in one step, nothing lost; once moved, the old address remembers.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hosts, cloudAt, OLD, NEW } from './hosts.mjs';
import { answer, parseHeaders, headersFor } from '../scripts/pages.mjs';
import { Drive } from './clouds.mjs';

test.describe.configure({ timeout: 90000 });

const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plus = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return key(d);
};
const today = () => plus(0);
// a browser's One Day at the old address: open and done tasks, a note, sub-tasks, a day carried on, a repeat, a tag
const seed = () => ({
  days: {
    [plus(-1)]: { u: 1764000000000, moved: 1, tasks: [{ id: 'c3', text: 'Call the bank', done: true, at: 1763990000000 }] },
    [today()]: {
      u: 1764100000000,
      tasks: [
        {
          id: 'a1',
          text: 'Write the report #work',
          done: false,
          note: 'Bring the <b>numbers</b>',
          subs: [
            { id: 's1', text: 'Draft it', done: true },
            { id: 's2', text: 'Send it', done: false },
          ],
        },
        { id: 'b2', text: 'Water the plants', done: true, at: 1764100001000 },
      ],
    },
    [plus(3)]: { u: 1764100002000, tasks: [{ id: 'd4', text: 'Book the train', done: false }] },
  },
  rules: { w1: { id: 'w1', text: 'Weekly review #work', start: today(), freq: 'week', every: 1, days: [0, 2, 4] } },
  tags: { work: 'blue' },
});
const TIMER = JSON.stringify({ mode: 'live', min: 40, dur: 24e5, end: 0, left: 0, st: 'idle' });
const IDS = [/CLOUD_IDS = \{[^}]*\}/, "CLOUD_IDS = { google: 'test.apps.googleusercontent.com', dropbox: 'testappkey', onedrive: '00000000-test' }"];
const PASS = 'a long sync passphrase',
  LOCK = 'correct horse battery';

async function browserAt(browser, o = {}) {
  const ctx = await browser.newContext({ serviceWorkers: o.sw ? 'allow' : 'block', viewport: { width: 1280, height: 860 } }),
    errors = [];
  await hosts(ctx, o);
  if (o.clouds) for (const c of o.clouds) await cloudAt(ctx, c);
  if (o.init) await ctx.addInitScript(o.init);
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});
  });
  return { ctx, errors };
}
// what a browser keeps for an address, read on a page there that runs nothing of One Day (its 404)
async function storageAt(ctx, origin) {
  const p = await ctx.newPage();
  await p.goto(origin + '/nothing-here');
  const all = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  await p.close();
  return all;
}
async function keepAt(ctx, origin, items) {
  const p = await ctx.newPage();
  await p.goto(origin + '/nothing-here');
  await p.evaluate(it => {
    for (const [k, v] of Object.entries(it)) localStorage.setItem(k, v);
  }, items);
  await p.close();
}
const tasksOf = j => Object.values(j.days).flatMap(d => d.tasks);
const row = (page, text) => page.locator('#list .row', { hasText: text });
const origin = u => new URL(u).origin;
// the step at the old address, then the window at getone.day, which closes once the tasks are there
async function move(page) {
  await expect(page.locator('#mv')).toBeVisible();
  const pop = page.waitForEvent('popup');
  await page.locator('#mvGo').click();
  const w = await pop;
  // it may close before it is watched: what counts is that it did
  await expect.poll(() => w.isClosed(), { timeout: 20000 }).toBe(true);
  await page.waitForURL(u => origin(u) === NEW);
}
async function welcomed(page) {
  await expect(page.locator('#mvin')).toBeVisible();
  await expect(page.locator('#mviT')).toHaveText('Your tasks are here');
  await page.locator('#mviYes').click();
  await expect(page.locator('#mvin')).toBeHidden();
}
async function fresh(ctx) {
  const page = await ctx.newPage();
  await page.goto(OLD + '/');
  return page;
}
async function protect(page, pass = LOCK) {
  await page.locator('#lpill').click();
  await page.locator('#lsPass').fill(pass);
  await page.locator('#lsPass2').fill(pass);
  await page.locator('#lsOk').check();
  await page.locator('#lsGo').click();
  await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
}
// getone.day's window as if it cut itself off from the page that opened it (the first time only)
const sever = () => {
  let n = 0;
  return (url, a) => (url.origin === NEW && url.pathname === '/move/' && n++ === 0 ? { ...a, headers: { ...a.headers, 'Cross-Origin-Opener-Policy': 'same-origin' } } : undefined);
};
// the step fails, then the link
async function byLink(page) {
  await expect(page.locator('#mv')).toBeVisible();
  const pop = page.waitForEvent('popup');
  await page.locator('#mvGo').click();
  await pop;
  await expect(page.locator('#mvT')).toHaveText('getone.day didn’t answer', { timeout: 20000 });
  await page.locator('#mvLink').click();
  await page.waitForURL(NEW + '/');
  await expect(page.locator('#mviT')).toHaveText('Bring these tasks here?');
}

test.describe('moving to getone.day', () => {
  test('a browser with nothing kept at day.bemorin.com goes on to getone.day, with its #add link and the rest of the address', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser);
    const page = await ctx.newPage();
    await page.goto(OLD + '/#add?task=Buy+bread&day=tomorrow');
    await page.waitForURL(u => origin(u) === NEW);
    await expect(page.locator('#inbox')).toBeVisible();
    await expect(page.locator('#inTitle')).toHaveText('Buy bread');
    await page.goto(OLD + '/guide/#sync');
    await page.waitForURL(NEW + '/guide/#sync');
    // the Android app's mark goes along (getone.day takes it out of the address there)
    const asked = [];
    page.on('request', r => asked.push(r.url()));
    await page.goto(OLD + '/?app=android');
    await page.waitForURL(u => origin(u) === NEW);
    expect(asked).toContain(NEW + '/?app=android');
    // nothing was written at the old address
    expect(await storageAt(ctx, OLD)).toEqual({});
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('a browser with tasks moves them in one step, nothing lost, settings included; the old copy stays', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser);
    const data = seed();
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(data), 'oneday.timer': TIMER, 'oneday.theme': 'dark' });
    const page = await fresh(ctx);
    await expect(page.locator('#mvT')).toHaveText('One Day has moved to getone.day');
    await expect(page.locator('#mvSub')).toContainText('never through a server');
    await expect(page.locator('#mvPass')).toBeHidden();
    await move(page);
    await welcomed(page);
    await expect(row(page, 'Write the report')).toBeVisible();
    const there = await storageAt(ctx, NEW),
      got = JSON.parse(there['oneday.v1']);
    for (const t of tasksOf(data)) expect(tasksOf(got).find(x => x.id === t.id)).toEqual(t);
    expect(got.rules).toEqual(data.rules);
    expect(got.tags).toEqual(data.tags);
    expect(got.days[plus(-1)].moved).toBe(1);
    expect(there['oneday.timer']).toBe(TIMER);
    expect(there['oneday.theme']).toBe('dark');
    expect(there['oneday.incoming']).toBeUndefined();
    expect(JSON.parse(there['oneday.movedin'])).toMatchObject({ from: OLD, copy: true, shown: true, sync: '', locked: false });
    // the old address remembers what went, and keeps its copy until it is cleared
    const left = await storageAt(ctx, OLD),
      moved = JSON.parse(left['oneday.moved']);
    expect(moved).toMatchObject({ to: NEW, how: 'window' });
    expect(typeof moved.keep).toBe('string');
    const kept = JSON.parse(left['oneday.v1']);
    for (const t of tasksOf(data)) expect(tasksOf(kept).find(x => x.id === t.id)).toEqual(t);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('the Android app’s mark goes along with the move', async ({ browser }) => {
    const { ctx } = await browserAt(browser),
      asked = [];
    ctx.on('request', r => asked.push(r.url()));
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await ctx.newPage();
    await page.goto(OLD + '/?app=android');
    await move(page);
    expect(asked).toContain(NEW + '/?app=android');
    await ctx.close();
  });

  test('a link’s tasks go along to getone.day; Not now adds them here, and the step comes back next time', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await ctx.newPage();
    await page.goto(OLD + '/#add?task=Pay+the+rent');
    await expect(page.locator('#mvLi')).toContainText('The tasks in your link go there too.');
    await page.locator('#mvNo').click();
    await expect(page.locator('#mv')).toBeHidden();
    await expect(page.locator('#inTitle')).toHaveText('Pay the rent');
    await page.locator('#inYes').click();
    await expect(row(page, 'Pay the rent')).toBeVisible();
    expect(origin(page.url())).toBe(OLD);
    // a new link in this open tab: the step again, and this time the link's tasks move with the rest
    await page.evaluate(() => (location.hash = '#add?task=Feed+the+cat'));
    await expect(page.locator('#mvLi')).toContainText('The tasks in your link go there too.');
    await move(page);
    await welcomed(page);
    await expect(page.locator('#inTitle')).toHaveText('Feed the cat');
    await page.locator('#inYes').click();
    await expect(row(page, 'Pay the rent')).toBeVisible();
    await expect(row(page, 'Feed the cat')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('tasks already at getone.day are merged with what comes: each task keeps its latest change, none is lost', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()), 'oneday.timer': TIMER, 'oneday.theme': 'dark' });
    // a1 changed earlier here, d4 later here (each day's u says when), and one task of its own
    const mine = {
      days: {
        [today()]: { u: 5, tasks: [{ id: 'a1', text: 'My older version', done: false }, { id: 'z9', text: 'Only here', done: false }] },
        [plus(3)]: { u: 1900000000000, tasks: [{ id: 'd4', text: 'Book the night train', done: false }] },
      },
      rules: {},
      tags: {},
    };
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify(mine), 'oneday.theme': 'light' });
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#toast')).toContainText('came from day.bemorin.com');
    await welcomed(page);
    const there = await storageAt(ctx, NEW),
      got = JSON.parse(there['oneday.v1']),
      t = id => tasksOf(got).filter(x => x.id === id);
    expect(t('a1').map(x => x.text)).toEqual(['Write the report #work']);
    expect(t('d4').map(x => x.text)).toEqual(['Book the night train']);
    for (const id of ['z9', 'b2', 'c3']) expect(t(id)).toHaveLength(1);
    expect(got.rules.w1).toBeTruthy();
    // the settings come where there are none here
    expect(there['oneday.theme']).toBe('light');
    expect(there['oneday.timer']).toBe(TIMER);
    await ctx.close();
  });

  test('once moved, day.bemorin.com goes on every time, other tabs too; tasks changed there later come too, edits included', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const other = await fresh(ctx);
    await expect(other.locator('#mv')).toBeVisible();
    await other.locator('#mvNo').click();
    const page = await fresh(ctx);
    await move(page);
    await welcomed(page);
    // the tab left open at the old address goes on as well
    await other.waitForURL(u => origin(u) === NEW);
    await page.goto(OLD + '/');
    await page.waitForURL(NEW + '/');
    await page.goto(OLD + '/#add?task=Buy+stamps');
    await page.waitForURL(u => origin(u) === NEW);
    await expect(page.locator('#inTitle')).toHaveText('Buy stamps');
    await page.goto(OLD + '/guide/');
    await page.waitForURL(NEW + '/guide/');
    // at getone.day, a task deleted since the move
    const n1 = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']);
    n1.days[today()].tasks = n1.days[today()].tasks.filter(x => x.id !== 'b2');
    n1.days[today()].u = Date.now();
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify(n1) });
    // at day.bemorin.com, an old tab changed things after the move: a note, a sub-task, a tick, a new task
    const o = JSON.parse((await storageAt(ctx, OLD))['oneday.v1']),
      a1 = o.days[today()].tasks.find(x => x.id === 'a1'),
      d4 = o.days[plus(3)].tasks.find(x => x.id === 'd4');
    a1.note = 'Bring the <b>new</b> numbers';
    a1.subs.push({ id: 's3', text: 'Print it', done: false });
    o.days[today()].tasks.push({ id: 'late1', text: 'Written after the move', done: false });
    o.days[today()].u = Date.now() + 1000;
    d4.done = true;
    d4.at = Date.now();
    o.days[plus(3)].u = Date.now() + 1000;
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(o) });
    await page.goto(OLD + '/');
    await expect(page.locator('#mvT')).toHaveText('Some tasks changed here');
    await move(page);
    await expect(page.locator('#toast')).toContainText('came from day.bemorin.com');
    await welcomed(page);
    const got = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']),
      t = id => tasksOf(got).find(x => x.id === id);
    expect(t('a1').note).toBe('Bring the <b>new</b> numbers');
    expect(t('a1').subs.map(s => s.text)).toEqual(['Draft it', 'Send it', 'Print it']);
    expect(t('d4').done).toBe(true);
    expect(t('late1').text).toBe('Written after the move');
    // deleted at getone.day since the first move: it stays deleted
    expect(t('b2')).toBeUndefined();
    await ctx.close();
  });

  test('the copy left at day.bemorin.com goes only after a yes there, Keep it first', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()), 'oneday.timer': TIMER });
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#mviLi')).toContainText('A copy stays at day.bemorin.com');
    await page.locator('#mviNo').click();
    await page.waitForURL(OLD + '/#clear-old-copy');
    await expect(page.locator('#mvclr')).toBeVisible();
    await expect(page.locator('#mvcT')).toHaveText('Clear the old copy?');
    // Enter keeps it
    await expect(page.locator('#mvcNo')).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForURL(NEW + '/');
    expect((await storageAt(ctx, OLD))['oneday.v1']).toBeTruthy();
    // later, from search: the same question, and a yes this time
    await expect(page.locator('#mvin')).toBeHidden();
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="oldcopy"]').click();
    await page.waitForURL(OLD + '/#clear-old-copy');
    await page.locator('#mvcYes').click();
    await page.waitForURL(NEW + '/');
    await expect(page.locator('#toast')).toContainText('The old copy at day.bemorin.com is cleared');
    const left = await storageAt(ctx, OLD);
    expect(Object.keys(left)).toEqual(['oneday.moved']);
    // only that the tasks moved: no copy of them
    expect(Object.keys(JSON.parse(left['oneday.moved'])).sort()).toEqual(['at', 'cleared', 'sig', 'to']);
    await page.keyboard.press('/');
    await expect(page.locator('#slist .sdata')).toBeVisible();
    await expect(page.locator('#slist [data-act="oldcopy"]')).toHaveCount(0);
    // still on to getone.day afterwards
    await page.goto(OLD + '/');
    await page.waitForURL(NEW + '/');
    await ctx.close();
  });

  test('locked tasks move still locked: the same passphrase opens them at getone.day, and the passkey stays behind', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.locator('#mvNo').click();
    await protect(page);
    const before = JSON.parse((await storageAt(ctx, OLD))['oneday.vault']);
    await page.reload();
    await page.locator('#lockPass').fill(LOCK);
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#mvLi')).toContainText('They move locked');
    // unlocked with the passphrase just now: not asked again
    await expect(page.locator('#mvPass')).toBeHidden();
    await move(page);
    await expect(page.locator('#lock')).toBeVisible();
    const vault = JSON.parse((await storageAt(ctx, NEW))['oneday.vault']);
    expect(vault.data).toEqual(before.data);
    expect(vault.kdf).toEqual(before.kdf);
    expect(vault.bio).toBeUndefined();
    expect(vault.sync).toBeUndefined();
    expect((await storageAt(ctx, NEW))['oneday.v1']).toBeUndefined();
    await page.locator('#lockPass').fill(LOCK);
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#lock')).toBeHidden({ timeout: 20000 });
    await welcomed(page);
    await expect(row(page, 'Write the report')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('with the lock on and the page not opened with the passphrase, the step asks for it, and a wrong one moves nothing', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.locator('#mvNo').click();
    await protect(page);
    // a link brings the step back in this page, which was never unlocked with the passphrase
    await page.evaluate(() => (location.hash = '#add?task=Pay+the+rent'));
    await expect(page.locator('#mvPass')).toBeVisible();
    await page.locator('#mvPass').fill('not the passphrase');
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    const w = await pop;
    await expect(page.locator('#mvErr')).toHaveText('That passphrase doesn’t open these tasks');
    await expect.poll(() => w.isClosed()).toBe(true);
    expect((await storageAt(ctx, OLD))['oneday.moved']).toBeUndefined();
    await page.locator('#mvPass').fill(LOCK);
    await move(page);
    await expect(page.locator('#lock')).toBeVisible();
    await ctx.close();
  });

  test('sync: it stops at the old address, whose tabs never talk to the cloud again; reconnected at getone.day, everything comes back once', async ({ browser }) => {
    const drive = new Drive(),
      { ctx } = await browserAt(browser, { patch: [IDS], clouds: [drive] }),
      late = [];
    let after = false;
    ctx.on('request', r => {
      let o = '';
      try {
        o = origin(r.frame().url());
      } catch (e) {}
      if (after && o === OLD && /googleapis\.com/.test(r.url())) late.push(r.url());
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.locator('#mvNo').click();
    // sync on at the old address, with Google Drive
    await page.locator('#spill:visible, #syncb:visible').first().click();
    const pop = page.waitForEvent('popup');
    await page.locator('#syCh [data-c="google"]').click();
    await expect.poll(async () => (await pop).isClosed(), { timeout: 15000 }).toBe(true);
    await page.locator('#syPass').fill(PASS);
    await page.locator('#syPass2').fill(PASS);
    await page.locator('#syOk').check();
    await page.locator('#syGo').click();
    await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
    await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
    await page.locator('#syGo').click();
    await expect(page.locator('#syncd')).toBeHidden();
    expect(drive.files.length).toBe(1);
    // this tab stays open at the old address, syncing; another one moves
    const mover = await fresh(ctx);
    await expect(mover.locator('#mvLi')).toContainText('Sync with your Google Drive stops here');
    await move(mover);
    after = true;
    // no key, no sign-in left at the old address, and the open tab goes on to getone.day without asking the cloud
    expect(JSON.parse((await storageAt(ctx, OLD))['oneday.v1']).sync).toBeUndefined();
    await page.waitForURL(u => origin(u) === NEW);
    await page.waitForTimeout(1500);
    expect(late).toEqual([]);
    await expect(mover.locator('#mviLi')).toContainText('Sync was on there');
    await mover.locator('#mviYes').click();
    // reconnected at getone.day: the same cloud and passphrase
    await mover.locator('#spill:visible, #syncb:visible').first().click();
    const pop2 = mover.waitForEvent('popup');
    await mover.locator('#syCh [data-c="google"]').click();
    await expect.poll(async () => (await pop2).isClosed(), { timeout: 15000 }).toBe(true);
    await expect(mover.locator('#syT')).toHaveText('Enter your sync passphrase', { timeout: 15000 });
    await mover.locator('#syPass').fill(PASS);
    await mover.locator('#syGo').click();
    await expect(mover.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
    await expect(mover.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
    const got = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']),
      ids = tasksOf(got).map(t => t.id);
    for (const t of tasksOf(seed())) expect(ids.filter(id => id === t.id)).toHaveLength(1);
    expect(late).toEqual([]);
    await ctx.close();
  });

  test('a getone.day tab left open opens again with what came, and writes nothing over it', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify({ days: { [today()]: { u: 5, tasks: [{ id: 'z9', text: 'Only here', done: false }] } }, rules: {}, tags: {} }) });
    const other = await ctx.newPage();
    await other.goto(NEW + '/');
    await expect(row(other, 'Only here')).toBeVisible();
    const reloaded = other.waitForEvent('load');
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#mvin')).toBeVisible();
    await reloaded;
    // it shows what came, and what it adds now goes beside it
    await welcomed(other);
    await welcomed(page);
    await expect(row(other, 'Write the report')).toBeVisible();
    await other.locator('#input').fill('Added in the other tab');
    await other.locator('#input').press('Enter');
    await expect(row(other, 'Added in the other tab')).toBeVisible();
    const got = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']),
      texts = tasksOf(got).map(t => t.text);
    for (const x of ['Write the report #work', 'Water the plants', 'Only here', 'Added in the other tab']) expect(texts).toContain(x);
    await ctx.close();
  });

  test('a browser with no room at getone.day keeps what came aside, says so, and adds it once there is room', async ({ browser }) => {
    const { ctx } = await browserAt(browser, {
      init: () => {
        if (location.origin !== 'https://getone.day') return;
        const set = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (this === localStorage && k === 'oneday.v1' && localStorage.getItem('oneday.incoming') && !sessionStorage.getItem('room'))
            throw new DOMException('full', 'QuotaExceededError');
          return set.call(this, k, v);
        };
      },
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify({ days: { [today()]: { u: 5, tasks: [{ id: 'z9', text: 'Only here', done: false }] } }, rules: {}, tags: {} }) });
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#toast')).toContainText('This browser has no room left for these tasks');
    let there = await storageAt(ctx, NEW);
    expect(there['oneday.incoming']).toBeTruthy();
    expect(there['oneday.movedin']).toBeUndefined();
    expect(tasksOf(JSON.parse(there['oneday.v1'])).map(t => t.id)).toEqual(['z9']);
    await expect(page.locator('#mvin')).toBeHidden();
    // room again: the next opening adds them
    await page.evaluate(() => sessionStorage.setItem('room', '1'));
    await page.reload();
    await welcomed(page);
    there = await storageAt(ctx, NEW);
    expect(there['oneday.incoming']).toBeUndefined();
    expect(tasksOf(JSON.parse(there['oneday.v1'])).map(t => t.id)).toEqual(expect.arrayContaining(['z9', 'a1', 'b2']));
    await ctx.close();
  });

  test('where getone.day’s window can’t answer, a link carries the tasks: getone.day asks, and the old address remembers only once they are added', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser, { on: sever() });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await byLink(page);
    expect(await page.evaluate(() => location.hash)).toBe('');
    expect((await storageAt(ctx, OLD))['oneday.moved']).toBeUndefined();
    await page.locator('#mviYes').click();
    await welcomed(page);
    await expect(row(page, 'Write the report')).toBeVisible();
    const left = await storageAt(ctx, OLD);
    expect(JSON.parse(left['oneday.moved'])).toMatchObject({ to: NEW, how: 'link' });
    expect(left['oneday.moving']).toBeUndefined();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('a link’s question: Escape or a lock asks again later, Cancel lets it go, and nothing is lost either way', async ({ browser }) => {
    const { ctx } = await browserAt(browser, { on: sever() });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify({ days: { [today()]: { u: 5, tasks: [{ id: 'z9', text: 'Only here', done: false }] } }, rules: {}, tags: {} }) });
    const page = await fresh(ctx);
    await byLink(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#mvin')).toBeHidden();
    expect((await storageAt(ctx, NEW))['oneday.incoming']).toBeTruthy();
    expect((await storageAt(ctx, OLD))['oneday.moved']).toBeUndefined();
    // asked again; Cancel this time
    await page.reload();
    await expect(page.locator('#mviT')).toHaveText('Bring these tasks here?');
    await page.locator('#mviNo').click();
    await expect(page.locator('#mvin')).toBeHidden();
    expect((await storageAt(ctx, NEW))['oneday.incoming']).toBeUndefined();
    expect((await storageAt(ctx, OLD))['oneday.moved']).toBeUndefined();
    // the tasks are still at the old address, which offers the step again
    await page.goto(OLD + '/');
    await expect(page.locator('#mvT')).toHaveText('One Day has moved to getone.day');
    await ctx.close();
  });

  test('a moving link made by someone else is asked about, and Cancel adds nothing', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    const json = JSON.stringify({
        kind: 'one-day-move',
        v: 1,
        from: OLD,
        at: Date.now(),
        n: 1,
        sync: '',
        app: false,
        tasks: { days: { [today()]: { u: 1, tasks: [{ id: 'x1', text: 'Planted task', done: false }] } }, rules: {}, tags: {} },
      }),
      z = deflateRawSync(Buffer.from(json)).toString('base64url');
    const page = await ctx.newPage();
    await page.goto(NEW + '/move/#v1.abcdefgh12.' + z);
    await page.waitForURL(NEW + '/');
    await expect(page.locator('#mviT')).toHaveText('Bring these tasks here?');
    await page.locator('#mviNo').click();
    await expect(page.locator('#mvin')).toBeHidden();
    const there = await storageAt(ctx, NEW);
    expect(there['oneday.incoming']).toBeUndefined();
    expect(JSON.stringify(there)).not.toContain('Planted task');
    expect(await storageAt(ctx, OLD)).toEqual({});
    await ctx.close();
  });

  test('getone.day’s window takes tasks from day.bemorin.com’s page alone', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    const json = JSON.stringify({ kind: 'one-day-move', v: 1, tasks: { days: { [today()]: { u: 1, tasks: [{ id: 'e1', text: 'From elsewhere', done: false }] } }, rules: {}, tags: {} } }),
      sum = createHash('sha256').update(json).digest('hex');
    await ctx.route('https://elsewhere.example/**', r =>
      r.fulfill({
        contentType: 'text/html',
        body: `<button id="b">Open</button><script>
          b.onclick = () => {
            const w = window.open('${NEW}/move/', 'x');
            setInterval(() => w.postMessage({ type: 'one-day-move', v: 1, step: 'data', id: 'abcdefgh12', json: ${JSON.stringify(json)}, sum: '${sum}' }, '${NEW}'), 300);
          };
        </script>`,
      }),
    );
    const page = await ctx.newPage();
    await page.goto('https://elsewhere.example/');
    const pop = page.waitForEvent('popup');
    await page.locator('#b').click();
    const w = await pop;
    await w.waitForLoadState();
    await page.waitForTimeout(2000);
    await expect(w.locator('#note')).toHaveText('Bringing your tasks to getone.day…');
    expect((await storageAt(ctx, NEW))['oneday.incoming']).toBeUndefined();
    await ctx.close();
  });

  test('an app on an iPhone’s Home Screen moves by a backup file, then says where One Day lives, its copy still at hand', async ({ browser }) => {
    const { ctx } = await browserAt(browser, { init: () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }) });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await expect(page.locator('#mvSub')).toContainText('keeps its own copy');
    await expect(page.locator('#mvLi li')).toHaveCount(3);
    const dl = page.waitForEvent('download');
    await page.locator('#mvGo').click();
    expect((await dl).suggestedFilename()).toMatch(/^one-day-backup-.*\.json$/);
    await expect(page.locator('#mvGo')).toHaveText('They’re at getone.day');
    await page.locator('#mvGo').click();
    // still here, saying so, with the tasks behind
    await expect(page.locator('#mvT')).toHaveText('One Day lives at getone.day now');
    expect(origin(page.url())).toBe(OLD);
    await expect(page.locator('#mvFile')).toBeVisible();
    expect(JSON.parse((await storageAt(ctx, OLD))['oneday.moved'])).toMatchObject({ to: NEW, how: 'file' });
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    await (await pop).waitForURL(u => origin(u) === NEW);
    await page.locator('#mvNo').click();
    await expect(row(page, 'Write the report')).toBeVisible();
    await ctx.close();
  });

  test('an installed app moves its link’s tasks too: the window it opens becomes One Day, with them', async ({ browser }) => {
    const { ctx } = await browserAt(browser, {
      // the old address opened as an installed app
      init: () => {
        if (location.origin !== 'https://day.bemorin.com') return;
        const mm = window.matchMedia.bind(window);
        window.matchMedia = q => (/display-mode: standalone/.test(q) ? mm('(min-width: 0px)') : mm(q));
      },
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await ctx.newPage();
    await page.goto(OLD + '/#add?task=Pay+the+rent');
    await expect(page.locator('#mvLi')).toContainText('install One Day from getone.day');
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    const w = await pop;
    await expect(page.locator('#mvT')).toHaveText('Your tasks are at getone.day', { timeout: 20000 });
    await w.waitForURL(u => origin(u) === NEW && new URL(u).pathname === '/');
    await welcomed(w);
    await expect(w.locator('#inTitle')).toHaveText('Pay the rent');
    await page.locator('#mvGo').click();
    await page.waitForURL(NEW + '/');
    await ctx.close();
  });

  test('an installed copy keeps going on to getone.day offline, from what its service worker keeps', async ({ browser }) => {
    const { ctx } = await browserAt(browser, { sw: true });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await move(page);
    await welcomed(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await ctx.setOffline(true);
    await page.goto(OLD + '/');
    await page.waitForURL(NEW + '/');
    await expect(row(page, 'Write the report')).toBeVisible();
    await ctx.setOffline(false);
    await ctx.close();
  });

  test('a move by link that never came back leaves nothing at the old address after a day, and a later move clears it at once', async ({ browser }) => {
    const { ctx } = await browserAt(browser),
      left = at => JSON.stringify({ id: 'abcdefgh12', sum: 'f'.repeat(64), at, n: 4, sig: 'x', keep: 'a copy' });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()), 'oneday.moving': left(Date.now() - 2 * 864e5) });
    const page = await fresh(ctx);
    await expect(page.locator('#mv')).toBeVisible();
    expect((await storageAt(ctx, OLD))['oneday.moving']).toBeUndefined();
    await keepAt(ctx, OLD, { 'oneday.moving': left(Date.now()) });
    await page.reload();
    await move(page);
    expect((await storageAt(ctx, OLD))['oneday.moving']).toBeUndefined();
    await ctx.close();
  });

  test('a Home Screen app with sync on stops syncing once its tasks went by a file', async ({ browser }) => {
    const drive = new Drive(),
      { ctx } = await browserAt(browser, { patch: [IDS], clouds: [drive], init: () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }) }),
      late = [];
    let after = false;
    ctx.on('request', r => {
      let o = '';
      try {
        o = origin(r.frame().url());
      } catch (e) {}
      if (after && o === OLD && /googleapis\.com/.test(r.url())) late.push(r.url());
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.locator('#mvNo').click();
    await page.locator('#spill:visible, #syncb:visible').first().click();
    const pop = page.waitForEvent('popup');
    await page.locator('#syCh [data-c="google"]').click();
    await expect.poll(async () => (await pop).isClosed(), { timeout: 15000 }).toBe(true);
    await page.locator('#syPass').fill(PASS);
    await page.locator('#syPass2').fill(PASS);
    await page.locator('#syOk').check();
    await page.locator('#syGo').click();
    await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
    await page.locator('#syGo').click();
    await page.reload();
    await expect(page.locator('#mvLi')).toContainText('Sync with your Google Drive stops here once they’re there');
    const dl = page.waitForEvent('download');
    await page.locator('#mvGo').click();
    await dl;
    await page.locator('#mvGo').click();
    await expect(page.locator('#mvT')).toHaveText('One Day lives at getone.day now');
    after = true;
    expect(JSON.parse((await storageAt(ctx, OLD))['oneday.v1']).sync).toBeUndefined();
    await page.waitForTimeout(1500);
    expect(late).toEqual([]);
    await ctx.close();
  });

  test('the Android app, moved as an installed app, keeps its mark at getone.day', async ({ browser }) => {
    const { ctx } = await browserAt(browser, {
        init: () => {
          if (location.origin !== 'https://day.bemorin.com') return;
          const mm = window.matchMedia.bind(window);
          window.matchMedia = q => (/display-mode: standalone/.test(q) ? mm('(min-width: 0px)') : mm(q));
        },
      }),
      asked = [];
    ctx.on('request', r => asked.push(r.url()));
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await ctx.newPage();
    await page.goto(OLD + '/?app=android');
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    await pop;
    await expect(page.locator('#mvT')).toHaveText('Your tasks are at getone.day', { timeout: 20000 });
    await page.locator('#mvGo').click();
    await page.waitForURL(u => origin(u) === NEW);
    expect(asked).toContain(NEW + '/?app=android');
    await ctx.close();
  });

  test('a page brought back by Back opens again if a move happened meanwhile, at either address', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify({ days: { [today()]: { u: 5, tasks: [{ id: 'z9', text: 'Only here', done: false }] } }, rules: {}, tags: {} }) });
    const page = await ctx.newPage();
    await page.goto(NEW + '/');
    await expect(row(page, 'Only here')).toBeVisible();
    // tasks came while this page slept in the back-forward cache (no storage event reaches it there)
    await page.evaluate(o => localStorage.setItem('oneday.movedin', JSON.stringify({ from: o, at: Date.now(), n: 1, copy: true, shown: true })), OLD);
    let reload = page.waitForEvent('load');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await reload;
    // the old address: a move finished in another tab meanwhile
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    await page.goto(OLD + '/');
    await page.locator('#mvNo').click();
    await page.evaluate(n => localStorage.setItem('oneday.moved', JSON.stringify({ to: n, at: Date.now(), sig: MOVE.sig(localStorage.getItem('oneday.v1'), null), how: 'window' })), NEW);
    reload = page.waitForURL(u => origin(u) === NEW);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await reload;
    await ctx.close();
  });

  test('a moved Home Screen app, locked and opened without the passphrase: Export backup asks for it, Enter exports, Open getone.day opens', async ({ browser }) => {
    const { ctx } = await browserAt(browser, {
      // a fingerprint or face unlock leaves the passphrase unasked: the passphrase unlock is made to do the same
      patch: [["    // opened with the passphrase: moving to getone.day doesn't ask for it again\n    MVPASS = true;\n", '\n']],
      init: () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }),
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await page.locator('#mvNo').click();
    await protect(page);
    await page.reload();
    await page.locator('#lockPass').fill(LOCK);
    await page.locator('#lockPass').press('Enter');
    // the file way asks for the passphrase first: it is what opens the backup at getone.day
    await expect(page.locator('#mvPass')).toBeVisible();
    await page.locator('#mvPass').fill(LOCK);
    let dl = page.waitForEvent('download');
    await page.locator('#mvGo').click();
    await dl;
    await page.locator('#mvGo').click();
    await page.locator('#lockPass').fill(LOCK);
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#mvT')).toHaveText('One Day lives at getone.day now');
    await expect(page.locator('#mvPass')).toBeHidden();
    // Export backup again: the field shows, and Enter in it exports
    await page.locator('#mvFile').click();
    await expect(page.locator('#mvPass')).toBeVisible();
    await page.locator('#mvPass').fill(LOCK);
    dl = page.waitForEvent('download');
    await page.locator('#mvPass').press('Enter');
    await dl;
    // and Open getone.day, with the field still there, opens getone.day
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    await (await pop).waitForURL(u => origin(u) === NEW);
    await ctx.close();
  });

  test('One Day still opens at either address in a browser that keeps no site data', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser, {
      // as with "Don't allow sites to save data": reading either storage throws
      init: () => {
        for (const k of ['localStorage', 'sessionStorage'])
          Object.defineProperty(window, k, {
            get() {
              throw new DOMException('Access is denied for this document.', 'SecurityError');
            },
          });
      },
    });
    const page = await ctx.newPage();
    await page.goto(NEW + '/');
    await expect(page.locator('#list .row').first()).toBeVisible();
    // nothing can be kept at the old address either: on to getone.day
    await page.goto(OLD + '/');
    await page.waitForURL(u => origin(u) === NEW);
    await expect(page.locator('#list .row').first()).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('each address gets its own opener policy, as Pages reads _headers: one rule per pattern, detaches first', async () => {
    const coop = async u => (await answer(new URL(u))).headers['Cross-Origin-Opener-Policy'];
    expect(await coop(OLD + '/')).toBe('same-origin-allow-popups');
    expect(await coop(OLD + '/guide/')).toBe('same-origin-allow-popups');
    expect(await coop(NEW + '/')).toBe('same-origin');
    expect(await coop(NEW + '/guide/')).toBe('same-origin');
    expect(await coop(NEW + '/move/')).toBeUndefined();
    expect(await coop('https://getone-day.one-day-2eb.pages.dev/move/')).toBe('same-origin');
    expect(await coop('http://localhost:4401/')).toBe('same-origin');
    // Pages keeps one rule per pattern: written twice, a pattern loses its first block (and the old host its policy)
    const text = await readFile(new URL('../public/_headers', import.meta.url), 'utf8'),
      patterns = text
        .split(/\r?\n/)
        .filter(l => l.trim() && !l.trim().startsWith('#') && !/^\s/.test(l))
        .map(l => l.trim());
    expect(new Set(patterns).size).toBe(patterns.length);
    const trap = parseHeaders(['/*', '  X: a', 'https://h/*', '  ! X', 'https://h/*', '  X: b'].join('\n'));
    expect(headersFor(trap, 'h', '/')).toEqual({ X: 'a, b' });
    // a header written twice in one block: both values, as Pages joins them
    expect(headersFor(parseHeaders(['/*', '  Y: a', '  Y: b'].join('\n')), 'h', '/')).toEqual({ Y: 'a, b' });
  });

  for (const scheme of ['light', 'dark'])
    test(`the step, the card at getone.day and the old copy’s question pass axe (${scheme})`, async ({ browser }) => {
      const { ctx } = await browserAt(browser);
      await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
      const page = await ctx.newPage();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(OLD + '/');
      const axe = async sel => {
        await expect(page.locator(sel)).toBeVisible();
        const r = await new AxeBuilder({ page }).include(sel).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        expect(r.violations.map(v => v.id)).toEqual([]);
      };
      await axe('#mv');
      await move(page);
      await axe('#mvin');
      await page.locator('#mviNo').click();
      await page.waitForURL(OLD + '/#clear-old-copy');
      await axe('#mvclr');
      await ctx.close();
    });
});
