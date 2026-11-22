import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
// What Chrome and Edge lend while the app can be installed and is not: a prompt that serves once.
const offerInstall = page =>
  page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.__prompted = window.__prompted || 0;
    e.prompt = () => {
      window.__prompted++;
      return Promise.resolve();
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(e);
  });

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

test('an open card: its title is easy to hit, a little above and after the words', async ({ page }) => {
  await open(page);
  const r = row(page, 'Plan the trip');
  await r.locator('.mt').click();
  await expect(r).toHaveClass(/\bopen\b/);
  // measure once the card has finished opening
  const settled = () => r.evaluate(n => Promise.all(n.getAnimations({ subtree: true }).map(x => x.finished)));
  await settled();
  const words = () =>
    r.locator('.t').evaluate(n => {
      const g = document.createRange();
      g.selectNodeContents(n);
      const b = g.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom };
    });
  let w = await words();
  await page.mouse.click(w.r + 22, (w.t + w.b) / 2);
  await expect(r).toHaveClass(/\bediting\b/);
  await page.keyboard.press('Escape');
  await expect(r).not.toHaveClass(/\bediting\b/);
  await expect(r).toHaveClass(/\bopen\b/);
  await settled();
  w = await words();
  // two clicks on a task within 400 ms make a double-click: leave a moment between them
  await page.waitForTimeout(450);
  await page.mouse.click(w.l + 8, w.t - 6);
  await expect(r).toHaveClass(/\bediting\b/);
  await page.keyboard.press('Escape');
  // further right, the line still closes the card
  await expect(r).not.toHaveClass(/\bediting\b/);
  await settled();
  w = await words();
  const acts = await r.locator('.in .acts').boundingBox();
  await page.waitForTimeout(450);
  await page.mouse.click(Math.min(w.r + 100, acts.x - 12), (w.t + w.b) / 2);
  await expect(r).not.toHaveClass(/\bopen\b/);
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
  // the pick survives a click elsewhere, and goes back to the day on screen once the task is added
  await page.mouse.click(40, 600);
  await expect(page.locator('#dlabel')).toHaveText('Tomorrow');
  await page.locator('#input').fill('Call the bank');
  await page.locator('#input').press('Enter');
  await expect(page.locator('#toast')).toContainText('Added to tomorrow');
  await expect(row(page, 'Call the bank')).toHaveCount(0);
  await expect(page.locator('#dlabel')).toHaveText('Today');
  await page.mouse.click(40, 600);
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

test.describe('filter by tag', () => {
  test('the button at the right of the date lists the day\'s tags; one shows only its tasks', async ({ page }) => {
    await open(page);
    await page.locator('#fbtn').click();
    await expect(page.locator('#fpop')).toHaveClass(/\bon\b/);
    await expect(page.locator('#ftags .ftag')).toHaveText(['All tasks3', '#travel1', '#work1']);
    // a tag in a sub-task counts for its task
    await page.locator('#ftags .ftag', { hasText: '#travel' }).click();
    await expect(page.locator('#fpop')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#list .row')).toHaveCount(1);
    await expect(row(page, 'Plan the trip')).toHaveCount(1);
    await expect(page.locator('#fname')).toHaveText('#travel');
    await expect(page.locator('#input')).toHaveAttribute('placeholder', 'Add a task to #travel');
    // the filter stays on from day to day
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#fnone')).toHaveText('');
    await expect(page.locator('#fname')).toHaveText('#travel');
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'Plan the trip')).toHaveCount(1);
    await page.locator('#fclr').click();
    await expect(page.locator('#list .row')).toHaveCount(3);
    await expect(page.locator('#fclr')).toBeHidden();
    // one pill, no seam: the black is the container's
    await expect(page.locator('#fx')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#fbtn')).not.toBeFocused();
  });

  test('F opens it, Escape clears it; a task added meanwhile takes the tag', async ({ page }) => {
    await open(page);
    await page.keyboard.press('f');
    await expect(page.locator('#fpop')).toHaveClass(/\bon\b/);
    // nothing is ringed on opening; the arrows lead into the list
    await expect(page.locator('#fpop')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#ftags .ftag').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#fname')).toHaveText('#work');
    await page.locator('#input').fill('Send the slides');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Send the slides')).toHaveCount(1);
    await expect(row(page, 'Send the slides').locator('.tag')).toHaveText('#work');
    await page.locator('#input').evaluate(n => n.blur());
    await page.keyboard.press('Escape');
    await expect(page.locator('#fx')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#list .row')).toHaveCount(4);
  });

  test('with many tags the list stays short, and a field finds any of them', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(k => {
      const tags = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
      const tasks = tags.map((g, i) => ({ id: 't' + i, text: `Task ${i} #${g}`, done: false }));
      localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
    }, today());
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.keyboard.press('f');
    await expect(page.locator('#fq')).toBeFocused();
    await expect(page.locator('#fq')).toHaveAttribute('placeholder', 'Find a tag among 12');
    await expect(page.locator('#ftags .ftag')).toHaveCount(9);
    await page.keyboard.type('ki');
    await expect(page.locator('#ftags .ftag')).toHaveText(['#kilo1']);
    await page.keyboard.press('Enter');
    await expect(page.locator('#fname')).toHaveText('#kilo');
    await expect(page.locator('#list .row')).toHaveCount(1);
  });

  test('in a short window the popover stops above the bottom edge and its list scrolls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1100, height: 600 });
    await page.addInitScript(k => {
      const tags = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
      const tasks = tags.map((g, i) => ({ id: 't' + i, text: `Task ${i} #${g}`, done: false }));
      localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
    }, today());
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.keyboard.press('f');
    await expect(page.locator('#fq')).toBeFocused();
    await expect(page.locator('#ftags .ftag')).toHaveCount(9);
    const fit = () =>
      page.evaluate(() => {
        const p = document.getElementById('fpop').getBoundingClientRect(),
          t = document.getElementById('ftags'),
          q = document.getElementById('fq').getBoundingClientRect();
        // the row the bottom edge cuts: how much of it shows
        const cut = [...t.children].map(c => c.getBoundingClientRect()).find(c => c.top < p.bottom && c.bottom > p.bottom);
        return {
          bottom: p.bottom,
          vh: innerHeight,
          scrolls: t.scrollHeight > t.clientHeight + 1,
          field: q.top >= p.top && q.bottom <= p.bottom,
          sb: t.classList.contains('sb'),
          half: cut ? (p.bottom - cut.top) / cut.height : 0,
        };
      });
    let r = await fit();
    expect(r.bottom).toBeLessThanOrEqual(r.vh - 8);
    expect(r.scrolls).toBe(true);
    expect(r.field).toBe(true);
    expect(r.sb).toBe(true);
    // the edge goes through the middle of a tag, so the list reads as one that goes on
    expect(r.half).toBeGreaterThan(0.3);
    expect(r.half).toBeLessThan(0.7);
    // the last tag is reachable: the arrows bring it into view (Tab stops at each colour dot too)
    for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowDown');
    const last = page.locator('#ftags .ftag').last();
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport({ ratio: 1 });
    // a taller window gives it its full height back
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect.poll(async () => (await fit()).scrolls).toBe(false);
  });

  test('search shows a dozen tags; after a # it offers the ones that start with what is typed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(k => {
      const tags = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november'];
      const tasks = tags.map((g, i) => ({ id: 't' + i, text: `Task ${i} #${g}`, done: false }));
      localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
    }, today());
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.keyboard.press('/');
    await expect(page.locator('#slist [data-tag]')).toHaveCount(12);
    await page.locator('#slist [data-more]').click();
    await expect(page.locator('#sq')).toHaveValue('#');
    await expect(page.locator('#spicks [data-pick]')).toHaveCount(12);
    await page.keyboard.type('n');
    await expect(page.locator('#spicks [data-pick]')).toHaveText(['#november1']);
    await page.locator('#spicks [data-pick]').click();
    await expect(page.locator('#sq')).toHaveValue('#november ');
    await expect(page.locator('#slist .sr')).toHaveCount(1);
  });

  test('reordering a filtered list keeps the tasks it hides where they are', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(k => {
      const tasks = [
        { id: 'a', text: 'A #work', done: false },
        { id: 'b', text: 'B', done: false },
        { id: 'c', text: 'C #work', done: false },
        { id: 'd', text: 'D', done: false },
      ];
      localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
    }, today());
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.locator('#fbtn').click();
    await page.locator('#ftags .ftag', { hasText: '#work' }).click();
    await expect(page.locator('#list .row')).toHaveCount(2);
    await row(page, 'A #work').locator('.in .ck').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(() => page.evaluate(k => JSON.parse(localStorage.getItem('oneday.v1')).days[k].tasks.map(t => t.id).join(''), today()))
      .toBe('cbad');
  });
});

test.describe('pasting a list', () => {
  const paste = (page, sel, txt) =>
    page.evaluate(
      ([sel, txt]) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', txt);
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        document.querySelector(sel).dispatchEvent(ev);
        return ev.defaultPrevented;
      },
      [sel, txt],
    );
  const LIST = [
    '- Publish giveaway post and boost as ads',
    '- Publish the article on X',
    '',
    '* Reach out to 5 YouTubers',
    '2. Reach out to 5 freelancers on news media',
    '• Reach out to a charity',
    '- Watch this 15-min video https://youtu.be/RypUD_Fuaqw',
    '- [x] Look into UGC',
    '10.5 km run',
  ].join('\r\n');

  test('the composer makes one task per line, bullets and numbers left out, one undo for all', async ({ page }) => {
    await open(page);
    await page.locator('#input').focus();
    expect(await paste(page, '#input', LIST)).toBe(true);
    await expect(page.locator('#toast')).toContainText('Added 8 tasks');
    for (const t of ['Publish giveaway post and boost as ads', 'Reach out to 5 YouTubers', 'Reach out to 5 freelancers on news media', 'Reach out to a charity', '10.5 km run'])
      await expect(row(page, t)).toHaveCount(1);
    await expect(row(page, 'Watch this 15-min video')).toHaveCount(1);
    await expect(row(page, 'Look into UGC')).toHaveClass(/\bdone\b/);
    await expect(page.locator('#input')).toHaveValue('');
    await page.locator('#undo').click();
    await expect(row(page, 'Reach out to a charity')).toHaveCount(0);
    await expect(row(page, 'Write the report')).toHaveCount(1);
  });

  test('a single line pastes as usual', async ({ page }) => {
    await open(page);
    await page.locator('#input').focus();
    expect(await paste(page, '#input', '- Just this one\n')).toBe(false);
  });

  test('the sub-task field makes one sub-task per line', async ({ page }) => {
    await open(page);
    await row(page, 'Plan the trip').locator('.mt').click();
    const field = row(page, 'Plan the trip').locator('.sadd input');
    await field.focus();
    expect(await paste(page, '.row.open .sadd input', '1. Pack\n2. Print the tickets\n3. Water the plants')).toBe(true);
    await expect(page.locator('#toast')).toContainText('Added 3 sub-tasks');
    await expect(row(page, 'Plan the trip').locator('.sub .st')).toHaveText(['Book the train #travel', 'Find a hotel', 'Pack', 'Print the tickets', 'Water the plants']);
  });

  test('a Notion to-do list: its boxes are read, and what is nested comes in under its task', async ({ page }) => {
    await open(page);
    await page.locator('#input').focus();
    const notion = [
      '- [ ] Plan the weekend',
      '    - [x] Book the cabin',
      '\t- [ ] Pack the bags',
      '- [ ] Call the bank',
      '1. Water the ferns',
      '2) Buy bread',
      '☑️ Emoji box, ticked',
      '[] Empty box',
      '☒ Crossed box',
    ].join('\n');
    expect(await paste(page, '#input', notion)).toBe(true);
    await expect(page.locator('#toast')).toContainText('Added 7 tasks and 2 sub-tasks');
    const t = row(page, 'Plan the weekend');
    await t.locator('.mt').click();
    await expect(t.locator('.sub .st')).toHaveText(['Book the cabin', 'Pack the bags']);
    await expect(t.locator('.sub').first()).toHaveClass(/\bdone\b/);
    await expect(t.locator('.sub').nth(1)).not.toHaveClass(/\bdone\b/);
    for (const x of ['Call the bank', 'Water the ferns', 'Buy bread', 'Empty box']) await expect(row(page, x)).not.toHaveClass(/\bdone\b/);
    for (const x of ['Emoji box, ticked', 'Crossed box']) await expect(row(page, x)).toHaveClass(/\bdone\b/);
    // nothing invisible is left before the words
    expect(await row(page, 'Emoji box, ticked').locator('.t').evaluate(n => n.textContent.codePointAt(0))).toBe(69);
    // one undo takes it all back
    await page.locator('#undo').click();
    await expect(row(page, 'Plan the weekend')).toHaveCount(0);
    await expect(row(page, 'Crossed box')).toHaveCount(0);
  });

  test('pasted into a repeat, what was nested comes in as repeating tasks of its own', async ({ page }) => {
    await open(page);
    await page.locator('#input').click();
    await page.locator('#dchip').click();
    await page.locator('#drep').click();
    await page.locator('#rdone').click();
    await page.locator('#input').focus();
    expect(await paste(page, '#input', '- Stretch\n  - Neck\n- Read')).toBe(true);
    await expect(page.locator('#toast')).toContainText('Added 3 repeating tasks');
  });
});

