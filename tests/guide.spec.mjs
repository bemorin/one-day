import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGE = readFileSync(new URL('../public/guide/index.html', import.meta.url), 'utf8');
const SHOTS = new URL('../public/guide/shots/', import.meta.url);
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function guide(page, path = '/guide/') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.locator('h1')).toHaveText('How to use One Day');
}
// Pictures load as they come into view: bring each one shown into view, and wait for it.
const scrollThrough = page =>
  page.evaluate(async () => {
    for (const img of document.querySelectorAll('img')) {
      if (!img.getClientRects().length) continue;
      img.scrollIntoView({ block: 'center' });
      await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
    }
    scrollTo(0, 0);
  });
// A WebP file's own width and height, from its header.
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
  }
  return null;
}

// A JPEG file's own width and height, from its frame header.
function jpegSize(buf) {
  for (let o = 2; o + 9 < buf.length; ) {
    if (buf[o] !== 0xff) return null;
    const m = buf[o + 1],
      n = buf.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xc3) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
    o += 2 + n;
  }
  return null;
}
const PUBLIC = new URL('../public/', import.meta.url);
const fileOf = address => new URL(new URL(address).pathname.slice(1), PUBLIC);

test('the guide loads cleanly: no errors, no third-party requests, strict CSP', async ({ page, baseURL }) => {
  const errors = [],
    foreign = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => !r.url().startsWith(baseURL) && !r.url().startsWith('data:') && foreign.push(r.url()));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const res = await page.goto('/guide/');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(res.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
  await scrollThrough(page);
  await page.waitForLoadState('networkidle');
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('/guide leads to /guide/, where its own files load', async ({ page }) => {
  await guide(page, '/guide');
  expect(new URL(page.url()).pathname).toBe('/guide/');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontWeight)).toBe('800');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('800 40px Archivo'))).toBe(true);
});

test('SEO basics: a title, a description, one h1, headings in order, every anchor lands', async ({ page }) => {
  await guide(page);
  await expect(page).toHaveTitle(/One Day/);
  const desc = await page.locator('meta[name="description"]').getAttribute('content');
  expect(desc.length).toBeGreaterThan(70);
  expect(desc.length).toBeLessThanOrEqual(160);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://day.bemorin.com/guide/');
  await expect(page.locator('h1')).toHaveCount(1);
  const levels = await page.$$eval('h1, h2, h3, h4, h5, h6', hs => hs.map(h => +h.tagName[1]));
  for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  const { missing, twice } = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(n => n.id);
    return {
      missing: [...document.querySelectorAll('a[href^="#"]')].map(a => a.hash.slice(1)).filter(id => !document.getElementById(id)),
      twice: ids.filter((id, i) => ids.indexOf(id) !== i),
    };
  });
  expect(missing).toEqual([]);
  expect(twice).toEqual([]);
  // "On this page" lists every chapter and every section, in order, by its heading
  const toc = await page.$$eval('.toc a', as =>
    as.map(a => [
      a.hash.slice(1),
      [...a.childNodes]
        .filter(n => !(n.nodeType === 1 && n.getAttribute('aria-hidden')))
        .map(n => n.textContent)
        .join('')
        .trim(),
    ]),
  );
  const parts = await page.$$eval('.body .chapter, .body .chapter > section', ns =>
    ns.map(n => [n.id, n.querySelector(n.classList.contains('chapter') ? 'h2' : 'h3').textContent.trim()]),
  );
  expect(parts.length).toBe(28);
  expect(toc).toEqual(parts);
  // chapters are h2, their sections h3, everything under those h4
  expect(await page.$$eval('.chapter > .ch h2', hs => hs.length)).toBe(6);
  expect(await page.$$eval('.chapter > section > h3', hs => hs.length)).toBe(22);
});

for (const [path, title, image] of [
  ['/guide/', 'How to use One Day', 'https://day.bemorin.com/guide/share.jpg'],
  ['/', 'One Day', 'https://day.bemorin.com/share.jpg'],
])
  test(`a link to ${path} shares a picture of the app (WhatsApp, X…)`, async ({ page, request }) => {
    await page.goto(path);
    const meta = async p => page.locator(`meta[property="${p}"], meta[name="${p}"]`).getAttribute('content');
    expect(await meta('og:title')).toBe(title);
    expect(await meta('og:image')).toBe(image);
    expect(await meta('og:image:width')).toBe('1200');
    expect(await meta('og:image:height')).toBe('630');
    expect((await meta('og:image:alt')).length).toBeGreaterThan(20);
    expect(await meta('twitter:card')).toBe('summary_large_image');
    expect(new URL(await meta('og:url')).origin).toBe('https://day.bemorin.com');
    // the picture npm run shots made: a JPEG of 1200 by 630, light enough for WhatsApp
    const buf = readFileSync(fileOf(image));
    expect(jpegSize(buf)).toEqual([1200, 630]);
    expect(buf.length).toBeLessThan(300 * 1024);
    const r = await request.get(new URL(image).pathname);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/jpeg');
  });

