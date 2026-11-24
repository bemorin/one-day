#!/usr/bin/env node
// The guide's screenshots, taken from the app itself with made-up tasks on a fixed day (Tuesday 14 April 2026, 09:41),
// in light and dark, on a computer and on a phone. Run it after any visible change, then commit what it writes:
// the pictures, and their sizes in the guide's <img> tags. It also makes the pictures a link shows when it is shared
// (WhatsApp, X, iMessage…), for the app and for the guide.
//   npm run shots             -> public/guide/shots/*.webp, width/height in public/guide/index.html,
//                                public/share.jpg and public/guide/share.jpg
//   npm run shots -- timer    -> only the shots whose name contains "timer" ("share": the shared pictures)
// Needs the dev dependencies (npm install). Nothing here reaches the network: the app is served from this folder.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// sync's pictures talk to a made-up Google Drive, the tests' own: nothing reaches the real one
import { Drive } from '../tests/clouds.mjs';

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
// Days before whose tasks were all ticked: the bar counts them (full days), twelve of them.
const DONE = ['03-27', '03-30', '03-31', '04-01', '04-02', '04-03', '04-06', '04-07', '04-08', '04-09', '04-11', '04-12'];
const data = ({ leftovers = false, done = false } = {}) => ({
  days: {
    ...Object.fromEntries(
      DONE.map((d, i) => [`2026-${d}`, { u: 1, tasks: [{ id: 'done' + i, text: 'Answer the post', done: true, at: 1 }] }]),
    ),
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
    // with done, every task of the day is ticked, the plants' repeat too (it falls on Tuesdays): the day is done, and
    // counted; with done 'last', all but the parcel, which a shot then ticks
    [TODAY]: {
      u: 1,
      tasks: done
        ? [...day(), { id: 'water-20260414', text: 'Water the plants #home', rule: 'water' }].map((t, i) => ({
            ...t,
            done: done !== 'last' || t.id !== 'parcel',
            ...((done !== 'last' || t.id !== 'parcel') && { at: i + 1 }),
          }))
        : day(),
    },
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

// Sync, as it is once One Day's apps are registered: their ids set, and Google Drive answered by a made-up one.
async function withSync(ctx) {
  await ctx.route(/\/app\.js$/, async route => {
    const res = await route.fetch(),
      body = await res.text();
    await route.fulfill({ response: res, body: body.replace(/CLOUD_IDS = \{[^}]*\}/, "CLOUD_IDS = { google: 'g', dropbox: 'd', onedrive: 'o' }") });
  });
  await new Drive().route(ctx);
}
const SYNCPASS = 'a calm sync morning';

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
// The timer's panel on its own: what is behind it (the bar, the date, the tasks) is hidden, so no cut words show
// around it.
const panelAlone = page =>
  page.evaluate(() => {
    for (const s of ['#app .rule', '#app .bar', '#app .date', '#vp']) document.querySelector(s).style.visibility = 'hidden';
  });
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
    // the last task ticked: the check over the day and the count it adds to (held still, as without motion)
    name: 'seal',
    data: { done: 'last' },
    act: async page => {
      await row(page, 'Pick up the parcel').locator('.in .ck').click();
      await page.locator('.sl').waitFor();
    },
    keep: ['#topbar', '#app'],
  },
  {
    name: 'done',
    data: { done: true },
    keep: ['#topbar', '.date', '#list .row:nth-child(2)'],
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
  // sync: the three clouds, then sync on, with where it stands
  {
    name: 'sync-pick',
    ctx: withSync,
    act: async page => {
      await page.keyboard.press('/');
      await page.locator('#slist [data-act="sync"]').click();
      await page.locator('#syCh .syc').first().waitFor();
      await page.evaluate(() => document.activeElement.blur());
    },
    keep: ['#syncd .lcard'],
    pad: 40,
    column: false,
  },
  {
    name: 'sync-on',
    ctx: withSync,
    act: async page => {
      await page.keyboard.press('/');
      await page.locator('#slist [data-act="sync"]').click();
      const pop = page.waitForEvent('popup');
      await page.locator('#syCh [data-c="google"]').click();
      await pop;
      await page.locator('#syPass2').waitFor({ timeout: 20000 });
      await page.locator('#syPass').fill(SYNCPASS);
      await page.locator('#syPass2').fill(SYNCPASS);
      await page.locator('#syOk').check();
      await page.locator('#syGo').click();
      await page.locator('#sySt .syd[data-s="idle"]').waitFor({ timeout: 30000 });
      await page.evaluate(() => document.activeElement.blur());
    },
    keep: ['#syncd .lcard'],
    pad: 40,
    column: false,
  },
  {
    name: 'timer',
    act: async page => {
      await page.keyboard.press('t');
      await page.locator('#tpop.on').waitFor();
      await page.locator('#tpre [data-v="25"]').click();
      await page.locator('#tstart').click();
      await page.locator('#trun').waitFor();
      await panelAlone(page);
    },
    keep: ['#tpop'],
    pad: 24,
    column: false,
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
    name: 'assistant',
    // a link as an assistant writes it: several tasks, with a note, a sub-task, days and a repeat
    path:
      '/#add?task=Buy+bread&day=tomorrow&task=Call+the+bank&note=About+the+loan&sub=Find+the+account+number&day=today' +
      '&task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU,FR',
    act: async page => {
      await page.locator('#inbox').waitFor();
    },
    keep: ['#topbar', '#inbox'],
    // stop at the card's edge, above the list it covers
    padBottom: 4,
  },
  {
    name: 'import',
    // the day after the export was saved, so its done tasks are behind and its open ones ahead
    now: '2026-11-25T09:41:00+00:00',
    act: async page => {
      await page.locator('#impf').setInputFiles(join(root, 'tests', 'fixtures', 'imports', 'TickTick-backup-2026-11-24.csv'));
      await page.locator('#imp').waitFor();
      await page.evaluate(() => document.activeElement.blur());
    },
    keep: ['#impCard'],
    pad: 40,
    column: false,
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
    ({ keep, from, pad, padTop, padBottom, column }) => {
      const boxes = keep
        .flatMap(s => [...document.querySelectorAll(s)])
        .filter(n => n.getClientRects().length)
        .map(n => n.getBoundingClientRect());
      if (!boxes.length) throw new Error('nothing to frame: ' + keep.join(', '));
      let top = Math.min(...boxes.map(b => b.top)) - padTop,
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
      padTop: shot.padTop ?? shot.pad ?? 18,
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
  if (shot.ctx) await shot.ctx(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(shot.now || NOW);
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

// The pictures a shared link shows (Open Graph, X cards): 1200×630, a few words beside the app on a computer and a
// phone. The app is captured without loss on its own page colour, so it sits on the picture's background seamlessly.
const SHARES = [
  {
    file: join(root, 'public', 'share.jpg'),
    brand: 'day.bemorin.com',
    title: 'One Day',
    size: 116,
    line: 'A calm to-do list that shows one day at a time.',
    foot: 'Free and private: no account, and your tasks stay yours.',
  },
  {
    file: join(root, 'public', 'guide', 'share.jpg'),
    brand: 'One Day · Guide',
    title: 'How to use One Day',
    size: 86,
    line: 'Every feature, in plain words and pictures.',
    foot: 'day.bemorin.com/guide',
  },
];
async function lossless(browser, device, keep) {
  const ctx = await browser.newContext({
    ...device,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(d => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(d));
  }, data());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('pre'));
  if (device === DESK) await away(page);
  // the card alone with its shadow: the footer under it stays out of the picture
  await page.evaluate(() => {
    const foot = document.getElementById('foot');
    if (foot) foot.style.visibility = 'hidden';
  });
  await settle(page);
  const clip = keep ? await frame(page, { keep, pad: 40 }) : { x: 0, y: 0, ...device.viewport };
  const cdp = await ctx.newCDPSession(page);
  const { data: b64 } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } });
  await ctx.close();
  return 'data:image/png;base64,' + b64;
}
async function takeShares(browser) {
  const [desk, phone] = await Promise.all([lossless(browser, DESK, ['#topbar', '#app']), lossless(browser, PHONE)]);
  const font = (await readFile(join(root, 'public', 'fonts', 'archivo-latin.woff2'))).toString('base64'),
    icon = (await readFile(join(root, 'public', 'icons', 'icon.svg'))).toString('base64');
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const out = [];
  for (const sh of SHARES) {
    await page.setContent(`<!doctype html><html lang="en"><head><style>
      @font-face { font-family: Archivo; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f5f5f7; }
      body { position: relative; box-sizing: border-box; display: flex; flex-direction: column; padding: 62px 72px 58px;
        font-family: Archivo, system-ui, sans-serif; color: #000; -webkit-font-smoothing: antialiased; }
      .brand { display: flex; align-items: center; gap: 14px; font-size: 25px; font-weight: 700; font-variation-settings: 'wdth' 106; letter-spacing: -0.01em; }
      .brand img { width: 44px; height: 44px; border-radius: 11px; }
      .words { flex: 1; display: flex; flex-direction: column; justify-content: center; width: 530px; }
      h1 { margin: 0; line-height: 0.93; font-weight: 800; font-variation-settings: 'wdth' 112; letter-spacing: -0.045em; text-wrap: balance; }
      p { margin: 26px 0 0; font-size: 29px; line-height: 1.32; color: #5f5f5f; text-wrap: balance; }
      .foot { width: 520px; font-size: 21px; line-height: 1.35; font-weight: 600; color: #3a3a3a; text-wrap: balance; }
      .desk { position: absolute; left: 618px; top: 18px; width: 572px; }
      .phone { position: absolute; left: 1004px; top: 240px; width: 166px; border-radius: 25px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08), 0 30px 60px -18px rgb(0 0 0 / 0.38); }
    </style></head><body>
      <div class="brand"><img src="data:image/svg+xml;base64,${icon}" alt=""><span>${sh.brand}</span></div>
      <div class="words"><h1 style="font-size: ${sh.size}px">${sh.title}</h1><p>${sh.line}</p></div>
      <div class="foot">${sh.foot}</div>
      <img class="desk" src="${desk}" alt="">
      <img class="phone" src="${phone}" alt="">
    </body></html>`);
    await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map(i => i.decode())]));
    const buf = await page.screenshot({ type: 'jpeg', quality: 88 });
    await writeFile(sh.file, buf);
    out.push({ file: sh.file.slice(root.length + 1).replace(/\\/g, '/'), bytes: buf.length });
  }
  await ctx.close();
  return out;
}