test('phones: the page can run under the system bars, and keeps clear of them', async ({ page }) => {
  await page.goto('/');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
  const pad = await page.locator('header').evaluate(n => getComputedStyle(n).paddingTop);
  expect(pad).toBe('16px');
});

test('the leaving day floats above the list instead of joining it', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  // the ghost only lives for the length of the transition: note where it is the moment it is added
  await page.evaluate(() => {
    window.__ghost = null;
    const vp = document.querySelector('.vp'),
      mo = new MutationObserver(() => {
        const g = vp.querySelector(':scope > .ghost');
        if (!g || window.__ghost) return;
        window.__ghost = {
          pos: getComputedStyle(g).position,
          ghostTop: g.getBoundingClientRect().top,
          addTop: document.getElementById('add').getBoundingClientRect().top,
        };
        mo.disconnect();
      });
    mo.observe(vp, { childList: true });
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__ghost)).not.toBeNull();
  const st = await page.evaluate(() => window.__ghost);
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

test('the dogood.day link says where it comes from; the progress rule has round ends', async ({ page }) => {
  await open(page);
  expect(await page.locator('#foot .promo').getAttribute('href')).toBe('https://dogood.day/?utm_source=day.bemorin.com&utm_medium=referral');
  expect(await page.locator('.rule').evaluate(n => getComputedStyle(n).borderTopLeftRadius)).toBe('3px');
  // one task done of three: the fill's round end is a third of the way
  const [rule, fill] = await Promise.all([page.locator('.rule').boundingBox(), page.locator('.rule i').boundingBox()]);
  await expect.poll(async () => {
    const f = await page.locator('.rule i').boundingBox();
    return Math.round(((f.x + f.width - rule.x) / rule.width) * 100);
  }).toBe(33);
});

test('a tag takes a colour in two taps from the filter, wears it everywhere, and keeps it', async ({ page }) => {
  await open(page);
  await page.keyboard.press('f');
  await expect(page.locator('#fpop')).toHaveClass(/\bon\b/);
  const dot = page.locator('#ftags .fdot[data-tag="work"]');
  await expect(dot).toHaveAttribute('aria-label', 'Colour of #work: none');
  // its dot opens the colours, and closes them again
  await dot.click();
  await expect(page.locator('#ftags .fsw')).toHaveCount(1);
  await expect(dot).toHaveAttribute('aria-expanded', 'true');
  await dot.click();
  await expect(page.locator('#ftags .fsw')).toHaveCount(0);
  await expect(dot).toHaveAttribute('aria-expanded', 'false');
  await dot.click();
  const sw = page.locator('#ftags .fsw');
  await expect(sw.locator('button')).toHaveCount(9);
  // the ring of the one worn fits in the row, at either end
  for (const k of ['red', '']) {
    const fits = await sw.locator(`[data-sw="${k}"]`).evaluate(b => {
      const r = b.getBoundingClientRect(),
        p = b.parentElement.getBoundingClientRect();
      return r.left - 1 >= p.left && r.right + 1 <= p.right;
    });
    expect(fits).toBe(true);
  }
  await expect(sw.locator('[aria-pressed="true"]')).toHaveAttribute('aria-label', 'No colour');
  await sw.locator('[data-sw="blue"]').click();
  await expect(page.locator('#ftags .fsw')).toHaveCount(0);
  await expect(dot).toHaveAttribute('data-c', 'blue');
  await expect(dot).toHaveAttribute('aria-label', 'Colour of #work: Blue');
  // the task behind wears it at once, in a shade that stays readable
  const tag = row(page, 'Write the report').locator('.tag[data-tag="work"]');
  await expect(tag).toHaveAttribute('data-c', 'blue');
  expect(await tag.evaluate(n => getComputedStyle(n).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('oneday.v1'))).tags).toEqual({ work: 'blue' });
  await page.reload();
  await expect(row(page, 'Write the report').locator('.tag[data-tag="work"]')).toHaveAttribute('data-c', 'blue');
  // the keyboard: the dot opens the colours on the one worn, the arrows move, Enter picks
  await page.keyboard.press('f');
  await page.locator('#ftags .fdot[data-tag="work"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ftags .fsw [data-sw="blue"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#ftags .fsw [data-sw=""]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ftags .fdot[data-tag="work"]')).toBeFocused();
  await expect(page.locator('#ftags .fdot[data-tag="work"]')).not.toHaveAttribute('data-c');
  await expect(row(page, 'Write the report').locator('.tag[data-tag="work"]')).not.toHaveAttribute('data-c');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('oneday.v1'))).tags).toEqual({});
});

test('the footer: the croissant sits midway between dogood.day and the links', async ({ page }) => {
  await open(page);
  // the pills: the croissant's sits midway between the other two
  const [p, k, n] = await Promise.all(['#foot .promo', '#foot .kofi', '#foot nav'].map(x => page.locator(x).boundingBox()));
  const left = k.x - (p.x + p.width),
    right = n.x - (k.x + k.width);
  expect(Math.abs(left - right)).toBeLessThan(2);
  // what lights up on hover sits five pixels inside its pill, all round
  expect(await page.locator('#foot .promo').evaluate(n => getComputedStyle(n, '::before').inset)).toBe('5px');
  expect(await page.locator('#foot nav').evaluate(n => getComputedStyle(n).padding)).toBe('5px');
  await expect(page.locator('#foot nav a', { hasText: 'Privacy' })).toBeVisible();
  await expect(page.locator('#foot nav a', { hasText: /^Legal$/ })).toBeVisible();
});

test('month pickers clip what slides in them; the footer waits for the card', async ({ page }) => {
  await open(page);
  expect(await page.locator('#pop').evaluate(n => getComputedStyle(n).overflow)).toBe('hidden');
  expect(await page.locator('#dpop').evaluate(n => getComputedStyle(n).overflow)).toBe('hidden');
  await page.evaluate(() => document.getElementById('app').classList.add('pre'));
  // even with reduced motion, the change goes through a transition of one frame
  await expect.poll(() => page.locator('#foot').evaluate(n => getComputedStyle(n).opacity)).toBe('0');
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
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  expect(await page.evaluate(() => localStorage.getItem('oneday.theme'))).toBeNull();
});

test('the wheel: up for the day before, down for the day after, one day per notch', async ({ page }) => {
  await open(page);
  const wd = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-GB', { weekday: 'long' });
  await page.locator('#num').hover();
  await page.mouse.wheel(0, 100);
  await expect(page.locator('#wd')).toHaveText(wd(1));
  await page.waitForTimeout(260);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#wd')).toHaveText(wd(0));
  await page.waitForTimeout(260);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#wd')).toHaveText(wd(-1));
});

test('the day chip follows its label with a smooth width, the words change at once', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  await expect(page.locator('#dlabel')).toHaveText('Today');
  // watch every frame, however busy the machine: the width animation is short
  await page.evaluate(() => {
    window.__cw = false;
    const t0 = performance.now();
    (function look() {
      if (document.getElementById('dchip').getAnimations().some(a => a.id === 'cw')) window.__cw = true;
      if (performance.now() - t0 < 4000) requestAnimationFrame(look);
    })();
  });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#dlabel')).toHaveText('Tomorrow');
  await expect.poll(() => page.evaluate(() => window.__cw)).toBe(true);
  // the words themselves change at once: never a roll or a fade on the label
  expect(await page.locator('#dlabel').evaluate(n => n.children.length + n.getAnimations().length)).toBe(0);
  await expect.poll(() => page.locator('#dchip').evaluate(n => n.getAnimations().some(a => a.id === 'cw'))).toBe(false);
  expect(await page.locator('#dchip').evaluate(n => n.style.overflow)).toBe('');
});

test('the wheel works on the page around the card too', async ({ page }) => {
  await open(page);
  await page.mouse.move(60, 400);
  await page.mouse.wheel(0, 100);
  await expect(page.locator('#app')).not.toHaveClass(/\bis-today\b/);
  await page.waitForTimeout(260);
  await page.mouse.wheel(0, -100);
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
});

test('search: with few tasks and many tags, the card grows to hold it all', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(k => {
    const names = ['aaaa', 'ee', 'eeeee', 'erer', 'erre', 'ffdd', 'gegg', 'reererer', 'rrre', 'tags', 'tttt', 'ty', 'work', 'yoioioo', 'zeze'];
    const tasks = [{ id: 'x', text: 'One task ' + names.map(g => '#' + g).join(' '), done: false }];
    localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
  }, today());
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  await page.keyboard.press('/');
  await expect.poll(() => page.locator('#sres').evaluate(n => n.scrollHeight - n.clientHeight)).toBeLessThanOrEqual(1);
  const [chips, card] = await Promise.all([page.locator('.sdata .chips').last().boundingBox(), page.locator('#app').boundingBox()]);
  expect(card.y + card.height - (chips.y + chips.height)).toBeGreaterThan(20);
});

test('changing day: the leaving copy of the date keeps its month on one line', async ({ page }) => {
  await open(page, { motion: 'no-preference' });
  await page.evaluate(() => {
    window.__wrap = 0;
    const t0 = performance.now();
    (function look() {
      for (const g of document.querySelectorAll('.date > .ghost .mo')) if (g.offsetHeight > 24) window.__wrap++;
      if (performance.now() - t0 < 9000) requestAnimationFrame(look);
    })();
  });
  for (let i = 0; i < 70; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
  }
  expect(await page.evaluate(() => window.__wrap)).toBe(0);
});

