#!/usr/bin/env node
// The guide's screenshots, taken from the app itself with made-up tasks on a fixed day (Tuesday 14 April 2026, 09:41),
// in light and dark, on a computer and on a phone. Run it after any visible change, then commit what it writes:
// the pictures, and their sizes in the guide's <img> tags.
//   npm run shots             -> public/guide/shots/*.webp, and width/height in public/guide/index.html
//   npm run shots -- timer    -> only the shots whose name contains "timer"
// Needs the dev dependencies (npm install). Nothing here reaches the network: the app is served from this folder.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'guide', 'shots');
const PAGE = join(root, 'public', 'guide', 'index.html');
const PORT = 47361;
const BASE = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// One fixed morning, so the pictures only change when the app does.
const NOW = '2026-04-14T09:41:00+01:00';
const TODAY = '2026-04-14',
  BEFORE = '2026-04-13',
  EARLIER = '2026-04-10',
  NEXT = '2026-04-15';

const day = () => [
  {
    id: 'review',
    text: 'Prepare the weekly review #work',
    done: false,
    note: 'Numbers first, then the <b>three decisions</b> for next week. Keep it under <i>twenty minutes</i>.',
    subs: [
      { id: 'numbers', text: 'Collect the numbers', done: true },
      { id: 'agenda', text: 'Draft the agenda', done: false },
      { id: 'team', text: 'Send it to the team', done: false },
    ],
  },
  { id: 'train', text: 'Book the train to Lisbon #travel', done: false },
  { id: 'dentist', text: 'Call the dentist', done: false },
  { id: 'parcel', text: 'Pick up the parcel', done: false },
  { id: 'run', text: 'Morning run', done: true, at: 1 },
];
const data = ({ leftovers = false } = {}) => ({
  days: {
    ...(leftovers && {
      [EARLIER]: { u: 1, tasks: [{ id: 'passport', text: 'Renew the passport #travel', done: false }] },
      [BEFORE]: {
        u: 1,
        tasks: [
          { id: 'sam', text: 'Reply to Sam', done: false },
          { id: 'swim', text: 'Swimming', done: true, at: 1 },
        ],
      },
    }),
    [TODAY]: { u: 1, tasks: day() },
    [NEXT]: {
      u: 1,
      tasks: [
        { id: 'invoices', text: 'Send the invoices #work', done: false },
        { id: 'pack', text: 'Pack for Lisbon #travel', done: false },
      ],
    },
  },
  rules: { water: { text: 'Water the plants #home', start: '2026-04-07', freq: 'week', every: 1, days: [1, 4] } },
  tags: { work: 'orange', travel: 'blue', home: 'green' },
});

// A link like the one Send makes, for the dialog that greets whoever opens it.
const sentLink = () =>
  '#add=j' +
  Buffer.from(
    JSON.stringify({
      v: 1,
      t: 'Pick a restaurant for Saturday',
      n: 'Somewhere near the river, for <b>six</b>.',
      s: [['Ask who is coming', 1], ['Book a table']],
    }),
  ).toString('base64url');

// Chrome and Edge lend a prompt while the app can be installed; the offer only shows with one.
const offerInstall = page =>
  page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(e);
  });

const DESK = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// On a computer every picture has the card's width, with its frame of glass; only its height changes.
const COLUMN = [292, 988];

const row = (page, text) => page.locator('#list .row', { hasText: text }).first();
const away = page => page.mouse.move(4, 856);