test('every picture is there, in light and dark, with its own size written in the page', async ({ request }) => {
  const tags = [...PAGE.matchAll(/<img\b[^>]*\bsrc="shots\/([^"]+)"[^>]*>/g)],
    sources = [...PAGE.matchAll(/<source\b[^>]*\bsrcset="shots\/([^"]+)"[^>]*>/g)];
  const used = [...new Set([...tags, ...sources].map(m => m[1]))].sort();
  // the folder holds the pictures the page shows, and only those
  expect(readdirSync(SHOTS).filter(f => !f.startsWith('.')).sort()).toEqual(used);
  for (const f of used) {
    expect(f).toMatch(/^[a-z-]+-(light|dark)\.webp$/);
    expect(used).toContain(f.replace(/-(light|dark)\.webp$/, (m, s) => (s === 'light' ? '-dark.webp' : '-light.webp')));
  }
  // npm run shots writes each picture's size into its tags, so the page holds its place while pictures load
  for (const [tag, f] of tags) {
    const size = webpSize(readFileSync(new URL(f, SHOTS)));
    expect(size, f).not.toBeNull();
    expect(tag, f).toContain(`width="${size[0]}"`);
    expect(tag, f).toContain(`height="${size[1]}"`);
    expect(tag, f).toMatch(/\balt="[^"]{12,}"/);
    expect(tag, f).toContain('loading="lazy"');
  }
  // a moving picture has the size of the still one in its <picture>, so either holds the same place
  for (const m of PAGE.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/g)) {
    const moving = /srcset="shots\/([^"]+)"/.exec(m[1])[1],
      img = /<img\b[^>]*>/.exec(m[1])[0],
      [w, h] = webpSize(readFileSync(new URL(moving, SHOTS)));
    expect(img, moving).toContain(`width="${w}"`);
    expect(img, moving).toContain(`height="${h}"`);
  }
  // light and dark versions of a picture say the same thing
  for (const [tag] of tags.filter(m => /class="l"/.test(m[0]))) {
    const src = /src="([^"]+)"/.exec(tag)[1],
      alt = /alt="([^"]*)"/.exec(tag)[1],
      dark = tags.find(m => m[0].includes(`src="${src.replace('-light.webp', '-dark.webp')}"`) && /class="d"/.test(m[0]));
    expect(dark, src).toBeTruthy();
    expect(/alt="([^"]*)"/.exec(dark[0])[1]).toBe(alt);
  }
  for (const f of used.slice(0, 4)) {
    const r = await request.get('/guide/shots/' + f);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/webp');
  }
});

for (const scheme of ['light', 'dark'])
  test(`in ${scheme}, only the ${scheme} pictures are fetched`, async ({ page }) => {
    const got = [];
    page.on('request', r => r.url().includes('/guide/shots/') && got.push(r.url().split('/').pop()));
    await page.emulateMedia({ colorScheme: scheme });
    await guide(page);
    await scrollThrough(page);
    await page.waitForLoadState('networkidle');
    const other = scheme === 'light' ? 'dark' : 'light',
      shown = await page.$$eval('img[src^="shots/"]', is => is.filter(i => i.getClientRects().length).map(i => i.currentSrc.split('/').pop()));
    // every picture shown, once; of the other look, only the day shown in both, side by side
    expect([...new Set(got)].sort()).toEqual([...new Set(shown)].sort());
    expect(shown.filter(f => f.endsWith(`-${scheme}.webp`)).length).toBeGreaterThan(17);
    expect(got.filter(f => f.endsWith(`-${other}.webp`))).toEqual([`day-${other}.webp`]);
  });

test("the guide follows the app's own choice of light or dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('oneday.theme', 'dark'));
  await guide(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 14, 14)');
  await expect(page.locator('#start .desk img.d')).toBeVisible();
  await expect(page.locator('#start .desk img.l')).toBeHidden();
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#0e0e0e');
});

