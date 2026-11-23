#!/usr/bin/env node
// Records the One Day demo video, with a cursor, click ripples, a keystroke bar and scene titles.
// It ends on a phone: that part is recorded first in a phone-sized touch browser, then played in a phone frame.
//   node scripts/demo-video.mjs            -> dist/one-day-demo.mp4 (1080p60) and dist/one-day-demo-720p.mp4
// Needs the dev dependencies (npm install) and ffmpeg on PATH.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 47321;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = key(new Date());
const tomorrow = key(new Date(new Date().setDate(new Date().getDate() + 1)));
const yesterday = key(new Date(new Date().setDate(new Date().getDate() - 1)));

// Days before with every task ticked: the full days counted in the middle of the bar. A day is missed now and then,
// as there is no streak to keep.
const PAST = ['Morning run', 'Answer the emails', 'Laundry', 'Call the bank', 'Read for half an hour', 'Groceries', 'Clean the kitchen', 'Pay the rent', 'Yoga', 'Fix the bike light', 'Tidy the desk', 'Back up the photos', 'Stretch'];
function fullDays(n, id) {
  const days = {};
  for (let ago = 2, i = 0; i < n; ago++) {
    if (ago % 5 === 0) continue;
    const d = new Date();
    d.setDate(d.getDate() - ago);
    d.setHours(18, 0, 0, 0);
    days[key(d)] = {
      u: 1,
      tasks: [0, 1].map(j => ({ id: `${id}${i}-${j}`, text: PAST[(i * 2 + j) % PAST.length], done: true, at: d.getTime() + j * 36e5 })),
    };
    i++;
  }
  return days;
}

const seed = {
  days: {
    ...fullDays(12, 'f'),
    // only what was left: once brought to today, yesterday has no task and stays out of the count
    [yesterday]: {
      u: 1,
      tasks: [
        { id: 'y1', text: 'Reply to Sam', done: false },
        { id: 'y2', text: 'Renew the passport #travel', done: false },
      ],
    },
    [today]: {
      u: 1,
      tasks: [
        {
          id: 'v2',
          text: 'Prepare the weekly review #work',
          done: false,
          note: 'Numbers first, then the <b>three decisions</b> for next week.',
          subs: [
            { id: 'v2a', text: 'Collect the numbers', done: true },
            { id: 'v2b', text: 'Draft the agenda', done: false },
          ],
        },
        { id: 'v3', text: 'Book the train to London #travel', done: false },
      ],
    },
  },
  rules: {},
  tags: { work: 'orange' },
};
const phoneSeed = {
  days: {
    // a phone keeps its own tasks, and so its own count
    ...fullDays(9, 'q'),
    [today]: {
      u: 1,
      tasks: [
        { id: 'p1', text: 'Morning run', done: true, at: 1 },
        { id: 'p2', text: 'Pick up the parcel', done: false },
        { id: 'p3', text: 'Book the train to London #travel', done: false },
        { id: 'p4', text: 'Call mum', done: false },
      ],
    },
    [tomorrow]: {
      u: 1,
      tasks: [
        { id: 'p5', text: 'Send the invoices #work', done: false },
        { id: 'p6', text: 'Water the plants #home', done: false },
        { id: 'p7', text: 'Pack for London #travel', done: false },
      ],
    },
  },
  rules: {},
  tags: { travel: 'blue', home: 'green', work: 'orange' },
};