// Each shot: the device, the tasks, what to do in the app, and what the picture must hold (selectors).
const SHOTS = [
  {
    name: 'day',
    keep: ['#topbar', '#app'],
  },
  {
    name: 'leftovers',
    data: { leftovers: true },
    from: '.date',
    keep: ['#carry', '#list .row:nth-child(2)'],
  },
  {
    name: 'picker',
    act: async page => {
      await page.locator('#meta').click();
      await page.locator('#pop.on').waitFor();
    },
    keep: ['#topbar', '.date', '#pop'],
  },
  {
    name: 'add',
    act: async page => {
      await page.locator('#input').click();
      await page.keyboard.type('Book a table for Friday');
      await page.locator('#dchip').click();
      await page.locator('#dpop.on').waitFor();
    },
    from: '#list .row:nth-child(3)',
    keep: ['#add', '#dpop'],
  },
  {
    name: 'task',
    act: async page => {
      await row(page, 'Prepare the weekly review').locator('.tx').click({ position: { x: 380, y: 10 } });
      await page.locator('#list .row.open').waitFor();
      await page.locator('#list .row.open .more').waitFor();
    },
    from: '.date',
    keep: ['#list .row.open'],
  },
  {
    name: 'repeat',
    act: async page => {
      await page.locator('#input').click();
      await page.keyboard.type('Yoga class');
      await page.locator('#dchip').click();
      await page.locator('#dpop.on').waitFor();
      await page.locator('#drep').click();
      await page.locator('#rpop.on').waitFor();
      await page.locator('#rseg [data-f="week"]').click();
      // Monday and Thursday, the day on screen (a Tuesday) left out
      for (const d of [0, 3, 1]) {
        const b = page.locator(`#rdays [data-d="${d}"]`);
        if ((await b.getAttribute('aria-pressed')) !== String(d !== 1)) await b.click();
      }
    },
    from: '#list .row:nth-child(2)',
    keep: ['#add', '#rpop'],
  },
  {
    name: 'tags',
    act: async page => {
      await page.locator('#fbtn').click();
      await page.locator('#fpop.on').waitFor();
    },
    keep: ['#topbar', '.date', '#fpop'],
  },
  {
    name: 'search',
    act: async page => {
      await page.keyboard.press('/');
      await page.locator('#srch.on').waitFor();
      await page.keyboard.type('lisbon');
      await page.locator('#slist .sr').first().waitFor();
    },
    keep: ['#topbar', '#srch .sbar', '#slist .sr'],
  },
  {
    name: 'backups',
    act: async page => {
      await page.keyboard.press('/');
      await page.locator('#srch.on').waitFor();
      await page.locator('#slist .sdata').waitFor();
    },
    keep: ['#topbar', '#srch .sbar', '#slist .sdata'],
  },
  {
    name: 'timer',
    act: async page => {
      await page.keyboard.press('t');
      await page.locator('#tpop.on').waitFor();
      await page.locator('#tpre [data-v="25"]').click();
      await page.locator('#tstart').click();
      await page.locator('#trun').waitFor();
    },
    keep: ['#topbar', '.date', '#tpop'],
  },
  {
    name: 'inbox',
    path: '/' + sentLink(),
    act: async page => {
      await page.locator('#inbox').waitFor();
    },
    keep: ['#topbar', '#inbox'],
  },
  {
    name: 'install',
    act: async page => {
      await offerInstall(page);
      await page.locator('#ins').waitFor();
    },
    keep: ['#topbar', '#app .bar'],
    // stop above the date's big numeral
    padBottom: 8,
  },
  {
    name: 'protect',
    act: async page => {
      await page.locator('#lpill').click();
      await page.locator('#lsPass').waitFor();
      await page.locator('#lsPass').fill('a calm morning');
      await page.locator('#lsPass2').fill('a calm morning');
      await page.locator('#lsOkT').click();
      await page.evaluate(() => document.activeElement.blur());
    },
    keep: ['#lockset .lcard'],
    pad: 40,
    column: false,
  },
  {
    name: 'lock',
    act: async page => {
      await page.locator('#lpill').click();
      await page.locator('#lsPass').fill('a calm morning');
      await page.locator('#lsPass2').fill('a calm morning');
      await page.locator('#lsOkT').click();
      await page.locator('#lsGo').click();
      await page.locator('#lockset').waitFor({ state: 'hidden', timeout: 20000 });
      await page.keyboard.press('l');
      await page.locator('#lock').waitFor();
    },
    keep: ['#lock .lcard'],
    pad: 40,
    column: false,
  },
  // On a phone: the whole screen.
  { name: 'phone-day', device: PHONE },
  {
    name: 'phone-add',
    device: PHONE,
    act: async page => {
      await page.locator('#mbAdd').tap();
      await page.keyboard.type('Book a table for Friday');
    },
  },
  {
    name: 'phone-search',
    device: PHONE,
    act: async page => {
      await page.locator('#mbSearch').tap();
      await page.locator('#srch.on').waitFor();
      await page.keyboard.type('lisbon');
      await page.locator('#slist .sr').first().waitFor();
    },
  },
  {
    name: 'phone-more',
    device: PHONE,
    act: async page => {
      await offerInstall(page);
      await page.locator('#mbMore').tap();
      await page.locator('#more').waitFor();
    },
  },
];

// Until nothing moves: fonts in, no animation running, two frames painted.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, {
      timeout: 4000,
    })
    .catch(() => {});
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(250);
}

