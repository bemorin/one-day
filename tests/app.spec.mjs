import { test, expect } from '@playwright/test';
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

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

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
