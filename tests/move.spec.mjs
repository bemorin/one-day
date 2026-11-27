// Moving to getone.day: One Day's old address (day.bemorin.com) and its new one (getone.day), each at its real
// origin inside the test's browser (tests/hosts.mjs), nothing online. A browser with nothing kept at the old address
// goes on at once; one with tasks moves them in one step, nothing lost; once moved, the old address remembers.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { hosts, cloudAt, OLD, NEW } from './hosts.mjs';
import { answer } from '../scripts/pages.mjs';
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
// the step at the old address, then the window at getone.day, which closes once the tasks are there
async function move(page) {
  await expect(page.locator('#mv')).toBeVisible();
  const pop = page.waitForEvent('popup');
  await page.locator('#mvGo').click();
  const w = await pop;
  // it may close before it is watched: what counts is that it did
  await expect.poll(() => w.isClosed(), { timeout: 20000 }).toBe(true);
  await page.waitForURL(u => new URL(u).origin === NEW);
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

test.describe('moving to getone.day', () => {
  test('a browser with nothing kept at day.bemorin.com goes on to getone.day, with its #add link and the rest of the address', async ({ browser }) => {
    const { ctx, errors } = await browserAt(browser);
    const page = await ctx.newPage();
    await page.goto(OLD + '/#add?task=Buy+bread&day=tomorrow');
    await page.waitForURL(u => new URL(u).origin === NEW);
    await expect(page.locator('#inbox')).toBeVisible();
    await expect(page.locator('#inTitle')).toHaveText('Buy bread');
    await page.goto(OLD + '/guide/#sync');
    await page.waitForURL(NEW + '/guide/#sync');
    // the Android app's mark goes along (getone.day takes it out of the address there)
    const asked = [];
    page.on('request', r => asked.push(r.url()));
    await page.goto(OLD + '/?app=android');
    await page.waitForURL(u => new URL(u).origin === NEW);
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
    // the old address remembers, and keeps its copy until it is cleared
    const left = await storageAt(ctx, OLD);
    expect(JSON.parse(left['oneday.moved'])).toMatchObject({ to: NEW, how: 'window' });
    const kept = JSON.parse(left['oneday.v1']);
    for (const t of tasksOf(data)) expect(tasksOf(kept).find(x => x.id === t.id)).toEqual(t);
    expect(errors).toEqual([]);
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
    expect(new URL(page.url()).origin).toBe(OLD);
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

  test('tasks already at getone.day stay as they are: what comes is added beside them', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()), 'oneday.theme': 'dark' });
    const mine = { days: { [today()]: { u: 5, tasks: [{ id: 'a1', text: 'My own version', done: false }, { id: 'z9', text: 'Only here', done: false }] } }, rules: {}, tags: {} };
    await keepAt(ctx, NEW, { 'oneday.v1': JSON.stringify(mine), 'oneday.theme': 'light' });
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#toast')).toContainText('came from day.bemorin.com');
    await welcomed(page);
    const got = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']);
    expect(tasksOf(got).find(t => t.id === 'a1').text).toBe('My own version');
    for (const id of ['z9', 'b2', 'c3', 'd4']) expect(tasksOf(got).some(t => t.id === id)).toBe(true);
    expect(got.rules.w1).toBeTruthy();
    expect((await storageAt(ctx, NEW))['oneday.theme']).toBe('light');
    await ctx.close();
  });

  test('once moved, day.bemorin.com goes on to getone.day every time, other tabs too, and offers again if its tasks change', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const other = await fresh(ctx);
    await expect(other.locator('#mv')).toBeVisible();
    await other.locator('#mvNo').click();
    const page = await fresh(ctx);
    await move(page);
    await welcomed(page);
    // the tab left open at the old address goes on as well
    await other.waitForURL(u => new URL(u).origin === NEW);
    await page.goto(OLD + '/');
    await page.waitForURL(NEW + '/');
    await page.goto(OLD + '/#add?task=Buy+stamps');
    await page.waitForURL(u => new URL(u).origin === NEW);
    await expect(page.locator('#inTitle')).toHaveText('Buy stamps');
    await page.goto(OLD + '/guide/');
    await page.waitForURL(NEW + '/guide/');
    // an old tab wrote a task at the old address after the move: offered again, and it comes too
    const old = JSON.parse((await storageAt(ctx, OLD))['oneday.v1']);
    old.days[today()].tasks.push({ id: 'late1', text: 'Written after the move', done: false });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(old) });
    await page.goto(OLD + '/');
    await expect(page.locator('#mvT')).toHaveText('Some tasks changed here');
    await move(page);
    await expect(page.locator('#toast')).toContainText('came from day.bemorin.com');
    await welcomed(page);
    await expect(row(page, 'Written after the move')).toBeVisible();
    await ctx.close();
  });

  test('the copy left at day.bemorin.com goes only after a yes there', async ({ browser }) => {
    const { ctx } = await browserAt(browser);
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()), 'oneday.timer': TIMER });
    const page = await fresh(ctx);
    await move(page);
    await expect(page.locator('#mviLi')).toContainText('A copy stays at day.bemorin.com');
    await page.locator('#mviNo').click();
    await page.waitForURL(OLD + '/#clear-old-copy');
    await expect(page.locator('#mvclr')).toBeVisible();
    await expect(page.locator('#mvcT')).toHaveText('Clear the old copy?');
    await page.locator('#mvcNo').click();
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
    expect(JSON.parse(left['oneday.moved']).cleared).toBeGreaterThan(0);
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
    await page.locator('#lpill').click();
    await page.locator('#lsPass').fill(LOCK);
    await page.locator('#lsPass2').fill(LOCK);
    await page.locator('#lsOk').check();
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
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

  test('sync: it stops at the old address, which never talks to the cloud again; reconnected at getone.day, everything comes back', async ({ browser }) => {
    const drive = new Drive(),
      { ctx } = await browserAt(browser, { patch: [IDS], clouds: [drive] }),
      fromOld = [];
    ctx.on('request', r => {
      let o = '';
      try {
        o = new URL(r.frame().url()).origin;
      } catch (e) {}
      if (o === OLD && /googleapis\.com/.test(r.url())) fromOld.push(r.url());
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
    await page.reload();
    await expect(page.locator('#mvLi')).toContainText('Sync with your Google Drive stops here');
    await move(page);
    fromOld.length = 0;
    // no key, no sign-in left at the old address
    const left = await storageAt(ctx, OLD);
    expect(JSON.parse(left['oneday.v1']).sync).toBeUndefined();
    await expect(page.locator('#mviLi')).toContainText('Sync was on there');
    await page.locator('#mviYes').click();
    // reconnected at getone.day: the same cloud and passphrase
    await page.locator('#spill:visible, #syncb:visible').first().click();
    const pop2 = page.waitForEvent('popup');
    await page.locator('#syCh [data-c="google"]').click();
    await expect.poll(async () => (await pop2).isClosed(), { timeout: 15000 }).toBe(true);
    await expect(page.locator('#syT')).toHaveText('Enter your sync passphrase', { timeout: 15000 });
    await page.locator('#syPass').fill(PASS);
    await page.locator('#syGo').click();
    await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
    await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
    const got = JSON.parse((await storageAt(ctx, NEW))['oneday.v1']),
      ids = tasksOf(got).map(t => t.id);
    for (const t of tasksOf(seed())) expect(ids.filter(id => id === t.id)).toHaveLength(1);
    // the old address, opened again, goes on at once and asks the cloud nothing
    const again = await ctx.newPage();
    await again.goto(OLD + '/');
    await again.waitForURL(NEW + '/');
    await again.waitForTimeout(1500);
    expect(fromOld).toEqual([]);
    await ctx.close();
  });

  test('where getone.day’s window can’t answer, a link carries the tasks: getone.day asks before adding them', async ({ browser }) => {
    let first = true;
    const { ctx, errors } = await browserAt(browser, {
      // the window's page as if it cut itself off from the page that opened it
      on: (url, a) => {
        if (url.origin === NEW && url.pathname === '/move/' && first) {
          first = false;
          return { ...a, headers: { ...a.headers, 'Cross-Origin-Opener-Policy': 'same-origin' } };
        }
      },
    });
    await keepAt(ctx, OLD, { 'oneday.v1': JSON.stringify(seed()) });
    const page = await fresh(ctx);
    await expect(page.locator('#mv')).toBeVisible();
    const pop = page.waitForEvent('popup');
    await page.locator('#mvGo').click();
    await pop;
    await expect(page.locator('#mvT')).toHaveText('getone.day didn’t answer', { timeout: 20000 });
    await expect(page.locator('#mvLink')).toBeVisible();
    await expect(page.locator('#mvFile')).toBeVisible();
    expect((await storageAt(ctx, OLD))['oneday.moved']).toBeUndefined();
    await page.locator('#mvLink').click();
    await page.waitForURL(NEW + '/');
    await expect(page.locator('#mviT')).toHaveText('Bring these tasks here?');
    await page.locator('#mviYes').click();
    await welcomed(page);
    await expect(row(page, 'Write the report')).toBeVisible();
    expect(JSON.parse((await storageAt(ctx, OLD))['oneday.moved'])).toMatchObject({ to: NEW, how: 'link' });
    expect((await storageAt(ctx, OLD))['oneday.moving']).toBeUndefined();
    expect(errors).toEqual([]);
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
    void createHash;
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

  test('an app on an iPhone’s Home Screen moves by a backup file, then remembers', async ({ browser }) => {
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
    await page.waitForURL(NEW + '/');
    expect(JSON.parse((await storageAt(ctx, OLD))['oneday.moved'])).toMatchObject({ to: NEW, how: 'file' });
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

  test('each address gets its own opener policy: the old one keeps its windows, getone.day’s move/ cuts none', async () => {
    const coop = async u => (await answer(new URL(u))).headers['Cross-Origin-Opener-Policy'];
    expect(await coop(OLD + '/')).toBe('same-origin-allow-popups');
    expect(await coop(NEW + '/')).toBe('same-origin');
    expect(await coop(NEW + '/guide/')).toBe('same-origin');
    expect(await coop(NEW + '/move/')).toBeUndefined();
    expect(await coop('https://getone-day.one-day-2eb.pages.dev/move/')).toBe('same-origin');
    expect(await coop('http://localhost:4401/')).toBe('same-origin');
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