// The overlay lives in the page, above the app: cursor, ripples, keystroke bar, titles, progress rule.
function overlay() {
  const css = `
  #vo{position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;font-family:Archivo,system-ui,sans-serif}
  #vo .cur{position:absolute;left:0;top:0;width:30px;height:30px;transform:translate3d(-60px,-60px,0);filter:drop-shadow(0 3px 6px rgb(0 0 0/.28))}
  #vo .cur svg{width:30px;height:30px;transition:transform .32s cubic-bezier(.34,1.56,.64,1);transform-origin:6px 4px}
  #vo .cur.down svg{transform:scale(.82)}
  #vo .rip{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:2.5px solid var(--vr,rgb(0 0 0/.42));animation:rip .62s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes rip{from{transform:scale(.25);opacity:1}to{transform:scale(1.45);opacity:0}}
  #vo .hud{position:absolute;left:50%;bottom:34px;display:flex;align-items:center;gap:12px;padding:10px 20px 10px 12px;border-radius:24px;
    background:var(--vh,rgb(255 255 255/.78));backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);
    box-shadow:0 0 0 1px var(--ve,rgb(0 0 0/.06)),0 18px 50px -14px rgb(0 0 0/.35);color:var(--vt,#111);
    transform:translate(-50%,24px) scale(.9);opacity:0;filter:blur(6px);transition:transform .55s cubic-bezier(.34,1.4,.64,1),opacity .25s,filter .35s,bottom .6s cubic-bezier(.34,1.3,.64,1)}
  #vo .hud.up{bottom:94px}
  #vo .hud.on{transform:translate(-50%,0) scale(1);opacity:1;filter:none}
  #vo .k{display:grid;place-items:center;min-width:46px;height:46px;padding:0 12px;border-radius:12px;font-weight:650;font-size:21px;
    background:var(--vk,#fff);box-shadow:inset 0 -2px 0 var(--vks,rgb(0 0 0/.1)),0 0 0 1px var(--ve,rgb(0 0 0/.08)),0 6px 14px -6px rgb(0 0 0/.3)}
  #vo .k svg{width:22px;height:22px}
  #vo .hud.on .k{animation:kp .5s cubic-bezier(.34,1.56,.64,1) backwards}
  #vo .hud.on .k:nth-child(2){animation-delay:.06s}
  #vo .hud.on .k:nth-child(3){animation-delay:.12s}
  @keyframes kp{from{transform:scale(.55);opacity:0}}
  #vo .hud b{font-weight:600;font-size:19px;letter-spacing:-.01em;margin-left:2px}
  #vo .cap{position:absolute;left:48px;top:50%;width:232px;transform:translateY(-50%)}
  #vo .cap h2{margin:0;font-weight:800;font-variation-settings:'wdth' 112;font-size:38px;line-height:1;letter-spacing:-.035em;color:var(--vt,#111)}
  #vo .cap p{margin:12px 0 0;font-weight:500;font-size:17px;line-height:1.4;color:var(--vm,#666)}
  #vo .cap h2,#vo .cap p{opacity:0;transform:translateY(18px);transition:opacity .45s,transform .7s cubic-bezier(.22,1,.36,1)}
  #vo .cap.on h2{opacity:1;transform:none}
  #vo .cap.on p{opacity:1;transform:none;transition-delay:.09s}
  #vo .cap.out h2,#vo .cap.out p{opacity:0;transform:translateY(-12px);transition-duration:.25s;transition-delay:0s}
  #vo .bar{position:absolute;left:0;bottom:0;height:4px;width:100%;background:#e4002b;transform-origin:0 50%;transform:scaleX(0)}
  #vo .fade{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  #vo .dim{position:absolute;inset:0;background:rgb(0 0 0/.66);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transition:opacity .9s cubic-bezier(.22,1,.36,1)}
  #vo .dim.on{opacity:1}
  #vo .ph{position:absolute;left:50%;top:50%;width:308px;height:645px;margin:-322.5px 0 0 -154px;padding:10px;border-radius:52px;background:#1c1c1e;
    box-shadow:inset 0 0 0 1.5px rgb(255 255 255/.17),0 0 0 1px rgb(0 0 0/.75),0 60px 110px -34px rgb(0 0 0/.95);
    transform:translateY(calc(50vh + 360px));transition:transform 1.05s cubic-bezier(.22,1,.36,1)}
  #vo .ph.on{transform:none}
  #vo .scr{position:relative;width:100%;height:100%;overflow:hidden;border-radius:42px;background:#0e0e0e}
  #vo .scr video{position:absolute;left:0;top:34px;width:100%;height:auto;display:block}
  #vo .sbar{position:absolute;left:0;right:0;top:0;height:34px;display:flex;align-items:center;justify-content:space-between;padding:3px 26px 0 30px;
    color:#f2f2f2;font-weight:650;font-size:12.5px;letter-spacing:.01em}
  #vo .sbar svg{width:23px;height:12px}
  #vo .hind{position:absolute;left:50%;bottom:6px;width:104px;height:4px;margin-left:-52px;border-radius:2px;background:rgb(255 255 255/.6)}
  `;
  const make = () => {
    if (document.getElementById('vo')) return;
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
    const vo = document.createElement('div');
    vo.id = 'vo';
    vo.innerHTML = `<div class="cap"><h2></h2><p></p></div><div class="hud"></div><div class="bar"></div>
      <div class="cur"><svg viewBox="0 0 30 30"><path d="M6 4l17 9.2-7.3 1.9-3.1 7.3z" fill="#fff" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg></div>`;
    document.documentElement.append(vo);
    const cur = vo.querySelector('.cur');
    addEventListener('mousemove', e => (cur.style.transform = `translate3d(${e.clientX - 6}px,${e.clientY - 4}px,0)`), true);
    addEventListener('mousedown', e => {
      cur.classList.add('down');
      const r = document.createElement('i');
      r.className = 'rip';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      vo.append(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    addEventListener('mouseup', () => cur.classList.remove('down'), true);
    // The keystroke bar lifts above the app's toast instead of covering it.
    const toast = document.getElementById('toast'),
      lift = () => vo.querySelector('.hud').classList.toggle('up', !!toast && toast.classList.contains('on'));
    if (toast) new MutationObserver(lift).observe(toast, { attributes: true, attributeFilter: ['class'] });
    let ht = null;
    window.__hud = (keys, label) => {
      const h = vo.querySelector('.hud');
      h.classList.remove('on');
      void h.offsetWidth;
      h.innerHTML = keys.map(k => `<span class="k">${k}</span>`).join('') + `<b>${label}</b>`;
      h.classList.add('on');
      clearTimeout(ht);
      ht = setTimeout(() => h.classList.remove('on'), 1300);
    };
    window.__cap = (title, sub) => {
      const c = vo.querySelector('.cap');
      c.classList.add('out');
      setTimeout(() => {
        c.classList.remove('on', 'out');
        if (!title) return;
        const h = c.querySelector('h2');
        h.textContent = title;
        c.querySelector('p').textContent = sub || '';
        // long titles (a domain name) shrink to fit the margin beside the card
        h.style.fontSize = '';
        for (let fs = 38; h.scrollWidth > h.clientWidth + 1 && fs > 20; fs--) h.style.fontSize = fs - 1 + 'px';
        void c.offsetWidth;
        c.classList.add('on');
      }, title && c.classList.contains('on') ? 260 : 0);
    };
    window.__bar = ms => {
      const b = vo.querySelector('.bar');
      b.style.transition = `transform ${ms}ms linear`;
      b.style.transform = 'scaleX(1)';
    };
    // From wherever it is, the rule fills in what is left (the phone part's length is known before it plays).
    window.__barTo = ms => {
      const b = vo.querySelector('.bar'),
        m = getComputedStyle(b).transform.match(/matrix\(([^,]+)/),
        x = m ? parseFloat(m[1]) : 0;
      b.style.transition = 'none';
      b.style.transform = `scaleX(${x})`;
      void b.offsetWidth;
      b.style.transition = `transform ${ms}ms linear`;
      b.style.transform = 'scaleX(1)';
    };
    // The outro completes the rule, wherever it is.
    window.__barEnd = () => {
      const b = vo.querySelector('.bar'),
        m = getComputedStyle(b).transform.match(/matrix\(([^,]+)/),
        x = m ? parseFloat(m[1]) : 1;
      b.style.transition = 'none';
      b.style.transform = `scaleX(${x})`;
      void b.offsetWidth;
      b.style.transition = 'transform 1.4s cubic-bezier(.22,1,.36,1)';
      b.style.transform = 'scaleX(1)';
    };
    // The phone part, recorded beforehand, plays in a phone frame over the dimmed app.
    window.__phoneLoad = async b64 => {
      const bin = atob(b64),
        u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      const ready = new Promise((ok, no) => {
        v.oncanplaythrough = ok;
        v.onerror = () => no(new Error('phone video: ' + (v.error && v.error.message)));
      });
      v.src = URL.createObjectURL(new Blob([u8], { type: 'video/webm' }));
      await ready;
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.innerHTML = `<div class="scr"><div class="sbar"><span>8:30</span><svg viewBox="0 0 24 12"><rect x=".75" y=".75" width="19.5" height="10.5" rx="3.2" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.2"/><rect x="2.6" y="2.6" width="12.8" height="6.8" rx="1.7" fill="currentColor"/><path d="M21.9 4.1v3.8c.8-.3 1.3-1.1 1.3-1.9s-.5-1.6-1.3-1.9z" fill="currentColor" fill-opacity=".45"/></svg></div><div class="hind"></div></div>`;
      ph.querySelector('.scr').prepend(v);
      const dim = document.createElement('div');
      dim.className = 'dim';
      vo.prepend(ph);
      vo.prepend(dim);
    };
    window.__phone = wait => {
      const cur = vo.querySelector('.cur');
      cur.style.transition = 'opacity .3s';
      cur.style.opacity = '0';
      vo.querySelector('.dim').classList.add('on');
      vo.querySelector('.ph').classList.add('on');
      setTimeout(() => vo.querySelector('.ph video').play(), wait);
    };
    window.__dark = on => {
      const st = vo.style;
      for (const [k, v] of Object.entries(
        on
          ? { '--vh': 'rgb(30 30 30/.72)', '--vt': '#f2f2f2', '--vm': '#9a9a9a', '--vk': '#2a2a2a', '--vks': 'rgb(0 0 0/.5)', '--ve': 'rgb(255 255 255/.1)', '--vr': 'rgb(255 255 255/.55)' }
          : {},
      ))
        st.setProperty(k, v);
    };
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', make);
  else make();
}

// On the phone, a fingertip instead of a cursor.
function touchDots() {
  const css = `
  .vtd{position:fixed;left:0;top:0;z-index:2147483647;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;
    background:rgb(255 255 255/.24);box-shadow:0 0 0 1.5px rgb(255 255 255/.6),0 8px 22px rgb(0 0 0/.4);animation:vtdin .16s cubic-bezier(.2,.8,.2,1) both}
  .vtd.up{animation:vtdout .45s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes vtdin{from{transform:scale(.4);opacity:0}}
  @keyframes vtdout{to{transform:scale(1.4);opacity:0}}`;
  const make = () => {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
    const dots = new Map();
    const at = (d, e) => {
      d.style.left = e.clientX + 'px';
      d.style.top = e.clientY + 'px';
    };
    addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const d = document.createElement('i');
      d.className = 'vtd';
      at(d, e);
      document.documentElement.append(d);
      dots.set(e.pointerId, d);
    }, true);
    addEventListener('pointermove', e => {
      const d = dots.get(e.pointerId);
      if (d) at(d, e);
    }, true);
    const up = e => {
      const d = dots.get(e.pointerId);
      if (!d) return;
      dots.delete(e.pointerId);
      d.classList.add('up');
      setTimeout(() => d.remove(), 500);
    };
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', make);
  else make();
}

// Frames have their own timing: give each one its real duration (the last one `tail` seconds).
// With `from` (seconds since 1970, like the frame timestamps), the clip starts on what was on screen then.
// Returns the clip's length in seconds.
// A busy machine can hand frames over out of their order: they are put back in the order of their timestamps (taken
// as they came, every step back would be played twice over and the whole clip would run slow).
async function frameList(dir, shots, tail, from = 0) {
  const back = shots.filter((t, i) => i && t < shots[i - 1]).length;
  if (back) console.warn(`${back} frames came out of order: put back in place`);
  const order = shots.map((t, i) => i).sort((a, b) => shots[a] - shots[b] || a - b),
    ts = order.map(i => shots[i]),
    name = k => `file f${String(order[k]).padStart(5, '0')}.jpg`;
  let first = 0;
  ts.forEach((t, k) => {
    if (t <= from) first = k;
  });
  const start = Math.max(ts[first], from),
    list = ['ffconcat version 1.0'];
  for (let k = first; k < ts.length; k++) {
    const d = k + 1 < ts.length ? Math.max(0.001, ts[k + 1] - (k === first ? start : ts[k])) : tail;
    list.push(name(k), `duration ${d.toFixed(4)}`);
  }
  list.push(name(ts.length - 1));
  await writeFile(join(dir, 'frames.txt'), list.join('\n') + '\n');
  return ts[ts.length - 1] - start + tail;
}

// The phone part: a phone-sized touch browser in dark mode, with its own tasks.
// Returns the clip as base64 WebM (VP9, which Playwright's Chromium plays) and its length in ms.
async function recordPhone(browser) {
  const dir = await mkdtemp(join(tmpdir(), 'one-day-phone-'));
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 778 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    bypassCSP: true,
  });
  await ctx.addInitScript(data => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(data));
  }, phoneSeed);
  await ctx.addInitScript(touchDots);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const shots = [],
    writes = [];
  cdp.on('Page.screencastFrame', f => {
    const i = shots.length;
    shots.push(f.metadata.timestamp);
    writes.push(writeFile(join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
    });
  async function tap(target) {
    let x, y;
    if (Array.isArray(target)) [x, y] = target;
    else {
      const b = await target.boundingBox();
      [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
    }
    await touch('touchStart', x, y);
    await sleep(120);
    await touch('touchEnd', x, y);
  }
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  // A finger's path, timed by the clock: each step lands where the finger is by then, whatever a step costs.
  async function path([x0, y0], [x1, y1], ms) {
    await touch('touchStart', x0, y0);
    await sleep(40);
    const t0 = Date.now();
    for (let k = 0; k < 1; ) {
      k = Math.min(1, (Date.now() - t0) / ms);
      const e = ease(k);
      await touch('touchMove', x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
    }
    await touch('touchEnd', x1, y1);
  }
  const swipe = (x0, x1, y, ms = 320) => path([x0, y], [x1, y], ms);
  const drag = (x, y0, y1, ms = 260) => path([x, y0], [x, y1], ms);
  const row = text => page.locator('#list .row', { hasText: text }).first();

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('pre'));
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1556, everyNthFrame: 1 });
  await page
    .waitForFunction(
      () => document.querySelectorAll('#list .row').length >= 4 && document.getAnimations().every(a => a.playState !== 'running'),
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  await sleep(300);
  const from = Date.now() / 1000;
  await sleep(650);
  await tap(row('Pick up the parcel').locator('.in .ck'));
  await sleep(850);
  await tap(page.locator('#mbAdd'));
  await sleep(600);
  for (const ch of 'Buy croissants 🥐') {
    await page.keyboard.type(ch);
    await sleep(34 + Math.random() * 26);
  }
  await sleep(280);
  await page.keyboard.press('Enter');
  await sleep(700);
  await tap([60, 130]);
  await sleep(750);
  await swipe(290, 70, 430);
  await sleep(1250);
  await swipe(70, 290, 430);
  await sleep(900);
  await tap(page.locator('#mbSearch'));
  await sleep(700);
  // what follows is typed into the search field, never into the day (where T would open the timer)
  if (!(await page.evaluate(() => document.activeElement && document.activeElement.id === 'sq'))) await page.locator('#sq').focus();
  // a # lists the tags: a moment for them to show (typed on, they would flash), then the tag picked from them
  await page.keyboard.type('#');
  await sleep(1000);
  await tap(page.locator('#spicks [data-pick="travel"]'));
  await sleep(1300);
  const g = await page.locator('#srch .sgrab').boundingBox();
  await drag(g.x + g.width / 2, g.y + g.height / 2, g.y + 330, 240);
  await sleep(1000);
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  await ctx.close();

  // the frame clock and ours are both seconds since 1970; if they disagree, keep the whole clip
  const ok = from > shots[0] - 1 && from < shots[shots.length - 1];
  if (!ok) console.warn('Phone clip: frame clock looks off, keeping its entrance');
  const secs = await frameList(dir, shots, 0.1, ok ? from : 0);
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', 'fps=60', '-c:v', 'libvpx-vp9', '-crf', '16', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-pix_fmt', 'yuv420p', '-an', 'phone.webm'],
    { cwd: dir, stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error('ffmpeg failed for the phone clip');
  const b64 = (await readFile(join(dir, 'phone.webm'))).toString('base64');
  const dur = Math.round(secs * 1000);
  await rm(dir, { recursive: true, force: true });
  console.log(`Phone clip: ${(dur / 1000).toFixed(1)} s, ${Math.round((b64.length * 3) / 4 / 1024)} KB`);
  return { b64, dur };
}

const ICON_WHEEL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3"/></svg>';
const ICON_CLICK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l10.5 4-4.6 1.4L13.5 19z"/><path d="M5.5 5.5 4 4M9 3.5V2M3.5 9H2"/></svg>';

async function main() {
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await sleep(700);
  const frames = await mkdtemp(join(tmpdir(), 'one-day-video-'));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const phone = await recordPhone(browser);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.5,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
    bypassCSP: true,
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
  await ctx.addInitScript(data => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(data));
  }, seed);
  await ctx.addInitScript(overlay);
  const page = await ctx.newPage();

  // Screencast: every painted frame, with its timestamp.
  const cdp = await ctx.newCDPSession(page);
  const shots = [],
    writes = [];
  cdp.on('Page.screencastFrame', f => {
    const i = shots.length;
    shots.push(f.metadata.timestamp);
    writes.push(writeFile(join(frames, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });

  // Gestures
  let mx = 1150,
    my = 430;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  // Timed by the clock: each step lands where the cursor is by then (a step costs a round trip to the browser,
  // so counting steps made every glide last twice as long as planned).
  async function glide(x, y, ms = 600) {
    const x0 = mx,
      y0 = my,
      t0 = Date.now();
    for (let k = 0; k < 1; ) {
      k = Math.min(1, (Date.now() - t0) / ms);
      const e = ease(k);
      await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    }
    mx = x;
    my = y;
  }
  // A day longer than the card scrolls inside it: a task out of sight glides into view before the cursor goes
  // to it, as a scroll would bring it.
  async function reveal(loc) {
    const d = await loc.evaluate(el => {
      const sc = el.closest('#sc');
      if (!sc || !el.getClientRects().length) return 0;
      const r = el.getBoundingClientRect(),
        s = sc.getBoundingClientRect(),
        m = 14;
      if (r.top < s.top + m) return r.top - s.top - m;
      if (r.bottom > s.bottom - m) return r.bottom - s.bottom + m;
      return 0;
    });
    if (!d) return;
    await loc.evaluate((el, by) => el.closest('#sc').scrollBy({ top: by, behavior: 'smooth' }), d);
    await sleep(560);
  }
  async function at(target, dx = 0.5, dy = 0.5) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await reveal(loc);
    const b = await loc.boundingBox();
    return [b.x + b.width * dx, b.y + b.height * dy];
  }
  async function click(target, label, opts = {}) {
    const [x, y] = Array.isArray(target) ? target : await at(target, opts.dx, opts.dy);
    await glide(x, y, opts.ms);
    await sleep(110);
    if (label) await page.evaluate(([i, l]) => window.__hud([i], l), [ICON_CLICK, label]);
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();
  }
  async function press(combo, keys, label) {
    await page.evaluate(([k, l]) => window.__hud(k, l), [keys, label]);
    await sleep(160);
    await page.keyboard.press(combo);
  }
  async function type(text) {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await sleep(28 + Math.random() * 26);
    }
  }
  // A task with a tag: the # opens the list of tags, so the typing stops a moment for it to show (typed on, it would
  // flash), then a tag already there is picked from it (its first letter, then Tab); a new one is typed on.
  async function typeTask(text) {
    const at = text.lastIndexOf('#');
    if (at < 0) return type(text);
    const tag = text.slice(at + 1);
    await type(text.slice(0, at + 1));
    await sleep(1000);
    // where the tag is in the list (a button reads "#work2": the tag, then how many tasks have it), and the one chosen
    const where = () =>
      page.evaluate(g => {
        const bs = [...document.querySelectorAll('#sug.on button')];
        return { i: bs.findIndex(b => b.textContent.replace(/\d+$/, '') === '#' + g), sel: bs.findIndex(b => b.classList.contains('sel')) };
      }, tag);
    if ((await where()).i < 0) return type(tag);
    await type(tag[0]);
    await sleep(380);
    const w = await where();
    if (w.i < 0) return type(tag.slice(1));
    for (let k = w.sel; k < w.i; k++) await page.keyboard.press('ArrowDown');
    await press('Tab', ['Tab'], '#' + tag);
  }
  const cap = (t, s) => page.evaluate(([a, b]) => window.__cap(a, b), [t, s]);
  const row = text => page.locator('#list .row', { hasText: text }).first();

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__hud && !document.getElementById('app').classList.contains('pre'));
  await page.evaluate(b64 => window.__phoneLoad(b64), phone.b64);
  await page.mouse.move(mx, my);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const PHONE_IN = 800;
  const DESK = 111000;
  const TOTAL = DESK + PHONE_IN + phone.dur + 450;
  await page.evaluate(ms => window.__bar(ms), TOTAL);
  const t0 = Date.now();

  // 1. Intro
  await sleep(370);
  await cap('One Day', 'A calm to-do list that shows one day at a time.');
  await sleep(1920);

  // 2. What yesterday left
  await cap('Pick up where you left off', 'What was left undone comes to today in one click.');
  await sleep(620);
  await click('#bring', 'Bring here');
  await sleep(1150);

  // 3. Plan today
  await cap('Plan today', 'Write down what today is for.');
  await sleep(420);
  await press('n', ['N'], 'New task');
  await sleep(260);
  await typeTask('Pick up the cake for Sunday #home');
  await sleep(250);
  await press('Enter', ['Enter'], 'Add');
  await sleep(600);
  await click(row('Reply to Sam').locator('.in .ck'), 'Done');
  await sleep(820);

  // 4. Paste a list
  await cap('Paste a list', 'Every line becomes a task.');
  await sleep(420);
  await page.evaluate(() => navigator.clipboard.writeText('- Buy flowers for mum\n- Print the boarding passes\n- Book a table for Friday'));
  await click('#input', null);
  await sleep(240);
  await press('Control+v', ['Ctrl', 'V'], 'Paste a list');
  await sleep(1350);

  // 5. Undo
  await cap('Undo anything', 'Ctrl Z, or ⌘Z on a Mac.');
  await sleep(420);
  await click(row('Book a table for Friday').locator('.in .acts .rm'), 'Delete');
  await sleep(760);
  await click([1120, 600], null);
  await sleep(160);
  await press('Control+z', ['Ctrl', 'Z'], 'Undo');
  await sleep(1150);

  // 6. Open a task
  await cap('Open a task', 'A note and a checklist, one click away.');
  await sleep(370);
  await click(row('Prepare the weekly review').locator('.tx'), 'Open', { dx: 0.82, dy: 0.3 });
  await sleep(810);
  await click(page.locator('.sub', { hasText: 'Draft the agenda' }).locator('.sck'), 'Tick');
  await sleep(960);
  await click([1120, 600], 'Close');
  await sleep(670);

  // 7. Any day, and the wheel to get there
  await cap('Any day', 'Send a task to tomorrow without leaving today.');
  await sleep(370);
  await click('#input', null);
  await sleep(250);
  await click('#dchip', 'Choose the day');
  await sleep(520);
  await click('#dq [data-d="tomorrow"]', 'Tomorrow');
  await sleep(300);
  await typeTask('Send the invoices #work');
  await sleep(200);
  await press('Enter', ['Enter'], 'Add');
  await sleep(960);
  await page.keyboard.press('Escape');
  await sleep(220);
  await cap('Scroll through the days', 'Down for the next day, up for the one before.');
  const [nx, ny] = await at('#num');
  await glide(nx, ny, 600);
  await sleep(160);
  await page.evaluate(([i, l]) => window.__hud([i], l), [ICON_WHEEL, 'Next day']);
  await page.mouse.wheel(0, 120);
  await sleep(1250);
  await page.evaluate(([i, l]) => window.__hud([i], l), [ICON_WHEEL, 'Back to today']);
  await page.mouse.wheel(0, -120);
  await sleep(1000);

  // 8. Repeat
  await cap('Repeat', 'Every few days, weeks or months.');
  await sleep(370);
  await click('#input', null);
  await sleep(200);
  await click('#dchip', 'Choose the day');
  await sleep(440);
  await click('#drep', 'Repeat');
  await sleep(590);
  const wd = (new Date().getDay() + 6) % 7;
  await click(`#rdays [data-d="${(wd + 3) % 7}"]`, null);
  await sleep(370);
  await click('#rseg [data-f="month"]', 'Monthly');
  await sleep(670);
  await click('#rseg [data-f="week"]', 'Weekly');
  await sleep(590);
  await click('#rdone', 'Done');
  await sleep(220);
  await typeTask('Water the plants #home');
  await press('Enter', ['Enter'], 'Add');
  await sleep(1180);

  // 9. Send a task
  await cap('Send a task', 'It travels inside the link. No server, no account.');
  await sleep(370);
  await click(row('Water the plants').locator('.tx'), 'Open', { dx: 0.85, dy: 0.3 });
  await sleep(670);
  await click('.row.open .sbtn', 'Send');
  await sleep(960);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await click([1120, 600], null);
  await sleep(370);
  await page.evaluate(h => (location.hash = new URL(h).hash), link);
  await sleep(1260);
  await click('#inNo', 'Ignore');
  await sleep(520);

  // 10. Tags in colour (#work has its own from the start), and the day filtered by one
  await cap('Tags in colour', 'Give each tag a colour. Show one tag at a time.');
  await sleep(370);
  await click('#fbtn', 'Filter by tag');
  await sleep(560);
  for (const [tag, c, name] of [
    ['travel', 'blue', 'Blue'],
    ['home', 'green', 'Green'],
  ]) {
    await click(`#ftags .fdot[data-tag="${tag}"]`, 'Colour of #' + tag);
    await sleep(400);
    await click(`#ftags .fsw [data-sw="${c}"]`, name);
    await sleep(560);
  }
  await click('#ftags .ftag[data-tag="travel"]', 'Only #travel');
  await sleep(1350);
  await click('#fclr', 'All tasks');
  await sleep(720);

  // 11. Search
  await cap('Search', 'Every day, every note, every sub-task.');
  await sleep(370);
  await press('Control+k', ['Ctrl', 'K'], 'Search');
  await sleep(370);
  // a # lists the tags: a moment for them to show (typed on, they would flash), then the tag picked from them
  await type('#');
  await sleep(1000);
  await click('#spicks [data-pick="work"]', '#work');
  await sleep(1180);
  await press('Control+k', ['Ctrl', 'K'], 'Close');
  await sleep(590);

  // 12. Timer, live
  await cap('Calm or live', 'A timer that rolls like the date.');
  await sleep(370);
  await press('t', ['T'], 'Timer');
  await sleep(520);
  await click('#tstart', 'Start');
  await sleep(1500);
  await click('#seg [data-m="live"]', 'Live');
  await sleep(2100);
  await click([1120, 600], null);
  await sleep(520);

  // 13. Full days: the rest of today ticked down the list, and the last tick seals the day: its circle rises into a big
  // check over the day, the count under it goes up by one, then it all folds into the count in the middle of the bar.
  await cap('Full days', 'Tick the last task of a day: one more full day.');
  await page.evaluate(() => document.getElementById('sc').scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(420);
  // The app sorts ticked tasks down 560 ms after the last tick, so the ticks come quicker than that, from circles
  // measured beforehand, and nothing scrolls meanwhile. First the tasks at the top, till what is left fits above the
  // field to add a task (a repeating task has a second line); then the ticked ones sink, the rest come up, and they
  // are ticked one after another: the last one stays low in the list, and its check rises from there.
  const plan = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('#list .row:not(.done)')],
        room = document.getElementById('add').getBoundingClientRect().top - document.getElementById('list').getBoundingClientRect().top,
        h = rows.map(r => r.getBoundingClientRect().height);
      let first = 0;
      while (first < rows.length - 1 && h.slice(first).reduce((a, b) => a + b, 0) > room) first++;
      const spots = rows.map(r => {
        const b = r.querySelector('.in .ck').getBoundingClientRect();
        return [b.x + b.width / 2, b.y + b.height / 2];
      });
      return { first, spots };
    });
  // the circle under the cursor is still an open task's (if the list moved after all, the next open one is followed)
  const openAt = xy =>
    page.evaluate(([x, y]) => {
      const ck = document.elementFromPoint(x, y)?.closest('.ck'),
        row = ck && ck.closest('.row');
      return !!(row && ck.matches('.in .ck') && !row.classList.contains('done'));
    }, xy);
  const ticks = [];
  async function tick([x, y], ms) {
    await glide(x, y, ms);
    if (!(await openAt([x, y]))) {
      [x, y] = (await plan()).spots[0];
      await glide(x, y, 140);
    }
    await page.mouse.down();
    ticks.push(Date.now());
    await sleep(50);
    await page.mouse.up();
  }
  const top = await plan();
  for (const xy of top.spots.slice(0, top.first)) {
    await tick(xy, 190);
    await sleep(60);
  }
  if (top.first) {
    await sleep(700);
    await page
      .waitForFunction(() => !document.getAnimations().some(a => a.id === 'flip' && a.playState === 'running'), null, { timeout: 1500 })
      .catch(() => {});
    await sleep(150);
  }
  const rest = (await plan()).spots;
  for (let i = 0; i < rest.length; i++) {
    const last = i === rest.length - 1;
    // the last one, a touch slower: the day is full
    await tick(rest[i], last ? 230 : 170);
    if (!last) await sleep(40);
  }
  const gaps = ticks.slice(top.first + 1).map((t, i) => t - ticks[top.first + i]);
  console.log(`Full days: ${top.first} + ${rest.length} ticks, ${Math.max(...gaps)} ms at most between two (the app sorts after 560)`);
  await sleep(300);
  await glide(1090, 580, 1100);
  await sleep(2250);

  // 14. Light and dark, in one click, crossfaded
  await cap('Light and dark', 'It follows your system, or switches in one click.');
  await sleep(670);
  const [tx, ty] = await at('#theme');
  await glide(tx, ty, 620);
  await sleep(150);
  const still = (await page.screenshot({ type: 'jpeg', quality: 95 })).toString('base64');
  await page.evaluate(src => {
    const img = document.createElement('img');
    img.className = 'fade';
    img.src = 'data:image/jpeg;base64,' + src;
    document.getElementById('vo').prepend(img);
  }, still);
  await sleep(120);
  await page.evaluate(([i, l]) => window.__hud([i], l), [ICON_CLICK, 'Dark mode']);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  await page.evaluate(() => window.__dark(true));
  await glide(1180, 650, 700);
  await sleep(200);
  await page.evaluate(() => {
    const img = document.querySelector('#vo .fade');
    img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () =>
      img.remove();
  });
  await sleep(1780);

  // 15. The lock: a passphrase, locked in one click, open again
  const PASS = 'maple sunrise';
  await cap('Lock it', 'A passphrase encrypts your tasks in this browser.');
  await sleep(420);
  await click('#lpill', 'Protect with a passphrase');
  await page.locator('#lsPass').waitFor({ state: 'visible' });
  await sleep(420);
  await click('#lsPass', null);
  await type(PASS);
  await sleep(140);
  await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => document.activeElement && document.activeElement.id === 'lsPass2'))) await click('#lsPass2', null);
  await type(PASS);
  await sleep(200);
  await click('#lsOkT', 'I understand');
  await sleep(380);
  await click('#lsGo', 'Protect');
  await page.locator('#lockset').waitFor({ state: 'hidden', timeout: 20000 });
  await sleep(900);
  await click('#lpill', 'Lock now');
  await page.locator('#lockPass').waitFor({ state: 'visible' });
  await sleep(560);
  await click('#lockPass', null);
  await type(PASS);
  await sleep(200);
  await press('Enter', ['Enter'], 'Unlock');
  await page.locator('#lock').waitFor({ state: 'hidden', timeout: 20000 });
  await sleep(1000);
  console.log(`Desktop part: ${((Date.now() - t0) / 1000).toFixed(1)} s (the bar plans ${DESK / 1000} s)`);

  // 16. Also on a phone
  await cap('Also on your phone', 'Add it to your Home Screen. It works offline, too.');
  await page.evaluate(ms => window.__barTo(ms), PHONE_IN + phone.dur + 450 + 2520);
  await page.evaluate(ms => window.__phone(ms), PHONE_IN);
  await sleep(PHONE_IN + phone.dur + 450);

  // 17. Outro
  await cap('day.bemorin.com', 'Free, private and open source.');
  await page.evaluate(() => window.__barEnd());
  await sleep(2520);

  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  await browser.close();
  server.kill();

  // Each frame keeps its real duration, then the whole is resampled to 60 fps.
  await frameList(frames, shots, 1.2);
  await mkdir(join(root, 'dist'), { recursive: true });
  const enc = (out, vf, crf) => {
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
      { cwd: frames, stdio: 'inherit' },
    );
    if (r.status !== 0) throw new Error('ffmpeg failed for ' + out);
  };
  enc(join(root, 'dist', 'one-day-demo.mp4'), 'fps=60,scale=1920:1080:flags=lanczos', 18);
  enc(join(root, 'dist', 'one-day-demo-720p.mp4'), 'fps=30,scale=1280:720:flags=lanczos', 24);
  const span = shots.length ? Math.max(...shots) - Math.min(...shots) : 0;
  console.log(`${shots.length} frames over ${span.toFixed(1)} s (${(shots.length / span).toFixed(0)} fps captured)`);
  await rm(frames, { recursive: true, force: true });
  console.log('Wrote dist/one-day-demo.mp4 and dist/one-day-demo-720p.mp4');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