test('the wheel scrolls a long list first, and never flips the day at its end', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(k => {
    const tasks = Array.from({ length: 40 }, (_, i) => ({ id: 'l' + i, text: 'Task number ' + (i + 1), done: false }));
    localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
  }, today());
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  // even while the list rests after its entrance, the wheel does not flip the day
  await page.locator('#list .row').nth(3).hover();
  await page.mouse.wheel(0, 400);
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
  await expect(page.locator('#app')).not.toHaveClass(/\bcalm\b/);
  await expect.poll(() => page.locator('.sc').evaluate(n => getComputedStyle(n).overflowY)).not.toBe('hidden');
  await page.waitForTimeout(260);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 400);
  // a busy machine can still be resting the list after its entrance: wheel again until it scrolls
  await expect
    .poll(async () => {
      const top = await page.locator('.sc').evaluate(n => n.scrollTop);
      if (top <= 200) await page.mouse.wheel(0, 400);
      return top;
    })
    .toBeGreaterThan(200);
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
  // scrolled to the end, a new gesture over the list still does not flip the day
  await page.waitForTimeout(260);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(260);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  await expect(page.locator('#app')).toHaveClass(/\bis-today\b/);
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
      spot = document.createComment('app'),
      f = document.createElement('iframe');
    document.body.append(f);
    app.before(spot);
    f.contentDocument.body.append(app);
    app.querySelector('#next').click();
    await new Promise(r => setTimeout(r, 1400));
    spot.replaceWith(app);
    f.remove();
  });
  await expect(page.locator('#num .dg .out')).toHaveCount(0);
  await expect(page.locator('#num')).toHaveText(String(plus(1).getDate()));
});