// The live timer, rolling: the clock stands still while the timer is set, then moves one second at a time. At each
// second the digits roll; their animations are held and played frame by frame, so the picture is the same at every
// run. After the first frame, each frame keeps only the digits that roll that second, without loss (smaller, too).
const STEP = 50;
async function takeLive(browser, scheme) {
  const ctx = await browser.newContext({
    ...DESK,
    colorScheme: scheme,
    reducedMotion: 'no-preference',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(d => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(d));
  }, data());
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('pre'));
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(new Date(Date.parse(NOW) + 20000));
  // the page's own timers stand still from here: wait, in real time, for what moves in real time
  const still = async () => {
    for (let i = 0; i < 80; i++) {
      const busy = await page.evaluate(() =>
        document.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect.getComputedTiming().endTime)),
      );
      if (!busy) break;
      await sleep(50);
    }
    await sleep(200);
  };
  await page.locator('#tmb').click();
  await page.locator('#tpop.on').waitFor();
  await page.locator('#tpre [data-v="25"]').click();
  await page.locator('#tstart').click();
  await page.locator('#seg [data-m="live"]').click();
  await panelAlone(page);
  await away(page);
  await still();
  const box = await frame(page, SHOTS.find(x => x.name === 'timer'));
  const S = DESK.deviceScaleFactor;
  // the digits rolling now (the ones holding a digit on its way out), in whole CSS pixels inside the picture:
  // at 2x their offsets are even, as frames need
  const rolling = async () => {
    const r = await page.evaluate(() =>
      [...document.querySelectorAll('#tbig .dg')]
        .filter(n => n.querySelector('.out'))
        .map(n => {
          const b = n.getBoundingClientRect();
          return [b.left, b.top, b.right, b.bottom];
        }),
    );
    if (!r.length) return null;
    const x0 = Math.max(box.x, Math.floor(Math.min(...r.map(b => b[0]))) - 4),
      y0 = Math.max(box.y, Math.floor(Math.min(...r.map(b => b[1]))) - 8),
      x1 = Math.min(box.x + box.width, Math.ceil(Math.max(...r.map(b => b[2]))) + 4),
      y1 = Math.min(box.y + box.height, Math.ceil(Math.max(...r.map(b => b[3]))) + 8);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  const cdp = await ctx.newCDPSession(page);
  const grab = async (clip, quality = 90) =>
    Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'webp', quality, clip: { ...clip, scale: S } })).data, 'base64');
  const frames = [{ x: 0, y: 0, buf: await grab(box), ms: 900 }];
  for (let k = 0; k < 3; k++) {
    await page.clock.runFor(1000);
    // the digits have started rolling: hold their animations, then play them frame by frame
    const span = await page.evaluate(() => {
      let end = 0;
      for (const a of document.getAnimations())
        if (a.playState === 'running' && Number.isFinite(a.effect.getComputedTiming().endTime)) {
          a.pause();
          a.currentTime = 0;
          end = Math.max(end, a.effect.getComputedTiming().endTime);
        }
      return end;
    });
    const digits = await rolling();
    if (!digits) {
      frames[frames.length - 1].ms += 1000;
      continue;
    }
    const steps = Math.max(1, Math.ceil(span / STEP));
    for (let i = 1; i <= steps; i++) {
      await page.evaluate(t => {
        for (const a of document.getAnimations())
          if (a.playState === 'paused' && Number.isFinite(a.effect.getComputedTiming().endTime)) a.currentTime = t;
      }, Math.min(span, i * STEP));
      frames.push({ x: (digits.x - box.x) * S, y: (digits.y - box.y) * S, buf: await grab(digits, 100), ms: STEP });
    }
    await page.evaluate(() => {
      for (const a of document.getAnimations())
        if (a.playState === 'paused' && Number.isFinite(a.effect.getComputedTiming().endTime)) a.finish();
    });
    frames[frames.length - 1].ms += Math.max(0, 1000 - steps * STEP);
  }
  // the last second rests a little longer before it all starts again
  frames[frames.length - 1].ms += 1200;
  await still();
  const rest = await grab(box);
  await ctx.close();
  const anim = animatedWebp(frames, webpSize(frames[0].buf));
  const out = [];
  for (const [file, buf] of [
    ['timer-live-' + scheme + '.webp', anim],
    ['timer-live-still-' + scheme + '.webp', rest],
  ]) {
    await writeFile(join(OUT, file), buf);
    const [width, height] = webpSize(buf);
    out.push({ file, width, height, bytes: buf.length, frames: buf === anim ? frames.length : 1 });
  }
  return out;
}

