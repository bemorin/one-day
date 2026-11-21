import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';

const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => key(new Date());
const plus = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

// A known day: two open tasks (one with a note and tagged sub-tasks) and one done.
const seed = () => ({
  days: {
    [today()]: {
      u: 1,
      tasks: [
        { id: 'a1', text: 'Write the report #work', done: false },
        {
          id: 'b2',
          text: 'Plan the trip',
          done: false,
          note: 'Bring the <b>passports</b>',
          subs: [
            { id: 's1', text: 'Book the train #travel', done: true },
            { id: 's2', text: 'Find a hotel', done: false },
          ],
        },
        { id: 'c3', text: 'Water the plants', done: true, at: 1 },
      ],
    },
  },
});

async function open(page, { motion = 'reduce' } = {}) {
  await page.emulateMedia({ reducedMotion: motion });
  await page.addInitScript(data => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(data));
  }, seed());
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
}
const row = (page, text) => page.locator('#list .row', { hasText: text });

test('loads cleanly: no errors, no third-party requests, strict CSP', async ({ page, baseURL }) => {
  const errors = [],
    foreign = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && foreign.push(r.url()));
  const res = await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  await page.waitForTimeout(500);
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('unknown addresses get a real 404 that leads back to the app', async ({ page }) => {
  const res = await page.goto('/README.md');
  expect(res.status()).toBe(404);
  await page.getByRole('link', { name: 'Open One Day' }).click();
  await expect(page.locator('#app')).toBeVisible();
});

test('works offline from a cold start once visited, whatever the address', async ({ browser }) => {
  const port = 4175,
    url = `http://localhost:${port}/`,
    up = async () => {
      try {
        return (await fetch(url)).ok;
      } catch (e) {
        return false;
      }
    };
  const srv = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'ignore' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  try {
    await expect.poll(up, { timeout: 8000 }).toBe(true);
    const page = await ctx.newPage();
    await page.goto(url);
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.locator('#input').fill('Written before going offline');
    await page.locator('#input').press('Enter');
    // the service worker controls the page and has cached the whole app
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!navigator.serviceWorker.controller) return false;
            const keys = await caches.keys();
            return keys.length === 1 && (await (await caches.open(keys[0])).keys()).length >= 11;
          }),
        { timeout: 10000 },
      )
      .toBe(true);
    await page.close();
  } finally {
    srv.kill();
  }
  await expect.poll(up, { timeout: 8000 }).toBe(false);
  const cold = await ctx.newPage(),
    errors = [];
  cold.on('pageerror', e => errors.push(e.message));
  for (const address of [url, url + '?from=home', url + 'index.html']) {
    await cold.goto(address);
    await expect(cold.locator('#app')).not.toHaveClass(/\bpre\b/);
    await expect(cold.locator('#list .row', { hasText: 'Written before going offline' })).toBeVisible();
    expect(await cold.evaluate(() => document.fonts.check('800 40px Archivo'))).toBe(true);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test('adds, ticks, keeps, deletes and restores a task', async ({ page }) => {
  await open(page);
  await page.locator('#input').fill('Buy bread #home');
  await page.locator('#input').press('Enter');
  const r = row(page, 'Buy bread');
  await expect(r).toBeVisible();
  await expect(r.locator('.tag[data-tag="home"]')).toBeVisible();
  await r.locator('.in .ck').click();
  await expect(r.locator('.in .ck')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(row(page, 'Buy bread').locator('.in .ck')).toHaveAttribute('aria-checked', 'true');
  await row(page, 'Buy bread').hover();
  await row(page, 'Buy bread').locator('.rm').click();
  await expect(page.locator('#toast')).toContainText('Deleted');
  await expect(row(page, 'Buy bread')).toHaveCount(0);
  await page.locator('#undo').click();
  await expect(row(page, 'Buy bread')).toBeVisible();
});

test('a click opens the card, the title of an open card edits, a double-click edits at once', async ({ page }) => {
  await open(page);
  const b = row(page, 'Plan the trip');
  await b.locator('.tx').click({ position: { x: 300, y: 8 } });
  await expect(b).toHaveClass(/\bopen\b/);
  await expect(b.locator('.note')).toContainText('passports');
  await b.locator('.t').click();
  await expect(b.locator('.t')).toHaveAttribute('contenteditable', /.+/);
  await page.keyboard.press('End');
  await page.keyboard.type(' to Lisbon');
  await page.keyboard.press('Enter');
  await expect(b.locator('.t')).toHaveText('Plan the trip to Lisbon');

  const a = row(page, 'Write the report');
  await a.locator('.t').dblclick();
  await expect(a.locator('.t')).toHaveAttribute('contenteditable', /.+/);
  await page.keyboard.press('Escape');
  await expect(a.locator('.t')).not.toHaveAttribute('contenteditable', /.+/);
});

test('a click outside closes the card, the calendar and the timer', async ({ page }) => {
  await open(page);
  const b = row(page, 'Plan the trip');
  await b.locator('.mt').click();
  await expect(b).toHaveClass(/\bopen\b/);
  await page.mouse.click(40, 600);
  await expect(b).not.toHaveClass(/\bopen\b/);

  await page.locator('#meta').click();
  await expect(page.locator('#pop')).toHaveClass(/\bon\b/);
  await page.mouse.click(40, 600);
  await expect(page.locator('#pop')).not.toHaveClass(/\bon\b/);

  await page.locator('#tmb').click();
  await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
  await page.mouse.click(40, 600);
  await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);
});

test('a click outside the card closes search and shows the day again', async ({ page }) => {
  await open(page);
  await page.keyboard.press('/');
  await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-act="export"] svg')).toBeVisible();
  await expect(page.locator('[data-act="import"] svg')).toBeVisible();
  await page.mouse.click(40, 600);
  await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
  await expect(row(page, 'Write the report')).toBeVisible();
});