test('keep on top: the floating window is styled and follows the page theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  const kids = () => page.evaluate(() => [...document.getElementById('home').children].map(n => n.id || n.className));
  const before = await kids();
  expect(before.indexOf('topbar')).toBeLessThan(before.indexOf('app'));
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
  // back in its place: the page in the same order, the time and the pills above the card again
  expect(await kids()).toEqual(before);
  const [top, card] = await Promise.all(['#topbar', '#app'].map(s => page.locator(s).boundingBox()));
  expect(top.y + top.height).toBeLessThanOrEqual(card.y + 1);
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

// Links an assistant writes: several tasks, each with a note, sub-tasks, a day and a repeat (docs/links.md).
// The clock is set to Monday 23 November 2026, so days and repeats read the same whenever the tests run.
const MON = '2026-11-23';
async function openOn(page, k = MON) {
  await page.clock.setFixedTime(new Date(k + 'T10:00:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(k => {
    if (!localStorage.getItem('oneday.v1'))
      localStorage.setItem(
        'oneday.v1',
        JSON.stringify({ days: { [k]: { u: 1, tasks: [{ id: 'a1', text: 'Write the report #work', done: false }] } }, rules: {} }),
      );
  }, k);
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oneday.v1')));

test.describe('links from assistants', () => {
  test('one link carries several tasks with notes, sub-tasks, days and repeats; they go in together and one undo takes them back', async ({ page }) => {
    await openOn(page);
    const seen = [];
    page.on('request', r => seen.push(r.url()));
    await page.goto(
      '/#add?task=Prepare+the+talk+%23work&note=Slides+and+**demo**%0A-+Intro%0A-+Q%26A&sub=Write+the+outline&sub=%5Bx%5D+Book+the+room' +
        '&task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU,FR&task=Call+the+bank&day=tomorrow',
    );
    await expect(page.locator('#inbox')).toBeVisible();
    expect(page.url()).not.toContain('#add');
    await expect(page.locator('#inT')).toHaveText('3 tasks for you');
    await expect(page.locator('#inList .inlt')).toHaveText(['Prepare the talk #work', 'Water the plants', 'Call the bank']);
    await expect(page.locator('#inList .inlm')).toHaveText(['Note · 2 sub-tasks', 'Every Tuesday and Friday, from tomorrow', 'Tomorrow']);
    // the chip holds the day of the tasks that name none
    await expect(page.locator('#inDayL')).toHaveText('Today');
    await expect(page.locator('#inYes')).toHaveText('Add all');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('Added 3 tasks to 2 days');
    const talk = row(page, 'Prepare the talk');
    await talk.locator('.mt').click();
    await expect(talk.locator('.note b')).toHaveText('demo');
    await expect(talk.locator('.note li')).toHaveText(['Intro', 'Q&A']);
    await expect(talk.locator('.sub')).toHaveText(['Write the outline', 'Book the room']);
    await expect(talk.locator('.sub.done')).toHaveText('Book the room');
    await page.mouse.click(40, 600);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Water the plants')).toBeVisible();
    await expect(row(page, 'Call the bank')).toBeVisible();
    const st = await stored(page);
    expect(Object.values(st.rules).map(r => [r.text, r.freq, r.days, r.start])).toEqual([['Water the plants', 'week', [1, 4], MON]]);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Control+z');
    await expect(row(page, 'Prepare the talk')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Water the plants')).toHaveCount(0);
    await expect(row(page, 'Call the bank')).toHaveCount(0);
    expect((await stored(page)).rules).toEqual({});
    expect(seen.some(u => u.includes('task='))).toBe(false);
  });

  test('tasks that share a day follow the chip together; a day before the first task is theirs', async ({ page }) => {
    await openOn(page);
    await page.goto('/#add?day=tomorrow&task=Buy+bread&task=Buy+milk');
    await expect(page.locator('#inDayL')).toHaveText('Tomorrow');
    await expect(page.locator('#inList .inlm:visible')).toHaveCount(0);
    await page.locator('#inDay').click();
    await page.locator('#dq [data-d="today"]').click();
    await expect(page.locator('#inDayL')).toHaveText('Today');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('2 tasks added');
    await expect(row(page, 'Buy bread')).toBeVisible();
    await expect(row(page, 'Buy milk')).toBeVisible();
    // one task with its own day: the chip starts on it and can still change it
    await page.goto('/#add?task=Pick+up+the+keys&day=friday');
    await expect(page.locator('#inT')).toHaveText('A task for you');
    await expect(page.locator('#inDayL')).toHaveText('Fri 27 Nov');
    await expect(page.locator('#inMeta')).toBeHidden();
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('27 November');
    // each its own day: no chip, every line says where it goes
    await page.goto('/#add?task=Gym&day=wednesday&task=Dentist&day=2026-12-02');
    await expect(page.locator('#inDay')).toBeHidden();
    await expect(page.locator('#inList .inlm')).toHaveText(['Wed 25 Nov', 'Wed 2 Dec']);
    // a day already gone becomes today
    await page.goto('/#add?task=Late&day=2026-11-01');
    await expect(page.locator('#inDayL')).toHaveText('Today');
  });

  test('repeats: words and iCalendar rules, counted from the task’s day, and what One Day cannot follow is said', async ({ page }) => {
    await openOn(page);
    // [repeat, what the dialog says, the task's own day]
    const reps = [
      ['daily', 'Every day, from today'],
      ['weekdays', 'Every weekday, from today'],
      ['weekends', 'Every weekend, from Sat 28 Nov'],
      ['weekly', 'Every Monday, from today'],
      ['FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', 'Every 2 weeks on Tuesday and Thursday, from tomorrow'],
      ['FREQ=MONTHLY;BYDAY=-1FR', 'Every month on the last Friday, from Fri 27 Nov'],
      ['FREQ=MONTHLY;BYDAY=WE;BYSETPOS=2', 'Every month on the second Wednesday, from Wed 9 Dec'],
      ['FREQ=MONTHLY;BYMONTHDAY=1', 'Every month on the 1st, from Tue 1 Dec'],
      ['RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', 'Every year on the fourth Thursday of November, from Thu 26 Nov'],
      ['freq=daily;count=3', 'Every day, from today, until Wed 25 Nov'],
      ['FREQ=YEARLY;COUNT=10', 'Every year on 23 November, from today, until Fri 23 Nov 2035'],
      // a date November lacks falls on its last day, from the start
      ['FREQ=MONTHLY;BYMONTHDAY=31', 'Every month on the last day, from Mon 30 Nov'],
      ['FREQ=MONTHLY;BYMONTHDAY=-1', 'Every month on the last day, from Mon 30 Nov'],
      // far apart, and from a day already gone: still followed
      ['FREQ=YEARLY;INTERVAL=3', 'Every 3 years on 21 November, from Wed 21 Nov 2029', '2026-11-21'],
      ['FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', 'Every year on 29 February, from Sun 28 Feb 2027'],
      // COUNT, worked out for each kind of rule; one that would end past the year 9999 runs on
      ['FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6', 'Every Tuesday and Thursday, from tomorrow, until Thu 10 Dec'],
      ['FREQ=MONTHLY;BYDAY=-1FR;COUNT=3', 'Every month on the last Friday, from Fri 27 Nov, until Fri 29 Jan 2027'],
      ['FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', 'Every month on the last day, from Mon 30 Nov, until Sun 31 Jan 2027'],
      ['FREQ=YEARLY;INTERVAL=8;COUNT=1000', 'Every 8 years on 23 November, from today'],
      ['FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=3', 'Every year on 29 February, from Sun 28 Feb 2027, until Wed 28 Feb 2029'],
      ['FREQ=HOURLY', 'Repeat not understood'],
      ['FREQ=MONTHLY;BYDAY=5MO', 'Repeat not understood'],
      ['FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30', 'Repeat not understood'],
      ['FREQ=YEARLY;BYMONTHDAY=14', 'Repeat not understood'],
      ['constructor', 'Repeat not understood'],
      ['FREQ=WEEKLY;UNTIL=20261101', 'Its repeat is over'],
    ];
    const kept = reps.filter(r => !/not understood|is over/.test(r[1])).length;
    await page.goto(
      '/#add?' + reps.map(([r, , d], i) => `task=R${i}&repeat=${encodeURIComponent(r)}${d ? '&day=' + d : ''}`).join('&'),
    );
    await expect(page.locator('#inList .inlm')).toHaveText(reps.map(r => r[1]));
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText(`Added ${reps.length} tasks`);
    const st = await stored(page),
      rules = Object.values(st.rules),
      rule = i => rules.find(r => r.text === 'R' + i);
    expect(rules.map(r => r.text)).toEqual(reps.slice(0, kept).map((_, i) => 'R' + i));
    expect(rule(9).until).toBe('2026-11-25');
    expect(rule(10).until).toBe('2035-11-23');
    expect(rule(8)).toMatchObject({ freq: 'month', every: 12, nth: 4, start: '2026-11-26' });
    expect(rule(11)).toMatchObject({ start: '2026-10-31', skip: ['2026-10-31'] });
    expect(st.days['2026-11-30'].tasks.map(t => t.text)).toEqual(['R11', 'R12', 'R17']);
    expect(rule(18).until).toBeUndefined();
    expect(rule(19)).toMatchObject({ start: '2024-02-29', skip: ['2024-02-29'], until: '2029-02-28' });
    // the rest came as plain tasks, today
    expect(st.days[MON].tasks.filter(t => reps[+t.text.slice(1)] && +t.text.slice(1) >= kept).map(t => t.rule || null)).toEqual(
      Array(reps.length - kept).fill(null),
    );
    await expect(row(page, 'R0')).toBeVisible();
    await expect(row(page, 'R5')).toHaveCount(0);
  });

  test('a day before the first task counts for a repeat too; undoing a repeat takes its later occurrences with it', async ({ page }) => {
    await openOn(page);
    await page.goto('/#add?day=2026-11-04&task=Sync&repeat=weekly');
    await expect(page.locator('#inMeta')).toHaveText('Every Wednesday, from Wed 25 Nov');
    await page.locator('#inNo').click();
    await page.goto('/#add?task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('Every Tuesday, from tomorrow');
    // a week later, the repeat has made another one
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Water the plants')).toBeVisible();
    expect(Object.keys((await stored(page)).days)).toContain('2026-12-01');
    await page.keyboard.press('d');
    await page.keyboard.press('Control+z');
    expect((await stored(page)).rules).toEqual({});
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await expect(row(page, 'Water the plants')).toHaveCount(0);
    const days = (await stored(page)).days;
    expect(Object.values(days).flatMap(d => d.tasks.map(t => t.text))).not.toContain('Water the plants');
  });

  test('One Day keeps up to 300 repeats: past that, a task comes without its own; ended ones make room', async ({ page }) => {
    await page.addInitScript(() => {
      const rules = {};
      for (let i = 0; i < 297; i++) rules['q' + i] = { text: 'Later ' + i, start: '2031-01-01', freq: 'day', every: 1 };
      for (let i = 0; i < 2; i++) rules['e' + i] = { text: 'Ended ' + i, start: '2026-01-01', freq: 'day', every: 1, until: '2026-02-01' };
      localStorage.setItem('oneday.v1', JSON.stringify({ days: {}, rules }));
    });
    await openOn(page);
    await page.goto('/#add?task=A&repeat=daily&task=B&repeat=daily&task=C&repeat=daily&task=D&repeat=daily&task=E&repeat=daily');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('5 tasks added (2 without their repeats: One Day keeps 300 at most)');
    const ids = Object.keys((await stored(page)).rules);
    expect(ids).toHaveLength(300);
    expect(ids.filter(id => id[0] === 'e')).toEqual([]);
    // one undo brings everything back as it was
    await page.keyboard.press('Control+z');
    expect(Object.keys((await stored(page)).rules)).toHaveLength(299);
    // with room to spare, ended repeats stay where they are
    await page.goto('/#add?task=F&repeat=weekly');
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('Every Monday, from today');
    const kept = Object.keys((await stored(page)).rules);
    expect(kept).toHaveLength(300);
    expect(kept.filter(id => id[0] === 'e')).toHaveLength(2);
  });

  test('a repeat from a link keeps its end: Done with nothing changed changes nothing, a change keeps the end', async ({ page }) => {
    await openOn(page);
    await page.goto('/#add?task=Stretch&repeat=FREQ=DAILY;COUNT=5');
    await page.locator('#inYes').click();
    const r = row(page, 'Stretch');
    await r.locator('.mt').click();
    await expect(r.locator('.rbtn')).toContainText('Every day, until Friday 27 November');
    await r.locator('.rbtn').click();
    await page.locator('#rdone').click();
    const one = () => stored(page).then(st => Object.values(st.rules)[0]);
    expect(await one()).toMatchObject({ freq: 'day', every: 1, start: MON, until: '2026-11-27' });
    await r.locator('.rbtn').click();
    await page.locator('#rplus').click();
    await page.locator('#rdone').click();
    expect(await one()).toMatchObject({ freq: 'day', every: 2, until: '2026-11-27' });
  });

  test('the compact form carries a day and a repeat too; accents, emoji and encoded signs come through as written', async ({ page }) => {
    await openOn(page);
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    await page.goto('/#add=j' + enc({ v: 1, d: [{ t: 'Old style' }, { t: 'Gym', day: 'wednesday', repeat: 'FREQ=WEEKLY;BYDAY=WE' }] }));
    await expect(page.locator('#inList .inlm')).toHaveText(['', 'Every Wednesday, from Wed 25 Nov']);
    await page.locator('#inNo').click();
    await expect(page.locator('#inbox')).toBeHidden();
    await page.goto('/#add?task=Café+à+emporter+🥐&task=C%2B%2B+%26+Rust+%23code&sub=a%3Db+%25+c');
    await expect(page.locator('#inList .inlt')).toHaveText(['Café à emporter 🥐', 'C++ & Rust #code']);
    await expect(page.locator('#inList .inlt .tag')).toHaveText('#code');
    await page.locator('#inYes').click();
    const r = row(page, 'C++ & Rust');
    await r.locator('.mt').click();
    await expect(r.locator('.sub')).toHaveText('a=b % c');
    // links in a note keep the brackets of their own address
    await page.goto(
      '/#add?task=Read+up&note=' +
        encodeURIComponent('[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet)) and https://en.wikipedia.org/wiki/Venus_(planet).'),
    );
    await page.locator('#inYes').click();
    const n = row(page, 'Read up');
    await n.locator('.mt').click();
    await expect(n.locator('.note')).toHaveText('Mercury and https://en.wikipedia.org/wiki/Venus_(planet).');
    expect(await n.locator('.note a').evaluateAll(a => a.map(x => x.getAttribute('href')))).toEqual([
      'https://en.wikipedia.org/wiki/Mercury_(planet)',
      'https://en.wikipedia.org/wiki/Venus_(planet)',
    ]);
  });

  test('a hostile readable link cannot run code or break the page', async ({ page }) => {
    await openOn(page);
    const e = encodeURIComponent;
    await page.goto(
      '/#add?task=' +
        e('Evil <img src=x onerror="window.__pwned=1">') +
        '&note=' +
        e('<script>window.__pwned=1</script>[click](javascript:window.__pwned=1) **kept** <b>raw</b> https://example.com/a?b=1&c=2') +
        '&sub=' +
        e('<svg onload="window.__pwned=1">') +
        '&day=' +
        e('"><img src=x onerror=window.__pwned=1>') +
        '&repeat=' +
        e('FREQ=DAILY;BYDAY=<script>'),
    );
    await expect(page.locator('#inTitle')).toHaveText('Evil <img src=x onerror="window.__pwned=1">');
    await expect(page.locator('#inMeta')).toHaveText('Note · 1 sub-task · Repeat not understood');
    await page.locator('#inYes').click();
    const r = row(page, 'Evil <img');
    await r.locator('.mt').click();
    await expect(r.locator('.note b')).toHaveText('kept');
    await expect(r.locator('.note')).toContainText('<b>raw</b>');
    await expect(r.locator('.note')).toContainText('[click](javascript:window.__pwned=1)');
    await expect(r.locator('.note a')).toHaveCount(1);
    await expect(r.locator('.note a')).toHaveAttribute('href', 'https://example.com/a?b=1&c=2');
    await expect(r.locator('.note img, .note script, .note svg')).toHaveCount(0);
    await expect(r.locator('.sub')).toHaveText('<svg onload="window.__pwned=1">');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    // a link with no task, or far too long: a calm word and no dialog
    await page.goto('/#add?note=no+task');
    await expect(page.locator('#toast')).toContainText('doesn’t hold a task');
    await page.goto('/#add?task=' + 'x'.repeat(33000));
    await expect(page.locator('#toast')).toContainText('doesn’t hold a task');
    await expect(page.locator('#inbox')).toBeHidden();
  });

  test('the skill for ChatGPT and Claude says who it is, and its example link holds what it says', async ({ page, baseURL }) => {
    const skill = readFileSync(new URL('../skills/one-day/SKILL.md', import.meta.url), 'utf8');
    expect(skill).toMatch(/^---\nname: one-day\ndescription: [^\n]{40,1024}\n---\n/);
    const link = skill.split('\n').find(l => l.startsWith('https://day.bemorin.com/#add?'));
    await openOn(page);
    await page.goto(link.replace('https://day.bemorin.com', baseURL));
    await expect(page.locator('#inList .inlt')).toHaveText(['Buy bread', 'Call the bank', 'Water the plants']);
    await expect(page.locator('#inList .inlm')).toHaveText(['Tomorrow', 'Note · 1 sub-task', 'Every Tuesday and Friday, from tomorrow']);
  });

  test('a link of a hundred tasks scrolls inside the dialog and the keyboard can reach it', async ({ page }) => {
    await openOn(page);
    await page.goto('/#add?' + Array.from({ length: 120 }, (_, i) => `task=Task+${i + 1}&day=${i % 2 ? 'tomorrow' : 'friday'}`).join('&'));
    await expect(page.locator('#inT')).toHaveText('100 tasks for you');
    const list = page.locator('#inList');
    await expect(list).toHaveAttribute('tabindex', '0');
    const box = await list.boundingBox();
    expect(box.height).toBeLessThan(400);
    // a faint edge says there is more, until the end is in view
    await expect(list).toHaveClass(/\bfade\b/);
    await list.evaluate(el => el.scrollTo(0, el.scrollHeight));
    await expect(list).not.toHaveClass(/\bfade\b/);
    await page.locator('#inYes').click();
    await expect(page.locator('#toast')).toContainText('Added 100 tasks to 2 days');
  });
});

test('on a large screen with a long day, the card takes what is left: the same room above the time and below the footer', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(k => {
    const tasks = Array.from({ length: 30 }, (_, i) => ({ id: 'l' + i, text: 'A long day, task ' + (i + 1), done: false }));
    localStorage.setItem('oneday.v1', JSON.stringify({ days: { [k]: { u: 1, tasks } }, rules: {} }));
  }, today());
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const first = document.querySelector('#topbar').getBoundingClientRect(),
      foot = [...document.querySelectorAll('#foot > *')].map(n => n.getBoundingClientRect().bottom);
    return { above: first.top, below: innerHeight - Math.max(...foot), scrolls: document.getElementById('sc').scrollHeight > document.getElementById('sc').clientHeight };
  });
  expect(m.scrolls).toBe(true);
  expect(m.below).toBeGreaterThan(8);
  expect(Math.abs(m.above - m.below)).toBeLessThan(3);
});

test('on a large screen the card rests in a frame of glass; not on a phone', async ({ page, browser }) => {
  await open(page);
  expect(await page.locator('#app').evaluate(n => getComputedStyle(n, '::before').backgroundImage)).toContain('gradient');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await ctx.newPage();
  await phone.goto('/');
  expect(await phone.locator('#app').evaluate(n => getComputedStyle(n, '::before').content)).toBe('none');
  await ctx.close();
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
    await expect(about.locator('.kofi')).toHaveText('This app is free. If you want, buy me a 🥐.');
    await expect(about.locator('.kofi')).toHaveAttribute('aria-label', 'This app is free. If you want, buy me a croissant on Ko-fi.');
    expect(await about.evaluate(n => getComputedStyle(n).alignItems)).toBe('center');
  });
});