// The union of what the picture must hold, in CSS pixels.
async function frame(page, shot) {
  return page.evaluate(
    ({ keep, from, pad, padBottom, column }) => {
      const boxes = keep
        .flatMap(s => [...document.querySelectorAll(s)])
        .filter(n => n.getClientRects().length)
        .map(n => n.getBoundingClientRect());
      if (!boxes.length) throw new Error('nothing to frame: ' + keep.join(', '));
      let top = Math.min(...boxes.map(b => b.top)) - pad,
        bottom = Math.max(...boxes.map(b => b.bottom)) + padBottom,
        left = Math.min(...boxes.map(b => b.left)) - pad,
        right = Math.max(...boxes.map(b => b.right)) + pad;
      if (from) {
        const f = document.querySelector(from);
        if (f) top = Math.min(top, f.getBoundingClientRect().top - pad);
      }
      if (column) {
        left = Math.min(left, column[0]);
        right = Math.max(right, column[1]);
      }
      top = Math.max(0, Math.floor(top));
      left = Math.max(0, Math.floor(left));
      bottom = Math.min(innerHeight, Math.ceil(bottom));
      right = Math.min(innerWidth, Math.ceil(right));
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
    {
      keep: shot.keep,
      from: shot.from || null,
      pad: shot.pad ?? 18,
      padBottom: shot.padBottom ?? shot.pad ?? 18,
      column: shot.column === false ? null : COLUMN,
    },
  );
}

async function take(browser, shot, scheme) {
  const device = shot.device || DESK;
  const ctx = await browser.newContext({
    ...device,
    colorScheme: scheme,
    reducedMotion: 'reduce',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    // every shot starts from the files on disk
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(d => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(d));
  }, data(shot.data));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + (shot.path || '/'));
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('pre'));
  await settle(page);
  if (shot.act) await shot.act(page);
  if (device === DESK) await away(page);
  await settle(page);
  if (errors.length) throw new Error(`${shot.name}: ${errors.join('; ')}`);
  const clip = shot.keep ? await frame(page, shot) : { x: 0, y: 0, ...device.viewport };
  // CDP draws the clip at this scale, whatever the device's: 2x for a computer; a phone's screen at 1.2x is plenty
  const scale = device.deviceScaleFactor * (device === PHONE ? 0.6 : 1);
  const cdp = await ctx.newCDPSession(page);
  const { data: b64 } = await cdp.send('Page.captureScreenshot', {
    format: 'webp',
    quality: 90,
    clip: { ...clip, scale },
  });
  const file = `${shot.name}-${scheme}.webp`,
    buf = Buffer.from(b64, 'base64'),
    [width, height] = webpSize(buf);
  await writeFile(join(OUT, file), buf);
  await ctx.close();
  return { file, width, height, bytes: buf.length };
}

// A WebP file's own width and height, from its header (lossy, lossless or extended).
function webpSize(buf) {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  const b = buf.readUInt32LE(21);
  return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)];
}

// Each <img src="shots/…"> gets the size of its picture, so the page keeps its place while pictures load.
async function writeSizes(sizes) {
  let html = await readFile(PAGE, 'utf8').catch(() => null);
  if (html == null) return console.warn('No guide page yet: sizes not written');
  let n = 0;
  html = html.replace(/<img\b[^>]*>/g, tag => {
    const m = /\bsrc="shots\/([^"]+)"/.exec(tag);
    const s = m && sizes.get(m[1]);
    if (!s) return tag;
    n++;
    return tag.replace(/\bwidth="\d*"/, `width="${s.width}"`).replace(/\bheight="\d*"/, `height="${s.height}"`);
  });
  await writeFile(PAGE, html);
  console.log(`Sizes written for ${n} <img> tags`);
}

async function main() {
  const only = process.argv[2];
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await mkdir(OUT, { recursive: true });
  for (let i = 0; i < 50; i++) {
    if (await fetch(BASE).then(r => r.ok, () => false)) break;
    await sleep(100);
  }
  const browser = await chromium.launch();
  const sizes = new Map();
  try {
    for (const shot of SHOTS) {
      if (only && !shot.name.includes(only)) continue;
      for (const scheme of ['light', 'dark']) {
        const s = await take(browser, shot, scheme);
        sizes.set(s.file, s);
        console.log(`${s.file.padEnd(26)} ${s.width}×${s.height}  ${Math.round(s.bytes / 1024)} KB`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  // a full run leaves no picture behind that no shot takes any more
  if (!only)
    for (const f of await readdir(OUT))
      if (f.endsWith('.webp') && !sizes.has(f)) {
        await rm(join(OUT, f));
        console.log('Removed ' + f);
      }
  await writeSizes(sizes);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