test('tags in sub-tasks show as chips and search finds their task', async ({ page }) => {
  await open(page);
  const b = row(page, 'Plan the trip');
  await b.locator('.mt').click();
  const tag = b.locator('.sub .tag[data-tag="travel"]');
  await expect(tag).toBeVisible();
  await tag.click();
  await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
  await expect(page.locator('#sq')).toHaveValue('#travel ');
  await expect(page.locator('#slist .sr')).toHaveCount(1);
  await expect(page.locator('#slist .sr')).toContainText('Plan the trip');
});

test('the composer can add a task to another day, then goes back to the day on screen', async ({ page }) => {
  await open(page);
  await page.locator('#input').click();
  await page.locator('#dchip').click();
  await expect(page.locator('#dpop')).toHaveClass(/\bon\b/);
  await page.locator('#dq [data-d="tomorrow"]').click();
  await expect(page.locator('#dchip')).toHaveClass(/\bset\b/);
  await expect(page.locator('#dlabel')).toHaveText('Tomorrow');
  await expect(page.locator('#input')).toBeFocused();
  // white on black while the composer has focus, never black on black
  const ink = await page.locator('#dchip').evaluate(n => [getComputedStyle(n).color, getComputedStyle(n).backgroundColor]);
  expect(ink[0]).not.toBe(ink[1]);
  await page.locator('#input').fill('Call the bank');
  await page.locator('#input').press('Enter');
  await expect(page.locator('#toast')).toContainText('Added to tomorrow');
  await expect(row(page, 'Call the bank')).toHaveCount(0);
  await expect(page.locator('#dlabel')).toHaveText('Tomorrow');
  await page.mouse.click(40, 600);
  await expect(page.locator('#dlabel')).toHaveText('Today');
  await page.keyboard.press('ArrowRight');
  await expect(row(page, 'Call the bank')).toBeVisible();
  // On another day, the composer adds to that day by default.
  await expect(page.locator('#dlabel')).toHaveText('Tomorrow');
  await expect(page.locator('#dchip')).not.toHaveClass(/\bset\b/);
});