test.describe('on Android', () => {
  test.use({
    viewport: { width: 412, height: 860 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  });
  test('the page does not draw under the system buttons, so the bottom bar never hides beneath them', async ({ page }) => {
    await open(page);
    const vp = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(vp).not.toContain('viewport-fit');
    expect(vp).toContain('interactive-widget=resizes-content');
    await expect(page.locator('#mbar')).toBeVisible();
  });
});

test.describe('on a touch screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('search is a drawer like More: the day stays above it; a tap on the day or a drag down goes back', async ({ page }) => {
    await open(page);
    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await expect(page.locator('#srch .sgrab')).toBeVisible();
    await expect(page.locator('#scrim')).toBeVisible();
    await expect(page.locator('#sq')).toBeFocused();
    // it rises from the bottom; the top of the day shows above it
    await expect.poll(() => page.locator('#srch').evaluate(n => Math.round(n.getBoundingClientRect().top))).toBe(70);
    const [sb, mt] = await Promise.all([
      page.locator('#srch').evaluate(n => n.getBoundingClientRect().bottom),
      page.locator('#mbar').evaluate(n => n.getBoundingClientRect().top),
    ]);
    expect(Math.abs(sb - mt)).toBeLessThan(1.5);
    await expect(page.locator('#mbSearch')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#slist .about')).toBeHidden();
    // a tap on the day closes it
    await page.locator('#scrim').tap({ position: { x: 60, y: 20 } });
    await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#scrim')).toBeHidden();
    // so does a drag down from its bar, which presses nothing on the way
    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await expect.poll(() => page.locator('#srch').evaluate(n => Math.round(n.getBoundingClientRect().top))).toBe(70);
    const b = await page.locator('#sx').boundingBox();
    await page.evaluate(([x, y]) => {
      const el = document.getElementById('sx'),
        ev = (type, cy) =>
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: cy }));
      ev('pointerdown', y);
      for (let i = 1; i <= 8; i++) ev('pointermove', y + i * 16);
      ev('pointerup', y + 128);
    }, [b.x + b.width / 2, b.y + b.height / 2]);
    await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
    // a short drag springs back and keeps it open
    await page.locator('#mbSearch').tap();
    await expect.poll(() => page.locator('#srch').evaluate(n => Math.round(n.getBoundingClientRect().top))).toBe(70);
    await page.evaluate(([x, y]) => {
      const el = document.getElementById('sq'),
        ev = (type, cy) =>
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 8, pointerType: 'touch', clientX: x, clientY: cy }));
      ev('pointerdown', y);
      for (let i = 1; i <= 3; i++) ev('pointermove', y + i * 12);
      ev('pointerup', y + 36);
    }, [b.x - 120, b.y + b.height / 2]);
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await expect.poll(() => page.locator('#srch').evaluate(n => Math.round(n.getBoundingClientRect().top))).toBe(70);
    // the lit Search button in the bar closes it
    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#mbSearch')).toHaveAttribute('aria-expanded', 'false');
  });

  test('an open card: Repeat and Send are two buttons, half the width each, their words the same size', async ({ page }) => {
    await open(page);
    await row(page, 'Plan the trip').locator('.ex').tap();
    const cb = row(page, 'Plan the trip').locator('.cfoot .cb');
    await expect(cb).toHaveCount(2);
    await expect(cb.first()).toBeVisible();
    const [r, s, f] = await Promise.all([
      cb.nth(0).boundingBox(),
      cb.nth(1).boundingBox(),
      row(page, 'Plan the trip').locator('.cfoot').boundingBox(),
    ]);
    expect(Math.abs(r.width - s.width)).toBeLessThan(1);
    expect(Math.abs(r.y - s.y)).toBeLessThan(1);
    expect(Math.abs(r.width + s.width + 8 - f.width)).toBeLessThan(1.5);
    expect(await cb.nth(0).evaluate(n => [getComputedStyle(n).fontSize, getComputedStyle(n).boxShadow !== 'none'])).toEqual(['13.5px', true]);
  });

  test('search leaves like More: from where it is, its place held while the keyboard folds away', async ({ page }) => {
    await open(page, { motion: 'no-preference' });
    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    // the keyboard is up: the drawer ends above it
    await page.evaluate(() => document.documentElement.style.setProperty('--kb', '320px'));
    await page.waitForTimeout(700);
    const before = await page.locator('#srch').evaluate(n => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), height: Math.round(r.height) };
    });
    // closing folds the keyboard away at the same moment: the drawer keeps its place and size as it goes
    const during = await page.evaluate(async () => {
      document.getElementById('mbSearch').click();
      document.documentElement.style.setProperty('--kb', '0px');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const n = document.getElementById('srch'),
        t = new DOMMatrixReadOnly(getComputedStyle(n).transform),
        top = Math.round(n.getBoundingClientRect().top - t.m42),
        a = n.getAnimations()[0],
        end = a ? parseFloat(String(a.effect.getKeyframes().slice(-1)[0].transform).replace(/[^\d.-]/g, '')) : 0;
      // it goes all the way off the screen, whatever height the window takes once the keyboard is gone
      return { top, height: Math.round(n.getBoundingClientRect().height), out: n.classList.contains('out'), gone: top + end >= screen.height };
    });
    expect(during).toEqual({ ...before, out: true, gone: true });
    // once gone, it is hidden and its place is free again
    await expect(page.locator('#srch')).not.toHaveClass(/\bout\b/);
    await expect(page.locator('#srch')).toBeHidden();
    expect(await page.locator('#srch').evaluate(n => n.style.top)).toBe('');
  });

  test('an open panel lights its button in the bar, which stays above it and switches panels', async ({ page }) => {
    await open(page);
    const lit = id =>
      page.evaluate(id => {
        const b = document.getElementById(id),
          r = b.getBoundingClientRect(),
          hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return b.getAttribute('aria-expanded') === 'true' && !!hit && b.contains(hit);
      }, id);
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect.poll(() => lit('mbMore')).toBe(true);
    // More sits on the bar
    const [mb, bt] = await Promise.all([
      page.locator('#more').evaluate(n => n.getBoundingClientRect().bottom),
      page.locator('#mbar').evaluate(n => n.getBoundingClientRect().top),
    ]);
    expect(Math.abs(mb - bt)).toBeLessThan(1.5);
    // from More straight to the timer: one panel at a time
    await page.locator('#mbTimer').tap();
    await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
    await expect(page.locator('#more')).toBeHidden();
    await expect.poll(() => lit('mbTimer')).toBe(true);
    await expect(page.locator('#mbMore')).toHaveAttribute('aria-expanded', 'false');
    // and from the timer to search
    await page.locator('#mbSearch').tap();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);
    await expect.poll(() => lit('mbSearch')).toBe(true);
    await expect(page.locator('#mbTimer')).toHaveAttribute('aria-expanded', 'false');
    // from search to More
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#mbSearch')).toHaveAttribute('aria-expanded', 'false');
  });

  test('More: its links to dogood.day and the croissant are buttons like the backups, with no rules between', async ({ page }) => {
    await open(page);
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#more hr')).toHaveCount(0);
    const w = await page.locator('#more .sbk').evaluate(n => n.getBoundingClientRect().width);
    for (const sel of ['#more .spromo:not(.kofi)', '#more .spromo.kofi']) {
      const [width, shadow, align] = await page
        .locator(sel)
        .evaluate(n => [n.getBoundingClientRect().width, getComputedStyle(n).boxShadow, getComputedStyle(n).textAlign]);
      expect(Math.abs(width - w)).toBeLessThan(1.5);
      expect(shadow).not.toBe('none');
      expect(align).toBe('center');
    }
  });

  test('the timer sheet sits over a scrim; a tap on it closes both', async ({ page }) => {
    await open(page);
    await page.locator('#mbTimer').tap();
    await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
    await expect(page.locator('#tpop .tgrab')).toBeVisible();
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
    await expect(page.locator('#more .sbk .sbk-b')).toHaveCount(2);
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
    // the croissant says why it is there, on a row of its own under dogood.day
    await expect(page.locator('#more .spromo.kofi')).toHaveText('This app is free. If you want, buy me a 🥐.');
    await expect(page.locator('#more .spromo:not(.kofi) + .spromo.kofi')).toHaveCount(1);
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

test.describe('the lock', () => {
  const PASS = 'correct horse battery';
  // the seed goes in only when there is nothing yet: no tasks, no vault
  async function openLock(page) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(data => {
      if (!localStorage.getItem('oneday.v1') && !localStorage.getItem('oneday.vault'))
        localStorage.setItem('oneday.v1', JSON.stringify(data));
    }, seed());
    await page.goto('/');
  }
  async function fillOn(page, pass = PASS) {
    await expect(page.locator('#lockset')).toBeVisible();
    await expect(page.locator('#lsT')).toHaveText('Protect One Day');
    await page.locator('#lsPass').fill(pass);
    await page.locator('#lsPass2').fill(pass);
    await page.locator('#lsOk').check();
  }
  async function turnOn(page, pass = PASS) {
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="lock"]').click();
    await fillOn(page, pass);
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#toast')).toContainText('One Day is protected');
  }
  async function unlock(page, pass = PASS) {
    await page.locator('#lockPass').fill(pass);
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#lock')).toBeHidden({ timeout: 20000 });
  }
  const stored = page =>
    page.evaluate(() => ({ plain: localStorage.getItem('oneday.v1'), vault: localStorage.getItem('oneday.vault') }));

  test('turning it on encrypts the tasks; a reload asks for the passphrase', async ({ page }) => {
    await openLock(page);
    await expect(row(page, 'Plan the trip')).toBeVisible();
    await turnOn(page);
    const s = await stored(page);
    expect(s.plain).toBeNull();
    expect(s.vault).not.toContain('Plan the trip');
    expect(s.vault).not.toContain('passports');
    await expect(page.locator('#slist .sdata .shint')).toHaveText('Your tasks are encrypted and stored only in this browser.');
    await expect(page.locator('#slist [data-act="locknow"]')).toBeVisible();
    await expect(page.locator('#lpill')).toHaveClass(/\bon\b/);
    await expect(page.locator('#lpill')).toHaveAttribute('aria-label', 'Lock now');

    await page.reload();
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('#lockPass')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('Plan the trip'))).toBe(false);
    await page.locator('#lockPass').fill('not it at all');
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#lockErr')).toHaveText('That passphrase doesn’t open these tasks');
    await expect(page.locator('#lock')).toBeVisible();
    await unlock(page);
    await expect(row(page, 'Plan the trip')).toBeVisible();
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  });

  test('above the card: the time on the left, the sun and the lock on the right', async ({ page }) => {
    await openLock(page);
    await expect(page.locator('#clock')).toHaveAttribute('aria-label', /^Time: /);
    const shown = await page.locator('#clock').getAttribute('aria-label');
    // the time as the browser writes it, this minute or the one before
    const ok = await page.evaluate(() => {
      const hm = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
        now = Date.now();
      return [hm.format(now), hm.format(now - 60e3)];
    });
    expect(ok).toContain(shown.replace('Time: ', ''));
    // the sun left of the lock, two separate pills of the same size, both above the card
    await expect(page.locator('#topbar #theme')).toBeVisible();
    await expect(page.locator('#topbar #clock')).toBeVisible();
    const [c, t, l] = await Promise.all(['#clock', '#theme', '#lpill'].map(x => page.locator(x).boundingBox()));
    expect(c.x).toBeLessThan(t.x);
    expect(t.x + t.width).toBeLessThan(l.x);
    expect([t.width, t.height]).toEqual([l.width, l.height]);
    expect(Math.round(l.height)).toBe(40);
    await expect(page.locator('.bar #theme')).toHaveCount(0);
    await expect(page.locator('#lpill')).toHaveAttribute('aria-label', 'Protect with a passphrase');
    await page.locator('#lpill').click();
    await expect(page.locator('#lockset')).toBeVisible();
    await expect(page.locator('#lsT')).toHaveText('Protect One Day');
  });

  test('changes stay encrypted; L locks at once and leaves nothing on screen', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    await page.locator('#input').fill('Call the bank');
    await page.locator('#input').press('Enter');
    await expect(row(page, 'Call the bank')).toBeVisible();
    await page.locator('#input').evaluate(n => n.blur());
    await page.keyboard.press('l');
    await expect(page.locator('#lock')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('Call the bank'))).toBe(false);
    expect((await stored(page)).vault).not.toContain('Call the bank');
    await unlock(page);
    await expect(row(page, 'Call the bank')).toBeVisible();
    await page.reload();
    await unlock(page);
    await expect(row(page, 'Call the bank')).toBeVisible();
  });

  test('change the passphrase, then turn the lock off', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    await page.locator('#slist [data-act="lockchange"]').click();
    await page.locator('#lsOld').fill('wrong one!');
    await page.locator('#lsPass').fill('a brand new phrase');
    await page.locator('#lsPass2').fill('a brand new phrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('That isn’t the current passphrase');
    await page.locator('#lsOld').fill(PASS);
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#toast')).toContainText('Passphrase changed');

    await page.reload();
    await page.locator('#lockPass').fill(PASS);
    await page.locator('#lockPass').press('Enter');
    await expect(page.locator('#lockErr')).toContainText('doesn’t open');
    await unlock(page, 'a brand new phrase');
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="lockoff"]').click();
    await page.locator('#lsOld').fill('a brand new phrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    const s = await stored(page);
    expect(s.vault).toBeNull();
    expect(s.plain).toContain('Plan the trip');
    await page.reload();
    await expect(page.locator('#lock')).toBeHidden();
    await expect(row(page, 'Plan the trip')).toBeVisible();
  });

  test('backups are encrypted, and open with their passphrase in another browser', async ({ page, browser }) => {
    await openLock(page);
    await turnOn(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#slist [data-act="export"]').click()]);
    expect(dl.suggestedFilename()).toMatch(/-encrypted\.json$/);
    const body = readFileSync(await dl.path(), 'utf8');
    expect(body).not.toContain('Plan the trip');
    expect(JSON.parse(body).vault.data.ct).toBeTruthy();

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.addInitScript(() => localStorage.setItem('oneday.v1', JSON.stringify({ days: {}, rules: {} })));
    await other.goto('/');
    await other.locator('#impf').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(body) });
    await expect(other.locator('#lsT')).toHaveText('Encrypted backup');
    await other.locator('#lsOld').fill('nope nope');
    await other.locator('#lsGo').click();
    await expect(other.locator('#lsErr')).toHaveText('That passphrase doesn’t open this backup');
    await other.locator('#lsOld').fill(PASS);
    await other.locator('#lsGo').click();
    await expect(other.locator('#toast')).toContainText('Imported 3 tasks', { timeout: 20000 });
    await expect(other.locator('#list .row', { hasText: 'Plan the trip' })).toBeVisible();
    await ctx.close();
  });

  test('fingerprint or face (a passkey) unlocks too', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf: true,
        automaticPresenceSimulation: true,
      },
    });
    await openLock(page);
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="lock"]').click();
    await fillOn(page);
    await expect(page.locator('#lsBioL')).toBeVisible();
    await page.locator('#lsBio').check();
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#toast')).toHaveText(/One Day is protected\. Your tasks are encrypted\./);
    expect(JSON.parse((await stored(page)).vault).bio).toBeTruthy();

    await page.reload();
    await expect(page.locator('#lockBio')).toHaveText('Use fingerprint, face or PIN');
    await page.locator('#lockBio').click();
    await expect(page.locator('#lock')).toBeHidden({ timeout: 20000 });
    await expect(row(page, 'Plan the trip')).toBeVisible();

    // stopping it asks for the passphrase and brings a new key
    const k0 = JSON.parse((await stored(page)).vault).kid;
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="biooff"]').click();
    await expect(page.locator('#lsT')).toHaveText('Stop using fingerprint or face');
    await page.locator('#lsOld').fill('not the passphrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('That isn’t the current passphrase');
    await page.locator('#lsOld').fill(PASS);
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    const off = JSON.parse((await stored(page)).vault);
    expect(off.bio).toBeUndefined();
    expect(off.kid).not.toBe(k0);

    // setting it up again asks for the passphrase too (search is still open behind)
    await page.locator('#slist [data-act="bioon"]').click();
    await expect(page.locator('#lsT')).toHaveText('Use fingerprint or face');
    await expect(page.locator('#lsPass')).toBeHidden();
    await page.locator('#lsOld').fill('not the passphrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('That isn’t the current passphrase');
    expect(JSON.parse((await stored(page)).vault).bio).toBeUndefined();
    await page.locator('#lsOld').fill(PASS);
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#toast')).toContainText('can now unlock One Day');
    expect(JSON.parse((await stored(page)).vault).bio).toBeTruthy();
    await page.reload();
    await page.locator('#lockBio').click();
    await expect(page.locator('#lock')).toBeHidden({ timeout: 20000 });
    await expect(row(page, 'Plan the trip')).toBeVisible();
  });

  test('away for five minutes: locked on return', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    // while away, nothing of the tasks is left for the app switcher's picture
    const hidden = h =>
      page.evaluate(h => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        document.dispatchEvent(new Event('visibilitychange'));
      }, h);
    await hidden(true);
    await expect(page.locator('#home')).toHaveClass(/\bveil\b/);
    await hidden(false);
    await expect(page.locator('#home')).not.toHaveClass(/\bveil\b/);
    const away = ms =>
      page.evaluate(ms => {
        const now = Date.now();
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        Date.now = () => now + ms;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      }, ms);
    await away(4 * 60e3);
    await page.waitForTimeout(300);
    await expect(page.locator('#lock')).toBeHidden();
    await away(5 * 60e3 + 1000);
    await expect(page.locator('#lock')).toBeVisible();
  });

  test('the warning holds its consent in one red block; a wrong field turns red, fixing it clears the message', async ({ page }) => {
    await openLock(page);
    await page.locator('#lpill').click();
    await expect(page.locator('#lockset')).toBeVisible();
    // one block: a tap on its words ticks the box, another unticks it
    await expect(page.locator('#lsOkL #lsWarn')).toBeVisible();
    await expect(page.locator('#lsOkL #lsOk')).toBeVisible();
    await page.locator('#lsWarn').click();
    await expect(page.locator('#lsOk')).toBeChecked();
    await page.locator('#lsWarn').click();
    await expect(page.locator('#lsOk')).not.toBeChecked();
    await expect(page.locator('#lsOk')).toHaveAccessibleName('I understand');
    // the words wrap with no lone last word
    expect(
      await page.locator('#lsSub').evaluate(n => {
        const c = getComputedStyle(n);
        return c.textWrapStyle || c.textWrap;
      }),
    ).toContain('pretty');
    // too short: that field turns red and the message says why; typing again clears both
    await page.locator('#lsPass').fill('short');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('Use 12 characters or more');
    await expect(page.locator('#lsPass')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#lsPass').pressSequentially('a longer one');
    await expect(page.locator('#lsErr')).toHaveText('');
    await expect(page.locator('#lsPass')).not.toHaveAttribute('aria-invalid', 'true');
    // not ticked: the box takes the focus, and ticking it clears the message
    await page.locator('#lsPass').fill(PASS);
    await page.locator('#lsPass2').fill(PASS);
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('Tick “I understand” first');
    await expect(page.locator('#lsOk')).toBeFocused();
    await page.locator('#lsOk').check();
    await expect(page.locator('#lsErr')).toHaveText('');
    await page.locator('#lsCancel').click();
    await expect(page.locator('#lockset')).toBeHidden();
    expect((await stored(page)).vault).toBeNull();
  });

  test('Lock now locks every tab; a settings dialog open in one closes and nothing is lost', async ({ page, context }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    const other = await context.newPage();
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.goto('/');
    await expect(other.locator('#lock')).toBeVisible();
    await unlock(other);
    // the first tab is about to turn protection off when the second one locks
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="lockoff"]').click();
    await expect(page.locator('#lockset')).toBeVisible();
    await page.locator('#lsOld').fill(PASS);
    await other.locator('body').press('l');
    await expect(other.locator('#lock')).toBeVisible();
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('#lockset')).toBeHidden();
    const s = await stored(page);
    expect(s.vault).not.toBeNull();
    expect(s.plain).toBeNull();
    await unlock(page);
    await expect(row(page, 'Plan the trip')).toBeVisible();
  });

  test('tasks an older tab writes in clear are merged into the vault, then the clear copy goes', async ({ page, context }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    const other = await context.newPage();
    await other.goto('/');
    const write = text =>
      other.evaluate(
        ([text, k]) =>
          localStorage.setItem(
            'oneday.v1',
            JSON.stringify({
              days: {
                [k]: {
                  u: Date.now() + 60e3,
                  // the stale tab's own copy of a task the vault has, and a task of its own
                  tasks: [
                    { id: 'b2', text: 'Plan the trip, as the old tab had it', done: true },
                    { id: 'z' + text.length, text, done: false },
                    { id: 'z' + text.length, text, done: false },
                  ],
                },
              },
              rules: {},
            }),
          ),
        [text, today()],
      );
    // unlocked: merged at once, task by task (the day's other tasks stay), sealed, and the copy in clear is removed
    await write('Buy stamps');
    await expect(row(page, 'Buy stamps')).toBeVisible();
    await expect(row(page, 'Buy stamps')).toHaveCount(1);
    // a task both have keeps the vault's version
    await expect(row(page, 'Plan the trip')).toBeVisible();
    await expect(row(page, 'as the old tab had it')).toHaveCount(0);
    await expect(row(page, 'Write the report')).toBeVisible();
    await expect.poll(async () => (await stored(page)).plain).toBeNull();
    expect((await stored(page)).vault).not.toContain('Buy stamps');
    // locked: it waits for the passphrase, then the same
    await page.locator('body').press('l');
    await expect(page.locator('#lock')).toBeVisible();
    await write('Call the vet');
    await unlock(page);
    await expect(row(page, 'Call the vet')).toBeVisible();
    await expect(row(page, 'Buy stamps')).toBeVisible();
    await expect(row(page, 'Plan the trip')).toBeVisible();
    await expect.poll(async () => (await stored(page)).plain).toBeNull();
    expect((await stored(page)).vault).not.toContain('Call the vet');
  });

  test('a new passphrase brings a new key: an old copy and the old passphrase open nothing written since', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    const before = JSON.parse((await stored(page)).vault);
    await page.locator('#slist [data-act="lockchange"]').click();
    await page.locator('#lsOld').fill(PASS);
    await page.locator('#lsPass').fill('a brand new phrase');
    await page.locator('#lsPass2').fill('a brand new phrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    const mid = JSON.parse((await stored(page)).vault);
    expect(mid.kid).toBeTruthy();
    expect(mid.kid).not.toBe(before.kid);
    await page.keyboard.press('Escape');
    await page.locator('#input').fill('Renew the passport');
    await page.locator('#input').press('Enter');
    await expect.poll(async () => JSON.parse((await stored(page)).vault).data.ct).not.toBe(mid.data.ct);
    const now = JSON.parse((await stored(page)).vault);
    const opens = await page.evaluate(
      async ([old, now, pass]) => {
        const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
          base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']),
          kek = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', hash: 'SHA-256', salt: b(old.kdf.salt), iterations: old.kdf.iter },
            base,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt'],
          ),
          raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(old.pass.iv) }, kek, b(old.pass.ct)),
          dek = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
        try {
          await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(now.data.iv) }, dek, b(now.data.ct));
          return true;
        } catch (e) {
          return false;
        }
      },
      [before, now, PASS],
    );
    expect(opens).toBe(false);
  });

  test('a new passphrase keeps the tasks another tab sealed meanwhile', async ({ page, context }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    const other = await context.newPage();
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.goto('/');
    await unlock(other);
    await other.locator('#input').fill('Sealed in the other tab');
    await other.locator('#input').press('Enter');
    await expect(row(other, 'Sealed in the other tab')).toBeVisible();
    await expect.poll(async () => JSON.parse((await stored(page)).vault).data.ct).toBeTruthy();
    await other.waitForTimeout(300);
    await page.keyboard.press('/');
    await page.locator('#slist [data-act="lockchange"]').click();
    await page.locator('#lsOld').fill(PASS);
    await page.locator('#lsPass').fill('a brand new phrase');
    await page.locator('#lsPass2').fill('a brand new phrase');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
    await page.keyboard.press('Escape');
    await expect(row(page, 'Sealed in the other tab')).toBeVisible();
    await page.reload();
    await unlock(page, 'a brand new phrase');
    await expect(row(page, 'Sealed in the other tab')).toBeVisible();
  });

  test('tag colours are sealed with the tasks, and come back once unlocked', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await page.locator('#ftags .fdot[data-tag="travel"]').click();
    await page.locator('#ftags .fsw [data-sw="green"]').click();
    await expect.poll(async () => (await stored(page)).vault).not.toContain('green');
    expect((await stored(page)).plain).toBeNull();
    await page.reload();
    await unlock(page);
    await page.locator('body').press('f');
    await expect(page.locator('#ftags .fdot[data-tag="travel"]')).toHaveAttribute('data-c', 'green');
  });

  test('locking leaves no tag behind: the filter, the field and its placeholder are cleared', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await page.locator('#ftags .ftag', { hasText: 'work' }).click();
    await expect(page.locator('#fname')).toHaveText('#work');
    await page.locator('body').press('l');
    await expect(page.locator('#lock')).toBeVisible();
    await expect(page.locator('#fname')).toHaveText('');
    await expect(page.locator('#input')).toHaveAttribute('placeholder', 'Add a task');
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('#work'))).toBe(false);
  });

  test('forgot the passphrase: erase and start over', async ({ page }) => {
    await openLock(page);
    await turnOn(page);
    await page.reload();
    await page.locator('#lockForgot').click();
    await expect(page.locator('#lsT')).toHaveText('Forgot the passphrase?');
    await page.locator('#lsGo').click();
    await expect(page.locator('#lsErr')).toHaveText('Tick the box to erase them');
    await page.locator('#lsOk').check();
    await page.locator('#lsGo').click();
    await expect(page.locator('#lock')).toBeHidden();
    await expect(row(page, 'Plan the trip')).toBeVisible();
    expect((await stored(page)).vault).toBeNull();
  });

  test.describe('in a narrower window', () => {
    test.use({ viewport: { width: 640, height: 800 } });
    test('the time sits in the middle of the bar; the sun and the lock come after the floating window', async ({ page }) => {
      await openLock(page);
      await expect(page.locator('.bar .sp #clock')).toBeVisible();
      // exactly between the chevrons and the first button on the right
      const [n, c, b] = await Promise.all(['#next', '#clock', '#sb'].map(x => page.locator(x).boundingBox()));
      expect(Math.abs(c.x + c.width / 2 - (n.x + n.width + b.x) / 2)).toBeLessThan(2);
      const order = await page.evaluate(() =>
        [...document.querySelector('.bar').children].filter(e => e.getClientRects().length).map(e => e.id || e.className),
      );
      expect(order.slice(-3)).toEqual(['float', 'theme', 'lockb']);
      await expect(page.locator('#lockb')).toHaveAttribute('aria-label', 'Protect with a passphrase');
      await page.locator('#lockb').click();
      await expect(page.locator('#lsT')).toHaveText('Protect One Day');
    });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the lock lives in More; the top right keeps the theme alone', async ({ page }) => {
      await openLock(page);
      await page.locator('#mbMore').tap();
      // a button like the backups', across the sheet, its words in the middle
      const centre = sel => page.locator(sel).evaluate(n => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.width)]; });
      await expect(page.locator('#more [data-act="lock"]')).toHaveClass(/sbk-b/);
      const [lx, lw] = await centre('#more [data-act="lock"]'), [sx, sw] = await centre('#more .sbk');
      expect(Math.abs(lx - sx)).toBeLessThan(2);
      expect(Math.abs(lw - sw)).toBeLessThan(6);
      const [tx] = await centre('#more [data-act="lock"] span');
      expect(Math.abs(tx - lx)).toBeLessThan(16);
      await page.locator('#more [data-act="lock"]').tap();
      // a sheet from the bottom of the screen, its two buttons side by side
      await expect.poll(() => page.locator('#lsForm').evaluate(n => Math.round(innerHeight - n.getBoundingClientRect().bottom))).toBe(0);
      const [c, g] = await Promise.all([page.locator('#lsCancel').boundingBox(), page.locator('#lsGo').boundingBox()]);
      expect(Math.abs(c.y - g.y)).toBeLessThan(1);
      expect(Math.abs(c.width - g.width)).toBeLessThan(1);
      await fillOn(page);
      await page.locator('#lsGo').tap();
      await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
      await expect(page.locator('#lockb')).toBeHidden();
      await expect(page.locator('#clock')).toBeHidden();
      await page.locator('#mbMore').tap();
      await expect(page.locator('#more [data-act="lockoff"]')).toBeVisible();
      // protected: one group of centred buttons, lock now first, turning it off last
      await expect(page.locator('#more .slk')).toHaveClass(/grp/);
      expect(await page.locator('#more .slk > *').evaluateAll(a => a.every(n => n.classList.contains('sbk-b')))).toBe(true);
      expect(await page.locator('#more .slk > :first-child').getAttribute('data-act')).toBe('locknow');
      expect(await page.locator('#more .slk > :last-child').getAttribute('data-act')).toBe('lockoff');
      await page.locator('#more [data-act="locknow"]').tap();
      await expect(page.locator('#lock')).toBeVisible();
      await expect(page.locator('#lockPass')).not.toBeFocused();
    });
  });
});