test('Copy page as Markdown: the whole guide, in the clipboard only', async ({ page }) => {
  // what the page writes to the clipboard, kept here rather than in the computer's own clipboard
  await page.addInitScript(() => {
    window.__copied = [];
    navigator.clipboard.writeText = t => (window.__copied.push(t), Promise.resolve());
  });
  await guide(page);
  // every picture in first, so that anything asked for from here on would come from the copy
  await scrollThrough(page);
  await page.waitForLoadState('networkidle');
  const sent = [];
  page.on('request', r => sent.push(r.url()));
  await page.getByRole('button', { name: 'Copy page as Markdown' }).click();
  await expect(page.locator('#copied')).toHaveText('The page is in your clipboard, as Markdown.');
  await expect(page.locator('#copy')).toHaveText('Copied');
  expect(sent).toEqual([]);
  const md = await page.evaluate(() => window.__copied.at(-1));
  expect(md.startsWith('# How to use One Day\n\nOne Day is a calm to-do list')).toBe(true);
  for (const s of [
    'From https://day.bemorin.com/guide/',
    '## Basics',
    '### Getting started',
    '#### Leftovers',
    '- click the **arrows** at the top left, or press ← and →;',
    '## Tools',
    '### Keyboard shortcuts',
    '**Anywhere**',
    '| Back to today | D or Home |',
    '#### The installed app shows an old version',
    '![One Day on a computer: Tuesday 14 April',
    '(https://day.bemorin.com/guide/shots/day-light.webp)',
    '[privacy policy](https://bemorin.com/privacy#one-day)',
    '[Moving to a new phone or computer](https://day.bemorin.com/guide/#moving)',
    '> **A forgotten passphrase cannot be recovered.**',
    '`one-day-backup-2026-04-14.json`',
    '### Something unclear?',
    '- [Email me](mailto:hello@bemorin.com?subject=One%20Day%20guide)',
    '- [Ask on GitHub](https://github.com/bemorin/one-day/issues)',
  ])
    expect(md).toContain(s);
  // one picture per figure, in light, except the light and dark pair
  expect(md).not.toContain('phone-more-dark.webp');
  expect(md).toContain('shots/day-dark.webp');
  expect(md).not.toMatch(/<\/?[a-z]+[ >]/);
  await expect(page.locator('#copy')).toHaveText('Copy page as Markdown', { timeout: 6000 });
});

test('every title ends with a link, always shown, that copies the address of its place in the guide; the Markdown copy leaves them out', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await guide(page);
  const h = page.locator('#assistants > h3');
  const a = h.locator('a.hl');
  await expect(a).toHaveAttribute('aria-label', 'Copy the link to With an AI assistant');
  // there without the pointer on the title, in grey; darker while the title is under the pointer; red once copied
  const look = () => a.evaluate(n => [getComputedStyle(n).opacity, getComputedStyle(n).color]);
  await expect(a).toBeVisible();
  expect(await look()).toEqual(['1', 'rgb(110, 110, 110)']);
  await h.hover();
  await expect.poll(look).toEqual(['1', 'rgb(0, 0, 0)']);
  await a.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/guide\/#assistants$/);
  expect(await page.evaluate(() => location.hash)).toBe('#assistants');
  await expect(page.locator('#copied')).toHaveText('The link is in your clipboard.');
  await expect.poll(look).toEqual(['1', 'rgb(228, 0, 43)']);
  // chapters and questions have theirs too
  await expect(page.locator('#basics .ch h2 a.hl')).toHaveAttribute('href', '#basics');
  await expect(page.locator('h4#moving a.hl')).toHaveAttribute('href', '#moving');
  await page.locator('#copy').click();
  await expect(page.locator('#copy span')).toHaveText('Copied');
  // Windows' clipboard gives the lines back with \r\n
  const md = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(md).toContain('\n### With an AI assistant\n');
  // no empty link left behind by the titles' own links
  expect(md).not.toContain('[](');
});