test('keyboard: T timer, D today, / search, N new task', async ({ page }) => {
  await open(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).not.toHaveClass(/\bis-today\b/);
  await page.keyboard.press('d');
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
  await page.keyboard.press('t');
  await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
  await page.keyboard.press('t');
  await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('/');
  await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
  await page.keyboard.press('n');
  await expect(page.locator('#input')).toBeFocused();
});

test('an imported backup cannot run code or break the page', async ({ page }) => {
  await open(page);
  const evil = {
    app: 'one-day',
    version: 1,
    days: {
      [today()]: {
        u: 5,
        tasks: [
          {
            id: 'x"] .row, body[a="',
            text: 'Evil <img src=x onerror="window.__pwned=1">',
            note: '<img src=x onerror="window.__pwned=1"><a href="javascript:window.__pwned=1">bad</a><script>window.__pwned=1</script><b>kept</b>',
            subs: [{ id: '<i>', text: '<svg onload="window.__pwned=1">', done: false }],
          },
        ],
      },
      __proto__: { tasks: [] },
      'not-a-day': { tasks: [{ id: 'z', text: 'nope' }] },
    },
  };
  await page.locator('#impf').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evil)),
  });
  await expect(page.locator('#toast')).toContainText('Imported 1 task');
  const r = row(page, 'Evil <img');
  await expect(r).toBeVisible();
  await r.locator('.mt').click();
  await expect(r.locator('.note b')).toHaveText('kept');
  await expect(r.locator('.note img, .note script, .note a[href^="javascript"]')).toHaveCount(0);
  await expect(r.locator('.sub .st')).toHaveText('<svg onload="window.__pwned=1">');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(row(page, 'nope')).toHaveCount(0);
});

test('the leaving day floats above the list instead of joining it', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  await page.keyboard.press('ArrowRight');
  // read it in one go: the ghost only lives for the length of the transition
  const st = await page.evaluate(() => {
    const g = document.querySelector('.vp > .ghost');
    return g && {
      pos: getComputedStyle(g).position,
      ghostTop: g.getBoundingClientRect().top,
      addTop: document.getElementById('add').getBoundingClientRect().top,
    };
  });
  expect(st).not.toBeNull();
  expect(st.pos).toBe('absolute');
  expect(st.ghostTop).toBeLessThan(st.addTop);
});

test('Repeat opened from the day picker: Cancel goes back to the picker', async ({ page }) => {
  await open(page);
  await page.locator('#input').click();
  await page.locator('#dchip').click();
  await page.locator('#drep').click();
  await expect(page.locator('#rpop')).toHaveClass(/\bon\b/);
  await page.locator('#rnone').click();
  await expect(page.locator('#rpop')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#dpop')).toHaveClass(/\bon\b/);
});

test('send the day from the header on a computer', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#sendd').click();
  await expect(page.locator('#toast')).toContainText('these tasks');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('#add=');
});

test('no scrollbar can flash while a day slides in', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sc')).overflowY)).toBe('hidden');
  await expect(page.locator('#app')).not.toHaveClass(/\bcalm\b/, { timeout: 3000 });
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sc')).overflowY)).toBe('auto');
});

test('one click switches light and dark, kept across visits, and back to the system', async ({ page }) => {
  await open(page);
  await page.locator('#theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#theme')).toHaveAttribute('aria-label', 'Switch to light mode');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await page.evaluate(() => localStorage.getItem('oneday.theme'))).toBeNull();
});

test('a sideways scroll on a month grid changes the month, not the day', async ({ page }) => {
  await open(page);
  await page.locator('#meta').click();
  const title = await page.locator('#popT').textContent();
  await page.locator('#grid').hover();
  await page.mouse.wheel(120, 0);
  await expect(page.locator('#popT')).not.toHaveText(title);
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
});

