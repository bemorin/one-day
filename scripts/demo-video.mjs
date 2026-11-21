#!/usr/bin/env node
// Records the One Day demo video, with a cursor, click ripples, a keystroke bar and scene titles.
//   node scripts/demo-video.mjs            -> dist/one-day-demo.mp4 (1080p60) and dist/one-day-demo-720p.mp4
// Needs the dev dependencies (npm install) and ffmpeg on PATH.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 47321;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = key(new Date());

const seed = {
  days: {
    [today]: {
      u: 1,
      tasks: [
        { id: 'v1', text: 'Morning run', done: true, at: 1 },
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
        { id: 'v3', text: 'Book the train to Lyon #travel', done: false },
        { id: 'v4', text: 'Call mum', done: false },
      ],
    },
  },
  rules: {},
};

// The overlay lives in the page, above the app: cursor, ripples, keystroke bar, titles, progress rule.
function overlay() {
  const css = `
  #vo{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Archivo,system-ui,sans-serif}
  #vo .cur{position:absolute;left:0;top:0;width:30px;height:30px;transform:translate3d(-60px,-60px,0);filter:drop-shadow(0 3px 6px rgb(0 0 0/.28))}
  #vo .cur svg{width:30px;height:30px;transition:transform .32s cubic-bezier(.34,1.56,.64,1);transform-origin:6px 4px}
  #vo .cur.down svg{transform:scale(.82)}
  #vo .rip{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:2.5px solid var(--vr,rgb(0 0 0/.42));animation:rip .62s cubic-bezier(.2,.8,.2,1) forwards}
  @keyframes rip{from{transform:scale(.25);opacity:1}to{transform:scale(1.45);opacity:0}}
  #vo .hud{position:absolute;left:50%;bottom:34px;display:flex;align-items:center;gap:12px;padding:10px 20px 10px 12px;border-radius:24px;
    background:var(--vh,rgb(255 255 255/.78));backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);
    box-shadow:0 0 0 1px var(--ve,rgb(0 0 0/.06)),0 18px 50px -14px rgb(0 0 0/.35);color:var(--vt,#111);
    transform:translate(-50%,24px) scale(.9);opacity:0;filter:blur(6px);transition:transform .55s cubic-bezier(.34,1.4,.64,1),opacity .25s,filter .35s}
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
        c.querySelector('h2').textContent = title;
        c.querySelector('p').textContent = sub || '';
        void c.offsetWidth;
        c.classList.add('on');
      }, title && c.classList.contains('on') ? 260 : 0);
    };
    window.__bar = ms => {
      const b = vo.querySelector('.bar');
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

const ICON_CLICK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l10.5 4-4.6 1.4L13.5 19z"/><path d="M5.5 5.5 4 4M9 3.5V2M3.5 9H2"/></svg>';

async function main() {
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await sleep(700);
  const frames = await mkdtemp(join(tmpdir(), 'one-day-video-'));
  const browser = await chromium.launch();
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
  async function glide(x, y, ms = 430) {
    const x0 = mx,
      y0 = my,
      n = Math.max(12, Math.round(ms / 16));
    for (let i = 1; i <= n; i++) {
      const e = ease(i / n);
      await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await sleep(ms / n);
    }
    mx = x;
    my = y;
  }
  async function at(target, dx = 0.5, dy = 0.5) {
    const b = await (typeof target === 'string' ? page.locator(target).first() : target).boundingBox();
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
  const cap = (t, s) => page.evaluate(([a, b]) => window.__cap(a, b), [t, s]);
  const row = text => page.locator('#list .row', { hasText: text }).first();

  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__hud && !document.getElementById('app').classList.contains('pre'));
  await page.mouse.move(mx, my);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const TOTAL = 64000;
  await page.evaluate(ms => window.__bar(ms), TOTAL);

  // 1. Intro
  await sleep(370);
  await cap('One Day', 'A calm to-do list that shows one day at a time.');
  await sleep(1920);

  // 2. Plan today
  await cap('Plan today', 'Write down what today is for.');
  await sleep(520);
  await press('n', ['N'], 'New task');
  await sleep(260);
  await type('Pick up the cake for Sunday #home');
  await sleep(250);
  await press('Enter', ['Enter'], 'Add');
  await sleep(670);
  await click(row('Call mum').locator('.in .ck'), 'Done');
  await sleep(960);

  // 3. Open a task
  await cap('Open a task', 'A note and a checklist, one click away.');
  await sleep(370);
  await click(row('Prepare the weekly review').locator('.tx'), 'Open', { dx: 0.82, dy: 0.3 });
  await sleep(810);
  await click(page.locator('.sub', { hasText: 'Draft the agenda' }).locator('.sck'), 'Tick');
  await sleep(960);
  await click([1120, 600], 'Close');
  await sleep(670);

  // 4. Any day
  await cap('Any day', 'Send a task to tomorrow without leaving today.');
  await sleep(370);
  await click('#input', null);
  await sleep(250);
  await click('#dchip', 'Choose the day');
  await sleep(520);
  await click('#dq [data-d="tomorrow"]', 'Tomorrow');
  await sleep(300);
  await type('Send the invoices #work');
  await sleep(200);
  await press('Enter', ['Enter'], 'Add');
  await sleep(960);
  await page.keyboard.press('Escape');
  await sleep(220);
  await press('ArrowRight', ['→'], 'Next day');
  await sleep(1110);
  await press('d', ['D'], 'Back to today');
  await sleep(890);

  // 5. Repeat
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
  await type('Water the plants #home');
  await press('Enter', ['Enter'], 'Add');
  await sleep(1180);

  // 6. Send a task
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

  // 7. Search
  await cap('Search', 'Every day, every note, every sub-task.');
  await sleep(370);
  await press('Control+k', ['Ctrl', 'K'], 'Search');
  await sleep(370);
  await type('#work');
  await sleep(1180);
  await press('Control+k', ['Ctrl', 'K'], 'Close');
  await sleep(590);

  // 8. Timer
  await cap('A calm timer', 'Minutes, with a line that fills each minute.');
  await sleep(370);
  await press('t', ['T'], 'Timer');
  await sleep(590);
  await click('#tstart', 'Start');
  await sleep(1260);
  await click([1120, 600], null);
  await sleep(520);

  // 9. Light and dark, crossfaded
  await cap('Light and dark', 'It follows your system.');
  await sleep(670);
  await glide(1180, 650, 400);
  const still = (await page.screenshot({ type: 'jpeg', quality: 95 })).toString('base64');
  await page.evaluate(src => {
    const img = document.createElement('img');
    img.className = 'fade';
    img.src = 'data:image/jpeg;base64,' + src;
    document.getElementById('vo').prepend(img);
  }, still);
  await sleep(120);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => window.__dark(true));
  await sleep(200);
  await page.evaluate(() => {
    const img = document.querySelector('#vo .fade');
    img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () =>
      img.remove();
  });
  await sleep(1780);

  // 10. Outro
  await cap('day.bemorin.com', 'Free, private and open source.');
  await page.evaluate(() => window.__barEnd());
  await sleep(2520);

  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  await browser.close();
  server.kill();

  // Frames have their own timing: give each one its real duration, then resample to 60 fps.
  const list = ['ffconcat version 1.0'];
  shots.forEach((t, i) => {
    const d = i + 1 < shots.length ? Math.max(0.001, shots[i + 1] - t) : 1.2;
    list.push(`file f${String(i).padStart(5, '0')}.jpg`, `duration ${d.toFixed(4)}`);
  });
  list.push(`file f${String(shots.length - 1).padStart(5, '0')}.jpg`);
  await writeFile(join(frames, 'frames.txt'), list.join('\n') + '\n');
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
  const span = shots.length ? shots[shots.length - 1] - shots[0] : 0;
  console.log(`${shots.length} frames over ${span.toFixed(1)} s (${(shots.length / span).toFixed(0)} fps captured)`);
  await rm(frames, { recursive: true, force: true });
  console.log('Wrote dist/one-day-demo.mp4 and dist/one-day-demo-720p.mp4');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