test.describe('More on a phone, scanned (axe, WCAG 2.2 AA)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  for (const scheme of ['light', 'dark'])
    test(scheme, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await page.locator('#mbMore').tap();
      await expect(page.locator('#more')).toBeVisible();
      await page.waitForTimeout(450);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#more')
        .analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
});

test.describe('installing One Day', () => {
  test('nothing is offered while the browser offers nothing', async ({ page }) => {
    await open(page);
    for (const id of ['#ins', '#ipill', '#kb']) await expect(page.locator(id)).toBeHidden();
    await expect(page.locator('#theme')).toBeVisible();
  });

  test('on a large screen, the offer sits in the middle of the time\'s line; it installs, then goes for good', async ({ page }) => {
    await open(page);
    await offerInstall(page);
    await expect(page.locator('#ins')).toBeVisible();
    // as far from the time as from the sun, on the line where the pills end
    const [c, i, t] = await Promise.all(['#clock', '#ins', '#theme'].map(x => page.locator(x).boundingBox()));
    expect(Math.abs(i.x - (c.x + c.width) - (t.x - (i.x + i.width)))).toBeLessThan(2);
    expect(Math.abs(i.y + i.height - (t.y + t.height))).toBeLessThan(1);
    expect(Math.round(i.height)).toBe(40);
    await page.locator('#insGo').click();
    expect(await page.evaluate(() => window.__prompted)).toBe(1);
    await expect(page.locator('#ins')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.locator('#toast')).toContainText('One Day is installed');
    // installed, it is not offered again, whatever the browser says
    await offerInstall(page);
    await expect(page.locator('#ins')).toBeHidden();
    await expect(page.locator('#ipill')).toBeHidden();
  });

  test('the offer\'s words sit in the middle of their button, level with its icon', async ({ page }) => {
    await open(page);
    await offerInstall(page);
    await expect(page.locator('#ins')).toBeVisible();
    await page.evaluate(() => document.fonts.load('600 13px Archivo'));
    await page.waitForTimeout(300);
    // What the eye sees, from a picture of the button: the capital I's ink, from its top to the baseline, against the
    // button's middle. (Archivo sets its capitals a pixel high in a line: the words come down one pixel.)
    // the page's top margin is a whole number of pixels, so what sits above the card is on the pixel grid
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('home')).paddingTop)).toMatch(/^\d+px$/);
    const { left, svgL, svgR } = await page.evaluate(() => {
      const go = document.getElementById('insGo').getBoundingClientRect(),
        sv = document.querySelector('#insGo svg').getBoundingClientRect();
      return { left: document.querySelector('#insGo span').getBoundingClientRect().left - go.left, svgL: sv.left - go.left, svgR: sv.right - go.left };
    });
    const png = (await page.locator('#insGo').screenshot()).toString('base64');
    const m = await page.evaluate(
      async ([b64, left, svgL, svgR]) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let t = 1e9,
          b = -1,
          rt = 1e9,
          rb = -1;
        for (let j = 0; j < c.height; j++)
          for (let i = 0; i < c.width; i++) {
            const k = (j * c.width + i) * 4,
              [R, G, B] = [d[k], d[k + 1], d[k + 2]];
            if (i >= Math.floor(left) && i <= Math.ceil(left + 2.5) && R + G + B < 330) {
              t = Math.min(t, j);
              b = Math.max(b, j);
            }
            // the red icon, inside its own box (the words' edges can be tinted red too)
            if (i >= Math.floor(svgL) && i <= Math.ceil(svgR) && R > 170 && G < 90 && B < 110) {
              rt = Math.min(rt, j);
              rb = Math.max(rb, j);
            }
          }
        return { cap: (t + b + 1) / 2, icon: (rt + rb + 1) / 2, box: c.height / 2 };
      },
      [png, left, svgL, svgR],
    );
    expect(Math.abs(m.cap - m.box)).toBeLessThanOrEqual(0.5);
    // and the icon level with the words
    expect(Math.abs(m.icon - m.cap)).toBeLessThanOrEqual(0.5);
  });

  test('its cross puts the offer off for good: a small pill before the sun, still one click from installing', async ({ page }) => {
    await open(page);
    await offerInstall(page);
    await page.locator('#insX').click();
    await expect(page.locator('#ins')).toBeHidden();
    await expect(page.locator('#ipill')).toBeVisible();
    await expect(page.locator('#ipill')).toBeFocused();
    const [pl, t, c] = await Promise.all(['#ipill', '#theme', '#clock'].map(x => page.locator(x).boundingBox()));
    expect(pl.x + pl.width).toBeLessThan(t.x);
    expect([pl.width, pl.height]).toEqual([t.width, t.height]);
    // the time is back at the start of the line
    expect(c.x).toBeLessThan(pl.x - 200);
    await page.reload();
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await offerInstall(page);
    await expect(page.locator('#ins')).toBeHidden();
    await expect(page.locator('#ipill')).toBeVisible();
    await page.locator('#ipill').click();
    expect(await page.evaluate(() => window.__prompted)).toBe(1);
  });

  test('an installed app offers nothing', async ({ page }) => {
    await page.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q =>
        /display-mode: standalone/.test(q)
          ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
          : mm(q);
    });
    await open(page);
    await offerInstall(page);
    for (const id of ['#ins', '#ipill', '#kb']) await expect(page.locator(id)).toBeHidden();
  });

  test.describe('in a narrower window', () => {
    test.use({ viewport: { width: 640, height: 800 } });
    test('install, the theme and the lock wait behind one button, in one menu', async ({ page }) => {
      await open(page);
      await offerInstall(page);
      await expect(page.locator('#kb')).toBeVisible();
      await expect(page.locator('#theme')).toBeHidden();
      await expect(page.locator('#lockb')).toBeHidden();
      // the time stays in the middle of the bar
      const [n, c, b] = await Promise.all(['#next', '#clock', '#sb'].map(x => page.locator(x).boundingBox()));
      expect(Math.abs(c.x + c.width / 2 - (n.x + n.width + b.x) / 2)).toBeLessThan(2);
      await page.locator('#kb').click();
      await expect(page.locator('#kpop')).toHaveClass(/\bon\b/);
      await expect(page.locator('#kb')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#kpop .kit')).toHaveText(['Install One Day', 'Dark mode', 'Protect with a passphrase']);
      await expect(page.locator('#kpop .kit').first()).toBeFocused();
      // the arrows go round the menu; Escape closes it and goes back to its button
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#kpop .kit').nth(1)).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#kpop .kit').nth(2)).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#kpop')).not.toHaveClass(/\bon\b/);
      await expect(page.locator('#kb')).toBeFocused();
      // under its button, inside the card
      await page.locator('#kb').click();
      const [k, m] = await Promise.all(['#kb', '#kpop'].map(x => page.locator(x).boundingBox()));
      expect(m.y).toBeGreaterThanOrEqual(k.y + k.height);
      expect(Math.abs(m.x + m.width - (k.x + k.width))).toBeLessThan(2);
      await page.locator('#kpop .kit', { hasText: 'Dark mode' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.locator('#kb').click();
      await expect(page.locator('#kpop .kit').nth(1)).toHaveText('Light mode');
      await page.locator('#kpop .kit', { hasText: 'Install One Day' }).click();
      expect(await page.evaluate(() => window.__prompted)).toBe(1);
      // the offer used, the sun and the lock come back to the bar
      await expect(page.locator('#kb')).toBeHidden();
      await expect(page.locator('#theme')).toBeVisible();
      await expect(page.locator('#lockb')).toBeVisible();
    });
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('the offer comes first in More, in red; the bar keeps its sun', async ({ page }) => {
      await open(page);
      await offerInstall(page);
      await expect(page.locator('#kb')).toBeHidden();
      await page.locator('#mbMore').tap();
      const b = page.locator('#moreList > :first-child');
      await expect(b).toHaveClass(/\bsins\b/);
      await expect(b).toHaveText('Install One Day');
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .include('#more')
        .analyze();
      expect(violations.map(v => v.id)).toEqual([]);
      await b.tap();
      expect(await page.evaluate(() => window.__prompted)).toBe(1);
      await expect(page.locator('#more')).toBeHidden();
    });
  });

  test.describe('on an iPhone', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    });
    test('Safari lends no prompt: the offer says where Add to Home Screen is', async ({ page }) => {
      await open(page);
      await page.locator('#mbMore').tap();
      await page.locator('#moreList .sins').tap();
      await expect(page.locator('#toast')).toContainText('then Add to Home Screen');
    });
  });
});