test('digits stay right after the app comes back from another document (keep on top)', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  // Same journey as the floating window: the app moves to another document, rolls a day, comes back.
  await page.evaluate(async () => {
    const app = document.getElementById('app'),
      home = document.getElementById('home'),
      f = document.createElement('iframe');
    document.body.append(f);
    f.contentDocument.body.append(app);
    app.querySelector('#next').click();
    await new Promise(r => setTimeout(r, 1400));
    home.prepend(app);
    f.remove();
  });
  await expect(page.locator('#num .dg .out')).toHaveCount(0);
  await expect(page.locator('#num')).toHaveText(String(plus(1).getDate()));
});

test('keep on top: the floating window is styled and follows the page theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await page.locator('#float').click();
  await expect
    .poll(() => page.evaluate(() => !!documentPictureInPicture.window?.document.getElementById('app')))
    .toBe(true);
  const st = await page.evaluate(() => {
    const w = documentPictureInPicture.window,
      d = w.document;
    return {
      display: w.getComputedStyle(d.getElementById('app')).display,
      weight: w.getComputedStyle(d.getElementById('num')).fontWeight,
      theme: d.documentElement.dataset.theme,
    };
  });
  expect(st).toEqual({ display: 'flex', weight: '800', theme: 'dark' });
  await page.evaluate(() => documentPictureInPicture.window.close());
  await expect(page.locator('#home > #app')).toBeVisible();
  await expect(page.locator('#num .dg .out')).toHaveCount(0);
});