// An animated WebP from WebP frames: each frame's picture data, placed on the canvas, for so many milliseconds.
function animatedWebp(frames, [W, H]) {
  const chunk = (id, payload) => {
    const b = Buffer.alloc(8 + payload.length + (payload.length & 1));
    b.write(id, 0, 'ascii');
    b.writeUInt32LE(payload.length, 4);
    payload.copy(b, 8);
    return b;
  };
  let alpha = false;
  const anmf = frames.map(f => {
    const picture = [];
    for (let o = 12; o + 8 <= f.buf.length; ) {
      const id = f.buf.toString('ascii', o, o + 4),
        n = f.buf.readUInt32LE(o + 4),
        end = o + 8 + n + (n & 1);
      if (id === 'ALPH') alpha = true;
      if (id === 'ALPH' || id === 'VP8 ' || id === 'VP8L') picture.push(f.buf.subarray(o, end));
      o = end;
    }
    const [w, h] = webpSize(f.buf),
      head = Buffer.alloc(16);
    if (f.x % 2 || f.y % 2) throw new Error('frames must sit on even pixels');
    head.writeUIntLE(f.x / 2, 0, 3);
    head.writeUIntLE(f.y / 2, 3, 3);
    head.writeUIntLE(w - 1, 6, 3);
    head.writeUIntLE(h - 1, 9, 3);
    head.writeUIntLE(f.ms, 12, 3);
    head[15] = 0b10; // drawn over what is there (no blending), and left there
    return chunk('ANMF', Buffer.concat([head, ...picture]));
  });
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x02 | (alpha ? 0x10 : 0);
  vp8x.writeUIntLE(W - 1, 4, 3);
  vp8x.writeUIntLE(H - 1, 7, 3);
  const loop = Buffer.alloc(6); // background colour (unused), then 0: loop forever
  const body = Buffer.concat([Buffer.from('WEBP'), chunk('VP8X', vp8x), chunk('ANIM', loop), ...anmf]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
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
    if (!only || 'share'.includes(only))
      for (const s of await takeShares(browser)) console.log(`${s.file.padEnd(28)} 1200×630  ${Math.round(s.bytes / 1024)} KB`);
    if (!only || 'timer-live'.includes(only))
      for (const scheme of ['light', 'dark'])
        for (const s of await takeLive(browser, scheme)) {
          sizes.set(s.file, s);
          console.log(`${s.file.padEnd(28)} ${s.width}×${s.height}  ${Math.round(s.bytes / 1024)} KB  ${s.frames} frame(s)`);
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