test.describe("the composer's plus", () => {
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('it adds what is typed, keeps the field and the sheet open, and red says there is something to add', async ({ page }) => {
      await open(page);
      await page.locator('#mbAdd').tap();
      await expect(page.locator('#app')).toHaveClass(/\bcomposing\b/);
      // empty, it leaves the composer as it is
      await page.locator('#addGo').tap();
      await expect(page.locator('#app')).toHaveClass(/\bcomposing\b/);
      await expect(page.locator('#input')).toBeFocused();
      const bg = () => page.locator('#addGo').evaluate(n => getComputedStyle(n).backgroundColor);
      const idle = await bg();
      await page.keyboard.type('Post reel in the morning');
      await expect(page.locator('#add')).toHaveClass(/\btyping\b/);
      expect(await bg()).not.toBe(idle);
      await page.locator('#addGo').tap();
      await expect(row(page, 'Post reel in the morning')).toHaveCount(1);
      // ready for the next one: the sheet open, the field empty and focused (the keyboard stays up)
      await expect(page.locator('#app')).toHaveClass(/\bcomposing\b/);
      await expect(page.locator('#input')).toHaveValue('');
      await expect(page.locator('#input')).toBeFocused();
      await expect(page.locator('#add')).not.toHaveClass(/\btyping\b/);
      const box = await page.locator('#addGo').boundingBox();
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(36);
    });
  });

  test('on a computer, a click on it adds the task too', async ({ page }) => {
    await open(page);
    await page.locator('#input').click();
    await page.keyboard.type('Write the newsletter');
    await page.locator('#addGo').click();
    await expect(row(page, 'Write the newsletter')).toHaveCount(1);
    await expect(page.locator('#input')).toHaveValue('');
    await expect(page.locator('#input')).toBeFocused();
    await expect(page.locator('#addGo')).toHaveAttribute('aria-label', 'Add the task');
  });
});