test.describe('repeating tasks', () => {
  test('repeat every 2 days from the composer', async ({ page }) => {
    await open(page);
    await page.locator('#input').click();
    await page.locator('#dchip').click();
    await page.locator('#drep').click();
    await expect(page.locator('#rpop')).toHaveClass(/\bon\b/);
    await page.locator('#rseg [data-f="day"]').click();
    await page.locator('#rplus').click();
    await expect(page.locator('#rsum')).toContainText('Every 2 days');
    await page.locator('#rdone').click();
    await expect(page.locator('#dchip')).toHaveClass(/\brep\b/);
    await expect(page.locator('#dlabel')).toHaveText('Every 2 days');
    await expect(page.locator('#input')).toBeFocused();
    await page.locator('#input').fill('Stretch');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Stretch')).toBeVisible();
    await expect(row(page, 'Stretch').locator('.mt')).toContainText('Every 2 days');
    await page.mouse.click(40, 600);
    await expect(page.locator('#dlabel')).toHaveText('Today');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Stretch')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Stretch')).toBeVisible();
    await expect(row(page, 'Stretch').locator('.in .ck')).toHaveAttribute('aria-checked', 'false');
  });

  test('weekly on chosen days, with the summary and the next date', async ({ page }) => {
    await open(page);
    await page.locator('#input').click();
    await page.locator('#dchip').click();
    await page.locator('#drep').click();
    const wd = (new Date().getDay() + 6) % 7,
      other = (wd + 3) % 7;
    await expect(page.locator(`#rdays [data-d="${wd}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.locator(`#rdays [data-d="${other}"]`).click();
    await expect(page.locator(`#rdays [data-d="${other}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rsum')).toContainText('Next: Today');
    // the last chosen day cannot be removed
    await page.locator(`#rdays [data-d="${other}"]`).click();
    await page.locator(`#rdays [data-d="${wd}"]`).click();
    await expect(page.locator(`#rdays [data-d="${wd}"]`)).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#rdone').click();
    await page.locator('#input').fill('Gym');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Gym')).toBeVisible();
    await page.mouse.click(40, 600);
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Gym')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Gym')).toBeVisible();
  });

  test('ticking or deleting one occurrence leaves the series alone; stop ends what is to come', async ({ page }) => {
    await open(page);
    const a = row(page, 'Write the report');
    await a.locator('.tx').click({ position: { x: 300, y: 8 } });
    await a.locator('.rbtn').click();
    await page.locator('#rseg [data-f="day"]').click();
    await page.locator('#rdone').click();
    await expect(a.locator('.mt')).toContainText('Daily');
    await expect(a.locator('.rbtn')).toContainText('Every day');
    await a.locator('.in .ck').click();
    await expect(a.locator('.in .ck')).toHaveAttribute('aria-checked', 'true');
    await page.mouse.click(40, 600);
    await page.keyboard.press('ArrowRight');
    const b = row(page, 'Write the report');
    await expect(b.locator('.in .ck')).toHaveAttribute('aria-checked', 'false');
    await b.hover();
    await b.locator('.rm').click();
    await expect(row(page, 'Write the report')).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Write the report')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    const c = row(page, 'Write the report');
    await expect(c).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Write the report')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await c.locator('.mt').click();
    await c.locator('.rbtn').click();
    await expect(page.locator('#rnone')).toHaveText('Stop repeating');
    await page.locator('#rnone').click();
    await expect(page.locator('#toast')).toContainText('Stopped repeating');
    await expect(c.locator('.mt .rp')).toHaveCount(0);
    await page.mouse.click(40, 600);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Write the report')).toHaveCount(0);
  });

  test('missed occurrences are not leftovers; undo removes a new series', async ({ page }) => {
    const start = key(plus(-3)),
      past = key(plus(-2));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(
      ([s, p, t]) => {
        if (localStorage.getItem('oneday.v1')) return;
        localStorage.setItem(
          'oneday.v1',
          JSON.stringify({
            days: {
              [p]: { u: 1, tasks: [{ id: 'rx1-' + p.replace(/-/g, ''), text: 'Meditate', done: false, rule: 'rx1' }] },
              [t]: { u: 1, tasks: [] },
            },
            rules: { rx1: { id: 'rx1', text: 'Meditate', start: s, freq: 'day', every: 1 } },
          }),
        );
      },
      [start, past, today()],
    );
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await expect(row(page, 'Meditate')).toHaveCount(1);
    await expect(page.locator('#carry')).toBeHidden();
    await page.locator('#input').click();
    await page.locator('#dchip').click();
    await page.locator('#drep').click();
    await page.locator('#rseg [data-f="day"]').click();
    await page.locator('#rdone').click();
    await page.locator('#input').fill('Read');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Read')).toBeVisible();
    await page.mouse.click(40, 600);
    await page.keyboard.press('Control+z');
    await expect(row(page, 'Read')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Read')).toHaveCount(0);
    await expect(row(page, 'Meditate')).toHaveCount(1);
  });
});

test.describe('send a task', () => {
  test('the link carries the task, and whoever opens it can add it', async ({ page, browser }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    const b = row(page, 'Plan the trip');
    await b.locator('.mt').click();
    await b.locator('.sbtn').click();
    await expect(page.locator('#toast')).toContainText('Link copied');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#add=z[\w-]+$/);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const other = await ctx.newPage(),
      seen = [];
    other.on('request', r => seen.push(r.url()));
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.goto(link);
    await expect(other.locator('#inbox')).toBeVisible();
    await expect(other.locator('#inTitle')).toHaveText('Plan the trip');
    await expect(other.locator('#inMeta')).toHaveText('Note · 2 sub-tasks');
    expect(other.url()).not.toContain('#add=');
    await other.locator('#inYes').click();
    const r = other.locator('#list .row', { hasText: 'Plan the trip' });
    await expect(r).toBeVisible();
    await r.locator('.mt').click();
    await expect(r.locator('.note')).toContainText('passports');
    await expect(r.locator('.sub')).toHaveCount(2);
    expect(seen.some(u => u.includes('add='))).toBe(false);
    await ctx.close();
  });

  test('the incoming task can go to another day, or be ignored', async ({ page }) => {
    await open(page);
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    await page.goto('/#add=j' + enc({ v: 1, t: 'Pick up the keys' }));
    await expect(page.locator('#inbox')).toBeVisible();
    await page.locator('#inDay').click();
    await page.locator('#dq [data-d="tomorrow"]').click();
    await expect(page.locator('#inDayL')).toHaveText('Tomorrow');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('Added to tomorrow');
    await expect(row(page, 'Pick up the keys')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Pick up the keys')).toBeVisible();
    await page.goto('/#add=j' + enc({ v: 1, t: 'Not this one' }));
    await expect(page.locator('#inbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#inbox')).toBeHidden();
    await expect(row(page, 'Not this one')).toHaveCount(0);
  });

  test('a hostile link cannot run code or break the page', async ({ page }) => {
    await open(page);
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    await page.goto(
      '/#add=j' +
        enc({
          v: 1,
          t: 'Evil <img src=x onerror="window.__pwned=1">',
          n: '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"><b>kept</b>',
          s: [['<svg onload="window.__pwned=1">'], [42], 'nope'],
        }),
    );
    await expect(page.locator('#inTitle')).toHaveText('Evil <img src=x onerror="window.__pwned=1">');
    await page.locator('#inYes').click();
    const r = row(page, 'Evil <img');
    await r.locator('.mt').click();
    await expect(r.locator('.note b')).toHaveText('kept');
    await expect(r.locator('.note img, .note script')).toHaveCount(0);
    await expect(r.locator('.sub')).toHaveCount(1);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await page.goto('/#add=zAAAAAAAA');
    await expect(page.locator('#toast')).toContainText('doesn’t hold a task');
  });
});

test.describe('on a large screen', () => {
  test('the card grows with its content and the footer follows it', async ({ page }) => {
    await open(page);
    const app = page.locator('#app');
    const h0 = (await app.boundingBox()).height;
    for (const t of ['One', 'Two', 'Three']) {
      await page.locator('#input').fill(t);
      await page.locator('#input').press('Enter');
    }
    await page.waitForTimeout(800);
    const box = await app.boundingBox();
    expect(box.height).toBeGreaterThan(h0 + 100);
    const foot = await page.locator('#foot').boundingBox();
    expect(foot.y).toBeGreaterThanOrEqual(box.y + box.height);
  });
});

test.describe('in a narrow window with a mouse', () => {
  test.use({ viewport: { width: 600, height: 860 } });
  test('search shows the about links centred at the bottom', async ({ page }) => {
    await open(page);
    await expect(page.locator('#mbar')).toBeHidden();
    await page.locator('#sb').click();
    const about = page.locator('#slist .about');
    await expect(about).toBeVisible();
    await expect(about.locator('.links a')).toHaveCount(4);
    expect(await about.evaluate(n => getComputedStyle(n).alignItems)).toBe('center');
  });
});

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the timer sheet sits over a scrim; a tap on it closes both', async ({ page }) => {
    await open(page);
    await page.locator('#mbTimer').tap();
    await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
    await expect(page.locator('#scrim')).toBeVisible();
    await page.locator('#scrim').tap({ position: { x: 60, y: 120 } });
    await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#scrim')).toBeHidden();
  });

  test('the day picker of the composer sheet stays above the scrim', async ({ page }) => {
    await open(page);
    await page.locator('#mbAdd').tap();
    await page.locator('#dchip').tap();
    await expect(page.locator('#dpop')).toHaveClass(/\bon\b/);
    const box = await page.locator('#dgrid').boundingBox();
    const inside = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('#dpop'),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(inside).toBe(true);
  });

  test('More closes when dragged down, even from a button, without pressing it', async ({ page }) => {
    await open(page);
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#more .sbk-b')).toHaveCount(2);
    const b = await page.locator('#more [data-act="import"]').boundingBox();
    await page.evaluate(([x, y]) => {
      window.__picked = false;
      document.getElementById('impf').addEventListener('click', () => (window.__picked = true));
      const el = document.querySelector('#more [data-act="import"]'),
        ev = (type, cy) =>
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: x, clientY: cy }));
      ev('pointerdown', y);
      for (let i = 1; i <= 8; i++) ev('pointermove', y + i * 16);
      ev('pointerup', y + 128);
      el.click();
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    await expect(page.locator('#more')).toBeHidden();
    expect(await page.evaluate(() => window.__picked)).toBe(false);
  });

  test('one quiet chevron per task, the other actions inside the open card', async ({ page }) => {
    await open(page);
    const b = row(page, 'Plan the trip');
    await expect(b.locator('.ex')).toBeVisible();
    await expect(b.locator('.rm')).toBeHidden();
    await expect(b.locator('.mv')).toBeHidden();
    await expect(page.locator('#float')).toBeHidden();
    await b.locator('.tx').tap({ position: { x: 20, y: 8 } });
    await expect(b).toHaveClass(/\bopen\b/);
    await expect(b.locator('.rm')).toBeVisible();
    await expect(b.locator('.mv')).toBeVisible();
    await expect(b.locator('.t')).not.toHaveAttribute('contenteditable', /.+/);
    expect(await b.locator('.in').evaluate(n => getComputedStyle(n).webkitTapHighlightColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('a swipe on the month picker changes the month', async ({ page }) => {
    await open(page);
    await page.locator('#meta').tap();
    const title = await page.locator('#popT').textContent();
    const box = await page.locator('#grid').boundingBox();
    await page.evaluate(([x, y]) => {
      const g = document.getElementById('grid'),
        ev = (type, cx) =>
          g.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: cx, clientY: y }));
      ev('pointerdown', x);
      for (let i = 1; i <= 6; i++) ev('pointermove', x - i * 20);
      ev('pointerup', x - 120);
    }, [box.x + box.width * 0.7, box.y + box.height / 2]);
    await expect(page.locator('#popT')).not.toHaveText(title);
  });

  test('the bottom bar: add, more, timer, search, and sending the day', async ({ page, browser }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await expect(page.locator('#mbar')).toBeVisible();
    await expect(page.locator('#sb')).toBeHidden();
    await expect(page.locator('#add')).toBeHidden();

    await page.locator('#mbAdd').tap();
    await expect(page.locator('#add')).toBeVisible();
    await expect(page.locator('#input')).toBeFocused();
    await page.locator('#input').fill('Buy flowers');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Buy flowers')).toBeVisible();
    await page.locator('#scrim').tap({ position: { x: 60, y: 120 } });
    await expect(page.locator('#add')).toBeHidden();

    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#more [data-act="export"]')).toBeVisible();
    await expect(page.locator('#more .slinks a')).toHaveCount(4);
    await page.locator('#scrim').tap({ position: { x: 60, y: 120 } });
    await expect(page.locator('#more')).toBeHidden();

    await page.locator('#mbTimer').tap();
    await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
    await page.locator('#mbTimer').tap();
    await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);

    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await page.locator('#sx').tap();
    await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);

    // no share sheet in a headless browser: the link goes to the clipboard
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined }));
    await page.locator('#mbSend').tap();
    await expect(page.locator('#toast')).toContainText('these tasks');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const other = await ctx.newPage();
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.goto(link);
    await expect(other.locator('#inT')).toHaveText('3 tasks for you');
    await other.locator('#inYes').tap();
    await expect(other.locator('#list .row', { hasText: 'Buy flowers' })).toBeVisible();
    await expect(other.locator('#list .row', { hasText: 'Plan the trip' })).toBeVisible();
    await ctx.close();
  });
});

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  const scan = page =>
    new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const states = {
    main: async () => {},
    'open card': async page => row(page, 'Plan the trip').locator('.mt').click(),
    search: async page => page.keyboard.press('/'),
    timer: async page => page.keyboard.press('t'),
    'day picker': async page => page.locator('#dchip').click(),
    'repeat editor': async page => {
      await page.locator('#dchip').click();
      await page.locator('#drep').click();
    },
    'incoming task': async page =>
      page.evaluate(() => {
        location.hash = '#add=j' + btoa(JSON.stringify({ v: 1, t: 'Hello #work', n: '<b>x</b>', s: [['a']] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }),
  };
  for (const scheme of ['light', 'dark'])
    for (const [name, go] of Object.entries(states))
      test(`${name}, ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page);
        await go(page);
        await page.waitForTimeout(450);
        const { violations } = await scan(page);
        expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
});