test('the paragraph for assistants is the one docs/links.md gives, and it copies in one click', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await guide(page);
  // the file may be checked out with \r\n, and Windows' clipboard gives lines back so too
  const doc = readFileSync(new URL('../docs/links.md', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n')
    .match(/```text\n([\s\S]*?)\n```/)[1];
  expect(await page.locator('#aiPrompt').textContent()).toBe(doc);
  await page.locator('#copyPrompt').click();
  await expect(page.locator('#copyPrompt span')).toHaveText('Copied');
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(doc);
  // the extension downloads from the latest release
  await expect(page.locator('#assistants a', { hasText: 'download the One Day extension' })).toHaveAttribute(
    'href',
    'https://github.com/bemorin/one-day/releases/latest/download/one-day.mcpb',
  );
});

test.describe('narrower, On this page in a sheet', () => {
  for (const [name, size] of [
    ['on a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
    ['on a tablet', { viewport: { width: 820, height: 1000 } }],
  ])
    test.describe(name, () => {
      test.use(size);
      test('a button in the bar opens it; a choice goes there, Escape comes back', async ({ page }) => {
        await guide(page);
        const b = page.locator('#tocb');
        await expect(b).toBeVisible();
        await expect(b.locator('span')).toBeVisible({ visible: name === 'on a tablet' });
        await page.evaluate(() => document.getElementById('timer').scrollIntoView({ behavior: 'instant' }));
        // once the page has stopped there, the list knows the section being read
        await expect(page.locator('.toc a[aria-current]')).toHaveAttribute('href', '#timer');
        // a press where the button is, as a person would (locator.click() would first scroll the page to centre the
        // sticky bar, which moves the section being read)
        const press = async () => {
          const bb = await b.boundingBox();
          await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
        };
        await press();
        const d = page.locator('#tocd');
        await expect(d).toBeVisible();
        await expect(b).toHaveAttribute('aria-expanded', 'true');
        await expect(d.locator('a')).toHaveCount(28);
        // the section being read is marked, and has the focus
        await expect(d.locator('a[aria-current]')).toHaveAttribute('href', '#timer');
        await expect(d.locator('a[href="#timer"]')).toBeFocused();
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(d).toBeHidden();
        await expect(b).toBeFocused();
        await press();
        await d.locator('a[href="#lock"]').click();
        await expect(d).toBeHidden();
        await expect.poll(() => page.locator('#lock').evaluate(n => Math.round(n.getBoundingClientRect().top))).toBeLessThan(140);
      });
    });

  test('on a wide screen the list sits beside the text, and the button is not there', async ({ page }) => {
    await guide(page);
    await expect(page.locator('#tocb')).toBeHidden();
  });
});

test('On this page sits on the left of the text on a wide screen and marks the section being read', async ({ page }) => {
  await guide(page);
  const [toc, body] = await Promise.all([page.locator('.toc').boundingBox(), page.locator('.body').boundingBox()]);
  expect(toc.x + toc.width).toBeLessThan(body.x);
  // it fits a laptop's screen without scrolling
  expect(await page.locator('.toc').evaluate(n => n.scrollHeight <= n.clientHeight + 1)).toBe(true);
  await page.evaluate(() => document.getElementById('lock').scrollIntoView());
  await expect(page.locator('.toc a[href="#lock"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.toc a[aria-current]')).toHaveCount(1);
  // its chapter's number turns red, like today's date
  const red = n => page.locator(`.toc a[href="#${n}"] .n`).evaluate(e => getComputedStyle(e).color);
  await expect.poll(() => red('data')).toBe('rgb(228, 0, 43)');
  await expect.poll(() => red('basics')).toBe('rgb(110, 110, 110)');
  // it stays in view while the text goes by
  const t = await page.locator('.toc').boundingBox();
  expect(t.y).toBeGreaterThan(0);
  expect(t.y).toBeLessThan(160);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.toc a[href="#contact"]')).toHaveAttribute('aria-current', 'true');
});

test('Live rolls: a moving picture of the timer, a still one with Reduce motion', async ({ page }) => {
  const anim = readFileSync(new URL('timer-live-light.webp', SHOTS));
  expect(anim.toString('ascii', 12, 16)).toBe('VP8X');
  expect(anim[20] & 0x02).toBe(0x02);
  expect(anim.toString('latin1').split('ANMF').length - 1).toBeGreaterThan(20);
  const pic = () => page.locator('#timer picture.l img').evaluate(i => i.currentSrc.split('/').pop());
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto('/guide/#timer');
  await page.locator('#timer picture.l img').scrollIntoViewIfNeeded();
  await expect.poll(pic).toBe('timer-live-light.webp');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('#timer picture.l img').scrollIntoViewIfNeeded();
  await expect.poll(pic).toBe('timer-live-still-light.webp');
});

test.describe('the guide on a phone', () => {
  test.use(PHONE);
  test('On this page comes first, under the title, and nothing scrolls sideways', async ({ page }) => {
    await guide(page);
    const [toc, start] = await Promise.all([page.locator('.toc').boundingBox(), page.locator('#start').boundingBox()]);
    expect(toc.y + toc.height).toBeLessThanOrEqual(start.y);
    await scrollThrough(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('the guide, scanned (axe, WCAG 2.2 AA)', () => {
  for (const scheme of ['light', 'dark'])
    test(`on a computer, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await guide(page);
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  test.describe('on a phone', () => {
    test.use(PHONE);
    for (const scheme of ['light', 'dark'])
      test(scheme, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await guide(page);
        const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
        expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
  });
});

test.describe('the app links to the guide', () => {
  const app = async page => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  };
  test('on a large screen, from a pill before the sun, in a new tab; the footer keeps its one line', async ({ page, context }) => {
    await app(page);
    const pill = page.getByRole('link', { name: 'Guide' });
    await expect(pill).toHaveCount(1);
    await expect(pill).toHaveAttribute('id', 'gpill');
    await expect(pill).toHaveAttribute('target', '_blank');
    // above the card: the guide, the sun, the lock, as tall as one another; the lock's edge on the footer's
    const [g, l, t, n] = await Promise.all(['#gpill', '#lpill', '#theme', '#foot nav'].map(s => page.locator(s).boundingBox()));
    expect(g.x + g.width).toBeLessThan(t.x);
    expect(t.x + t.width).toBeLessThan(l.x);
    expect([g.width, g.height]).toEqual([t.width, t.height]);
    expect(Math.abs(l.x + l.width - (n.x + n.width))).toBeLessThan(1);
    // the footer's own copy of the link is for search and More: under the card the row is full
    await expect(page.locator('#foot .gd')).toBeHidden();
    for (const s of ['#foot .promo', '#foot .kofi', '#foot nav']) expect(Math.round((await page.locator(s).boundingBox()).height)).toBe(40);
    const [tab] = await Promise.all([context.waitForEvent('page'), pill.click()]);
    await expect(tab.locator('h1')).toHaveText('How to use One Day');
    expect(new URL(tab.url()).pathname).toBe('/guide/');
  });
  test.describe('in a narrow window with a mouse', () => {
    test.use({ viewport: { width: 600, height: 860 } });
    test('from the links at the bottom of search', async ({ page }) => {
      await app(page);
      await expect(page.locator('#gpill')).toBeHidden();
      await page.locator('#sb').click();
      const link = page.locator('#slist .about .links a', { hasText: 'Guide' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', 'guide/');
    });
  });
  test.describe('on a phone', () => {
    test.use(PHONE);
    test('from More, in the same window, so the back button returns to the app', async ({ page }) => {
      await app(page);
      await page.locator('#mbMore').tap();
      const link = page.locator('#more .slinks a', { hasText: 'Guide' });
      await expect(link).toBeVisible();
      await expect(link).not.toHaveAttribute('target', /.+/);
      await link.tap();
      await expect(page.locator('h1')).toHaveText('How to use One Day');
      await page.goBack();
      await expect(page.locator('#app')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/');
    });
  });
  test('and the guide leads back to the app', async ({ page }) => {
    await guide(page);
    await page.getByRole('banner').getByRole('link', { name: 'Open One Day' }).click();
    await expect(page.locator('#app')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

test('the guide opens offline once the app has been opened', async ({ browser }) => {
  const port = 4186,
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
    // the service worker keeps the guide's words with the app
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!navigator.serviceWorker.controller) return false;
            const keys = await caches.keys();
            if (keys.length !== 1) return false;
            const kept = (await (await caches.open(keys[0])).keys()).map(r => new URL(r.url).pathname);
            return ['/guide/', '/guide/guide.css', '/guide/guide.js'].every(p => kept.includes(p));
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
  await cold.goto(url + 'guide/#lock');
  await expect(cold.locator('h1')).toHaveText('How to use One Day');
  await expect(cold.locator('#lock h3')).toBeVisible();
  expect(await cold.evaluate(() => getComputedStyle(document.querySelector('h1')).fontWeight)).toBe('800');
  await cold.evaluate(() => document.fonts.ready);
  expect(await cold.evaluate(() => document.fonts.check('800 40px Archivo'))).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('llms.txt sums One Day up for assistants and points to the guide', async ({ request }) => {
  const r = await request.get('/llms.txt');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('text/plain');
  const t = await r.text();
  expect(t.startsWith('# One Day\n\n> ')).toBe(true);
  expect(t).toContain('](https://day.bemorin.com/guide/)');
});