test.describe("the device's back", () => {
  // A stand-in for the browser's CloseWatcher: the device's back closes the newest one still open; with none, it
  // would leave the app.
  const fakeBack = page =>
    page.addInitScript(() => {
      const live = [];
      window.CloseWatcher = class {
        constructor() {
          live.push(this);
        }
        destroy() {
          const i = live.indexOf(this);
          if (i > -1) live.splice(i, 1);
        }
        requestClose() {
          this.close();
        }
        close() {
          this.destroy();
          if (this.onclose) this.onclose(new Event('close'));
        }
      };
      window.__back = () => {
        const w = live[live.length - 1];
        if (!w) return false;
        w.close();
        return true;
      };
      window.__held = () => live.length;
    });
  const back = page => page.evaluate(() => window.__back());

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test('closes what is open, the one on top first, before it leaves the app', async ({ page }) => {
      await fakeBack(page);
      await open(page);
      expect(await page.evaluate(() => window.__held())).toBe(0);
      // More
      await page.locator('#mbMore').tap();
      await expect(page.locator('#more')).toBeVisible();
      expect(await back(page)).toBe(true);
      await expect(page.locator('#more')).toBeHidden();
      // search's drawer
      await page.locator('#mbSearch').tap();
      await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
      await back(page);
      await expect(page.locator('#srch')).not.toHaveClass(/\bon\b/);
      // the composer, and the day picker over it: the picker goes first
      await page.locator('#mbAdd').tap();
      await expect(page.locator('#app')).toHaveClass(/\bcomposing\b/);
      await page.locator('#dchip').tap();
      await expect(page.locator('#dpop')).toHaveClass(/\bon\b/);
      await back(page);
      await expect(page.locator('#dpop')).not.toHaveClass(/\bon\b/);
      await expect(page.locator('#app')).toHaveClass(/\bcomposing\b/);
      await back(page);
      await expect(page.locator('#app')).not.toHaveClass(/\bcomposing\b/);
      // the timer
      await page.locator('#mbTimer').tap();
      await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
      await back(page);
      await expect(page.locator('#tpop')).not.toHaveClass(/\bon\b/);
      // an open task
      await row(page, 'Plan the trip').locator('.tx').tap();
      await expect(row(page, 'Plan the trip')).toHaveClass(/\bopen\b/);
      await back(page);
      await expect(row(page, 'Plan the trip')).not.toHaveClass(/\bopen\b/);
      // closed some other way, nothing is held: the next back leaves the app
      await page.locator('#mbMore').tap();
      await page.locator('#scrim').tap({ position: { x: 60, y: 120 } });
      await expect(page.locator('#more')).toBeHidden();
      expect(await page.evaluate(() => window.__held())).toBe(0);
      expect(await back(page)).toBe(false);
    });
  });

  test('on a computer, Escape does it: nothing is held', async ({ page }) => {
    await fakeBack(page);
    await open(page);
    await page.keyboard.press('t');
    await expect(page.locator('#tpop')).toHaveClass(/\bon\b/);
    expect(await page.evaluate(() => window.__held())).toBe(0);
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
    'tag filter': async page => page.keyboard.press('f'),
    'tag colours': async page => {
      await page.evaluate(() => {
        const v = JSON.parse(localStorage.getItem('oneday.v1'));
        v.tags = { work: 'yellow', travel: 'teal' };
        localStorage.setItem('oneday.v1', JSON.stringify(v));
      });
      await page.reload();
      await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
      await page.keyboard.press('f');
      await page.locator('#ftags .fdot[data-tag="work"]').click();
    },
    'lock settings': async page => {
      await page.keyboard.press('/');
      await page.locator('#slist [data-act="lock"]').click();
    },
    'lock screen': async page => {
      await page.keyboard.press('/');
      await page.locator('#slist [data-act="lock"]').click();
      await page.locator('#lsPass').fill('correct horse battery');
      await page.locator('#lsPass2').fill('correct horse battery');
      await page.locator('#lsOk').check();
      await page.locator('#lsGo').click();
      await expect(page.locator('#lockset')).toBeHidden({ timeout: 20000 });
      await page.keyboard.press('Escape');
      await page.locator('#lpill').click();
      await expect(page.locator('#lock')).toBeVisible();
    },
    'install offer': async page => offerInstall(page),
    'install, put off': async page => {
      await offerInstall(page);
      await page.locator('#insX').click();
    },
    'install menu, narrower': async page => {
      await page.setViewportSize({ width: 640, height: 800 });
      await offerInstall(page);
      await page.locator('#kb').click();
    },
    'incoming task': async page =>
      page.evaluate(() => {
        location.hash = '#add=j' + btoa(JSON.stringify({ v: 1, t: 'Hello #work', n: '<b>x</b>', s: [['a']] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }),
    'incoming tasks, a long list with days and repeats': async page =>
      page.evaluate(() => {
        location.hash =
          '#add?task=Plan+the+week+%23work&note=**Monday**+first&sub=Email&repeat=weekdays&task=Gym&day=tomorrow&repeat=nonsense&' +
          Array.from({ length: 20 }, (_, i) => `task=Task+${i + 1}&day=${i % 2 ? 'friday' : 'tomorrow'}`).join('&');
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
