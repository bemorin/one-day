/*! One Day — a calm, one-day-at-a-time task list. MIT License. */
'use strict';
// On Android the page stays between the status bar and the system buttons, not under them (no viewport-fit=cover):
// the browser places it there itself, so nothing depends on the insets it reports while an installed app starts.
if (/Android/i.test(navigator.userAgent)) {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.content = vp.content.replace(/,\s*viewport-fit=cover/, '');
}
try {
  const th = localStorage.getItem('oneday.theme');
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
} catch (e) {}
{
  const app = document.getElementById('app'),
    home = document.getElementById('home'),
    q = s => app.querySelector(s),
    $ = {};
  'num dnum meta wd mo rel prev next todayb dd ddv ddn ddw ddsr ddlive sb tmb tv float vp sc stage list empty carry carryTxt bring add input toast toastTxt undo pop popT grid pmPrev pmNext tpop seg tset trun tpv tminus tplus tpre tstart tbig tunit tsec tprog tpause tadd tstop tip fmt fmtIn lb lbA lbRm sug srch sq sx sres hl slist scount impf dchip dlabel dpop dq dpT dpPrev dpNext dgrid drep drepV rpop rseg rminus rnum rplus runit rdays rmon rsum rnone rdone inbox inVeil inT inTitle inMeta inList inDay inDayL inNo inYes mbar mbSearch mbTimer mbTimerL mbAdd mbSend mbMore scrim more moreList theme sendd fx fbtn fname fclr fpop ftags fnone fqL fq spicks lockb kb kpop addGo'
    .split(' ')
    .forEach(id => ($[id] = q('#' + id)));
  const fill = q('.rule i'),
    RM = matchMedia('(prefers-reduced-motion: reduce)'),
    D = () => app.ownerDocument,
    W = () => D().defaultView || window;
  const TOUCH = matchMedia('(hover: none)').matches;
  /* The device's back (Android's button or gesture) closes what is open, the one on top first, before it leaves the
     app: each sheet, drawer, popover, open card and dialog holds a close watcher while it is open. On a phone only:
     on a computer, Escape does this already. */
  const BACKW = TOUCH && typeof window.CloseWatcher === 'function',
    held = new Map();
  function guard(k, close) {
    if (!BACKW) return;
    unguard(k);
    try {
      const w = new CloseWatcher();
      w.onclose = () => {
        if (held.get(k) === w) held.delete(k);
        close();
      };
      held.set(k, w);
    } catch (e) {}
  }
  function unguard(k) {
    const w = held.get(k);
    if (!w) return;
    held.delete(k);
    w.destroy();
  }
  // an open task holds one while any task is open
  function cardGuard() {
    if (!BACKW) return;
    if ($.list.querySelector('.row.open')) {
      if (!held.has('card')) guard('card', () => $.list.querySelectorAll('.row.open').forEach(li => setOpen(li, false)));
    } else unguard('card');
  }
  const MAC = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    MOD = MAC ? '⌘' : 'Ctrl+';
  app.querySelectorAll('[data-key]').forEach(b => {
    b.dataset.key = b.dataset.key.replace('⌘⇧', MAC ? '⌘⇧' : 'Ctrl+Shift+').replace('⌘', MOD);
  });

  /* motion */
  function spring(k, c) {
    let x = 0,
      v = 0,
      t = 0,
      i = 0;
    const dt = 1 / 240,
      p = [0];
    while (t < 2) {
      v += (-k * (x - 1) - c * v) * dt;
      x += v * dt;
      t += dt;
      if (++i % 4 === 0) p.push(+x.toFixed(4));
      if (Math.abs(x - 1) < 5e-4 && Math.abs(v) < 5e-3) break;
    }
    p.push(1);
    return { ease: `linear(${p.join(',')})`, dur: Math.round(t * 1000) };
  }
  const LIN = window.CSS && CSS.supports('transition-timing-function', 'linear(0, 1)');
  const SP = LIN ? spring(230, 25) : { ease: 'cubic-bezier(.22,1,.36,1)', dur: 520 },
    SNAP = LIN ? spring(380, 38) : { ease: 'cubic-bezier(.25,1,.5,1)', dur: 380 };
  const POP = LIN ? spring(600, 22) : { ease: 'cubic-bezier(.34,1.56,.64,1)', dur: 520 },
    DROP = LIN ? spring(340, 23) : { ease: 'cubic-bezier(.3,1.35,.5,1)', dur: 560 };
  [
    ['--spring', SP.ease],
    ['--sp-d', SP.dur + 'ms'],
    ['--snap', SNAP.ease],
    ['--sn-d', SNAP.dur + 'ms'],
    ['--pop', POP.ease],
    ['--pop-d', POP.dur + 'ms'],
  ].forEach(([k, v]) => app.style.setProperty(k, v));
  function an(el, kf, o = {}) {
    if (!el || !el.animate) return null;
    if (RM.matches) {
      kf = kf.map(f => {
        const g = { ...f };
        delete g.transform;
        return g;
      });
      if (!kf.some(f => Object.keys(f).length)) return null;
      o = { ...o, duration: 160, easing: 'ease', delay: 0 };
    }
    return el.animate(kf, { duration: SP.dur, easing: SP.ease, ...o });
  }
  const then = (a, fn) => (a ? (a.onfinish = fn) : fn());
  const later = (fn, ms) => {
      const w = W();
      return { w, id: w.setTimeout(fn, ms) };
    },
    stop = t => {
      if (t)
        try {
          t.w.clearTimeout(t.id);
        } catch (e) {}
    };
  let calmT = null;
  function calm(ms) {
    app.classList.add('calm');
    stop(calmT);
    calmT = later(() => app.classList.remove('calm'), ms);
  }
  const esc = s =>
    String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* dates */
  const p2 = n => String(n).padStart(2, '0'),
    keyOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const fromKey = k => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (k, n) => {
    const d = fromKey(k);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  };
  const todayKey = () => keyOf(new Date()),
    diff = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);
  const WD = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }),
    MO = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }),
    MON = new Intl.DateTimeFormat('en-GB', { month: 'long' });
  const FULL = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    SHORT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  function relLabel(k) {
    const n = diff(todayKey(), k);
    return n === 0
      ? 'Today'
      : n === 1
        ? 'Tomorrow'
        : n === -1
          ? 'Yesterday'
          : n > 0
            ? `In ${n} days`
            : `${-n} days ago`;
  }
  const dayLabel = k => {
    const n = diff(todayKey(), k);
    return Math.abs(n) <= 1
      ? relLabel(k)
      : SHORT.format(fromKey(k)) + (k.slice(0, 4) !== todayKey().slice(0, 4) ? ' ' + k.slice(0, 4) : '');
  };

  /* rich text: allow-list sanitizer */
  const OKT = {
    B: 'b',
    STRONG: 'b',
    I: 'i',
    EM: 'i',
    U: 'u',
    S: 's',
    STRIKE: 's',
    DEL: 's',
    CODE: 'code',
    A: 'a',
    BR: 'br',
    DIV: 'div',
    P: 'div',
    UL: 'ul',
    OL: 'ol',
    LI: 'li',
  };
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u || /\s/.test(u)) return null;
    if (/^(https?:|mailto:)/i.test(u)) return u;
    if (/^www\./i.test(u) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(u)) return 'https://' + u;
    return null;
  }
  function walk(node) {
    let o = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        o += esc(n.nodeValue);
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = OKT[n.tagName],
        inner = walk(n);
      if (!tag) {
        o += inner;
        continue;
      }
      if (tag === 'br') {
        o += '<br>';
        continue;
      }
      if (tag === 'a') {
        const h = safeUrl(n.getAttribute('href'));
        o += h ? `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
        continue;
      }
      o += `<${tag}>${inner}</${tag}>`;
    }
    return o;
  }
  const tpl = document.createElement('template');
  function sanitize(h) {
    tpl.innerHTML = String(h || '');
    return walk(tpl.content).replace(/​/g, '');
  }
  function htmlText(h) {
    tpl.innerHTML = String(h || '').replace(/<br\s*\/?>|<\/(div|li|p)>/gi, ' ');
    return tpl.content.textContent;
  }

  /* state */
  const LS = 'oneday.v1',
    uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  // Ids end up in attribute selectors, so only plain ones are kept; anything else gets a fresh id.
  const IDRE = /^[\w-]{1,40}$/,
    DAYRE = /^\d{4}-\d\d-\d\d$/,
    okId = id => (IDRE.test(id) ? id : uid());
  const clean = a =>
    (Array.isArray(a) ? a : [])
      .filter(t => t && typeof t.text === 'string' && typeof t.id === 'string')
      .slice(0, 300)
      .map(t => {
        const o = { id: okId(t.id), text: t.text.slice(0, 500), done: !!t.done };
        if (t.done && typeof t.at === 'number') o.at = t.at;
        if (typeof t.note === 'string' && t.note) {
          const n = sanitize(t.note.slice(0, 30000));
          if (htmlText(n).trim()) o.note = n;
        }
        if (Array.isArray(t.subs)) {
          const s = t.subs
            .filter(x => x && typeof x.text === 'string' && typeof x.id === 'string')
            .slice(0, 100)
            .map(x => ({ id: okId(x.id), text: x.text.slice(0, 300), done: !!x.done }));
          if (s.length) o.subs = s;
        }
        if (typeof t.rule === 'string' && IDRE.test(t.rule)) o.rule = t.rule;
        return o;
      });

  /* repeating tasks: a rule makes a task on each matching day */
  const FREQ = ['day', 'week', 'month'],
    wdOf = k => (fromKey(k).getDay() + 6) % 7,
    dimOf = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  function cleanRule(r, id) {
    if (!r || typeof r !== 'object' || !IDRE.test(id) || id in {}) return null;
    if (typeof r.text !== 'string' || !r.text.trim() || !DAYRE.test(r.start) || !FREQ.includes(r.freq)) return null;
    const x = {
      id,
      text: r.text.slice(0, 500),
      start: r.start,
      freq: r.freq,
      every: Math.min(99, Math.max(1, Math.round(+r.every) || 1)),
    };
    if (r.freq === 'week') {
      const d = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number))]
        .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b);
      x.days = d.length ? d : [wdOf(r.start)];
    }
    if (r.freq === 'month' && (r.nth === -1 || [1, 2, 3, 4].includes(r.nth))) x.nth = r.nth;
    if (typeof r.note === 'string' && r.note) {
      const n = sanitize(r.note.slice(0, 30000));
      if (htmlText(n).trim()) x.note = n;
    }
    if (Array.isArray(r.subs)) {
      const sb = r.subs
        .filter(v => v && typeof v.text === 'string')
        .slice(0, 100)
        .map(v => ({ text: v.text.slice(0, 300) }));
      if (sb.length) x.subs = sb;
    }
    if (DAYRE.test(r.until)) x.until = r.until;
    if (Array.isArray(r.skip)) {
      const sk = r.skip.filter(k => DAYRE.test(k)).slice(-400);
      if (sk.length) x.skip = sk;
    }
    return x;
  }
  // a tag's colour: one of eight, kept by tag name with the tasks
  const TCOL = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'brown'],
    TCOLN = { red: 'Red', orange: 'Orange', yellow: 'Yellow', green: 'Green', teal: 'Teal', blue: 'Blue', purple: 'Purple', brown: 'Brown' },
    TAGNAME = /^[\p{L}\p{N}][\p{L}\p{N}_\-\/]*$/u;
  const cleanTags = o => {
    const out = {};
    if (o && typeof o === 'object')
      for (const g of Object.keys(o).slice(0, 500)) if (TAGNAME.test(g) && g === g.toLowerCase() && TCOL.includes(o[g])) out[g] = o[g];
    return out;
  };
  const cleanRules = o => {
    const out = {};
    if (o && typeof o === 'object')
      for (const id of Object.keys(o).slice(0, 300)) {
        const r = cleanRule(o[id], id);
        if (r) out[id] = r;
      }
    return out;
  };
  function cleanDays(o) {
    const days = {};
    if (o && typeof o === 'object')
      for (const k of Object.keys(o)) {
        const v = o[k];
        // moved: open tasks were carried from this day to another once it had come (see doneDays)
        if (DAYRE.test(k) && v && typeof v === 'object') days[k] = { u: +v.u || 0, tasks: clean(v.tasks), ...(v.moved && { moved: 1 }) };
      }
    return days;
  }
  // With the lock on, the tasks live encrypted in the vault (see "the lock"). Until it is opened,
  // the app holds no tasks at all.
  const VK = 'oneday.vault',
    okBlob = b => !!b && typeof b.iv === 'string' && typeof b.ct === 'string',
    okVault = v =>
      !!v &&
      v.v === 1 &&
      !!v.kdf &&
      typeof v.kdf.salt === 'string' &&
      Number.isInteger(v.kdf.iter) &&
      v.kdf.iter >= 1e5 &&
      v.kdf.iter <= 5e6 &&
      okBlob(v.pass) &&
      okBlob(v.data) &&
      (!v.sync || okBlob(v.sync)) &&
      (!v.bio || (okBlob(v.bio) && typeof v.bio.id === 'string' && typeof v.bio.salt === 'string')) &&
      (v.kid == null || typeof v.kid === 'string') &&
      (v.uid == null || typeof v.uid === 'string');
  let vault = null,
    lockReady = false; // the lock's code below has started
  try {
    vault = JSON.parse(localStorage.getItem(VK));
  } catch (e) {}
  if (!okVault(vault)) vault = null;
  let locked = !!vault,
    S = null,
    // Sync with your cloud (see "sync"): its key and the copy last agreed with the cloud. They are written with the
    // tasks, in the same write, so the two always match; with the lock on, they are sealed with them in the vault.
    SYS = null,
    syncHook = null;
  if (!locked)
    try {
      S = JSON.parse(localStorage.getItem(LS));
    } catch (e) {}
  if (locked) S = { days: {}, rules: {}, tags: {} };
  else if (!S || !S.days || typeof S.days !== 'object') {
    const T = (text, x = {}) => ({
      id: uid() + Math.random().toString(36).slice(2, 4),
      text,
      done: false,
      ...x,
    });
    S = { days: {}, rules: {}, tags: {} };
    S.days[todayKey()] = {
      u: 0,
      tasks: [
        T('Open One Day', { done: true, at: 1 }),
        T('Tick the circle when something is done'),
        T('Prepare the weekly review #work', {
          subs: [T('Collect the numbers', { done: true }), T('Draft the agenda')].map(
            ({ id, text, done }) => ({ id, text, done }),
          ),
          note: 'Select any text in a note to format it. Links like <a href="https://www.wikipedia.org">wikipedia.org</a> open in a new tab.',
        }),
        T(TOUCH ? 'Tap a task to open it, tap its title to rename it' : 'Click a task to open it, click its title to rename it'),
        T(TOUCH ? 'Hold a task, then drag it to reorder' : 'Drag a task to change its order'),
        T(TOUCH ? 'Swipe sideways to change day #tips' : 'Type #tags, press / to search and T for the timer'),
      ],
    };
    S.days[todayKey()].tasks = clean(S.days[todayKey()].tasks);
  } else {
    SYS = cleanSys(S.sync);
    S = { days: cleanDays(S.days), rules: cleanRules(S.rules), tags: cleanTags(S.tags) };
  }
  let cur = todayKey(),
    lastToday = cur,
    IDX = null,
    TAGC = null,
    FX = null; // the tag the day is filtered by, if any (see "filter by tag")
  // the full days (see "full days"): the count on screen, and whether a day being sealed holds it for its moment
  let DDC = null,
    DDHOLD = 0,
    DDREADY = false,
    ddT = null;
  const tasks = k => (S.days[k] ? S.days[k].tasks : []),
    day = k => S.days[k] || (S.days[k] = { u: 0, tasks: [] });
  const find = id => tasks(cur).find(t => t.id === id),
    rowOf = id => $.list.querySelector(`.row[data-id="${CSS.escape(id)}"]`),
    subOf = (li, sid) => li.querySelector(`.sub[data-sid="${CSS.escape(sid)}"]`);
  const ordered = k => {
    const t = tasks(k);
    return [...t.filter(x => !x.done), ...t.filter(x => x.done).sort((a, b) => (a.at || 0) - (b.at || 0))];
  };
  const hasOpen = k =>
    tasks(k).some(t => !t.done) ||
    (k >= todayKey() && Object.values(S.rules).some(r => occurs(r, k) && !tasks(k).some(t => t.rule === r.id)));
  // false when the browser refused to keep the tasks in clear (its storage is full); with the lock on, sealSoon says
  function persist() {
    IDX = null;
    if (locked) return false;
    if (syncHook) syncHook();
    if (vault) {
      sealSoon();
      return true;
    }
    // another tab may have just turned the lock on: the tasks are never written in clear next to it
    if (lockReady && localStorage.getItem(VK) && adoptVault()) return true;
    try {
      localStorage.setItem(LS, JSON.stringify(SYS ? { ...S, sync: SYS } : S));
      return true;
    } catch (e) {
      return false;
    }
  }
  function commit(k) {
    day(k).u = Date.now();
    persist();
    cloud.push(k);
  }
  // Many days changed at once (an import, or its undo): written once, however many days there are.
  function commitMany(keys) {
    const now = Date.now();
    for (const k of keys)
      if (S.days[k]) {
        S.days[k].u = now;
        cloud.push(k);
      }
    return persist();
  }

  /* undo history */
  const UN = [],
    RE = [];
  const snap = keys => ({
    cur,
    days: Object.fromEntries([...new Set(keys)].map(k => [k, JSON.parse(JSON.stringify(day(k)))])),
    rules: JSON.parse(JSON.stringify(S.rules)),
  });
  function pushUndo(s) {
    UN.push(s);
    if (UN.length > 80) UN.shift();
    RE.length = 0;
  }
  const record = keys => pushUndo(snap(keys));
  function applySnap(e, into) {
    stopSeal();
    const keys = Object.keys(e.days);
    // what it says it does goes with it, from undo to redo and back
    into.push({ ...snap(keys), cur: e.cur, label: e.label });
    const was = S.rules,
      tk = todayKey();
    if (e.rules) S.rules = e.rules;
    for (const k of keys) S.days[k] = { u: 0, tasks: e.days[k].tasks, ...(e.days[k].moved && { moved: 1 }) };
    // a day left empty (one an import made, undone) is not kept, unless sync has to carry the change
    if (!cloud.col) for (const k of keys) if (!S.days[k].tasks.length) delete S.days[k];
    commitMany(keys);
    // a repeat this takes away takes with it the occurrences it had made on days still to come
    const gone = Object.keys(was).filter(id => !S.rules[id]);
    if (gone.length)
      for (const k in S.days) {
        if (k < tk || k in e.days) continue;
        const t = S.days[k].tasks.filter(x => !(x.rule && !x.done && gone.includes(x.rule)));
        if (t.length === S.days[k].tasks.length) continue;
        S.days[k].tasks = t;
        commit(k);
      }
    if (!(cur in e.days) && e.cur !== cur) go(e.cur);
    else
      flip(() => {
        renderList();
        renderAux();
      });
  }
  function undo() {
    const e = UN.pop();
    if (!e) {
      toast('Nothing to undo');
      return;
    }
    applySnap(e, RE);
    toast('Undone', 'redo', 2600);
  }
  function redo() {
    const e = RE.pop();
    if (!e) {
      toast('Nothing to redo');
      return;
    }
    applySnap(e, UN);
    toast('Redone', 'undo', 2600);
  }

  /* numerals that roll */
  function roll(el, s, d) {
    const prev = el.dataset.v;
    if (prev === s) return;
    el.dataset.v = s;
    if (!d || prev == null || RM.matches) {
      el.innerHTML = [...s].map(c => `<span class="dg"><i>${esc(c)}</i></span>`).join('');
      return;
    }
    const L = Math.max(prev.length, s.length),
      a = prev.padStart(L, ' '),
      b = s.padStart(L, ' ');
    el.textContent = '';
    for (let i = 0; i < L; i++) {
      const o = a[i],
        c = b[i],
        sp = D().createElement('span'),
        inn = D().createElement('i');
      sp.className = 'dg';
      inn.textContent = c.trim();
      sp.append(inn);
      el.append(sp);
      if (o === c) continue;
      const out = D().createElement('i');
      out.className = 'out';
      out.textContent = o.trim();
      sp.append(out);
      const delay = (L - 1 - i) * 50;
      an(inn, [{ transform: `translateY(${d * 108}%)` }, { transform: 'none' }], {
        delay,
        fill: 'backwards',
      });
      // Once a digit has rolled out, remove it: nothing may rely on a fill that lasts forever
      // (a fill dies with its document, e.g. when the floating window closes).
      then(
        an(out, [{ transform: 'none' }, { transform: `translateY(${-d * 108}%)` }], {
          delay,
          fill: 'forwards',
        }),
        () => out.remove(),
      );
      if (c === ' ')
        then(an(sp, [{ width: sp.offsetWidth + 'px' }, { width: '0px' }], { delay, fill: 'both' }), () =>
          sp.remove(),
        );
      else if (o === ' ') {
        const a = an(sp, [{ width: '0px' }, { width: sp.offsetWidth + 'px' }], { delay, fill: 'both' });
        then(a, () => a && a.cancel());
      }
    }
  }
  function swap(el, mutate, d) {
    const par = el.parentNode;
    par.querySelectorAll(':scope>.ghost').forEach(g => g.remove());
    const g = el.cloneNode(true);
    g.removeAttribute('id');
    g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    g.classList.add('ghost');
    g.setAttribute('aria-hidden', 'true');
    g.tabIndex = -1;
    // the exact width, not the rounded one: a line that just fits must not wrap in the copy
    Object.assign(g.style, {
      left: el.offsetLeft + 'px',
      top: el.offsetTop + 'px',
      width: el.getBoundingClientRect().width + 'px',
      margin: 0,
      background: 'none',
      whiteSpace: 'nowrap',
    });
    par.append(g);
    mutate();
    an(g, [{ transform: 'none' }, { transform: `translateX(${-d * 22}px)` }]);
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).onfinish = () =>
      g.remove();
    an(
      el,
      [
        { opacity: 0, transform: `translateX(${d * 22}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { delay: 40, fill: 'backwards' },
    );
  }

  /* header */
  function status() {
    const t = tasks(cur),
      n = t.length,
      dn = t.filter(x => x.done).length;
    $.rel.textContent =
      relLabel(cur) +
      (!n
        ? ''
        : dn === n
          ? ', all done'
          : dn
            ? `, ${dn} of ${n} done`
            : `, ${n} ${n > 1 ? 'tasks' : 'task'}`);
    fill.style.transform = `translateX(${((n ? dn / n : 0) - 1) * 100}%)`;
    ddRender();
    return { n, dn };
  }
  function renderHeader(d) {
    const dt = fromKey(cur),
      isT = cur === todayKey();
    app.classList.toggle('is-today', isT);
    roll($.num, String(dt.getDate()), d);
    const set = () => {
      $.wd.textContent = WD.format(dt);
      $.mo.textContent = MO.format(dt);
      status();
    };
    d && !RM.matches ? swap($.meta, set, d) : set();
    $.todayb.classList.toggle('on', !isT);
    $.todayb.parentElement.classList.toggle('today', isT);
    $.todayb.tabIndex = isT ? -1 : 0;
    $.todayb.setAttribute('aria-hidden', isT);
    $.dnum.textContent = dt.getDate() + ' ';
  }

  /* rows */
  const IC = {
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7.25" cy="7.25" r="4.5"/><path d="m10.6 10.6 3.15 3.15"/></svg>',
    help: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M6.32 6.48a1.72 1.72 0 1 1 2.44 1.56c-.48.22-.76.62-.76 1.12v.24M8 11.16v.04"/></svg>',
    tick: '<svg viewBox="0 0 12 12"><path d="M2.6 6.3 5 8.6l4.4-5"/></svg>',
    mv: '<svg viewBox="0 0 20 20"><path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5"/></svg>',
    rm: '<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9m0-9-9 9"/></svg>',
    ex: '<svg viewBox="0 0 20 20"><path d="m5.5 8 4.5 4.5L14.5 8"/></svg>',
    plus: '<svg viewBox="0 0 18 18"><path d="M9 3.5v11M3.5 9h11"/></svg>',
    list: '<svg viewBox="0 0 14 14"><path d="m2 4 1.3 1.3L5.6 3M7.5 4.2H12M2 9.4l1.3 1.3 2.3-2.3M7.5 9.6H12"/></svg>',
    note: '<svg viewBox="0 0 14 14"><path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h5.5"/></svg>',
    rep: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 7.25a5.25 5.25 0 0 1 9.1-3.3l1.4 1.3M13.25 2.25v3h-3M13.25 8.75a5.25 5.25 0 0 1-9.1 3.3l-1.4-1.3M2.75 13.75v-3h3"/></svg>',
    journal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.75h10.75c.55 0 1 .45 1 1v14.5c0 .55-.45 1-1 1H6.5a1.75 1.75 0 0 1-1.75-1.75V5.5c0-.97.78-1.75 1.75-1.75Z"/><path d="M9 8h6M9 11.5h4"/></svg>',
    send: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 9.75V2.25M5.25 5 8 2.25 10.75 5M5.5 7H4.5c-.83 0-1.5.67-1.5 1.5v4c0 .83.67 1.5 1.5 1.5h7c.83 0 1.5-.67 1.5-1.5v-4c0-.83-.67-1.5-1.5-1.5h-1"/></svg>',
    float:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.2" width="12" height="9.6" rx="2"/><rect x="8" y="7.2" width="4" height="3.6" rx=".8" fill="currentColor" stroke="none"/></svg>',
    undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.75 3.25 2.5 6.5l3.25 3.25"/><path d="M2.75 6.5h6.5a3.75 3.75 0 0 1 0 7.5H7.5"/></svg>',
    redo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10.25 3.25 3.25 3.25-3.25 3.25"/><path d="M13.25 6.5h-6.5a3.75 3.75 0 0 0 0 7.5H8.5"/></svg>',
    down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M2.75 11.5v.75c0 .69.56 1.25 1.25 1.25h8c.69 0 1.25-.56 1.25-1.25v-.75"/></svg>',
    up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10.25V2.75M4.75 6 8 2.75 11.25 6M2.75 11.5v.75c0 .69.56 1.25 1.25 1.25h8c.69 0 1.25-.56 1.25-1.25v-.75"/></svg>',
    lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.25" y="7" width="9.5" height="6.75" rx="1.75"/><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7"/></svg>',
    unlock:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.25" y="7" width="9.5" height="6.75" rx="1.75"/><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.35-.9"/></svg>',
    install:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.75" y="2.75" width="10.5" height="10.5" rx="3"/><path d="M8 5.5v5M5.5 8h5"/></svg>',
    sun: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.75"/><path d="M8 1.75V3M8 13v1.25M14.25 8H13M3 8H1.75M12.42 3.58l-.88.88M4.46 11.54l-.88.88M12.42 12.42l-.88-.88M4.46 4.46l-.88-.88"/></svg>',
    moon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z"/></svg>',
    key: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.25" cy="10.75" r="2.75"/><path d="M7.2 8.8 13 3M10.75 5.25l1.75 1.75M9.25 6.75l1.25 1.25"/></svg>',
    cloud:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.75 12.75h6.6a2.9 2.9 0 0 0 .42-5.77 3.9 3.9 0 0 0-7.48.86 2.45 2.45 0 0 0 .46 4.91Z"/></svg>',
    finger:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.1 5.2A4.6 4.6 0 0 1 12 5.9M3.2 8.6a5 5 0 0 1 .4-2.1M12.9 8.3c0 1.8-.3 3.4-1 4.9M5.3 12.8c.4-1.1.6-2.4.6-3.7a2.1 2.1 0 0 1 4.2 0c0 1.7-.3 3.4-.9 4.8M8 9.1c0 1.9-.4 3.7-1.2 5.2"/></svg>',
  };
  const CK =
    '<i></i><svg viewBox="0 0 22 22"><circle class="rg" cx="11" cy="11" r="10.25"/><circle class="pr" cx="11" cy="11" r="10.25"/><path d="M6.6 11.4l3 3 5.8-6.3"/></svg>';
  const SCK =
    '<i></i><svg viewBox="0 0 18 18"><circle class="rg" cx="9" cy="9" r="8.25"/><path d="M5.3 9.3l2.5 2.5 4.8-5.2"/></svg>';
  const TAGRE = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_\-\/]*)/gu;
  const tagsOf = text => [...new Set([...String(text).matchAll(TAGRE)].map(m => m[2].toLowerCase()))];
  const tcol = g => (S.tags && S.tags[g]) || '',
    cAttr = g => (tcol(g) ? ` data-c="${tcol(g)}"` : ''),
    tdot = g => (tcol(g) ? `<i class="tdot" data-c="${tcol(g)}" aria-hidden="true"></i>` : '');
  function titleHTML(text) {
    let h = '',
      last = 0;
    for (const m of String(text).matchAll(TAGRE)) {
      const i = m.index + m[1].length;
      h +=
        esc(text.slice(last, i)) +
        `<span class="tag" data-tag="${esc(m[2].toLowerCase())}"${cAttr(m[2].toLowerCase())}>#${esc(m[2])}</span>`;
      last = i + 1 + m[2].length;
    }
    return h + esc(text.slice(last));
  }
  const openIds = new Set();
  function makeRow(t) {
    const li = D().createElement('li');
    li.className = 'row';
    li.dataset.id = t.id;
    li.innerHTML = `<div class="card"><div class="in"><button class="ck" type="button" role="checkbox" aria-checked="false" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">${CK}</button><div class="tx"><span class="t"></span><button class="mt" type="button" hidden></button></div><div class="acts"><button class="ib mv" type="button" data-tip="Move to next day" aria-label="Move to next day">${IC.mv}</button><button class="ib rm" type="button" data-tip="Delete" aria-label="Delete">${IC.rm}</button><button class="ib ex" type="button" data-tip="Notes and sub-tasks" aria-label="Notes and sub-tasks" aria-expanded="false">${IC.ex}</button></div></div><div class="more" hidden><div class="mi"><div class="note is-empty" tabindex="0" role="textbox" aria-multiline="true" aria-label="Note" data-ph="Add a note"></div><ul class="subs"></ul><div class="sadd"><span class="plus" aria-hidden="true">${IC.plus}</span><input type="text" placeholder="Add a sub-task" aria-label="Add a sub-task" maxlength="300" enterkeyhint="done" autocomplete="off"></div><div class="cfoot"><button class="cb rbtn" type="button" aria-haspopup="dialog">${IC.rep}<span class="rlab">Repeat</span></button><button class="cb sbtn" type="button">${IC.send}<span>Send</span></button></div></div></div></div>`;
    return li;
  }
  function updateMeta(li, t) {
    const subs = t.subs || [],
      sd = subs.filter(s => s.done).length,
      ck = li.querySelector('.in .ck');
    const off = subs.length && !t.done ? (64.4 * (1 - sd / subs.length)).toFixed(2) : '64.4';
    if (ck.style.getPropertyValue('--off') !== off) ck.style.setProperty('--off', off);
    const r = t.rule && S.rules[t.rule],
      mt = li.querySelector('.mt'),
      has = !!(subs.length || t.note || r);
    mt.hidden = !has;
    if (!has && mt.dataset.v) mt.innerHTML = mt.dataset.v = '';
    if (has) {
      const h =
        (r ? `<span class="rp">${IC.rep}${esc(ruleText(r, true))}</span>` : '') +
        (subs.length ? `<span>${IC.list}${sd}/${subs.length}</span>` : '') +
        (t.note ? `<span>${IC.note}</span>` : '');
      if (mt.dataset.v !== h) {
        mt.innerHTML = h;
        mt.dataset.v = h;
      }
      const lab = [
        r ? `repeats ${ruleText(r).toLowerCase()}` : '',
        subs.length ? `${sd}/${subs.length} sub-tasks done` : '',
        t.note ? 'has a note' : '',
      ]
        .filter(Boolean)
        .join(', ');
      mt.setAttribute('aria-label', lab[0].toUpperCase() + lab.slice(1) + ', show details');
    }
  }
  function renderSubs(li, t, animNew) {
    const ul = li.querySelector('.subs'),
      map = new Map(),
      added = [];
    for (const n of ul.children) if (!n.classList.contains('exit')) map.set(n.dataset.sid, n);
    let prev = null;
    for (const s of t.subs || []) {
      let n = map.get(s.id);
      if (n) map.delete(s.id);
      else {
        n = D().createElement('li');
        n.className = 'sub';
        n.dataset.sid = s.id;
        n.innerHTML = `<button class="ck sck" type="button" role="checkbox" aria-checked="false">${SCK}</button><div class="sx"><span class="st"></span></div><button class="ib srm" type="button" data-tip="Delete" aria-label="Delete sub-task">${IC.rm}</button>`;
        added.push(n);
      }
      n.classList.toggle('done', s.done);
      const c = n.querySelector('.sck');
      attr(c, 'aria-checked', s.done);
      attr(c, 'aria-label', s.text);
      const st = n.querySelector('.st');
      if (!st.isContentEditable && st.dataset.v !== s.text) {
        st.innerHTML = titleHTML(s.text);
        st.dataset.v = s.text;
      }
      let ref = prev ? prev.nextSibling : ul.firstChild;
      while (ref && ref.classList.contains('exit')) ref = ref.nextSibling;
      if (n !== ref) ul.insertBefore(n, ref);
      prev = n;
    }
    for (const n of map.values()) n.remove();
    if (animNew && li.classList.contains('open')) for (const n of added) growIn(n);
  }
  // set an attribute only when it changes: on a long day, needless writes add up to a slow frame
  function attr(el, name, v) {
    v = String(v);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }
  function updateRow(li, t) {
    li.classList.toggle('done', t.done);
    const ck = li.querySelector('.in .ck');
    attr(ck, 'aria-checked', t.done);
    attr(ck, 'aria-label', t.text);
    const sp = li.querySelector('.t');
    if (!sp.isContentEditable && sp.dataset.v !== t.text) {
      sp.innerHTML = titleHTML(t.text);
      sp.dataset.v = t.text;
    }
    const note = li.querySelector('.note');
    if (!note.isContentEditable && note.dataset.v !== (t.note || '')) {
      note.innerHTML = t.note || '';
      note.dataset.v = t.note || '';
      note.classList.toggle('is-empty', !t.note);
    }
    updateMeta(li, t);
    renderSubs(li, t, false);
    const rb = li.querySelector('.rbtn'),
      rr = t.rule && S.rules[t.rule],
      rl = rr ? ruleText(rr) : 'Repeat';
    if (rb.dataset.v !== rl) {
      rb.dataset.v = rl;
      rb.querySelector('.rlab').textContent = rl;
      rb.classList.toggle('on', !!rr);
      rb.setAttribute('aria-label', rr ? `Repeats ${rl.toLowerCase()}. Change` : 'Repeat this task');
    }
    const open = openIds.has(t.id);
    if (li.classList.contains('open') !== open) {
      li.classList.toggle('open', open);
      li.querySelector('.more').hidden = !open;
      li.querySelector('.ex').setAttribute('aria-expanded', open);
    }
  }
  function renderList(fresh) {
    queueMicrotask(cardGuard);
    const ae = D().activeElement,
      want = FX ? ordered(cur).filter(t => hasTag(t, FX)) : ordered(cur),
      map = new Map(),
      added = [];
    for (const n of $.list.children) if (!n.classList.contains('exit')) map.set(n.dataset.id, n);
    // from the last row up: a task that moves down (ticked) costs one move, not one for every row after it
    let next = null;
    for (let i = want.length - 1; i >= 0; i--) {
      const t = want[i];
      let n = map.get(t.id);
      if (n) map.delete(t.id);
      else {
        n = makeRow(t);
        added.push(n);
      }
      updateRow(n, t);
      let ref = next ? next.previousSibling : $.list.lastChild;
      while (ref && ref.classList.contains('exit')) ref = ref.previousSibling;
      if (n !== ref) $.list.insertBefore(n, next);
      next = n;
    }
    for (const n of map.values()) n.remove();
    if (ae && ae.isConnected && ae !== D().activeElement) ae.focus({ preventScroll: true });
    if (!fresh)
      for (const n of added)
        an(n, [
          { opacity: 0, transform: 'translateY(12px) scale(.98)' },
          { opacity: 1, transform: 'none' },
        ]);
    return added;
  }
  function flip(mutate, lifted) {
    calm(SP.dur + 150);
    const rows = [...$.list.children].filter(r => !r.classList.contains('exit'));
    const first = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));
    mutate();
    // Three passes, so the page lays out once: cancel the running moves, read every position, animate.
    // Only rows that are, or were, in view (with a margin) get an animation.
    D()
      .getAnimations()
      .forEach(a => a.id === 'flip' && a.cancel());
    const vr = $.sc.getBoundingClientRect(),
      near = y => y > vr.top - 240 && y < vr.bottom + 240,
      live = [...$.list.children].filter(r => !r.classList.contains('exit') && first.has(r.dataset.id)),
      tops = live.map(r => r.getBoundingClientRect().top);
    for (let i = 0; i < live.length; i++) {
      const r = live[i],
        f = first.get(r.dataset.id),
        top = tops[i];
      if (!near(f) && !near(top) && !(lifted && r === lifted.li)) continue;
      const dy = f - top,
        L = lifted && r === lifted.li;
      if (Math.abs(dy) < 0.5 && !L) continue;
      const a = L
        ? an(r, [{ transform: `translate(${lifted.x}px,${dy}px)` }, { transform: 'none' }], {
            easing: DROP.ease,
            duration: DROP.dur,
          })
        : an(r, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }]);
      if (a) a.id = 'flip';
    }
  }
  let resortT = null;
  function resortSoon(ms) {
    stop(resortT);
    resortT = later(() => {
      if ($.list.querySelector('.editing,.note.editing') || P) return resortSoon(400);
      flip(() => renderList());
    }, ms);
  }
  function overdue() {
    const tk = todayKey(),
      out = [];
    for (const k in S.days) if (k < tk) for (const t of S.days[k].tasks) if (!t.done && !t.rule) out.push([k, t]);
    return out;
  }
  function renderAux() {
    const { n } = status();
    $.empty.hidden = n > 0;
    const none = !!FX && n > 0 && !tasks(cur).some(t => hasTag(t, FX));
    $.fnone.hidden = !none;
    if (none) $.fnone.textContent = `No #${FX} tasks on this day.`;
    if (!n)
      $.empty.textContent =
        cur === todayKey() ? 'Nothing planned for today.' : `Nothing planned for ${WD.format(fromKey(cur))}.`;
    const od = cur === todayKey() ? overdue().length : 0;
    $.carry.hidden = !od;
    if (od) $.carryTxt.textContent = `${od} ${od > 1 ? 'tasks' : 'task'} left from before`;
  }
  function growIn(el) {
    const h = el.offsetHeight;
    el.style.overflow = 'hidden';
    then(
      an(el, [
        { height: '0px', opacity: 0 },
        { height: h + 'px', opacity: 1 },
      ]),
      () => {
        el.style.overflow = '';
      },
    );
  }
  function collapse(el, d) {
    el.classList.add('exit');
    el.style.overflow = 'hidden';
    el.inert = true;
    const h = el.offsetHeight;
    an(
      el.firstElementChild,
      [
        { transform: 'none', opacity: 1 },
        { transform: `translateX(${d * 56}px)`, opacity: 0 },
      ],
      { duration: SNAP.dur * 0.7, easing: SNAP.ease, fill: 'forwards' },
    );
    then(
      an(el, [{ height: h + 'px' }, { height: '0px' }], {
        delay: 90,
        duration: SNAP.dur,
        easing: SNAP.ease,
        fill: 'forwards',
      }),
      () => el.remove(),
    );
  }
  function flash(li) {
    const f = D().createElement('div');
    f.className = 'flash';
    li.firstElementChild.append(f);
    then(
      an(f, [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], {
        duration: 1500,
        easing: 'ease-in-out',
      }),
      () => f.remove(),
    );
  }

  /* task actions */
  function addTask(text) {
    if (FX && !tagsOf(text).includes(FX)) text += ' #' + FX;
    const k = addDay();
    if (addRule) {
      addRepeating(text, k);
      return resetPick();
    }
    if (k !== cur) {
      addElsewhere(text, k);
      return resetPick();
    }
    record([cur]);
    const t = { id: uid(), text, done: false };
    day(cur).tasks.push(t);
    commit(cur);
    const had = !$.empty.hidden;
    flip(() => {
      renderList();
      renderAux();
    });
    const li = rowOf(t.id);
    if (li) li.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
    if (had) an(li, [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
  }
  function toggle(id) {
    const t = find(id);
    if (!t) return;
    stopSeal();
    record([cur]);
    t.done = !t.done;
    if (t.done) t.at = Date.now();
    else delete t.at;
    commit(cur);
    const li = rowOf(id);
    updateRow(li, t);
    // the last task of a day that counts (today or before, nothing carried from it): the day is sealed, and its count
    // waits for its moment
    const seals = t.done && cur <= todayKey() && !(S.days[cur] && S.days[cur].moved) && tasks(cur).every(x => x.done);
    if (seals) DDHOLD++;
    const { n, dn } = status();
    if (t.done)
      an(li.querySelector('.in .ck'), [{ transform: 'scale(.8)' }, { transform: 'none' }], {
        easing: POP.ease,
        duration: POP.dur,
      });
    if (t.done && t.rule)
      an(li.querySelector('.mt .rp svg'), [{ transform: 'rotate(-360deg)' }, { transform: 'none' }], {
        easing: SP.ease,
        duration: SP.dur * 1.4,
      });
    if (seals) sealDay(li);
    else if (t.done && n && dn === n)
      an($.num, [{ transform: 'translateY(-7px)' }, { transform: 'none' }], {
        easing: POP.ease,
        duration: POP.dur,
        delay: 120,
      });
    // a sealed day takes its new order while the check's scrim hides the list
    resortSoon(seals && !RM.matches ? 1000 : t.done ? 560 : 260);
  }
  function removeTask(id, how) {
    const k = cur,
      nk = addDays(k, 1),
      arr = tasks(k),
      i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    record(how === 'mv' ? [k, nk] : [k]);
    const [t] = arr.splice(i, 1);
    const rr = t.rule && S.rules[t.rule];
    if (rr) (rr.skip || (rr.skip = [])).push(k);
    if (how === 'mv') {
      // carried on from a day gone by: that day was not done in full. On its own day, even in the evening, putting a
      // task off is the person's call, and ahead it is only planning: neither leaves a mark.
      if (!t.done && k < todayKey()) day(k).moved = 1;
      t.done = false;
      delete t.at;
      delete t.rule;
      day(nk).tasks.push(t);
      commit(nk);
      nudge($.next, 1);
    }
    commit(k);
    const li = rowOf(id);
    if (li) collapse(li, how === 'mv' ? 1 : -1);
    const wasEmpty = $.empty.hidden;
    renderAux();
    if (wasEmpty && !$.empty.hidden)
      an($.empty, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        delay: 220,
        fill: 'backwards',
        easing: 'ease',
      });
    toast(how === 'mv' ? `Moved to ${WD.format(fromKey(nk))}` : `Deleted “${t.text}”`, 'undo');
  }
  function setOrder(ids) {
    const d = day(cur),
      full = d.tasks.filter(t => !t.done).map(t => t.id),
      vis = new Set(ids);
    // a filtered list moves its tasks among their own places; the tasks it hides stay where they are
    let i = 0;
    const order = ids.length < full.length ? full.map(id => (vis.has(id) ? ids[i++] : id)) : ids,
      open = order.map(id => d.tasks.find(t => t.id === id)).filter(Boolean);
    if (open.map(t => t.id).join() === full.join()) return false;
    record([cur]);
    d.tasks = [...open, ...d.tasks.filter(t => t.done)];
    commit(cur);
    return true;
  }
  function reorder(id, dir) {
    const ids = tasks(cur)
        .filter(t => !t.done && (!FX || hasTag(t, FX)))
        .map(t => t.id),
      i = ids.indexOf(id),
      j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    if (setOrder(ids)) flip(() => renderList());
  }
  function bringHere() {
    const od = overdue();
    if (!od.length) return;
    const keys = [...new Set(od.map(x => x[0]))];
    record([...keys, cur]);
    const moving = [];
    for (const k of keys) {
      const d = day(k);
      // what was left open comes here, as many as the line said; repeats stay on their day (a missed one never piles
      // up), and the day keeps a mark: what it left undone went elsewhere, so it can't count as a full day
      moving.push(...d.tasks.filter(t => !t.done && !t.rule));
      d.tasks = d.tasks.filter(t => t.done || t.rule);
      d.moved = 1;
      commit(k);
    }
    day(cur).tasks.unshift(...moving);
    commit(cur);
    flip(() => {
      renderList();
      renderAux();
    });
    toast(`Moved ${moving.length} ${moving.length > 1 ? 'tasks' : 'task'} to today`, 'undo');
  }
  function nudge(b, d) {
    an(b, [{ transform: `translateX(${d * 5}px)` }, { transform: 'none' }], {
      easing: POP.ease,
      duration: POP.dur,
    });
  }

  /* repeating tasks: an occurrence is made when its day is shown, today or later. Past days are left
     alone, so a missed occurrence never piles up, and deleting one skips that day for good. */
  const occId = (r, k) => r.id + '-' + k.replace(/-/g, '');
  function occurs(r, k) {
    if (k < r.start || (r.until && k > r.until) || (r.skip && r.skip.includes(k))) return false;
    const n = diff(r.start, k);
    if (r.freq === 'day') return n % r.every === 0;
    if (r.freq === 'week')
      return r.days.includes(wdOf(k)) && Math.floor((n + wdOf(r.start)) / 7) % r.every === 0;
    const d = fromKey(k),
      s = fromKey(r.start),
      m = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
    if (m % r.every) return false;
    if (r.nth != null)
      return (
        d.getDay() === s.getDay() &&
        (r.nth === -1 ? d.getDate() + 7 > dimOf(d) : Math.ceil(d.getDate() / 7) === r.nth)
      );
    return d.getDate() === Math.min(s.getDate(), dimOf(d));
  }
  function fromRule(r, k) {
    const t = { id: occId(r, k), text: r.text, done: false, rule: r.id };
    if (r.note) t.note = r.note;
    if (r.subs) t.subs = r.subs.map(x => ({ id: uid(), text: x.text, done: false }));
    return t;
  }
  function ensure(k) {
    if (k < todayKey()) return false;
    let added = false;
    for (const r of Object.values(S.rules)) {
      if (!occurs(r, k) || tasks(k).some(t => t.rule === r.id)) continue;
      day(k).tasks.push(fromRule(r, k));
      added = true;
    }
    if (added) persist();
    return added;
  }
  function nextOcc(r, from) {
    for (let i = 0, k = from; i < 800; i++, k = addDays(k, 1)) if (occurs(r, k)) return k;
    return null;
  }
  const WDL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    WDS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    NTH = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' },
    NTHS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', '-1': 'Last' },
    AND = new Intl.ListFormat('en-GB', { type: 'conjunction' }),
    ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  // "Every Monday and Thursday", "Every 2 weeks on weekdays", "Every month on the third Saturday", and, for a rule that
  // ends (one from a link), ", until Friday 4 December". Short: "Mon, Thu", "Every 2 weeks", "3rd Sat".
  function ruleText(r, short) {
    return ruleWords(r, short) + (!short && r.until ? `, until ${dayName(r.until)}` : '');
  }
  function ruleWords(r, short) {
    const e = r.every;
    if (r.freq === 'day') return e === 1 ? (short ? 'Daily' : 'Every day') : `Every ${e} days`;
    if (r.freq === 'week') {
      const d = r.days.join(),
        set = d === '0,1,2,3,4' ? 'weekday' : d === '5,6' ? 'weekend' : d === '0,1,2,3,4,5,6' ? 'day' : null,
        names = AND.format(r.days.map(i => WDL[i]));
      if (e === 1) {
        if (set === 'day') return short ? 'Daily' : 'Every day';
        if (set) return short ? (set === 'weekday' ? 'Weekdays' : 'Weekends') : `Every ${set}`;
        return short ? (r.days.length === 1 ? `Every ${WDS[r.days[0]]}` : r.days.map(i => WDS[i]).join(', ')) : `Every ${names}`;
      }
      return short ? `Every ${e} weeks` : `Every ${e} weeks on ${set ? set + 's' : names}`;
    }
    const s = fromKey(r.start),
      wd = wdOf(r.start);
    if (e % 12 === 0) {
      const y = e / 12;
      if (short) return y === 1 ? 'Yearly' : `Every ${y} years`;
      const on = r.nth != null ? `the ${NTH[r.nth]} ${WDL[wd]} of ${MON.format(s)}` : `${s.getDate()} ${MON.format(s)}`;
      return `${y === 1 ? 'Every year' : `Every ${y} years`} on ${on}`;
    }
    if (short)
      return e > 1
        ? `Every ${e} months`
        : r.nth != null
          ? `${NTHS[r.nth]} ${WDS[wd]}`
          : `Monthly, ${s.getDate() === 31 ? 'last day' : ord(s.getDate())}`;
    // from the 31st, every month has it on its last day
    const on = r.nth != null ? `the ${NTH[r.nth]} ${WDL[wd]}` : s.getDate() === 31 ? 'the last day' : `the ${ord(s.getDate())}`;
    return e === 1 ? `Every month on ${on}` : `Every ${e} months on ${on}`;
  }
  function addRepeating(text, k) {
    const r = cleanRule({ ...addRule, text, start: k }, 'r' + uid());
    if (!r) return;
    record([k]);
    S.rules[r.id] = r;
    const here = occurs(r, k);
    if (here) day(k).tasks.push(fromRule(r, k));
    commit(k);
    const first = nextOcc(r, k);
    if (here && k === cur) {
      flip(() => {
        renderList();
        renderAux();
      });
      const li = rowOf(occId(r, k));
      if (li) li.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
    } else if (first) {
      const d = Math.sign(diff(cur, first)) || 1;
      nudge(d > 0 ? $.next : $.prev, d);
    }
    toast(`${ruleText(r)}, from ${first ? dayName(first) : dayName(k)}`, 'undo');
  }
  // Undone occurrences still to come, which a change of rule replaces.
  const ahead = (id, k) =>
    Object.keys(S.days).filter(d => d > k && S.days[d].tasks.some(x => x.rule === id && !x.done));
  function dropAhead(id, keys) {
    for (const d of keys) {
      S.days[d].tasks = S.days[d].tasks.filter(x => !(x.rule === id && !x.done));
      commit(d);
    }
  }
  // Make a task repeat from its day, or change how it repeats.
  function setRule(t, f) {
    const old = t.rule && S.rules[t.rule],
      id = old ? old.id : 'r' + uid(),
      later_ = old ? ahead(id, cur) : [];
    record([cur, ...later_]);
    const r = cleanRule({ ...f, until: old ? old.until : undefined, text: t.text, note: t.note, subs: t.subs, start: cur }, id);
    if (!r) return;
    dropAhead(id, later_);
    S.rules[id] = r;
    t.rule = id;
    commit(cur);
    const li = rowOf(t.id);
    if (li) updateRow(li, t);
    toast(ruleText(r), 'undo');
  }
  function stopRule(t) {
    const r = S.rules[t.rule];
    if (!r) {
      delete t.rule;
      return;
    }
    const later_ = ahead(r.id, cur);
    record([cur, ...later_]);
    dropAhead(r.id, later_);
    delete S.rules[r.id];
    for (const d in S.days) for (const x of S.days[d].tasks) if (x.rule === r.id) delete x.rule;
    commit(cur);
    const li = rowOf(t.id);
    if (li) updateRow(li, t);
    toast('Stopped repeating', 'undo');
  }

  /* sub-tasks */
  function subDo(li, fn) {
    const t = find(li.dataset.id);
    if (!t) return null;
    record([cur]);
    t.subs = t.subs || [];
    fn(t);
    if (!t.subs.length) delete t.subs;
    commit(cur);
    updateMeta(li, t);
    return t;
  }
  function addSub(li, text) {
    const s = { id: uid(), text, done: false },
      t = subDo(li, t => t.subs.push(s));
    if (t) renderSubs(li, t, true);
  }
  function toggleSub(li, sid) {
    let s = null;
    const t = subDo(li, t => {
      s = t.subs.find(x => x.id === sid);
      if (s) s.done = !s.done;
    });
    if (!t || !s) return;
    const n = subOf(li, sid);
    n.classList.toggle('done', s.done);
    n.querySelector('.sck').setAttribute('aria-checked', s.done);
    if (s.done)
      an(n.querySelector('.sck'), [{ transform: 'scale(.75)' }, { transform: 'none' }], {
        easing: POP.ease,
        duration: POP.dur,
      });
  }
  function removeSub(li, sid) {
    const t = subDo(li, t => {
      t.subs = t.subs.filter(x => x.id !== sid);
    });
    const n = subOf(li, sid);
    if (n) collapse(n, -1);
    if (t) toast('Sub-task deleted', 'undo');
  }

  /* details panel */
  function setOpen(li, open, focusNote) {
    const id = li.dataset.id,
      more = li.querySelector('.more'),
      mi = more.firstElementChild;
    if (open) openIds.add(id);
    else openIds.delete(id);
    if (li.classList.contains('open') === open) {
      if (open && focusNote) editNote(li);
      return;
    }
    hideTip(0);
    more.getAnimations().forEach(a => a.cancel());
    li.classList.toggle('open', open);
    li.querySelector('.ex').setAttribute('aria-expanded', open);
    cardGuard();
    if (open) {
      more.hidden = false;
      const h = more.scrollHeight;
      more.style.overflow = 'hidden';
      then(an(more, [{ height: '0px' }, { height: h + 'px' }]), () => {
        more.style.overflow = '';
      });
      [...mi.children].forEach((c, i) =>
        an(
          c,
          [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'none' },
          ],
          { delay: 50 + i * 45, fill: 'backwards' },
        ),
      );
      if (focusNote) editNote(li);
      else
        later(() => {
          if (li.isConnected)
            li.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
        }, SP.dur * 0.6);
    } else {
      const ae = D().activeElement;
      if (ae && more.contains(ae)) ae.blur();
      const h = more.offsetHeight;
      more.style.overflow = 'hidden';
      const a = an(
        more,
        [
          { height: h + 'px', opacity: 1 },
          { height: '0px', opacity: 0 },
        ],
        { easing: SNAP.ease, duration: SNAP.dur, fill: 'forwards' },
      );
      then(a, () => {
        if (!li.classList.contains('open')) more.hidden = true;
        more.style.overflow = '';
        if (a) a.cancel();
      });
    }
  }
  function editNote(li) {
    const n = li.querySelector('.note');
    n.focus({ preventScroll: true });
    const r = D().createRange();
    r.selectNodeContents(n);
    r.collapse(false);
    const s = D().getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  let noteSnap = null,
    noteT = null;
  const cleanNote = h => {
    const s = sanitize(h);
    return htmlText(s).trim() ? s : '';
  };
  function saveNote(n) {
    const li = n.closest('.row'),
      t = li && find(li.dataset.id);
    if (!t) return;
    const h = cleanNote(n.innerHTML);
    if (h !== (t.note || '')) {
      if (h) t.note = h;
      else delete t.note;
      commit(cur);
      updateMeta(li, t);
    }
  }
  function noteChanged(n) {
    n.classList.toggle('is-empty', !n.textContent.replace(/​/g, '').trim() && !n.querySelector('li'));
    stop(noteT);
    noteT = later(() => saveNote(n), 600);
  }
  function endNote(n) {
    if (!n.isContentEditable) return;
    stop(noteT);
    n.removeAttribute('contenteditable');
    n.classList.remove('editing');
    hideFmt();
    hideLb();
    linkify(n);
    const li = n.closest('.row'),
      t = li && find(li.dataset.id);
    if (!t) return;
    saveNote(n);
    if ((t.note || '') !== (n.dataset.orig || '') && noteSnap) pushUndo(noteSnap);
    noteSnap = null;
    n.innerHTML = t.note || '';
    n.dataset.v = t.note || '';
    n.classList.toggle('is-empty', !t.note);
    updateMeta(li, t);
  }
  const URLRE = /((?:https?:\/\/|www\.)[^\s<]*[^\s<.,;:!?)\]'"»])/gi;
  function linkify(root) {
    const d = root.ownerDocument,
      w = d.createTreeWalker(root, 4),
      nodes = [];
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.parentElement.closest('a,code')) continue;
      URLRE.lastIndex = 0;
      if (URLRE.test(n.nodeValue)) nodes.push(n);
    }
    for (const n of nodes) {
      const s = n.nodeValue,
        f = d.createDocumentFragment();
      let last = 0;
      URLRE.lastIndex = 0;
      let m;
      while ((m = URLRE.exec(s))) {
        const h = safeUrl(m[1]);
        if (!h) continue;
        f.append(s.slice(last, m.index));
        const a = d.createElement('a');
        a.href = h;
        a.textContent = m[1];
        f.append(a);
        last = m.index + m[1].length;
      }
      f.append(s.slice(last));
      n.replaceWith(f);
    }
  }
  function liveLink() {
    const sel = D().getSelection();
    if (!sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== 3 || n.parentElement.closest('a,code')) return;
    const off = sel.anchorOffset,
      m = n.nodeValue.slice(0, off).match(/((?:https?:\/\/|www\.)\S*[^\s.,;:!?)\]'"»])[\s ]$/i);
    if (!m) return;
    const h = safeUrl(m[1]);
    if (!h) return;
    const start = off - m[0].length,
      r = D().createRange();
    r.setStart(n, start);
    r.setEnd(n, start + m[1].length);
    const a = D().createElement('a');
    a.href = h;
    r.surroundContents(a);
    const after = a.nextSibling,
      nr = D().createRange();
    if (after && after.nodeType === 3) nr.setStart(after, 1);
    else nr.setStartAfter(a);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
  const MD = [
    [/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, 'b'],
    [/~~([^~\s](?:[^~]*[^~\s])?)~~$/, 's'],
    [/`([^`]+)`$/, 'code'],
    [/(?<![*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, 'i'],
    [/(?<![_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, 'i'],
  ];
  function mdInline() {
    const sel = D().getSelection();
    if (!sel.isCollapsed) return;
    const n = sel.anchorNode;
    if (!n || n.nodeType !== 3 || n.parentElement.closest('code')) return;
    const off = sel.anchorOffset,
      before = n.nodeValue.slice(0, off);
    for (const [re, tag] of MD) {
      const m = before.match(re);
      if (!m) continue;
      const r = D().createRange();
      r.setStart(n, off - m[0].length);
      r.setEnd(n, off);
      r.deleteContents();
      const el = D().createElement(tag);
      el.textContent = m[1];
      r.insertNode(el);
      const z = D().createTextNode('​');
      el.after(z);
      const nr = D().createRange();
      nr.setStart(z, 1);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }
  }
  function mdBlock(note) {
    const sel = D().getSelection(),
      n = sel.anchorNode;
    if (!sel.isCollapsed || !n || n.nodeType !== 3) return false;
    const off = sel.anchorOffset,
      pre = n.nodeValue.slice(0, off).replace(/ /g, ' ');
    if (!/^([-*]|1\.) $/.test(pre)) return false;
    const blk = n.parentElement.closest('div,li,.note'),
      inLi = blk.closest('li');
    if (!note.contains(blk) || (inLi && note.contains(inLi))) return false;
    const r = D().createRange();
    r.setStart(blk, 0);
    r.setEnd(n, off);
    if (r.toString().replace(/ /g, ' ') !== pre) return false;
    const del = D().createRange();
    del.setStart(n, 0);
    del.setEnd(n, off);
    del.deleteContents();
    D().execCommand(pre[0] === '1' ? 'insertOrderedList' : 'insertUnorderedList');
    return true;
  }

  /* format bar and link bubble */
  let fmtRange = null;
  const noteOf = node => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const n = el && el.closest('.note');
    return n && n.isContentEditable && app.contains(n) ? n : null;
  };
  const closestA = node => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return el && el.closest('.note a');
  };
  function place(el, rect, prefer) {
    const w = el.offsetWidth,
      h = el.offsetHeight,
      vw = W().innerWidth,
      vh = W().innerHeight,
      g = 8;
    let x = Math.round(Math.max(8, Math.min(vw - w - 8, rect.left + rect.width / 2 - w / 2))),
      up = prefer === 'up';
    if (up && rect.top - g - h < 8) up = false;
    else if (!up && rect.bottom + g + h > vh - 8) up = true;
    const y = Math.round(Math.max(8, Math.min(vh - h - 8, up ? rect.top - g - h : rect.bottom + g)));
    if (!el.classList.contains('on')) {
      el.style.transition = 'none';
      el.style.setProperty('--x', x + 'px');
      el.style.setProperty('--y', y + (up ? 6 : -6) + 'px');
      el.style.transformOrigin = `50% ${up ? '100%' : '0'}`;
      el.offsetWidth;
      el.style.transition = '';
    }
    el.style.setProperty('--x', x + 'px');
    el.style.setProperty('--y', y + 'px');
    el.classList.add('on');
  }
  function onSel() {
    if ($.fmt.classList.contains('linking')) return;
    const sel = D().getSelection();
    if (!sel || !sel.rangeCount) {
      hideFmt();
      hideLb();
      return;
    }
    const note = noteOf(sel.anchorNode);
    if (note && !sel.isCollapsed && sel.toString().trim()) {
      const r = sel.getRangeAt(0),
        d = D();
      $.fmt.querySelectorAll('[data-c]').forEach(b => {
        const c = b.dataset.c;
        let on = false;
        try {
          on =
            c === 'code'
              ? !!(sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('code'))
              : c === 'link'
                ? !!closestA(sel.anchorNode)
                : d.queryCommandState(c);
        } catch (e) {}
        b.classList.toggle('act', on);
      });
      place($.fmt, r.getBoundingClientRect(), 'up');
      hideLb();
      hideTip(0);
    } else {
      hideFmt();
      const a = note && sel.isCollapsed && closestA(sel.anchorNode);
      const h = a && safeUrl(a.getAttribute('href'));
      if (h) {
        $.lbA.href = h;
        $.lbA.textContent = h.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        $.lb.dataset.on = '1';
        $.lb._a = a;
        place($.lb, a.getBoundingClientRect(), 'down');
      } else hideLb();
    }
  }
  function hideFmt() {
    $.fmt.classList.remove('on', 'linking');
  }
  function hideLb() {
    $.lb.classList.remove('on');
    $.lb._a = null;
  }
  function toggleCode() {
    const d = D(),
      sel = d.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0),
      c0 = r.commonAncestorContainer,
      anc = (c0.nodeType === 1 ? c0 : c0.parentElement).closest('code');
    if (anc) {
      const tn = d.createTextNode(anc.textContent);
      anc.replaceWith(tn);
      const nr = d.createRange();
      nr.selectNodeContents(tn);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }
    const text = r.toString();
    if (!text) return;
    const c = d.createElement('code');
    c.textContent = text;
    r.deleteContents();
    r.insertNode(c);
    const nr = d.createRange();
    nr.selectNodeContents(c);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
  function linkMode() {
    const sel = D().getSelection();
    if (!sel.rangeCount) return;
    const note = noteOf(sel.anchorNode);
    if (!note) return;
    if (closestA(sel.anchorNode)) {
      D().execCommand('unlink');
      noteChanged(note);
      onSel();
      return;
    }
    fmtRange = sel.getRangeAt(0).cloneRange();
    if (!$.fmt.classList.contains('on')) place($.fmt, fmtRange.getBoundingClientRect(), 'up');
    $.fmt.classList.add('linking');
    $.fmtIn.value = '';
    $.fmtIn.focus({ preventScroll: true });
    const vw = W().innerWidth,
      x = parseFloat($.fmt.style.getPropertyValue('--x')) || 8;
    $.fmt.style.setProperty('--x', Math.max(8, Math.min(vw - 268, x)) + 'px');
  }
  function applyLink() {
    const u = safeUrl($.fmtIn.value),
      r = fmtRange,
      note = r && noteOf(r.startContainer);
    $.fmt.classList.remove('linking');
    hideFmt();
    if (!note) return;
    note.focus({ preventScroll: true });
    const sel = D().getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    if (u) D().execCommand('createLink', false, u);
    sel.collapseToEnd();
    noteChanged(note);
  }
  $.fmt.addEventListener('pointerdown', e => {
    if (e.target !== $.fmtIn) e.preventDefault();
  });
  $.fmt.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = b.dataset.c,
      sel = D().getSelection(),
      note = sel.rangeCount && noteOf(sel.anchorNode);
    if (!note) return;
    if (c === 'link') {
      if ($.fmt.classList.contains('linking')) applyLink();
      else linkMode();
      return;
    }
    if (c === 'code') toggleCode();
    else {
      D().execCommand('styleWithCSS', false, false);
      D().execCommand(c, false, null);
    }
    noteChanged(note);
    onSel();
  });
  $.fmtIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const r = fmtRange,
        n = r && noteOf(r.startContainer);
      $.fmt.classList.remove('linking');
      hideFmt();
      if (n) {
        n.focus({ preventScroll: true });
        const s = D().getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }
    }
  });
  $.fmtIn.addEventListener('blur', e => {
    if (!$.fmt.classList.contains('linking')) return;
    const rt = e.relatedTarget;
    if (rt && ($.fmt.contains(rt) || (rt.closest && rt.closest('.note')))) return;
    $.fmt.classList.remove('linking');
    hideFmt();
    const n =
      fmtRange &&
      fmtRange.startContainer.parentElement &&
      fmtRange.startContainer.parentElement.closest('.note');
    if (n) endNote(n);
  });
  $.lb.addEventListener('pointerdown', e => e.preventDefault());
  $.lbRm.onclick = () => {
    const a = $.lb._a;
    if (!a) return;
    const n = a.closest('.note');
    a.replaceWith(...a.childNodes);
    hideLb();
    if (n) noteChanged(n);
  };
  const bindDoc = d => {
    d.addEventListener('selectionchange', onSel);
    d.addEventListener('pointerdown', e => onOutside(e), true);
  };

  /* editing titles and sub-tasks */
  let editSnap = null;
  function rangeAt(d, x, y) {
    if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      if (p) {
        const r = d.createRange();
        r.setStart(p.offsetNode, p.offset);
        return r;
      }
    } else if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
    return null;
  }
  function placeCaret(el, x, y) {
    const d = D(),
      sel = d.getSelection();
    let r = null;
    if (x != null) {
      const rs = [...el.getClientRects()].filter(c => c.width > 0);
      if (rs.length) {
        let b = rs[0],
          bd = 1e9;
        for (const c of rs) {
          const dd = y < c.top ? c.top - y : y > c.bottom ? y - c.bottom : 0;
          if (dd < bd) {
            bd = dd;
            b = c;
          }
        }
        if (!(b === rs[rs.length - 1] && x >= b.right - 2)) {
          r = rangeAt(d, Math.max(b.left + 1, Math.min(b.right - 1, x)), (b.top + b.bottom) / 2);
          if (r && !el.contains(r.startContainer)) r = null;
        }
      }
    }
    if (!r) {
      r = d.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
    } else r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function beginEdit(sp, x, y) {
    if (!sp || sp.isContentEditable) return;
    const host = sp.closest('.sub') || sp.closest('.row');
    if (!host || host.classList.contains('exit')) return;
    if (sp.classList.contains('t')) {
      const t = find(host.dataset.id);
      if (!t) return;
      sp.textContent = t.text;
      delete sp.dataset.v;
    } else {
      const t = find(sp.closest('.row').dataset.id),
        s = t && (t.subs || []).find(x => x.id === host.dataset.sid);
      if (!s) return;
      sp.textContent = s.text;
      delete sp.dataset.v;
    }
    hideTip(0);
    editSnap = snap([cur]);
    host.classList.add('editing');
    try {
      sp.contentEditable = 'plaintext-only';
    } catch (e) {}
    if (sp.contentEditable !== 'plaintext-only') sp.contentEditable = 'true';
    sp.focus({ preventScroll: true });
    placeCaret(sp, x, y);
  }
  function endEdit(sp, cancel) {
    const sub = sp.closest('.sub'),
      li = sp.closest('.row');
    (sub || li).classList.remove('editing');
    sp.removeAttribute('contenteditable');
    hideSug();
    const t = li && find(li.dataset.id);
    if (!t) return;
    const v = sp.textContent.replace(/\s+/g, ' ').trim();
    if (sub) {
      const s = (t.subs || []).find(x => x.id === sub.dataset.sid);
      if (!s) return;
      const showS = () => {
        sp.innerHTML = titleHTML(s.text);
        sp.dataset.v = s.text;
      };
      if (cancel || !v) {
        showS();
        if (!cancel && !v) removeSub(li, s.id);
        return;
      }
      if (v !== s.text) {
        pushUndo(editSnap);
        s.text = v;
        commit(cur);
      }
      showS();
      return;
    }
    const show = () => {
      sp.innerHTML = titleHTML(t.text);
      sp.dataset.v = t.text;
    };
    if (cancel) {
      show();
      return;
    }
    if (!v) {
      show();
      removeTask(t.id, 'rm');
      return;
    }
    if (v !== t.text) {
      pushUndo(editSnap);
      t.text = v;
      if (t.rule && S.rules[t.rule]) S.rules[t.rule].text = v;
      commit(cur);
    }
    show();
    updateRow(li, t);
  }

  /* list events */
  $.list.addEventListener('click', e => {
    const b = e.target.closest('button');
    const sub = e.target.closest('.sub'),
      li = e.target.closest('.row');
    if (!li || li.classList.contains('exit')) return;
    if (b) {
      if (b.classList.contains('sck')) toggleSub(li, sub.dataset.sid);
      else if (b.classList.contains('srm')) removeSub(li, sub.dataset.sid);
      else if (b.classList.contains('ck')) toggle(li.dataset.id);
      else if (b.classList.contains('mv')) removeTask(li.dataset.id, 'mv');
      else if (b.classList.contains('rm')) removeTask(li.dataset.id, 'rm');
      else if (b.classList.contains('ex') || b.classList.contains('mt'))
        setOpen(li, !li.classList.contains('open'));
      else if (b.classList.contains('rbtn')) repeatFor(li, b);
      else if (b.classList.contains('sbtn')) sendTask(find(li.dataset.id), b);
      return;
    }
    if (sub && !sub.classList.contains('exit')) {
      const tg = e.target.closest('.tag');
      if (tg && !sub.classList.contains('editing')) {
        openSearch('#' + tg.dataset.tag + ' ');
        return;
      }
      beginEdit(sub.querySelector('.st'), e.clientX, e.clientY);
    }
  });
  $.list.addEventListener('focusin', e => {
    const n = e.target;
    if (n.classList && n.classList.contains('note') && !n.isContentEditable) {
      n.contentEditable = 'true';
      n.classList.add('editing');
      noteSnap = snap([cur]);
      const t = find(n.closest('.row').dataset.id);
      n.dataset.orig = (t && t.note) || '';
    }
  });
  $.list.addEventListener('focusout', e => {
    const el = e.target;
    if (!el.classList) return;
    if ((el.classList.contains('t') || el.classList.contains('st')) && el.isContentEditable) {
      const c = el.dataset.cancel === '1';
      delete el.dataset.cancel;
      endEdit(el, c);
      return;
    }
    if (el.classList.contains('note') && el.isContentEditable) {
      const rt = e.relatedTarget;
      if (rt && ($.fmt.contains(rt) || $.lb.contains(rt))) return;
      endNote(el);
    }
    if (el.matches && el.matches('.sadd input')) hideSug();
  });
  $.list.addEventListener('input', e => {
    const t = e.target;
    if (!t.classList) return;
    if (t.classList.contains('note')) {
      if (e.inputType === 'insertText' && e.data) {
        if (e.data === ' ') {
          if (!mdBlock(t)) liveLink();
        } else if (/[*_`~]/.test(e.data)) mdInline();
      }
      noteChanged(t);
      return;
    }
    if ((t.classList.contains('t') || t.classList.contains('st')) && t.isContentEditable) sugCheck(t);
    else if (t.matches && t.matches('.sadd input')) sugCheck(t);
  });
  $.list.addEventListener('paste', e => {
    const f = e.target;
    if (f.matches && f.matches('.sadd input')) {
      pasteList(e, items => {
        const li = f.closest('.row'),
          t0 = li && find(li.dataset.id);
        if (!t0) return;
        const room = 100 - (t0.subs ? t0.subs.length : 0),
          ss = items.slice(0, Math.max(0, room)).map(it => ({ id: uid(), text: it.text.slice(0, 300), done: it.done }));
        if (!ss.length) return toast('This task has all the sub-tasks it can hold');
        const t = subDo(li, x => x.subs.push(...ss));
        if (t) renderSubs(li, t, true);
        toast(`Added ${ss.length} sub-tasks`, 'undo');
      });
      return;
    }
    const t = e.target.closest && e.target.closest('[contenteditable]');
    if (!t) return;
    e.preventDefault();
    const txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!txt) return;
    const d = D();
    if (t.classList.contains('note')) {
      const sel = d.getSelection(),
        u = /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(txt) ? safeUrl(txt.trim()) : null;
      if (u && !sel.isCollapsed) d.execCommand('createLink', false, u);
      else d.execCommand('insertText', false, txt);
      noteChanged(t);
    } else d.execCommand('insertText', false, txt.replace(/\s+/g, ' '));
  });
  $.list.addEventListener('keydown', e => {
    const el = e.target;
    if (!el.classList) return;
    if (el.classList.contains('t') && el.isContentEditable) {
      if (sugKey(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        el.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        el.dataset.cancel = '1';
        el.blur();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const li = el.closest('.row');
        el.blur();
        if (li.isConnected && !li.classList.contains('exit')) setOpen(li, true, true);
      }
      return;
    }
    if (el.classList.contains('st') && el.isContentEditable) {
      if (sugKey(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const li = el.closest('.row');
        el.blur();
        li.querySelector('.sadd input').focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        el.dataset.cancel = '1';
        el.blur();
      }
      return;
    }
    if (el.classList.contains('note') && el.isContentEditable) {
      const k = e.key.toLowerCase(),
        m = e.metaKey || e.ctrlKey;
      if (k === 'escape') {
        e.preventDefault();
        el.blur();
      } else if (m && k === 'e') {
        e.preventDefault();
        toggleCode();
        noteChanged(el);
        onSel();
      } else if (m && k === 'k') {
        e.preventDefault();
        if (!D().getSelection().isCollapsed) linkMode();
      } else if (m && e.shiftKey && (k === 's' || k === 'x')) {
        e.preventDefault();
        D().execCommand('strikeThrough');
        noteChanged(el);
        onSel();
      }
      return;
    }
    if (el.matches('.sadd input')) {
      if (sugKey(e)) return;
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const v = el.value.replace(/\s+/g, ' ').trim();
        if (v) {
          el.value = '';
          addSub(el.closest('.row'), v);
        }
      } else if (e.key === 'Escape') {
        el.value = '';
        el.blur();
      }
    }
  });

  /* pointer: tap to edit, drag to reorder, swipe between days */
  let P = null,
    ghostX = 0;
  $.vp.addEventListener('pointerdown', e => {
    if (e.button !== 0 || P) return;
    if (e.target.closest('button,input,.carry,.add,.more,[contenteditable]')) return;
    const li = e.target.closest('.row');
    if (li && li.classList.contains('exit')) return;
    const touch = e.pointerType === 'touch';
    if (!li && !touch) return;
    P = {
      li,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      pid: e.pointerId,
      touch,
      tgt: e.target,
      mode: null,
    };
    if (!touch)
      try {
        $.vp.setPointerCapture(e.pointerId);
      } catch (err) {}
    if (touch && li && !li.classList.contains('done')) {
      const p = P;
      p.timer = later(() => {
        if (P === p && !p.mode) begin(p);
      }, 340);
    }
  });
  $.vp.addEventListener('pointermove', e => {
    const p = P;
    if (!p || e.pointerId !== p.pid) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const dx = p.x - p.x0,
      dy = p.y - p.y0;
    if (!p.mode) {
      if (Math.hypot(dx, dy) < 6) return;
      stop(p.timer);
      if (p.touch) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          p.mode = 'swipe';
          try {
            $.vp.setPointerCapture(p.pid);
          } catch (err) {}
        } else {
          P = null;
          return;
        }
      } else if (p.li && !p.li.classList.contains('done')) begin(p);
      else p.mode = 'none';
    }
    if (p.mode === 'drag') {
      e.preventDefault();
      position(p);
    } else if (p.mode === 'swipe') {
      const r = dx * 0.55;
      $.stage.style.transform = `translateX(${r}px)`;
      $.stage.style.opacity = 1 - Math.min(Math.abs(r) / 320, 0.45);
    }
  });
  $.vp.addEventListener(
    'touchmove',
    e => {
      if (P && P.mode === 'drag' && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  function endPointer(e) {
    const p = P;
    if (!p || e.pointerId !== p.pid) return;
    P = null;
    stop(p.timer);
    try {
      $.vp.releasePointerCapture(p.pid);
    } catch (err) {}
    const ok = e.type === 'pointerup';
    if (p.mode === 'drag') return drop(p, !ok);
    if (p.mode === 'swipe') {
      const dx = p.x - p.x0,
        r = dx * 0.55;
      if (ok && Math.abs(dx) > 64) {
        ghostX = r;
        step(dx < 0 ? 1 : -1);
      } else {
        $.stage.style.transform = '';
        $.stage.style.opacity = '';
        an($.stage, [{ transform: `translateX(${r}px)` }, { transform: 'none' }]);
      }
      return;
    }
    if (!p.mode && ok && p.li) {
      tapped = { at: performance.now(), tgt: p.tgt };
      const tg = p.tgt.closest('.tag');
      if (tg) {
        openSearch('#' + tg.dataset.tag + ' ');
        return;
      }
      tapRow(p.li, p.tgt, e.clientX, e.clientY);
    }
  }
  /* A tap acts when the finger lifts (a task opens, a tag's search comes up), and that changes what lies under the
     finger: the click that follows lands on whatever is there now. On a phone that was the move or delete button of
     the task just opened, or the scrim behind search, which shut it again. That click is dropped, unless it falls
     on what was tapped, or on a link (a link in a title still opens). */
  let tapped = null;
  app.addEventListener(
    'click',
    e => {
      const t = tapped;
      tapped = null;
      if (!t || performance.now() - t.at > 700 || e.target.closest('a[href]')) return;
      // a button the finger was not on (it appeared under it) is not pressed
      const b = e.target.closest('button');
      if (!(b && !b.contains(t.tgt)) && (t.tgt === e.target || t.tgt.contains(e.target) || e.target.contains(t.tgt))) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  // A click on a task opens its card. A click on the title of an open task, or a double-click, edits the title.
  let lastTap = null;
  function tapRow(li, tgt, x, y) {
    const now = performance.now(),
      dbl = !!lastTap && lastTap.li === li && now - lastTap.t < 400;
    lastTap = dbl ? null : { li, t: now };
    const open = li.classList.contains('open');
    if (dbl || (open && tgt.closest('.t'))) {
      if (!open) setOpen(li, true);
      beginEdit(li.querySelector('.t'), x, y);
    } else setOpen(li, !open);
  }
  $.vp.addEventListener('pointerup', endPointer);
  $.vp.addEventListener('pointercancel', endPointer);
  function begin(p) {
    const li = p.li;
    p.rows = [...$.list.children].filter(r => !r.classList.contains('exit') && !r.classList.contains('done'));
    p.idx = p.rows.indexOf(li);
    if (p.idx < 0) {
      p.mode = 'none';
      return;
    }
    p.mode = 'drag';
    hideTip(0);
    p.rows.forEach(r => r.getAnimations().forEach(a => a.finish()));
    p.rects = p.rows.map(r => r.getBoundingClientRect());
    p.h = p.rects[p.idx].height;
    p.target = p.idx;
    p.s0 = $.sc.scrollTop;
    li.classList.add('lift');
    app.classList.add('dragging');
    for (const r of p.rows) if (r !== li) r.classList.add('shift');
    try {
      D().getSelection().removeAllRanges();
    } catch (e) {}
    if (p.touch && navigator.vibrate) navigator.vibrate(8);
    if (p.touch)
      try {
        $.vp.setPointerCapture(p.pid);
      } catch (e) {}
    const w = W(),
      card = li.firstElementChild,
      tick = () => {
        if (P !== p) return;
        const vx = p.x - (p.lx == null ? p.x : p.lx);
        p.lx = p.x;
        p.tv = (p.tv || 0) * 0.8 + vx * 0.2;
        const tl = Math.max(-3.5, Math.min(3.5, p.tv * 0.45));
        if (Math.abs(tl - (p.tl || 0)) > 0.02) {
          p.tl = tl;
          card.style.setProperty('--tilt', tl.toFixed(2) + 'deg');
        }
        const sr = $.sc.getBoundingClientRect();
        let v = 0;
        if (p.y < sr.top + 40) v = -Math.ceil((sr.top + 40 - p.y) / 5);
        else if (p.y > sr.bottom - 96) v = Math.ceil((p.y - sr.bottom + 96) / 5);
        if (v) {
          const b = $.sc.scrollTop;
          $.sc.scrollTop += Math.max(-18, Math.min(18, v));
          if ($.sc.scrollTop !== b) position(p);
        }
        p.raf = w.requestAnimationFrame(tick);
      };
    p.raf = w.requestAnimationFrame(tick);
    position(p);
  }
  function position(p) {
    const { rects, idx } = p,
      r0 = rects[idx],
      lo = rects[0].top - r0.top,
      hi = rects[rects.length - 1].bottom - r0.bottom;
    let dy = p.y - p.y0 + ($.sc.scrollTop - p.s0);
    dy = dy < lo ? lo - (lo - dy) * 0.2 : dy > hi ? hi + (dy - hi) * 0.2 : dy;
    p.hx = Math.max(-16, Math.min(16, (p.x - p.x0) * 0.22));
    p.li.style.transform = `translate(${p.hx}px,${dy}px)`;
    const c = r0.top + r0.height / 2 + dy;
    let t = idx;
    for (let i = 0; i < idx; i++)
      if (c < rects[i].top + rects[i].height / 2) {
        t = i;
        break;
      }
    if (t === idx)
      for (let i = rects.length - 1; i > idx; i--)
        if (c > rects[i].top + rects[i].height / 2) {
          t = i;
          break;
        }
    if (t !== p.target) {
      p.target = t;
      p.rows.forEach((r, i) => {
        if (i === idx) return;
        const s = i > idx && i <= t ? -p.h : i < idx && i >= t ? p.h : 0;
        r.style.transform = s ? `translateY(${s}px)` : '';
      });
    }
  }
  function drop(p, cancelIt) {
    app.classList.remove('dragging');
    try {
      W().cancelAnimationFrame(p.raf);
    } catch (e) {}
    const { rows, idx } = p,
      target = cancelIt ? idx : p.target;
    if (target !== idx) {
      const ids = rows.map(r => r.dataset.id),
        [m] = ids.splice(idx, 1);
      ids.splice(target, 0, m);
      setOrder(ids);
    }
    p.li.firstElementChild.style.removeProperty('--tilt');
    flip(
      () => {
        for (const r of rows) {
          r.classList.remove('shift', 'lift');
          r.style.transform = '';
        }
        renderList();
      },
      { li: p.li, x: p.hx || 0 },
    );
  }
  function cancelDrag() {
    const p = P;
    P = null;
    if (!p) return;
    stop(p.timer);
    if (p.mode === 'drag') drop(p, true);
    $.stage.style.transform = '';
    $.stage.style.opacity = '';
  }

  /* days */
  function go(k, d) {
    if (k === cur) return;
    d = d || Math.sign(diff(cur, k)) || 1;
    const ae = D().activeElement;
    if (ae && (ae.isContentEditable || ae.matches('.sadd input'))) ae.blur();
    cancelDrag();
    closePops();
    stop(resortT);
    hideTip(0);
    hideSug();
    $.vp.querySelectorAll(':scope>.ghost').forEach(g => g.remove());
    if (!RM.matches) {
      const rv = $.vp.getBoundingClientRect(),
        rs = $.stage.getBoundingClientRect(),
        g = $.stage.cloneNode(true),
        op = +($.stage.style.opacity || 1);
      g.removeAttribute('id');
      g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      g.classList.add('ghost');
      g.setAttribute('aria-hidden', 'true');
      g.inert = true;
      Object.assign(g.style, {
        top: rs.top - rv.top - (parseFloat(getComputedStyle($.stage).transform.split(',')[5]) || 0) + 'px',
        left: $.sc.offsetLeft + parseFloat(getComputedStyle($.sc).paddingLeft) + 'px',
        width: rs.width + 'px',
        transform: '',
        opacity: '',
      });
      $.vp.append(g);
      an(g, [{ transform: `translateX(${ghostX}px)` }, { transform: `translateX(${ghostX - d * 64}px)` }]);
      g.animate([{ opacity: op }, { opacity: 0 }], {
        duration: 190,
        easing: 'ease-out',
        fill: 'forwards',
      }).onfinish = () => g.remove();
    }
    ghostX = 0;
    $.stage.style.transform = '';
    $.stage.style.opacity = '';
    cur = k;
    calm(SP.dur + 450);
    addTo = null;
    addRule = null;
    ensure(k);
    renderChip();
    $.sc.scrollTop = 0;
    renderHeader(d);
    $.list.textContent = '';
    renderList(true);
    renderAux();
    if (!RM.matches)
      [$.carry, ...$.list.children, $.empty]
        .filter(n => !n.hidden)
        .forEach((n, i) =>
          an(
            n,
            [
              { opacity: 0, transform: `translateX(${d * 36}px)` },
              { opacity: 1, transform: 'none' },
            ],
            { delay: 30 + Math.min(i, 10) * 26, fill: 'backwards' },
          ),
        );
  }
  function step(d) {
    go(addDays(cur, d), d);
    nudge(d > 0 ? $.next : $.prev, d);
  }
  $.prev.onclick = () => step(-1);
  $.next.onclick = () => step(1);
  $.todayb.onclick = () => go(todayKey());
  $.bring.onclick = bringHere;
  // shared by the month grids' own sideways wheel
  let wAcc = 0,
    wLock = false,
    wT = null;
  /* The wheel changes the day: up for the day before, down for the day after, sideways as on a trackpad.
     Up and down scroll the list first: only a gesture that starts with nothing to scroll that way changes
     the day, so reaching the top of a long list never flips it. One day per gesture (it ends after 200 ms
     without events); a notched mouse wheel moves one day per notch. */
  let gAcc = 0,
    gMode = null,
    gLast = 0,
    gStep = 0;
  function scrollsY(t, dy) {
    for (let n = t; n && n !== app && n.nodeType === 1; n = n.parentElement) {
      if (n.scrollHeight <= n.clientHeight + 1) continue;
      // the list counts even while it rests during an entrance (overflow hidden for a moment)
      const oy = getComputedStyle(n).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && !n.classList.contains('sc')) continue;
      if (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
    }
    return false;
  }
  function onWheel(e) {
    // a sent task waiting for an answer: only its own list scrolls, and nothing behind it moves
    if (app.classList.contains('inboxing')) {
      if (!e.ctrlKey && !(e.target.closest && e.target.closest('#inList') && scrollsY(e.target, e.deltaY))) e.preventDefault();
      return;
    }
    if (P || e.ctrlKey || $.srch.classList.contains('on') || popOn()) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1,
      dx = e.deltaX * k,
      dy = e.deltaY * k,
      side = Math.abs(dx) > Math.abs(dy),
      now = performance.now(),
      gap = now - gLast;
    gLast = now;
    if (gap > 200) {
      gMode = null;
      gAcc = 0;
    } else if (!side && gMode === 'done' && Math.abs(dy) >= 80 && gap >= 90 && now - gStep >= 180) {
      gMode = 'day';
      gAcc = 0;
    }
    if (!gMode) {
      const sc = e.target.closest && e.target.closest('.sc');
      if (side) gMode = 'day';
      // over the list: a long one keeps the wheel for itself, and a day still arriving takes no wheel
      else if (sc && (app.classList.contains('calm') || sc.scrollHeight > sc.clientHeight + 1)) gMode = 'scroll';
      else gMode = scrollsY(e.target, dy) ? 'scroll' : 'day';
    }
    if (gMode === 'scroll') return;
    e.preventDefault();
    if (gMode === 'done') return;
    gAcc += side ? dx : dy;
    if (Math.abs(gAcc) > 46) {
      gMode = 'done';
      gStep = now;
      step(gAcc > 0 ? 1 : -1);
    }
  }
  app.addEventListener('wheel', onWheel, { passive: false });
  // around the card too (the page, the footer), while the app is in this window
  window.addEventListener(
    'wheel',
    e => {
      if (D() === document && !app.contains(e.target) && !(e.target.closest && e.target.closest('#lock,#lockset'))) onWheel(e);
    },
    { passive: false },
  );

  /* popovers: month and timer */
  let popM = null,
    dpM = null;
  const popOn = () => ['pop', 'tpop', 'dpop', 'rpop', 'fpop', 'kpop'].some(id => $[id].classList.contains('on'));
  function gridHTML(m0, sel) {
    const y = m0.getFullYear(),
      m = m0.getMonth(),
      off = (new Date(y, m, 1).getDay() + 6) % 7,
      dim = new Date(y, m + 1, 0).getDate(),
      cells = Math.ceil((off + dim) / 7) * 7,
      tk = todayKey();
    let h = '<b>M</b><b>T</b><b>W</b><b>T</b><b>F</b><b>S</b><b>S</b>';
    for (let i = 0; i < cells; i++) {
      const dt = new Date(y, m, 1 - off + i),
        k = keyOf(dt),
        cls = [dt.getMonth() !== m && 'o', k === tk && 't', k === sel && 's', hasOpen(k) && 'has']
          .filter(Boolean)
          .join(' ');
      h += `<button type="button" data-k="${k}" class="${cls}" aria-label="${FULL.format(dt)}"${k === sel ? ' aria-current="date"' : ''} tabindex="${k === sel ? 0 : -1}">${dt.getDate()}</button>`;
    }
    return h;
  }
  function renderPop(d) {
    $.popT.textContent = MO.format(popM);
    $.grid.innerHTML = gridHTML(popM, cur);
    if (d)
      an($.grid, [
        { opacity: 0, transform: `translateX(${d * 18}px)` },
        { opacity: 1, transform: 'none' },
      ]);
  }
  function swipeMonths(grid, shift) {
    let s = null,
      wAcc = 0,
      wLock = false,
      wT = null;
    grid.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      s = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
    });
    grid.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x,
        dy = e.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          s = null;
          return;
        }
        s.on = true;
        try {
          grid.setPointerCapture(s.id);
        } catch (err) {}
      }
      grid.style.transform = `translateX(${dx * 0.6}px)`;
      grid.style.opacity = 1 - Math.min(Math.abs(dx) / 360, 0.5);
    });
    const end = e => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x,
        on = s.on;
      s = null;
      if (!on) return;
      grid.style.transform = '';
      grid.style.opacity = '';
      if (e.type === 'pointerup' && Math.abs(dx) > 48) shift(dx < 0 ? 1 : -1);
      else an(grid, [{ transform: `translateX(${dx * 0.6}px)` }, { transform: 'none' }]);
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    grid.addEventListener(
      'wheel',
      e => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
        e.preventDefault();
        e.stopPropagation();
        stop(wT);
        wT = later(() => {
          wAcc = 0;
          wLock = false;
        }, 220);
        if (wLock) return;
        wAcc += e.deltaX;
        if (Math.abs(wAcc) > 40) {
          wLock = true;
          shift(wAcc > 0 ? 1 : -1);
        }
      },
      { passive: false },
    );
  }
  function openMonth() {
    closePops();
    const d = fromKey(cur);
    popM = new Date(d.getFullYear(), d.getMonth(), 1);
    renderPop(0);
    $.pop.classList.add('on');
    guard('pops', () => closePops(true));
    $.meta.setAttribute('aria-expanded', 'true');
    const s = $.grid.querySelector('.s');
    if (s) s.focus({ preventScroll: true });
  }
  function openTimer() {
    closePops();
    $.tpop.classList.add('on');
    guard('pops', () => closePops(true));
    $.tmb.setAttribute('aria-expanded', 'true');
    $.mbTimer.setAttribute('aria-expanded', 'true');
    segRender(false);
    tmShowRun(TM.st !== 'idle', false);
    tpRender(0);
    tmRender(false);
    hideTip(0);
    (TM.st === 'idle' ? $.tstart : $.tpause).focus({ preventScroll: true });
    syncScrim();
  }
  function closePops(back) {
    unguard('pops');
    const wasF = $.fpop.classList.contains('on');
    $.fpop.classList.remove('on');
    $.fbtn.setAttribute('aria-expanded', 'false');
    if (back && wasF) $.fbtn.focus({ preventScroll: true });
    const wasK = $.kpop.classList.contains('on');
    $.kpop.classList.remove('on');
    $.kb.setAttribute('aria-expanded', 'false');
    if (back && wasK) $.kb.focus({ preventScroll: true });
    const wasM = $.pop.classList.contains('on'),
      wasT = $.tpop.classList.contains('on'),
      wasD = $.dpop.classList.contains('on'),
      wasR = $.rpop.classList.contains('on');
    $.pop.classList.remove('on');
    $.tpop.classList.remove('on');
    $.dpop.classList.remove('on');
    $.rpop.classList.remove('on');
    $.meta.setAttribute('aria-expanded', 'false');
    $.tmb.setAttribute('aria-expanded', 'false');
    $.mbTimer.setAttribute('aria-expanded', 'false');
    $.dchip.setAttribute('aria-expanded', 'false');
    $.inDay.setAttribute('aria-expanded', 'false');
    if (RP && RP.from) RP.from.setAttribute('aria-expanded', 'false');
    if (back) {
      if (wasM) $.meta.focus({ preventScroll: true });
      else if (wasT) $.tmb.focus({ preventScroll: true });
      else if (wasD) (DPX === 'in' ? $.inDay : $.dchip).focus({ preventScroll: true });
      else if (wasR && RP && RP.from && RP.from.isConnected) RP.from.focus({ preventScroll: true });
    }
    if ((wasD && DPX === 'add') || (wasR && RP && RP.ctx === 'add')) composerLeft();
    if (wasT) syncScrim();
  }
  $.meta.onclick = () => ($.pop.classList.contains('on') ? closePops() : openMonth());
  $.tmb.onclick = () => ($.tpop.classList.contains('on') ? closePops() : openTimer());
  $.pmPrev.onclick = () => {
    popM = new Date(popM.getFullYear(), popM.getMonth() - 1, 1);
    renderPop(-1);
  };
  $.pmNext.onclick = () => {
    popM = new Date(popM.getFullYear(), popM.getMonth() + 1, 1);
    renderPop(1);
  };
  swipeMonths($.grid, d => {
    popM = new Date(popM.getFullYear(), popM.getMonth() + d, 1);
    renderPop(d);
  });
  $.grid.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (b) {
      closePops(true);
      go(b.dataset.k);
    }
  };
  let downPop = false;
  function onOutside(e) {
    downPop = popOn();
    const t = e.target && e.target.closest ? e.target : null;
    // the lock's screen and dialog sit above the app: what happens there leaves the app as it is
    if (t && t.closest('#lock,#lockset')) return;
    if ($.srch.classList.contains('on') && t && !app.contains(t)) closeSearch(false);
    if (popOn() && !(t && t.closest('#pop,#meta,#tpop,#tmb,#dpop,#dchip,#rpop,.rbtn,#inDay,#mbTimer,#fpop,#fx,#kpop,#kb'))) closePops();
    if (t && t.closest('#fmt,#lb,#sug,#toast,.srch,#dpop,#rpop,#inbox,#inVeil,#more,#mbar,#scrim')) return;
    const keep = t && t.closest('.row.open');
    for (const li of $.list.querySelectorAll('.row.open')) if (li !== keep) setOpen(li, false);
    for (const id of [...openIds]) if (!keep || keep.dataset.id !== id) openIds.delete(id);
  }

  /* timer */
  const TK = 'oneday.timer';
  let TM = { mode: 'calm', min: 25, dur: 15e5, end: 0, left: 0, st: 'idle' };
  try {
    const v = JSON.parse(localStorage.getItem(TK));
    if (v && typeof v === 'object') TM = { ...TM, ...v };
  } catch (e) {}
  if (TM.st === 'run' && TM.end <= Date.now()) TM.st = 'done';
  const tmSave = () => {
    try {
      localStorage.setItem(TK, JSON.stringify(TM));
    } catch (e) {}
  };
  const remain = () =>
    TM.st === 'run'
      ? Math.max(0, TM.end - Date.now())
      : TM.st === 'pause'
        ? TM.left
        : TM.st === 'done'
          ? 0
          : TM.min * 6e4;
  const fmtMS = ms => {
    const s = Math.ceil(ms / 1000),
      h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      x = s % 60;
    return h ? `${h}:${p2(m)}:${p2(x)}` : `${m}:${p2(x)}`;
  };
  let tmI = null,
    tmW = null,
    AC = null;
  function tmLoop() {
    if (tmI != null)
      try {
        tmW.clearInterval(tmI);
      } catch (e) {}
    tmI = null;
    if (TM.st === 'run') {
      tmW = W();
      tmI = tmW.setInterval(() => {
        if (TM.st === 'run' && TM.end <= Date.now()) tmDone();
        else tmRender(true);
      }, 200);
    }
  }
  function tmSync() {
    const el = TM.st === 'idle' ? 0 : ((TM.dur - remain()) % 6e4) / 1000;
    for (const n of [$.tsec, q('.tmr .fg')]) {
      n.style.animation = 'none';
      n.getBoundingClientRect();
      n.style.animation = '';
      n.style.animationDelay = `-${el}s`;
    }
    app.classList.toggle('tm-paused', TM.st !== 'run');
    app.classList.toggle('tm-live', TM.mode === 'live');
  }
  function tmRender(anim) {
    const r = remain(),
      on = TM.st !== 'idle',
      live = TM.mode === 'live',
      d = anim && TM.st === 'run' ? -1 : 0;
    if (on) {
      const pill = TM.st === 'done' ? 'Done' : live ? fmtMS(r) : Math.ceil(r / 6e4) + 'm',
        turning = !$.tmb.classList.contains('on');
      roll($.tv, pill, turning ? 0 : d);
    }
    const b = $.tmb,
      changed = b.classList.contains('on') !== on;
    let w0 = 0;
    if (changed) w0 = b.offsetWidth;
    b.classList.toggle('on', on);
    b.classList.toggle('done', TM.st === 'done');
    if (!on) delete $.tv.dataset.v;
    b.setAttribute('aria-label', on ? `Timer, ${TM.st === 'done' ? 'done' : fmtMS(r) + ' left'}` : 'Timer');
    b.dataset.tip = on
      ? TM.st === 'pause'
        ? 'Timer paused'
        : TM.st === 'done'
          ? 'Time’s up'
          : 'Timer'
      : 'Timer';
    if (changed) {
      const w1 = b.offsetWidth;
      an(b, [{ width: w0 + 'px' }, { width: w1 + 'px' }], { easing: SNAP.ease, duration: SNAP.dur });
    }
    if (on && $.tpop.classList.contains('on')) {
      roll($.tbig, live ? fmtMS(r) : String(Math.ceil(r / 6e4)), d);
      $.tunit.textContent = TM.st === 'done' ? 'done' : 'min left';
      $.tprog.style.transform = `scaleX(${TM.dur ? 1 - r / TM.dur : 0})`;
    }
    $.tpause.textContent = TM.st === 'pause' ? 'Resume' : TM.st === 'done' ? 'Restart' : 'Pause';
    $.mbTimerL.textContent = on ? (TM.st === 'done' ? 'Done' : live ? fmtMS(r) : Math.ceil(r / 6e4) + ' min') : 'Timer';
    $.mbTimer.classList.toggle('on', on);
  }
  function tmShowRun(run, anim = true) {
    const show = run ? $.trun : $.tset,
      hide = run ? $.tset : $.trun;
    if (!show.hidden && hide.hidden) return;
    const h0 = $.tpop.offsetHeight;
    hide.hidden = true;
    show.hidden = false;
    delete $.tbig.dataset.v;
    tmRender(false);
    if (anim && $.tpop.classList.contains('on')) {
      const h1 = $.tpop.offsetHeight;
      an($.tpop, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { easing: SNAP.ease, duration: SNAP.dur });
      [...show.children].forEach((c, i) =>
        an(
          c,
          [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'none' },
          ],
          { delay: i * 45, fill: 'backwards' },
        ),
      );
    }
  }
  function unlockAudio() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      AC.resume();
    } catch (e) {}
  }
  function chime() {
    if (!AC) return;
    try {
      const t = AC.currentTime;
      [
        [0, 880],
        [0.18, 1174.7],
        [0.36, 1568],
      ].forEach(([dt, f]) => {
        const o = AC.createOscillator(),
          g = AC.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + dt);
        g.gain.linearRampToValueAtTime(0.16, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.3);
        o.connect(g).connect(AC.destination);
        o.start(t + dt);
        o.stop(t + dt + 1.4);
      });
    } catch (e) {}
  }
  function tmStart() {
    unlockAudio();
    TM.dur = TM.min * 6e4;
    TM.end = Date.now() + TM.dur;
    TM.st = 'run';
    tmSave();
    tmLoop();
    tmSync();
    tmShowRun(true);
    tmRender(false);
  }
  function tmPause() {
    unlockAudio();
    if (TM.st === 'run') {
      TM.left = remain();
      TM.st = 'pause';
    } else if (TM.st === 'pause') {
      TM.end = Date.now() + TM.left;
      TM.st = 'run';
    } else {
      tmStart();
      return;
    }
    tmSave();
    tmLoop();
    tmSync();
    tmRender(false);
  }
  function tmAdd() {
    unlockAudio();
    if (TM.st === 'done') {
      TM.dur = 6e4;
      TM.end = Date.now() + 6e4;
      TM.st = 'run';
    } else {
      if (TM.st === 'run') TM.end += 6e4;
      else TM.left += 6e4;
      TM.dur += 6e4;
    }
    tmSave();
    tmLoop();
    tmSync();
    tmRender(true);
  }
  function tmStop() {
    TM.st = 'idle';
    tmSave();
    tmLoop();
    tmSync();
    tmShowRun(false);
    tmRender(false);
    tpRender(0);
  }
  function tmDone() {
    TM.st = 'done';
    tmSave();
    tmLoop();
    tmSync();
    tmRender(false);
    chime();
    toast('Time’s up', null, 6000);
    an($.tmb, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], {
      duration: 700,
      easing: 'ease-out',
    });
  }
  // A segmented control: the pill glides to the chosen option.
  function segMove(seg, a, anim) {
    const ind = seg.querySelector('i');
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b === a));
    if (!anim) ind.style.transition = 'none';
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
    if (!anim) {
      ind.getBoundingClientRect();
      ind.style.transition = '';
    }
  }
  function segRender(anim) {
    const bs = [...$.seg.querySelectorAll('button')];
    segMove($.seg, bs.find(b => b.dataset.m === TM.mode) || bs[0], anim);
  }
  $.seg.onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.m === TM.mode) return;
    TM.mode = b.dataset.m;
    tmSave();
    segRender(true);
    tmSync();
    delete $.tbig.dataset.v;
    delete $.tv.dataset.v;
    tmRender(false);
    an($.tbig, [
      { opacity: 0, transform: 'scale(.92)' },
      { opacity: 1, transform: 'none' },
    ]);
    an($.tv, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  };
  function tpRender(d) {
    roll($.tpv, String(TM.min), d);
    [...$.tpre.children].forEach(c => c.classList.toggle('on', +c.dataset.v === TM.min));
  }
  function tpSet(v) {
    v = Math.max(1, Math.min(180, v));
    if (v === TM.min) return;
    const d = Math.sign(v - TM.min);
    TM.min = v;
    tmSave();
    tpRender(d);
  }
  $.tminus.onclick = () => tpSet(TM.min - (TM.min > 10 ? 5 : 1));
  $.tplus.onclick = () => tpSet(TM.min + (TM.min >= 10 ? 5 : 1));
  $.tpre.onclick = e => {
    const b = e.target.closest('button');
    if (b) tpSet(+b.dataset.v);
  };
  $.tpv.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      e.stopPropagation();
      tpSet(TM.min + (e.deltaY < 0 ? 1 : -1));
    },
    { passive: false },
  );
  $.tstart.onclick = tmStart;
  $.tpause.onclick = tmPause;
  $.tadd.onclick = tmAdd;
  $.tstop.onclick = tmStop;

  /* search, with an index rebuilt only after changes */
  function index() {
    if (IDX) return IDX;
    IDX = [];
    TAGC = new Map();
    for (const k in S.days)
      for (const t of S.days[k].tasks) {
        const tags = tagsOf([t.text, ...(t.subs || []).map(s => s.text)].join(' '));
        tags.forEach(g => TAGC.set(g, (TAGC.get(g) || 0) + 1));
        const bodyRaw = [...(t.subs || []).map(s => s.text), htmlText(t.note || '')]
          .join('  ')
          .replace(/\s+/g, ' ')
          .trim();
        IDX.push({
          k,
          t,
          tags: tags.map(norm),
          tagsRaw: tags,
          title: norm(t.text),
          body: norm(bodyRaw),
          bodyRaw,
        });
      }
    return IDX;
  }
  const allTags = () => {
    index();
    return [...TAGC].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  function search(qs) {
    const toks = qs.trim().split(/\s+/).filter(Boolean),
      tagT = toks.filter(x => x[0] === '#' && x.length > 1).map(x => norm(x.slice(1))),
      words = toks.filter(x => x[0] !== '#').map(norm);
    if (!tagT.length && !words.length) return [];
    const tk = todayKey(),
      out = [];
    for (const e of index()) {
      if (tagT.some(tt => !e.tags.some(g => g.startsWith(tt)))) continue;
      let s = 0,
        inBody = false,
        ok = true;
      for (const w of words) {
        const i = e.title.indexOf(w);
        if (i > -1) s += i === 0 || /[\s#(]/.test(e.title[i - 1]) ? 3 : 2;
        else if (e.body.indexOf(w) > -1) {
          s += 1;
          inBody = true;
        } else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      s += 1 / (1 + Math.abs(diff(tk, e.k)) * 0.15) + (e.t.done ? 0 : 0.3);
      out.push({ e, s, inBody });
    }
    return out.sort((a, b) => b.s - a.s).slice(0, 60);
  }
  function hlText(text, words) {
    if (!words.length) return esc(text);
    let n = '';
    const map = [];
    for (let i = 0; i < text.length; i++)
      for (const c of norm(text[i])) {
        n += c;
        map.push(i);
      }
    const mk = new Array(text.length).fill(false);
    for (const w of words) {
      let i = n.indexOf(w);
      while (i > -1) {
        for (let j = i; j < i + w.length; j++) mk[map[j]] = true;
        i = n.indexOf(w, i + w.length);
      }
    }
    let h = '',
      on = false;
    for (let i = 0; i < text.length; i++) {
      if (mk[i] !== on) {
        h += mk[i] ? '<mark>' : '</mark>';
        on = mk[i];
      }
      h += esc(text[i]);
    }
    return h + (on ? '</mark>' : '');
  }
  let SR = [],
    SEL = 0,
    prevIds = new Set(),
    searchFrom = null;
  function renderSearch() {
    const qs = $.sq.value,
      words = qs
        .trim()
        .split(/\s+/)
        .filter(w => w && w[0] !== '#')
        .map(norm);
    if (!qs.trim()) {
      SR = [];
      $.spicks.hidden = true;
      const tags = allTags();
      prevIds = new Set();
      $.sq.setAttribute('aria-expanded', 'false');
      $.slist.removeAttribute('role');
      $.scount.textContent = '';
      $.slist.innerHTML =
        `<p class="shint">Search tasks, notes and sub-tasks on every day. Type # to filter by tag.</p>` +
        (tags.length
          ? `<div class="chips">${tags
              .slice(0, 12)
              .map(
                ([g, c]) =>
                  `<button type="button" class="chip" data-tag="${esc(g)}">#${esc(g)}<span>${c}</span></button>`,
              )
              .join('')}${tags.length > 12 ? `<button type="button" class="chip" data-more>${tags.length - 12} more tags</button>` : ''}</div>` +
            (tags.length > 12 ? '<p class="shint">Type # and a few letters to find any tag.</p>' : '')
          : '') +
        `<div class="sdata"><p class="shint">${dataHint()}</p><div class="chips"><button type="button" class="chip" data-act="import">${IC.up}Import backup</button><button type="button" class="chip" data-act="export">${IC.down}${canTop ? 'Export backup' : 'Copy backup'}</button></div>${lockChips()}</div>${aboutHTML()}`;
      moveHl();
      return;
    }
    SR = search(qs);
    SEL = 0;
    // after a #, the tags that start with what is typed, to pick in one click
    const last = qs.endsWith(' ') ? '' : qs.trim().split(/\s+/).pop() || '',
      pq = last[0] === '#' ? norm(last.slice(1)) : null,
      picks = pq == null ? [] : allTags().filter(([g]) => norm(g).startsWith(pq) && norm(g) !== pq).slice(0, 12);
    $.spicks.hidden = !picks.length;
    $.spicks.innerHTML = picks
      .map(([g, c]) => `<button type="button" class="chip" data-pick="${esc(g)}">${tdot(g)}#${esc(g)}<span>${c}</span></button>`)
      .join('');
    $.sq.setAttribute('aria-expanded', SR.length ? 'true' : 'false');
    if (SR.length) $.slist.setAttribute('role', 'listbox');
    else $.slist.removeAttribute('role');
    $.scount.textContent = SR.length ? `${SR.length} ${SR.length > 1 ? 'results' : 'result'}` : 'No results';
    if (!SR.length) {
      $.slist.innerHTML =
        picks.length && qs.trim().length < 3
          ? ''
          : `<p class="shint">${picks.length ? 'No tasks with that tag yet.' : `No tasks match “${esc(qs.trim())}”.`}</p>`;
      prevIds = new Set();
      moveHl();
      return;
    }
    $.slist.innerHTML = SR.map((r, i) => {
      const t = r.e.t,
        title = t.text.replace(TAGRE, '$1').replace(/\s+/g, ' ').trim() || t.text,
        tags = r.e.tagsRaw;
      let sn = '';
      if (r.inBody && words.length) {
        const raw = r.e.bodyRaw,
          nb = norm(raw);
        let i0 = -1;
        for (const w of words) {
          i0 = nb.indexOf(w);
          if (i0 > -1) break;
        }
        if (i0 > -1) {
          const a = Math.max(0, i0 - 28),
            b = Math.min(raw.length, i0 + 64);
          sn = (a ? '…' : '') + hlText(raw.slice(a, b), words) + (b < raw.length ? '…' : '');
        }
      }
      return `<button type="button" role="option" id="sr-${i}" tabindex="-1" class="sr${t.done ? ' done' : ''}" data-i="${i}" data-id="${esc(t.id)}"><span class="mini"></span><span class="tt"><span class="ti">${hlText(title, words)}</span>${tags.map(g => `<span class="tag" data-tag="${esc(g)}"${cAttr(g)}>#${esc(g)}</span> `).join('')}${sn ? `<span class="sn">${sn}</span>` : ''}</span><span class="dd">${esc(dayLabel(r.e.k))}</span></button>`;
    }).join('');
    const now = new Set(SR.map(r => r.e.t.id));
    let i = 0;
    for (const b of $.slist.children) {
      if (!prevIds.has(b.dataset.id))
        an(
          b,
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' },
          ],
          { delay: Math.min(i++, 8) * 22, fill: 'backwards' },
        );
    }
    prevIds = now;
    moveHl();
  }
  // The footer is the single source for these links; small screens show them here instead.
  function aboutHTML() {
    const f = document.getElementById('foot');
    if (!f) return '';
    const promo = f.querySelector('.promo'),
      kofi = f.querySelector('.kofi'),
      links = [...f.querySelectorAll('nav a')].map(a => a.cloneNode(true).outerHTML).join('');
    return `<div class="about">${promo ? promo.cloneNode(true).outerHTML : ''}${kofi ? freeLine(kofi, 'kofi') : ''}<p class="links">${links}</p></div>`;
  }
  // Under the card the coffee speaks for itself; small screens have room for the whole sentence. The words it shows
  // come first, in the same order, in the name a screen reader says: the cup is drawn last and named there.
  function freeLine(k, cls) {
    const low = t => t.charAt(0).toLowerCase() + t.slice(1),
      label = low(k.getAttribute('aria-label') || k.textContent.trim());
    return `<a class="${cls}" href="${esc(k.href)}" target="_blank" rel="noopener" aria-label="${esc(`This app is free. If you want, ${label}.`)}">This app is free. If you want, <b>${esc(low(k.textContent.trim()))}</b>.</a>`;
  }
  function moveHl() {
    const b = $.slist.querySelector(`.sr[data-i="${SEL}"]`);
    $.slist.querySelectorAll('.sr').forEach(x => x.setAttribute('aria-selected', x === b));
    if (b) $.sq.setAttribute('aria-activedescendant', b.id);
    else $.sq.removeAttribute('aria-activedescendant');
    if (!b) {
      $.hl.classList.remove('on');
      return;
    }
    if (!$.hl.classList.contains('on')) {
      $.hl.style.transition = 'none';
      $.hl.style.setProperty('--y', b.offsetTop + 'px');
      $.hl.style.height = b.offsetHeight + 'px';
      $.hl.getBoundingClientRect();
      $.hl.style.transition = '';
    }
    $.hl.style.setProperty('--y', b.offsetTop + 'px');
    $.hl.style.height = b.offsetHeight + 'px';
    $.hl.classList.add('on');
    const top = b.offsetTop,
      bot = top + b.offsetHeight,
      sr = $.sres;
    if (top < sr.scrollTop + 8) sr.scrollTop = top - 8;
    else if (bot > sr.scrollTop + sr.clientHeight - 8) sr.scrollTop = bot - sr.clientHeight + 8;
  }
  function openSearch(qv) {
    if ($.srch.classList.contains('on')) {
      if (qv != null) {
        $.sq.value = qv;
        renderSearch();
      }
      $.sq.focus();
      return;
    }
    closePops();
    hideTip(0);
    hideSug();
    const ae = D().activeElement;
    searchFrom = ae && ae !== D().body ? ae : null;
    if (ae && ae.isContentEditable) ae.blur();
    $.sq.value = qv || '';
    const phone = W().matchMedia(BARQ).matches,
      y0 = phone && $.srch.classList.contains('out') ? presentY($.srch) : null;
    $.srch.getAnimations().forEach(a => a.cancel());
    unpinDrawer();
    $.srch.classList.remove('out');
    $.srch.inert = false;
    $.srch.classList.add('on');
    guard('search', () => closeSearch());
    if (phone)
      an($.srch, [{ transform: y0 != null ? `translateY(${y0}px)` : 'translateY(calc(100% + 24px))' }, { transform: 'none' }], {
        easing: SP.ease,
        duration: SP.dur,
      });
    $.mbSearch.setAttribute('aria-expanded', 'true');
    syncScrim();
    renderSearch();
    $.sq.focus({ preventScroll: true });
    const n = $.sq.value.length;
    $.sq.setSelectionRange(n, n);
    if (!W().matchMedia(BARQ).matches)
      an(q('.sbar'), [
        { opacity: 0, transform: 'translateY(-12px)' },
        { opacity: 1, transform: 'none' },
      ]);
    an(q('.sbar>i'), [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: SP.dur * 1.3 });
    [...$.slist.children].forEach((c, i) =>
      an(
        c,
        [
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'none' },
        ],
        { delay: 70 + Math.min(i, 10) * 30, fill: 'backwards' },
      ),
    );
  }
  // On a phone, search leaves like More: from where it is (a drag hands over its distance), on the same spring.
  // Its place and size are held while it goes, so the keyboard folding away meanwhile cannot move it.
  function presentY(el) {
    const t = getComputedStyle(el).transform;
    return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0;
  }
  function unpinDrawer() {
    const st = $.srch.style;
    st.top = st.bottom = st.height = '';
  }
  function closeSearch(restore = true, from) {
    if (!$.srch.classList.contains('on')) return;
    unguard('search');
    if (W().matchMedia(BARQ).matches) {
      const y = from != null ? from : presentY($.srch),
        r = $.srch.getBoundingClientRect(),
        top = r.top - y;
      $.srch.getAnimations().forEach(a => a.cancel());
      $.srch.style.top = top + 'px';
      $.srch.style.bottom = 'auto';
      $.srch.style.height = r.height + 'px';
      $.srch.classList.add('out');
      // all the way off the screen: the keyboard folding away meanwhile makes the window taller than it is now
      const far = Math.max(W().innerHeight, (W().screen && W().screen.height) || 0) - top + 24;
      then(
        an($.srch, [{ transform: `translateY(${y}px)` }, { transform: `translateY(${Math.ceil(far)}px)` }], {
          easing: SNAP.ease,
          duration: SNAP.dur * 1.1,
          fill: 'forwards',
        }),
        () => {
          if ($.srch.classList.contains('on')) return;
          $.srch.classList.remove('out');
          unpinDrawer();
          $.srch.getAnimations().forEach(a => a.cancel());
        },
      );
    }
    $.srch.classList.remove('on');
    $.srch.inert = true;
    $.mbSearch.setAttribute('aria-expanded', 'false');
    syncScrim();
    hideTip(0);
    const f = searchFrom;
    searchFrom = null;
    if (restore) (f && f.isConnected && !f.isContentEditable ? f : $.sb).focus({ preventScroll: true });
  }
  function openResult(i) {
    const r = SR[i];
    if (!r) return;
    closeSearch(false);
    const k = r.e.k,
      id = r.e.t.id;
    const after = () => {
      const li = rowOf(id);
      if (!li) return;
      if (r.inBody) setOpen(li, true);
      li.scrollIntoView({ block: 'center', behavior: RM.matches ? 'auto' : 'smooth' });
      flash(li);
    };
    if (k !== cur) {
      go(k);
      later(after, 280);
    } else later(after, 60);
  }
  $.sb.onclick = () => openSearch();
  $.sx.onclick = closeSearch;
  $.sq.addEventListener('input', renderSearch);
  $.sq.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!SR.length) return;
      SEL = (SEL + (e.key === 'ArrowDown' ? 1 : -1) + SR.length) % SR.length;
      moveHl();
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      openResult(SEL);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });
  $.slist.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      doAct(act.dataset.act);
      return;
    }
    const tg = e.target.closest('[data-tag]');
    if (tg) {
      $.sq.value = '#' + tg.dataset.tag + ' ';
      renderSearch();
      $.sq.focus();
      return;
    }
    if (e.target.closest('[data-more]')) {
      $.sq.value = '#';
      renderSearch();
      $.sq.focus();
      return;
    }
    const b = e.target.closest('.sr');
    if (b) openResult(+b.dataset.i);
  });
  $.spicks.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    $.sq.value = $.sq.value.replace(/#[^\s#]*$/, '#' + b.dataset.pick + ' ');
    renderSearch();
    $.sq.focus();
  });
  $.slist.addEventListener('pointermove', e => {
    const b = e.target.closest('.sr');
    if (b && +b.dataset.i !== SEL) {
      SEL = +b.dataset.i;
      moveHl();
    }
  });

  /* backup: export and import */
  // With the lock on, a backup holds the encrypted tasks and opens with the passphrase.
  async function exportData() {
    const at = new Date().toISOString();
    let o = { app: 'one-day', version: 2, exported: at, days: S.days, rules: S.rules, tags: S.tags || {} };
    if (vault) {
      await flush();
      const v = storedVault();
      if (!v || locked) return;
      o = { app: 'one-day', version: 2, exported: at, vault: { v: 1, kdf: v.kdf, pass: v.pass, data: v.data } };
    }
    const data = JSON.stringify(o, null, 1),
      what = o.vault ? 'Encrypted backup' : 'Backup';
    if (canTop) {
      try {
        const u = URL.createObjectURL(new Blob([data], { type: 'application/json' })),
          a = D().createElement('a');
        a.href = u;
        a.download = `one-day-backup-${todayKey()}${o.vault ? '-encrypted' : ''}.json`;
        D().body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
        toast(`${what} downloaded`);
        return;
      } catch (e) {}
    }
    navigator.clipboard.writeText(data).then(
      () => toast(`${what} copied to the clipboard`),
      () => toast('This browser blocked the backup'),
    );
  }
  // A One Day backup is merged at once; another app's export is shown first (see "importing from other apps").
  $.impf.addEventListener('change', async () => {
    const all = [...($.impf.files || [])],
      files = all.slice(0, 20);
    $.impf.value = '';
    if (!files.length || locked) return;
    // an Evernote export carries its pictures and files: it may be large, and is read as it streams (see readEnex)
    if (files.some(f => f.size > (/\.enex$/i.test(f.name) ? 4e9 : 20e6))) {
      toast('That file is too large to import');
      return;
    }
    let got;
    try {
      got = await readFiles(files);
    } catch (e) {
      const m = e && e.message;
      toast(
        m === 'zip'
          ? 'This browser can’t open that .zip: unzip it, then pick the file inside'
          : m === 'too large'
            ? 'That file is too large to import'
            : 'That file could not be read',
      );
      return;
    }
    // the app may have locked meanwhile (five minutes away while the file was being picked)
    if (locked) return;
    if (got.length > 1 && got.some(f => /^\s*\{\s*"app"\s*:\s*"one-day"/.test(f.text.slice(0, 200)))) {
      toast('A One Day backup imports on its own: pick it alone');
      return;
    }
    if (got.length === 1 && /^\s*\{/.test(got[0].text)) {
      let j = null;
      try {
        j = JSON.parse(got[0].text);
      } catch (e) {}
      if (j && j.app === 'one-day') return importBackup(j);
    }
    let found = null;
    try {
      found = readExports(got);
      if (found && all.length > files.length) found.said.push(`${all.length - files.length} files past the first 20 are left out.`);
      if (found) showImport(found);
    } catch (e) {
      toast('That file could not be read');
      return;
    }
    if (!found) toast('That file isn’t a backup or an export One Day can read');
  });
  async function importBackup(j) {
    if (!j.days && j.vault) {
      const inner = await openBackup(j.vault);
      if (!inner || locked) return;
      j = { app: 'one-day', days: inner.days, rules: inner.rules, tags: inner.tags };
    }
    if (!j.days || typeof j.days !== 'object') {
      toast('That file isn’t a One Day backup');
      return;
    }
    const keys = Object.keys(j.days)
      .filter(k => /^\d{4}-\d\d-\d\d$/.test(k))
      .slice(0, 5000);
    const incRules = cleanRules(j.rules);
    if (!keys.length && !Object.keys(incRules).length) {
      toast('That backup is empty');
      return;
    }
    record(keys);
    let added = 0,
      ruled = 0;
    for (const id in incRules)
      if (!S.rules[id]) {
        S.rules[id] = incRules[id];
        ruled++;
      }
    const incTags = cleanTags(j.tags);
    if (!S.tags) S.tags = {};
    for (const g in incTags)
      if (!S.tags[g]) {
        S.tags[g] = incTags[g];
        ruled++;
      }
    if (ruled) persist();
    for (const k of keys) {
      const inc = clean(j.days[k] && j.days[k].tasks),
        d = day(k),
        have = new Set(d.tasks.map(t => t.id)),
        fresh = inc.filter(t => !have.has(t.id));
      if (fresh.length) {
        d.tasks.push(...fresh);
        added += fresh.length;
        commit(k);
      }
    }
    closeSearch();
    flip(() => {
      renderList();
      renderAux();
    });
    ensure(cur);
    flip(() => renderList());
    const what = [
      added ? `${added} ${added > 1 ? 'tasks' : 'task'}` : '',
      ruled ? `${ruled} repeating ${ruled > 1 ? 'tasks' : 'task'}` : '',
    ].filter(Boolean);
    toast(what.length ? `Imported ${what.join(' and ')}` : 'Nothing new in that backup', what.length ? 'undo' : null);
  }

  /* importing from other apps: an export from Todoist, TickTick, Google Tasks or todo.txt is read here, in the page,
     and nothing is sent anywhere. Each file becomes plain items (words, note, sub-tasks, tags, a day, a repeat); a
     dialog shows where they will go before anything is added, and one undo takes them all back. */
  // Each file as text, with the moment it was saved (Todoist counts its dates from the day of the export).
  async function readFiles(files) {
    const out = [];
    let total = 0;
    const add = (name, text, at) => {
      total += text.length;
      if (total > 60e6) throw new Error('too large');
      out.push({ name, text, at });
    };
    for (const f of files) {
      const at = f.lastModified || Date.now();
      if (/\.enex$/i.test(f.name)) {
        add(f.name, await readEnex(f), at);
        continue;
      }
      const u8 = new Uint8Array(await f.arrayBuffer());
      if (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4) for (const e of await unzip(u8)) add(e.name, utf8(e.bytes), at);
      else add(f.name, utf8(u8), at);
    }
    return out;
  }
  // A text's lines one at a time (a file may hold millions), up to `max` of those with something on them.
  function* linesOf(text, max) {
    let n = 0;
    for (let i = 0; i < text.length && n < max; ) {
      let j = text.indexOf('\n', i);
      if (j < 0) j = text.length;
      const l = text.slice(i, j);
      i = j + 1;
      for (const part of l.includes('\r') ? l.split('\r') : [l])
        if (part.trim() && n++ < max) yield part;
    }
  }
  // An Evernote export writes each note's pictures and files into it, in base64: it is read as it streams, and what
  // lies between <resource> and </resource> is dropped on the way, so only the notes are kept (40 MB of them at most).
  async function readEnex(f) {
    if (typeof TextDecoderStream !== 'function') return utf8(new Uint8Array(await f.arrayBuffer()));
    const rd = f.stream().pipeThrough(new TextDecoderStream()).getReader(),
      A = '<resource>',
      B = '</resource>';
    let out = '',
      buf = '',
      skip = false;
    for (;;) {
      const { done, value } = await rd.read();
      if (value) buf += value;
      for (;;) {
        const i = buf.indexOf(skip ? B : A);
        if (i < 0) {
          // keep what could be the start of a tag cut by the chunk's end
          const keep = done ? 0 : (skip ? B : A).length - 1;
          if (!skip) out += buf.slice(0, Math.max(0, buf.length - keep));
          buf = keep ? buf.slice(-keep) : '';
          break;
        }
        if (!skip) out += buf.slice(0, i);
        buf = buf.slice(i + (skip ? B : A).length);
        skip = !skip;
      }
      if (out.length > 40e6) {
        rd.cancel();
        throw new Error('too large');
      }
      if (done) break;
    }
    return out.replace(/^\uFEFF/, '');
  }
  // UTF-8, as these apps write it; a file an older Windows app saved falls back to its code page
  function utf8(u8) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(u8);
    }
  }
  // The text files in a .zip (Todoist's backups and Google Takeout come as one), opened with the browser's own inflate
  // and never past 40 MB in all.
  async function unzip(u8) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength),
      out = [];
    let e = -1;
    for (let i = u8.length - 22; i >= 0 && i >= u8.length - 65557; i--)
      if (v.getUint32(i, true) === 0x06054b50) {
        e = i;
        break;
      }
    if (e < 0 || typeof DecompressionStream !== 'function') throw new Error('zip');
    // 40 MB of text at most in all, each entry read once (two entries naming the same data count once)
    let p = v.getUint32(e + 16, true),
      left = 40e6;
    const seen = new Set();
    for (let n = Math.min(v.getUint16(e + 10, true), 4000); n > 0 && out.length < 500; n--) {
      if (p + 46 > u8.length || v.getUint32(p, true) !== 0x02014b50) break;
      const flags = v.getUint16(p + 8, true),
        how = v.getUint16(p + 10, true),
        size = v.getUint32(p + 20, true),
        nl = v.getUint16(p + 28, true),
        at = v.getUint32(p + 42, true),
        name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
      if (flags & 1 || !/\.(csv|json|txt)$/i.test(name) || /(^|\/)(__MACOSX\/|\.)/.test(name)) continue;
      if (at + 30 > u8.length || v.getUint32(at, true) !== 0x04034b50 || seen.has(at)) continue;
      seen.add(at);
      const from = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true),
        data = u8.subarray(from, from + size);
      let bytes = null;
      if (how === 0) {
        if (data.length > left) throw new Error('too large');
        bytes = data;
      } else if (how === 8) {
        let ds;
        try {
          ds = new DecompressionStream('deflate-raw');
        } catch (er) {
          throw new Error('zip');
        }
        bytes = await through(data, ds, left).catch(er => {
          if (er && er.message === 'too large') throw er;
          return null;
        });
      }
      if (!bytes) continue;
      left -= bytes.length;
      out.push({ name, bytes });
    }
    return out;
  }
  // A CSV file's rows, as RFC 4180 writes them: a quoted field may hold the separator, quotes ("") and line breaks.
  function csvRows(s, sep = ',') {
    const rows = [],
      n = s.length,
      end = c => c === sep || c === '\n' || c === '\r';
    let row = [],
      i = 0;
    while (i < n && rows.length < 200000) {
      let f = '';
      if (s[i] === '"') {
        let j = i + 1;
        for (;;) {
          const q = s.indexOf('"', j);
          if (q < 0) {
            f += s.slice(j);
            i = n;
            break;
          }
          f += s.slice(j, q);
          if (s[q + 1] === '"') j = q + 2;
          else {
            i = q + 1;
            break;
          }
          f += '"';
        }
        while (i < n && !end(s[i])) f += s[i++];
      } else {
        let j = i;
        while (j < n && !end(s[j])) j++;
        f = s.slice(i, j);
        i = j;
      }
      row.push(f);
      if (i >= n) break;
      if (s[i] === sep) {
        if (++i >= n) row.push('');
        continue;
      }
      if (s[i] === '\r' && s[i + 1] === '\n') i++;
      i++;
      rows.push(row);
      row = [];
    }
    if (row.length) rows.push(row);
    return rows;
  }
  // A note written elsewhere as plain text or Markdown: its lines and lists, links, **bold**, ~~strike~~ and `code`.
  const IMI =
    /(`[^`\n]+`)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\[([^[\]\n]+)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)?)\)|(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'»])/gi;
  function imLine(s) {
    let h = '',
      last = 0;
    for (const m of s.matchAll(IMI)) {
      const u = m[5] || m[6];
      h += esc(s.slice(last, m.index));
      last = m.index + m[0].length;
      h += m[1]
        ? `<code>${esc(m[1].slice(1, -1))}</code>`
        : m[2]
          ? `<b>${imLine(m[2])}</b>`
          : m[3]
            ? `<s>${imLine(m[3])}</s>`
            : `<a href="${esc(u)}">${esc(m[4] || u)}</a>`;
    }
    return h + esc(s.slice(last));
  }
  function imNote(text) {
    let h = '',
      list = '';
    const lines = String(text || '')
      .slice(0, 30000)
      .replace(/\r\n?|[\u2028\u2029]/g, '\n')
      .trim();
    if (!lines) return '';
    for (const ln of lines.split('\n')) {
      const m = /^\s*(?:([-*+•])|\d{1,3}[.)])\s+(.*)$/.exec(ln),
        kind = m ? (m[1] ? 'ul' : 'ol') : '';
      if (kind !== list) h += (list ? `</${list}>` : '') + (kind ? `<${kind}>` : '');
      list = kind;
      h += kind ? `<li>${imLine(m[2])}</li>` : `<div>${imLine(ln) || '<br>'}</div>`;
    }
    return h + (list ? `</${list}>` : '');
  }
  // a note grows a paragraph at a time, and stops growing past what a note keeps
  const more = (a, b) => (!b ? a : !a ? b : a.length > 30000 ? a : a + '\n\n' + b);
  // A list, project or label as a #tag: lower case, spaces as hyphens, only what a tag can hold. The lists every
  // account starts with (an inbox, "My Tasks") say nothing, so they bring no tag.
  const IMDEF = new Set(['inbox', 'my-tasks', 'boîte-de-réception', 'mes-tâches', 'eingang', 'meine-aufgaben', 'bandeja-de-entrada', 'mis-tareas']);
  function imTag(s) {
    const g = String(s || '')
      .slice(0, 200)
      .normalize('NFC')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_\-\/]/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_\/]+|[-\/]+$/g, '')
      .slice(0, 40);
    return TAGNAME.test(g) && !IMDEF.has(g) ? g : '';
  }
  // A day from a date that may carry a time: "2026-11-25", "2026-11-25T14:00:00+0000", "20261125". A time with a zone
  // is read in this browser's zone (or the one named), a date alone as it is written.
  function imDay(v, tz) {
    const s = String(v || '').trim(),
      m = /^(\d{4})-?(\d\d)-?(\d\d)(?:[T ](\d\d):?(\d\d)(?::?(\d\d)(?:\.\d+)?)?\s*(Z|[+-]\d\d:?\d\d)?)?$/i.exec(s);
    if (!m) return null;
    let k = `${m[1]}-${m[2]}-${m[3]}`;
    if (m[7]) {
      const t = imAt(s);
      if (t == null) return null;
      k = wall(t, tz).k;
    }
    return keyOf(fromKey(k)) === k ? k : null;
  }
  // The day and time a moment shows on a wall clock, in a zone (this browser's if none, or if it is unknown)
  function wall(t, tz) {
    try {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: tz || undefined,
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
          .formatToParts(t)
          .map(x => [x.type, x.value]),
      );
      return { k: `${p.year}-${p.month}-${p.day}`, h: +p.hour % 24, m: +p.minute, s: +p.second };
    } catch (e) {
      const d = new Date(t);
      return { k: keyOf(d), h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() };
    }
  }
  // A moment from a date-time with a zone, in milliseconds, or null.
  function imAt(v) {
    const m = /^(\d{4})-?(\d\d)-?(\d\d)[T ](\d\d:?\d\d(?::?\d\d)?)(\.\d+)?\s*(Z|[+-]\d\d:?\d\d)$/i.exec(String(v || '').trim());
    if (!m) return null;
    const hms = m[4].replace(/^(\d\d):?(\d\d)(?::?(\d\d))?$/, (x, h, mi, s) => `${h}:${mi}:${s || '00'}`),
      z = m[6].toUpperCase() === 'Z' ? 'Z' : m[6].replace(/^([+-]\d\d):?(\d\d)$/, '$1:$2'),
      t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${hms}${(m[5] || '').slice(0, 4)}${z}`);
    return isNaN(t) ? null : t;
  }
  /* A repeat from another app as a One Day rule from the task's day, or null when One Day can't follow it. A repeat is
     { freq: day, week, month or year, every, days: weekdays (0 is Monday), md: a date of the month (31 is the last day),
     nth and wd: a weekday of the month (the second Tuesday, the last Friday), mo: a yearly one's month, until }. */
  function imRule(rep, base) {
    if (!rep || !FREQ.concat('year').includes(rep.freq)) return null;
    const year = rep.freq === 'year',
      every = (rep.every || 1) * (year ? 12 : 1);
    if (!Number.isInteger(every) || every < 1 || every > 99) return null;
    const f = { freq: year ? 'month' : rep.freq, every };
    let start = base;
    if (f.freq === 'week') f.days = rep.days && rep.days.length ? rep.days : [wdOf(base)];
    if (f.freq === 'month' && (rep.md || rep.nth || rep.mo)) {
      if (rep.nth && !(rep.nth === -1 || (rep.nth >= 1 && rep.nth <= 4))) return null;
      const s = imStart(rep, base, every);
      if (!s) return null;
      start = s.start;
      if (s.skip) f.skip = [s.skip];
      if (rep.nth) f.nth = rep.nth;
    }
    if (rep.until) {
      if (rep.until < todayKey() || rep.until < start) return null;
      f.until = rep.until;
    }
    return { ...f, start };
  }
  // The first day from `base` a monthly or yearly repeat falls on: its date, or its weekday, of the month. A date that
  // month lacks (the 31st in November) falls on its last day, as it will in such months afterwards: the rule then
  // starts from that date in an earlier month, and skips that start.
  function imStart(rep, base, every) {
    const d0 = fromKey(base),
      y = d0.getFullYear();
    for (let i = 0; i < 130; i++) {
      const m = d0.getMonth() + i,
        dim = new Date(y, m + 1, 0).getDate();
      if (rep.mo && new Date(y, m, 1).getMonth() + 1 !== rep.mo) continue;
      let date = Math.min(rep.md || d0.getDate(), dim);
      if (rep.nth) {
        const fw = (new Date(y, m, 1).getDay() + 6) % 7,
          lw = (new Date(y, m, dim).getDay() + 6) % 7;
        date = rep.nth === -1 ? dim - ((lw - rep.wd + 7) % 7) : 1 + ((rep.wd - fw + 7) % 7) + (rep.nth - 1) * 7;
      }
      const s = keyOf(new Date(y, m, date));
      if (s < base) continue;
      if (!rep.md || rep.md <= dim) return { start: s };
      if (every !== 1 && every !== 12) continue;
      for (let j = 1; j <= 8; j++) {
        const pm = m - j * every;
        if (new Date(y, pm + 1, 0).getDate() < rep.md) continue;
        const a = keyOf(new Date(y, pm, rep.md));
        return { start: a, skip: a };
      }
    }
    return null;
  }
  /* An import as One Day will hold it. A done task goes on the day it was done (the history), a dated one on its day,
     the rest on today; a repeat becomes a rule, with its next occurrence on its day. One Day's limits hold: 300 tasks a
     day, 100 sub-tasks a task, 300 repeats, and what this browser can keep (the oldest done tasks go first). */
  function imPlan(items) {
    const tk = todayKey(),
      P = { days: {}, rules: {}, reps: [], n: 0, noted: 0, over: 0, whens: 0, cut: 0, full: new Set(), undated: 0, subcut: 0, old: 0, dupes: 0, tags: new Map(), big: false },
      left = {},
      had = {},
      ruleTexts = new Set(Object.values(S.rules).map(r => r.text)),
      // a task already on its day, word for word, was most likely imported before
      seen = (k, text) => (had[k] || (had[k] = new Set(tasks(k).map(t => t.text)))).has(text),
      put = (k, t) => {
        if (!(k in left)) left[k] = 300 - tasks(k).length;
        if (left[k] <= 0) {
          P.full.add(k);
          return false;
        }
        left[k]--;
        (P.days[k] || (P.days[k] = [])).push(t);
        return true;
      },
      line = s => `<div>${esc(s)}</div>`;
    let rules = Object.keys(S.rules).length;
    for (const it of items) {
      // a title holds words only: a Markdown link keeps its words there and goes to the note, **bold** loses its stars
      const links = [],
        words = String(it.text || '')
          .slice(0, 2000)
          .replace(/\[([^[\]\n]{1,300})\]\((https?:\/\/[^\s()]{1,2000})\)/g, (m, t, u) => {
            links.push(`- [${t}](${u})`);
            return t;
          })
          .replace(/\*\*([^*\n]+)\*\*/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();
      if (!words) continue;
      const own = tagsOf(words),
        tags = [...new Set((it.tags || []).slice(0, 50).map(imTag))].filter(g => g && !own.includes(g)),
        tail = tags.map(g => ' #' + g).join(''),
        text = (words.slice(0, Math.max(40, 500 - tail.length)) + tail).slice(0, 500);
      const subs0 = (it.subs || []).filter(x => x && String(x.text || '').trim()),
        subs = subs0.slice(0, 100).map(x => ({ id: uid(), text: String(x.text).slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 300), done: !!x.done }));
      // (the items are planned twice, for the dialog and again for Add all: nothing here changes them. An Evernote note
      // comes as HTML already; clean() sanitises every note below.) What One Day couldn't read goes first in the note,
      // so that a long note's end, which clean() cuts, never takes it away.
      const body = (it.noteHtml || '') + imNote([it.note, links.join('\n')].filter(x => x && String(x).trim()).join('\n\n')),
        when = it.when ? line(`Date in ${it.app}: ${String(it.when).slice(0, 200)}`) : '';
      if (it.when) P.whens++;
      if (it.done) {
        if (!it.doneDay) {
          P.undated++;
          continue;
        }
        const [t] = clean([{ id: uid(), text, done: true, at: it.at || fromKey(it.doneDay).getTime() + 432e5, note: when + body, subs }]);
        if (!t) continue;
        if (seen(it.doneDay, t.text)) P.dupes++;
        if (put(it.doneDay, t)) P.n++;
        else P.cut++;
      } else {
        const base = it.due || tk,
          f = it.rep && rules < 300 ? imRule(it.rep, base) : null,
          r = f && cleanRule({ ...f, text, note: when + body, subs: subs.map(x => ({ text: x.text })) }, 'r' + uid());
        if (r) {
          rules++;
          if (ruleTexts.has(r.text)) P.dupes++;
          P.rules[r.id] = r;
          P.reps.push(r);
          P.n++;
          // its next occurrence, from its day or today, waits on that day; ensure() makes the ones after
          const k = nextOcc(r, base > tk ? base : tk);
          if (k) put(k, fromRule(r, k));
        } else {
          // a repeat One Day can't follow (or one past the 300 it keeps) is written in the note, as the app wrote it
          let rep = '';
          if (it.rep || it.repWords) {
            rep = line(`Repeats in ${it.app}: ${String(it.repWords || '').slice(0, 300)}`);
            if (it.rep && rules >= 300) P.over++;
            else P.noted++;
          }
          const [t] = clean([{ id: uid(), text, done: false, note: when + rep + body, subs }]);
          if (!t) continue;
          if (seen(base, t.text)) P.dupes++;
          if (put(base, t)) P.n++;
          else P.cut++;
        }
      }
      if (subs0.length > 100) P.subcut += subs0.length - 100;
      for (const g of tags) P.tags.set(g, (P.tags.get(g) || 0) + 1);
    }
    /* What this browser can keep: about 5 MB. In clear, the tasks are counted in characters (twice in Safari once a
       single one is beyond Latin-1, since it then keeps the whole text in two bytes a character); with the lock, they
       are kept as base64, a third more than their UTF-8 bytes. Past that, the oldest done tasks are left out first. */
    const enc = new TextEncoder(),
      webkit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent),
      wide = !vault && webkit && [S, P.days, P.rules].some(o => /[^\u0000-\u00ff]/.test(JSON.stringify(o))),
      size = o => {
        const j = JSON.stringify(o);
        return vault ? Math.ceil((enc.encode(j).length * 4) / 3) : j.length * (wide ? 2 : 1);
      },
      cap = 4.5e6;
    let total = size(S) + size(P.days) + size(P.rules);
    for (const k of Object.keys(P.days).sort()) {
      if (total <= cap || k >= tk) break;
      const l = P.days[k],
        keep = l.filter(t => !t.done);
      total -= size(l) - size(keep);
      P.old += l.length - keep.length;
      P.n -= l.length - keep.length;
      if (keep.length) P.days[k] = keep;
      else delete P.days[k];
    }
    P.big = total > cap;
    return P;
  }

  /* Each app's export is known by what it holds, whatever the file is called. readExports() gives the apps found and
     their items: { text, note (plain text or Markdown), subs: [{ text, done }], tags, done, doneDay, at, due, rep,
     repWords (the repeat as the app wrote it, for the note when One Day doesn't follow it) }. */
  function readExports(got) {
    const apps = [],
      items = [],
      left = [],
      said = new Set();
    let known = false;
    for (const f of got) {
      const r = readExport(f.name.split('/').pop(), f.text, { left, said, at: f.at });
      if (!r) continue;
      known = true;
      if (!apps.includes(r.app)) apps.push(r.app);
      for (const it of r.items) {
        if (items.length >= 20000) break;
        it.app = r.app;
        items.push(it);
      }
    }
    return known ? { apps, items, left, said: [...said] } : null;
  }
  // ctx.left gathers what an export holds that One Day doesn't bring, as [count, one, many]; ctx.said, what the dialog
  // should say about how it was read; ctx.at is when the file was saved.
  function readExport(name, text, ctx) {
    const { left } = ctx;
    const head = text.slice(0, 3000);
    // JSON, or a list that only starts like it ("[ ] milk")
    if (/^\s*[[{]/.test(head)) {
      let j = null;
      try {
        j = JSON.parse(text);
      } catch (e) {}
      if (j) return j.kind === 'tasks#taskLists' && Array.isArray(j.items) ? { app: 'Google Tasks', items: fromGoogle(j) } : null;
    }
    if (ENX.test(head)) return { app: 'Evernote', items: fromEvernote(text, name, ctx) };
    if (TDH.test(head)) return { app: 'Todoist', items: fromTodoist(text, name, ctx) };
    if (TTH.test(head)) return { app: 'TickTick', items: fromTickTick(text, left) };
    if (/\.(csv|tsv)$/i.test(name)) {
      const items = fromTable(text, ctx);
      return items ? { app: name.replace(/\.(csv|tsv)$/i, ''), items } : null;
    }
    if (/\.(json|enex)$/i.test(name)) return null;
    if (/^(todo|done)\.txt$/i.test(name) || (!/\.(md|markdown)$/i.test(name) && looksTodo(text)))
      return { app: 'todo.txt', items: fromTodoTxt(text) };
    // any other list, one item a line, is read as a pasted one: bullets and boxes left out, what is set in nested
    if (/\.(txt|md|markdown)$/i.test(name))
      return {
        app: name,
        items: nestItems(listItems(text, 20000)).map(x => ({ ...x, tags: [], doneDay: x.done ? todayKey() : null })),
      };
    return null;
  }

  /* Todoist: a project exported as CSV (its ⋯ menu → Import & export → Export to CSV) or a backup (Settings → Backups:
     a .zip of one CSV per project, named after it). Columns are found by name, as they keep changing. A task's
     sub-tasks follow it, one INDENT further in; a "note" row is a comment on the row above it; labels end the CONTENT
     (@label, a space in one written "\ "). By default a date is written from the day of the export ("today", "in 4
     days", "3 days ago"), else (and in backups) as a short date in the account's language ("Aug 2", "2 Jan 2026"); a
     repeat is written as it was typed. Done tasks are never exported. */
  const TDH = /^"?TYPE"?[,;]"?CONTENT"?[,;]/;
  function fromTodoist(text, name, ctx) {
    const rows = csvRows(text, /^"?TYPE"?;/.test(text) ? ';' : ','),
      col = {};
    rows[0].forEach((n, i) => (col[n.trim().toUpperCase()] = i));
    const get = (r, n) => (n in col ? String(r[col[n]] || '') : ''),
      project = name.replace(/\.csv$/i, '').replace(/\s*\[[^\]]*\]$/, '').replace(/\s*\(\d+\)$/, ''),
      from = keyOf(new Date(ctx.at || Date.now())),
      out = [];
    let top = null,
      last = null,
      relative = false;
    for (const r of rows.slice(1)) {
      const type = get(r, 'TYPE').trim().toLowerCase();
      if (type === 'section') top = last = null;
      if (type === 'note' && top) {
        // a comment, with its files as links
        const words = get(r, 'CONTENT')
          .slice(0, 10000)
          .replace(/\s*\[\[file (\{[^\n]{0,2000}?\})\]\]/g, (m, j) => {
            try {
              const f = JSON.parse(j);
              return /^https?:\/\//i.test(f.file_url) ? ` [${String(f.file_name || 'File').replace(/[[\]\n]/g, ' ')}](${f.file_url})` : '';
            } catch (e) {
              return '';
            }
          })
          .trim();
        if (words) top.note = more(top.note, `${last !== top ? `**${last.replace(/\*/g, '')}:** ` : ''}${words}`);
      }
      if (type !== 'task') continue;
      // its labels end it: read once, word by word from the end (a space in a label is written "\ ")
      let words = get(r, 'CONTENT').slice(0, 5000).trim();
      const labels = [];
      while (labels.length < 50) {
        let i = words.length - 1;
        while (i >= 0 && !(/\s/.test(words[i]) && words[i - 1] !== '\\')) i--;
        const w = words.slice(i + 1);
        if (!/^@[^\s@]/.test(w)) break;
        labels.unshift(w.slice(1).replace(/\\ /g, ' '));
        words = words.slice(0, Math.max(0, i)).trimEnd();
      }
      // "* " makes a task that can't be ticked: a heading, in fact
      words = words.replace(/^\*\s+/, '');
      if (!words) continue;
      const desc = get(r, 'DESCRIPTION').slice(0, 30000).trim();
      if ((parseInt(get(r, 'INDENT'), 10) || 1) > 1 && top) {
        const sub = [words, ...labels.map(imTag).filter(Boolean).map(g => '#' + g)].join(' ');
        top.subs.push({ text: sub, done: false });
        if (desc) top.note = more(top.note, `**${words.replace(/\*/g, '')}**\n${desc}`);
        last = words;
        continue;
      }
      const it = { text: words, note: desc, subs: [], tags: [project, ...labels], done: false },
        date = get(r, 'DATE').slice(0, 200).replace(/\s+/g, ' ').trim(),
        lang = get(r, 'DATE_LANG').trim() || 'en',
        dl = imDay(get(r, 'DEADLINE').trim());
      if (/^(?:every|ev)!?\s|^(?:daily|weekly|monthly|yearly|annually)\b/i.test(date)) {
        // a repeat; its next date isn't exported, so it counts from today
        const u = / (?:until|ending|ends) /i.exec(date),
          head = u ? date.slice(0, u.index) : date,
          end = u ? date.slice(u.index + u[0].length) : '',
          until = end ? tdDay(end, lang, from) : null;
        it.rep = end && !until ? null : wordsRep(head, until && until.k);
        it.repWords = date;
        if (dl) it.note = more(it.note, `Deadline: ${LONG.format(fromKey(dl))}`);
      } else if (date) {
        const d = tdDay(date, lang, from);
        if (d) {
          it.due = d.k;
          relative = relative || d.rel;
        } else it.when = date;
        if (dl) it.note = more(it.note, `Deadline: ${LONG.format(fromKey(dl))}`);
      } else if (dl) it.due = dl;
      out.push(it);
      top = it;
      last = top;
    }
    if (relative && from !== todayKey())
      ctx.said.add(`Todoist wrote its dates from the day of the export (“today”, “in 4 days”): they count from ${dayName(from)}, when the file was saved.`);
    return out;
  }
  // A Todoist date as a day, and whether it was written from the day of the export: "today", "tomorrow", "in 4
  // days", "3 days ago", or a short date in the account's language, with a time or not. An ISO date is read too.
  function tdDay(v, lang, from) {
    const s = norm(String(v).slice(0, 200))
        .replace(/\s+/g, ' ')
        .replace(/,? *(?:at|@|a|a las|as|alle|um|om|kl\.?|в)? *\d{1,2}(?:[:.h]\d\d *(?:am|pm|a\.?m\.?|p\.?m\.?)?|(?:am|pm))$/, '')
        .trim(),
      n = (x, u) => {
        const d = fromKey(from);
        if (u === 'day') d.setDate(d.getDate() + x);
        else if (u === 'week') d.setDate(d.getDate() + 7 * x);
        else if (u === 'month') d.setMonth(d.getMonth() + x);
        else d.setFullYear(d.getFullYear() + x);
        // a day past the year 9999 is no day
        return d.getFullYear() >= 1000 && d.getFullYear() <= 9999 ? { k: keyOf(d), rel: true } : null;
      };
    let m;
    if (s === 'today') return n(0, 'day');
    if (s === 'tomorrow') return n(1, 'day');
    if (s === 'yesterday') return n(-1, 'day');
    if ((m = /^in (\d{1,5}) (day|week|month|year)s?$/.exec(s))) return n(+m[1], m[2]);
    if ((m = /^(\d{1,5}) (day|week|month|year)s? ago$/.exec(s))) return n(-m[1], m[2]);
    const iso = imDay(s.replace(/ .*$/, ''));
    if (iso) return { k: iso, rel: false };
    const k = shortDay(s, lang, from.slice(0, 4));
    return k ? { k, rel: false } : null;
  }
  // "aug 2", "2 jan 2026", "7 мар 2026", "nov 20", "2. august": a month's name in that language (short, long or
  // begun) and a day, with the year or in the year of the export.
  const MNAMES = new Map();
  function monthsOf(lang) {
    const key = String(lang).replace('_', '-');
    if (MNAMES.has(key)) return MNAMES.get(key);
    const out = [];
    for (const style of ['long', 'short'])
      try {
        const f = new Intl.DateTimeFormat(key, { month: style, timeZone: 'UTC' });
        for (let i = 0; i < 12; i++) out.push([norm(f.format(new Date(Date.UTC(2026, i, 15)))).replace(/\./g, ''), i + 1]);
      } catch (e) {}
    MNAMES.set(key, out);
    return out;
  }
  // the weekdays' names in a language (a date may begin with one: "Wednesday, November 25, 2026")
  const DNAMES = new Map();
  function daysOf(lang) {
    const key = String(lang).replace('_', '-');
    if (!DNAMES.has(key)) {
      const out = [];
      for (const style of ['long', 'short'])
        try {
          const f = new Intl.DateTimeFormat(key, { weekday: style, timeZone: 'UTC' });
          for (let i = 0; i < 7; i++) out.push(norm(f.format(new Date(Date.UTC(2026, 10, 23 + i)))).replace(/\./g, ''));
        } catch (e) {}
      DNAMES.set(key, out);
    }
    return DNAMES.get(key);
  }
  function shortDay(s, lang, year) {
    const parts = s.split(/[\s,./-]+/).filter(Boolean),
      names = monthsOf(lang).length ? monthsOf(lang) : monthsOf('en'),
      days = daysOf(lang),
      near = (a, b) => a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));
    let mo = 0,
      d = 0,
      y = 0;
    for (const p of parts) {
      let m;
      if (/^\d{4}$/.test(p)) y = +p;
      // 26, 26th, 1er, 3e
      else if ((m = /^(\d{1,2})(?:st|nd|rd|th|er|re|e|eme|º|°)?$/.exec(p)) && !d) d = +m[1];
      else if (/^\p{L}{2,}$/u.test(p)) {
        // a month's name first (Spanish "mar" is March as well as Tuesday), then a weekday's or a little word to pass
        const hit = !mo && p.length >= 3 && names.find(([nm]) => near(p, nm));
        if (hit) mo = hit[1];
        else if (!days.some(n => near(p, n)) && !['of', 'the', 'de', 'del', 'le', 'el', 'der', 'den', 'am', 'du'].includes(p)) return null;
      } else return null;
    }
    if (!mo || !d) return null;
    const k = `${y || year}-${p2(mo)}-${p2(d)}`;
    return keyOf(fromKey(k)) === k ? k : null;
  }

  /* TickTick's backup (web app: Settings → Account → Backup & Import → Generate Backup), a CSV file: a few lines about
     the file, then a row a task. Dates are UTC: an all-day one is midnight in the row's zone, a timed one a moment. A
     checklist keeps its items in Content (▫ open, ▪ done), a sub-task names its parent's row, Repeat is an RRULE.
     Status 2 (1 in older files) is done, -1 won't do; those, and notes, are not brought. */
  const TTH = /"Folder Name","List Name","Title"/;
  function fromTickTick(text, left) {
    const rows = csvRows(text),
      h = rows.findIndex(r => r[0] === 'Folder Name' && r.includes('Title'));
    if (h < 0) return [];
    const col = {};
    rows[h].forEach((n, i) => (col[n.trim()] = i));
    // every cell is cut to what One Day can keep of it before anything reads it
    const get = (r, n) => (n in col ? String(r[col[n]] || '').slice(0, 2000).trim() : ''),
      items = [],
      byId = new Map(),
      kids = [];
    let wont = 0,
      notes = 0;
    for (const r of rows.slice(h + 1)) {
      if (r.length < 3) continue;
      if (items.length + kids.length >= 20000) break;
      const kind = get(r, 'Kind').toUpperCase(),
        status = get(r, 'Status');
      if (kind === 'NOTE' || get(r, 'projectKind').toUpperCase() === 'NOTE') {
        notes++;
        continue;
      }
      if (status === '-1') {
        wont++;
        continue;
      }
      const tz = get(r, 'Timezone') || undefined,
        subs = [];
      let content = 'Content' in col ? String(r[col.Content] || '').slice(0, 30000) : '';
      if (kind === 'CHECKLIST' || /^y/i.test(get(r, 'Is Check list'))) {
        const desc = [];
        for (const ln of content.split(/\r\n|\r|\n/)) {
          const m = /^\s*([▫▪])(.*)$/.exec(ln);
          if (!m) desc.push(ln);
          else if (m[2].trim()) subs.push({ text: m[2].trim(), done: m[1] === '▪' });
        }
        content = desc.join('\n');
      }
      const done = status === '2' || status === '1',
        day = ttDay(get(r, 'Start Date') || get(r, 'Due Date'), /^true$/i.test(get(r, 'Is All Day')), /^true$/i.test(get(r, 'Is Floating')), tz),
        it = { text: get(r, 'Title'), note: content, subs, tags: [get(r, 'List Name'), ...get(r, 'Tags').split(',')], done, due: done ? null : day };
      if (done) {
        const v = get(r, 'Completed Time'),
          at = imAt(v);
        it.at = at;
        it.doneDay = at != null ? wall(at, tz).k : imDay(v.slice(0, 10)) || day;
      } else if (get(r, 'Repeat')) {
        it.rep = rruleRep(get(r, 'Repeat'));
        it.repWords = get(r, 'Repeat');
      }
      const id = get(r, 'taskId'),
        parent = get(r, 'parentId'),
        e = { it, parent };
      if (id) byId.set(id, e);
      if (parent) kids.push(e);
      else items.push(it);
    }
    // A sub-task joins the task at the top of its line (a child's row may come before its parent's). One whose parent
    // isn't in the file, or whose line turns in a circle, is a task of its own, and so are the tasks under it.
    // each line is walked once: what is found for a task holds for every task on the way up (null for a circle)
    const roots = new Map(),
      rootOf = e => {
        const path = [],
          on = new Set();
        let x = e,
          r;
        for (;;) {
          if (roots.has(x)) {
            r = roots.get(x);
            break;
          }
          if (on.has(x)) {
            r = null;
            break;
          }
          on.add(x);
          path.push(x);
          if (!(x.parent && byId.has(x.parent))) {
            r = x;
            break;
          }
          x = byId.get(x.parent);
        }
        for (const p of path) roots.set(p, r);
        return r;
      };
    const own = new Set(items);
    for (const e of kids) {
      const r = rootOf(e);
      if (!r || r === e) {
        e.parent = '';
        own.add(e.it);
        items.push(e.it);
      }
    }
    for (const e of kids) {
      if (own.has(e.it)) continue;
      const root = rootOf(e).it;
      root.subs.push({ text: e.it.text, done: e.it.done }, ...e.it.subs);
      if (e.it.note.trim()) root.note = more(root.note, `**${e.it.text.replace(/\*/g, '')}**\n${e.it.note.trim()}`);
    }
    if (wont) left.push([wont, 'task marked Won’t do', 'tasks marked Won’t do']);
    if (notes) left.push([notes, 'note', 'notes']);
    return items;
  }
  // The day of a TickTick date: an all-day one in the row's zone (its midnight, or an hour or two before it when the
  // zone changed), a floating one there too, a timed one where this browser is.
  function ttDay(v, allDay, floating, tz) {
    const t = imAt(v);
    if (t == null) return imDay(String(v).slice(0, 10));
    const w = wall(t, allDay || floating ? tz : undefined);
    return allDay && w.m === 0 && w.s === 0 && w.h >= 22 ? addDays(w.k, 1) : w.k;
  }

  /* Evernote: notes exported as .enex (in the desktop app, right-click a notebook or notes → Export → ENEX), its
     pictures and files left out on the way in (see readEnex). A note with checkboxes becomes a task: its checklist its
     sub-tasks, the rest of it its note. Each of its Evernote Tasks becomes a task of its own, on its due day or on the
     day it was done, the note's title as a tag. An older note with a reminder is a task on that day. Other notes stay
     behind. The notebook is the file's name. The export's own markup is read as text, never run or shown. */
  const ENX = /<en-export[\s>]/,
    etpl = document.createElement('template');
  // the text of one of a note's elements, its entities read (a CDATA section is kept as it is)
  function enDecode(s) {
    const c = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
    if (c) return c[1];
    etpl.innerHTML = s.replace(/</g, '&lt;');
    return etpl.content.textContent.trim();
  }
  function enText(block, tag) {
    const a = `<${tag}>`,
      i = block.indexOf(a),
      j = i > -1 ? block.indexOf(`</${tag}>`, i + a.length) : -1;
    return j > -1 ? enDecode(block.slice(i + a.length, Math.min(j, i + a.length + 30000))) : '';
  }
  // the inside of each <tag>…</tag> of a text, found in one pass
  function blocks(s, tag, max) {
    const a = `<${tag}>`,
      b = `</${tag}>`,
      out = [];
    for (let i = s.indexOf(a); i > -1 && out.length < max; ) {
      const j = s.indexOf(b, i + a.length);
      if (j < 0) break;
      out.push(s.slice(i + a.length, j));
      i = s.indexOf(a, j + b.length);
    }
    return out;
  }
  function fromEvernote(text, name, ctx) {
    const out = [],
      book = name.replace(/\.enex$/i, '');
    let plain = 0;
    for (const m of blocks(text, 'note', 20000)) {
      if (out.length >= 20000) break;
      // a note's own parts come before its body and its tasks
      const ci = m.indexOf('<content>'),
        cj = ci > -1 ? m.indexOf('</content>', ci) : -1,
        content = cj > -1 ? m.slice(ci + 9, cj) : '',
        b = cj > -1 ? m.slice(0, ci) + m.slice(cj + 10) : m,
        tasks = blocks(b, 'task', 500),
        ti = b.indexOf('<task>'),
        nb = ti > -1 ? b.slice(0, ti) : b,
        title = enText(nb, 'title').slice(0, 2000).replace(/\s+/g, ' ').trim() || 'Untitled note',
        tags = blocks(nb, 'tag', 50).map(t => enDecode(t.slice(0, 200))),
        body = enBody(content ? enDecode(content).slice(0, 200000) : ''),
        rem = imAt(enText(nb, 'reminder-time')),
        remDone = imAt(enText(nb, 'reminder-done-time'));
      let made = false;
      if (body.items.length || (!tasks.length && (rem != null || remDone != null))) {
        const it = { text: title, noteHtml: body.html, subs: body.items, tags: [book, ...tags], done: remDone != null };
        if (it.done) {
          it.at = remDone;
          it.doneDay = keyOf(new Date(remDone));
        } else if (rem != null) it.due = keyOf(new Date(rem));
        out.push(it);
        made = true;
      }
      // its tasks, in their order (sortWeight compares as written)
      const order = tasks.map(x => [enText(x, 'sortWeight'), x]).sort((a, z) => (a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0));
      for (const [, x] of order) {
        const tz = enText(x, 'timeZone') || undefined,
          done = enText(x, 'taskStatus').toLowerCase() === 'completed',
          due = imAt(enText(x, 'dueDate')),
          day = due != null ? wall(due, tz).k : null,
          it = { text: enText(x, 'title').slice(0, 2000), tags: [book, title, ...tags], done, due: done ? null : day };
        if (done) {
          const at = imAt(enText(x, 'statusUpdated'));
          it.at = at;
          it.doneDay = at != null ? keyOf(new Date(at)) : day;
        } else {
          // "DTSTART;TZID=…:20261124T090000\nRRULE:FREQ=…", the line break written as \n
          const rec = enText(x, 'recurrence');
          if (rec) {
            const rr = rec
              .split(/\\n|\r?\n/)
              .map(l => l.trim())
              .find(l => /^RRULE:/i.test(l));
            it.rep = rr ? rruleRep(rr) : null;
            it.repWords = rr || rec;
          }
        }
        out.push(it);
        made = true;
      }
      if (!made) plain++;
    }
    if (plain) ctx.left.push([plain, 'note without a checklist or task', 'notes without a checklist or task']);
    return out;
  }
  // A note's body as One Day keeps notes, its checklist apart: Evernote writes one as a list styled --en-todo (each item
  // --en-checked), older notes as <en-todo> boxes among the words. The task groups' placeholders are left out.
  function enBody(enml) {
    const items = [],
      style = a => ((/style\s*=\s*"([^"]*)"/i.exec(a) || /style\s*=\s*'([^']*)'/i.exec(a) || [])[1] || '');
    etpl.innerHTML = String(enml)
      .replace(/<en-todo\b([^>]{0,300})>(?:\s{0,20}<\/en-todo>)?/gi, (m, a) => `<input data-c="${/checked\s*=\s*["']?true/i.test(a) ? 1 : 0}">`)
      .replace(/<(ul|li|div)\b([^>]{0,300})>/gi, (m, tag, a) => {
        const st = style(a),
          chk = /--en-checked\s*:\s*(true|false)/i.exec(st);
        return `<${tag}${/--en-todo\s*:\s*true/i.test(st) ? ' data-todo=""' : ''}${chk ? ` data-c="${chk[1].toLowerCase() === 'true' ? 1 : 0}"` : ''}${/--en-task-group\s*:\s*true/i.test(st) ? ' data-group=""' : ''}>`;
      });
    const root = etpl.content,
      stop = 'input[data-c], br, div, p, li, ul, ol, table, h1, h2, h3, h4, h5, h6';
    root.querySelectorAll('[data-group], en-crypt, en-media, script, style').forEach(n => n.remove());
    for (const el of root.querySelectorAll('ul[data-todo] > li, input[data-c]')) {
      let t = '';
      if (el.tagName === 'LI') t = [...el.childNodes].filter(n => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map(n => n.textContent).join(' ');
      else
        for (let n = el.nextSibling; n && !(n.nodeType === 1 && n.matches(stop)); ) {
          const next = n.nextSibling;
          t += n.textContent;
          n.remove();
          n = next;
        }
      t = t.replace(/\s+/g, ' ').trim();
      if (t) items.push({ text: t, done: el.getAttribute('data-c') === '1' });
    }
    // what is left once the checklist is out: its lists and boxes go, and the blocks they leave empty
    root.querySelectorAll('ul[data-todo]').forEach(n => n.remove());
    root.querySelectorAll('input[data-c]').forEach(n => {
      const p = n.parentElement;
      n.remove();
      if (p && !p.textContent.trim()) p.remove();
    });
    const note = root.querySelector('en-note');
    return { items, html: (note ? note.innerHTML : etpl.innerHTML).replace(/^\s+|\s+$/g, '') };
  }

  /* Any other table with a row of column names, as Coda, Any.do's boards, Notion, Airtable or a spreadsheet export one.
     The columns are found by name, in English, French, German or Spanish: a task (or name, title) column at least, then
     done, the day it was done, a due date, notes, tags (or list, project), a repeat. A date written 4/6/2026 is read day
     first or month first as the column's other dates tell, else as this browser's language writes dates. */
  const COLS = {
    text: ['task', 'tasks', 'task name', 'name', 'title', 'to-do', 'to do', 'todo', 'item', 'subject', 'summary', 'tache', 'titre', 'nom', 'intitule', 'aufgabe', 'titel', 'tarea', 'titulo', 'nombre'],
    done: ['done', 'completed', 'complete', 'is done', 'checked', 'finished', 'status', 'state', 'fait', 'termine', 'statut', 'etat', 'erledigt', 'hecho', 'completado', 'completada', 'estado'],
    doneAt: ['completed at', 'completed on', 'completed date', 'completion date', 'date completed', 'done at', 'done on', 'done date', 'finished at', 'finished on', 'closed at', 'termine le', 'date de fin', 'erledigt am', 'fecha de finalizacion'],
    due: ['due', 'due date', 'deadline', 'do date', 'when', 'scheduled', 'scheduled date', 'date', 'start date', 'day', 'echeance', "date d'echeance", 'date limite', 'jour', 'fallig', 'falligkeitsdatum', 'datum', 'fecha limite', 'vencimiento', 'fecha'],
    note: ['notes', 'note', 'description', 'details', 'comments', 'comment', 'content', 'body', 'remarques', 'commentaire', 'beschreibung', 'notizen', 'notas', 'descripcion'],
    tags: ['tags', 'tag', 'labels', 'label', 'list', 'lists', 'project', 'projects', 'category', 'categories', 'folder', 'area', 'context', 'etiquettes', 'etiquette', 'liste', 'projet', 'categorie', 'dossier', 'schlagworter', 'projekt', 'kategorie', 'etiquetas', 'lista', 'proyecto', 'categoria'],
    rep: ['repeat', 'repeats', 'recurrence', 'recurring', 'rrule', 'repetition', 'wiederholung', 'repeticion'],
  };
  const YES = new Set(['true', 'yes', 'y', 'x', '✓', '✔', '☑', '✅', 'checked', 'done', 'completed', 'complete', 'finished', 'closed', '1', 'oui', 'fait', 'termine', 'fini', 'ja', 'erledigt', 'si', 'hecho', 'completado', 'completada']);
  // A date as tables write them: 2026-11-24, 24/11/2026 or 11/24/2026 (by `order`), Nov 24, 2026, 24 novembre 2026,
  // with a time or not; a range (Notion's "… → …") gives its start.
  function tableDay(v, order) {
    v = String(v).slice(0, 200).trim();
    // midnight UTC alone is a date, as Google and spreadsheets write one
    if (/^\d{4}-\d\d-\d\dT00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/i.test(v)) return imDay(v.slice(0, 10));
    const iso = imDay(v);
    if (iso) return iso;
    let s = norm(v)
        .trim()
        .replace(/\s*(?:→|->|–|—)\s.*$/, ''),
      m = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?![\d./-])/.exec(s);
    // numbers first, whatever follows them (24.11.26 is a date; only then is 11:26 a time)
    if (m) return imDay(`${m[1]}-${p2(m[2])}-${p2(m[3])}`);
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?![\d./-])/.exec(s))) {
      const [d, mo] = order === 'mdy' ? [m[2], m[1]] : [m[1], m[2]],
        // a year in two figures: this century, unless that is more than twenty years ahead
        yy = +m[3],
        y = m[3].length === 2 ? (yy > (new Date().getFullYear() % 100) + 20 ? 1900 : 2000) + yy : yy;
      return imDay(`${y}-${p2(mo)}-${p2(d)}`);
    }
    s = s.replace(/(?:^|[\s,]) *(?:at|a|um|om)? *\d{1,2}[:.h]\d\d(?::\d\d)? *(?:am|pm|a\.?m\.?|p\.?m\.?)?(?: *\(?[a-z]{2,5}\)?)?$/, '').trim();
    for (const lang of [navigator.language || 'en', 'en', 'fr', 'de', 'es']) {
      const k = shortDay(s, lang, todayKey().slice(0, 4));
      if (k) return k;
    }
    return null;
  }
  const US = /^en-(US|PH|CA)$|^en$/i;
  function fromTable(text, ctx) {
    const first = text.slice(0, 2000).split(/\r\n|\r|\n/, 1)[0] || '',
      sep = [',', ';', '\t'].map(s => [s, first.split(s).length]).sort((a, b) => b[1] - a[1])[0][0],
      rows = csvRows(text, sep).filter(r => r.some(c => c.trim())),
      head = (rows[0] || []).map(h => norm(String(h).slice(0, 100)).replace(/^[\s"'#*]+|[\s"'*:]+$/g, '').replace(/\s+/g, ' ')),
      used = new Set(),
      col = role => {
        for (const syn of COLS[role]) {
          const i = head.indexOf(syn);
          if (i > -1 && !used.has(i)) {
            used.add(i);
            return i;
          }
        }
        return -1;
      },
      c = { text: col('text'), doneAt: col('doneAt'), done: col('done'), due: col('due'), note: col('note'), tags: col('tags'), rep: col('rep') };
    if (c.text < 0 || rows.length < 2) return null;
    // every cell is cut to what One Day can keep of it before anything reads it
    const cell = (r, i, max = 2000) => (i < 0 ? '' : String(r[i] || '').slice(0, max).trim()),
      body = rows.slice(1, 20001);
    // day first or month first: what the dates of the file tell, else this browser's way
    let order = null;
    for (const r of body)
      for (const i of [c.due, c.doneAt, c.done]) {
        const m = /^(\d{1,2})[./-](\d{1,2})[./-]\d{2,4}\b/.exec(cell(r, i));
        if (m && +m[1] > 12) order = order || 'dmy';
        if (m && +m[2] > 12) order = order || 'mdy';
      }
    const guess = !order && body.some(r => [c.due, c.doneAt, c.done].some(i => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(cell(r, i))));
    if (!order) order = US.test(navigator.language || '') ? 'mdy' : 'dmy';
    if (guess) ctx.said.add(`Dates such as 4/6/2026 are read as ${order === 'mdy' ? 'month/day' : 'day/month'}, as this browser writes them.`);
    const out = [];
    for (const r of body) {
      const it = { text: cell(r, c.text), note: cell(r, c.note, 30000), tags: cell(r, c.tags).split(/[,;]/), done: false },
        d = cell(r, c.done),
        dd = tableDay(d, order),
        at = cell(r, c.doneAt),
        due = cell(r, c.due);
      // done: a word that says so, or a date in the done column
      it.done = YES.has(norm(d)) || !!dd || (!!at && !!tableDay(at, order));
      it.due = due ? tableDay(due, order) : null;
      if (due && !it.due) it.when = due;
      if (it.done) {
        // the day it was done, if the table says; else its due day, or today if that is still to come
        it.doneDay = (at && tableDay(at, order)) || dd || (it.due && (it.due < todayKey() ? it.due : todayKey()));
        it.when = null;
      } else if (cell(r, c.rep)) {
        const rp = cell(r, c.rep);
        it.rep = rruleRep(rp) || wordsRep(rp);
        it.repWords = rp;
      }
      out.push(it);
    }
    return out;
  }

  /* Google Tasks, from Google Takeout: Tasks.json holds every list. A task's day is the moment in its scheduled_time
     (due in older files), which is its maker's midnight written in UTC; a done task carries the moment it was done; a
     sub-task names its parent. Each list keeps its repeats, and every occurrence, done or not, names its own. */
  const GDOW = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  // the moment a task is set for (some exports write that list as Python rather than JSON)
  function gStart(t) {
    const st = t.scheduled_time;
    if (typeof st === 'string') {
      const all = [...st.matchAll(/\{[^{}]*\}/g)].map(m => m[0]),
        c = all.find(x => /'current':\s*True/.test(x)) || all[0] || '',
        m = /'start':\s*'([^']+)'/.exec(c);
      return m ? m[1] : null;
    }
    if (Array.isArray(st)) {
      const c = st.find(x => x && x.current) || st[0];
      if (c && typeof c.start === 'string') return c.start;
    }
    return typeof t.due === 'string' ? t.due : null;
  }
  // A date alone (midnight UTC, as the Tasks API writes it) is that day. Midnight on its maker's clock is that day here,
  // an hour or two either side included (another zone, a change of time); any other time, the day it shows here.
  function gDay(v, tz) {
    const s = String(v || '')
      .slice(0, 60)
      .trim();
    if (/^\d{4}-\d\d-\d\d(?:T00:00:00(?:\.0+)?(?:Z|[+-]00:?00))?$/i.test(s)) return imDay(s.slice(0, 10));
    const t = imAt(s);
    if (t == null) return null;
    // a time with a fraction of a second is a task set for that moment, never a midnight
    const w = wall(t, tz),
      timed = /\.\d*[1-9]/.test(s);
    return !timed && w.m === 0 && w.s === 0 && w.h >= 22 ? addDays(w.k, 1) : w.k;
  }
  // a list's repeat as One Day's, or null; one that has stopped is no repeat at all
  function gRep(r) {
    const sc = r && r.schedule,
      iv = sc && sc.interval;
    if (!iv || r.stopped === true || /^true$/i.test(r.stopped)) return null;
    const every = Math.round(+iv.interval_multiplier || 1),
      dow = d => GDOW.indexOf(String(d).toUpperCase());
    let rep = null;
    if (iv.daily) rep = { freq: 'day', every };
    else if (iv.weekly) {
      const ds = (Array.isArray(iv.weekly.day_of_week) ? iv.weekly.day_of_week : []).map(dow).filter(i => i > -1);
      rep = { freq: 'week', every, days: [...new Set(ds)].sort((a, b) => a - b) };
    } else if (iv.monthly) {
      const mo = iv.monthly,
        dw = mo.monthly_day_of_week;
      if (mo.day_of_month != null) {
        const d = +mo.day_of_month;
        if (d === -1 || (d >= 1 && d <= 31)) rep = { freq: 'month', every, md: d === -1 ? 31 : d };
      } else if (dw) {
        const wd = dow(dw.day_of_week),
          n = typeof dw.week_number === 'string' && !/^-?\d+$/.test(dw.week_number) ? ORD[dw.week_number.toLowerCase()] : +dw.week_number;
        if (wd > -1 && (n === -1 || (n >= 1 && n <= 4))) rep = { freq: 'month', every, nth: n, wd };
      }
    } else if (iv.yearly && iv.yearly.date_of_year) {
      const mo = +iv.yearly.date_of_year.month,
        md = +iv.yearly.date_of_year.day;
      if (mo >= 1 && mo <= 12 && md >= 1 && md <= MAXD[mo - 1]) rep = { freq: 'year', every, mo, md };
    }
    const end = sc.end_condition;
    if (rep && end) {
      const b = end.date_boundary,
        k =
          typeof b === 'string'
            ? gDay(b, sc.time_zone)
            : b && b.year
              ? imDay(`${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`)
              : null;
      if (!k) return null;
      rep.until = k;
    }
    return rep;
  }
  // how a repeat that doesn't fit is written in the task's note
  function gWords(r) {
    const sc = (r && r.schedule) || {},
      iv = sc.interval || {},
      n = Math.round(+iv.interval_multiplier || 1),
      u = iv.daily ? 'day' : iv.weekly ? 'week' : iv.monthly ? 'month' : iv.yearly ? 'year' : '',
      lim = sc.end_condition && sc.end_condition.instance_number_limit;
    return u ? `every ${n > 1 ? `${n} ${u}s` : u}${lim ? `, ${lim} times` : ''}` : 'a repeat';
  }
  function fromGoogle(j) {
    const out = [];
    for (const list of j.items.slice(0, 1000)) {
      if (!list || !Array.isArray(list.items)) continue;
      const all = list.items.filter(t => t && typeof t === 'object' && !t.deleted && typeof t.id === 'string'),
        byId = new Map(all.map(t => [t.id, t])),
        pos = t => (typeof t.position === 'string' ? t.position : ''),
        made = new Map(),
        reps = new Map((Array.isArray(list.recurrences) ? list.recurrences : []).filter(r => r && typeof r.id === 'string').map(r => [r.id, r])),
        ruled = new Set(),
        tag = typeof list.title === 'string' ? list.title : '';
      // older files keep the list's order in position; newer ones in the order of the file
      all.sort((a, b) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0));
      // its words, cut to what One Day keeps before anything reads them
      const words = t => {
        const title = typeof t.title === 'string' ? t.title.slice(0, 2000).trim() : '',
          notes = typeof t.notes === 'string' ? t.notes.slice(0, 30000) : '',
          links = (Array.isArray(t.links) ? t.links.slice(0, 20) : [])
            .filter(l => l && typeof l.link === 'string' && l.link.length < 2000 && /^https?:\/\//i.test(l.link))
            .map(l => `- [${String(l.description || l.link).slice(0, 300).replace(/[[\]\n]/g, ' ')}](${l.link})`);
        return { title: title || notes.trim().split('\n')[0].trim(), notes: [title ? notes : notes.trim().split('\n').slice(1).join('\n'), ...links].filter(Boolean).join('\n') };
      };
      // the task at the top of a sub-task's line; one whose line turns in a circle is a task of its own
      // each line is walked once: what is found for a task holds for every task on the way up
      const tops = new Map(),
        top = t => {
          const path = [],
            on = new Set();
          let x = t,
            r;
          for (;;) {
            if (tops.has(x)) {
              r = tops.get(x);
              break;
            }
            if (on.has(x)) {
              r = null;
              break;
            }
            on.add(x);
            path.push(x);
            if (!(x.parent && byId.has(x.parent))) {
              r = x;
              break;
            }
            x = byId.get(x.parent);
          }
          for (const p of path) tops.set(p, r || p);
          return tops.get(t);
        };
      for (const t of all) {
        if (out.length >= 20000) break;
        if (top(t) !== t) continue;
        const w = words(t),
          done = t.status === 'completed',
          rec = typeof t.task_recurrence_id === 'string' ? reps.get(t.task_recurrence_id) : null,
          day = gDay(gStart(t), rec && rec.schedule ? rec.schedule.time_zone : undefined),
          at = done ? imAt(t.completed) : null;
        const it = { text: w.title, note: w.notes, subs: [], tags: [tag], done, due: done ? null : day };
        if (done) {
          it.at = at;
          it.doneDay = at != null ? keyOf(new Date(at)) : day;
        } else if (rec && !ruled.has(rec.id)) {
          // the occurrence still open carries the repeat; the done ones are its history
          ruled.add(rec.id);
          it.rep = gRep(rec);
          if (!(rec.stopped === true || /^true$/i.test(rec.stopped))) it.repWords = gWords(rec);
        }
        made.set(t.id, it);
        out.push(it);
      }
      // a sub-task joins the task at the top of its line; its own notes go into that task's note
      for (const t of all) {
        const r = top(t);
        if (r === t) continue;
        const it = made.get(r.id);
        if (!it) continue;
        const w = words(t);
        if (!w.title) continue;
        it.subs.push({ text: w.title, done: t.status === 'completed' });
        if (w.notes.trim()) it.note = more(it.note, `**${w.title.replace(/\*/g, '')}**\n${w.notes.trim()}`);
      }
    }
    return out;
  }

  // todo.txt: a task a line. "x 2026-11-20 2026-11-02 Call Sam +work @phone due:2026-11-25" was done on the 20th;
  // +projects and @contexts become tags, due: is its day (else t:, the day it may start), rec: how it repeats; a priority
  // and pri: are left out. done.txt, the archive, is written the same way.
  // A file is todo.txt (whatever its name) when its lines say so: several with a mark only the format makes (a done "x"
  // and its date, a priority, a creation date, due:, t:, rec:), a fair share with one at least (+project or @context
  // too), and few that look like a Markdown or plain list.
  const TDS = /^(?:x \d{4}-\d\d-\d\d |\([A-Z]\) |\d{4}-\d\d-\d\d \S)|(?:^|\s)(?:(?:due|t):\d{4}-\d\d-\d\d|rec:\+?\d{0,3}[dbwmy])(?:\s|$)/,
    TDW = /(?:^|\s)[+@][\p{L}\p{N}]/u,
    MDL = /^(?:[-*+•]\s|\d{1,3}[.)]\s|\[[ xX]?\])/;
  function looksTodo(text) {
    let n = 0,
      strong = 0,
      sig = 0,
      list = 0;
    for (const l of linesOf(text.slice(0, 20000), 200)) {
      const s = l.trim().slice(0, 1000),
        st = TDS.test(s);
      n++;
      if (st) strong++;
      if (st || TDW.test(s)) sig++;
      if (MDL.test(s)) list++;
    }
    return n > 0 && list * 3 < n && (strong >= 2 || (n <= 3 && strong === n)) && sig * 10 >= n * 3;
  }
  function fromTodoTxt(text) {
    const out = [],
      tk = todayKey();
    for (const raw of linesOf(text, 20000)) {
      let l = raw.trim().slice(0, 5000),
        m;
      if (!l) continue;
      const it = { text: '', tags: [], done: false };
      // done: "x", then the day it was done and the day it was made (a single date is the first), a priority either side
      if ((m = /^x\s+(?:\([A-Z]\)\s+)?(?:(\d{4}-\d\d-\d\d)\s+)?(?:\d{4}-\d\d-\d\d\s+)?(?:\([A-Z]\)\s+)?/.exec(l))) {
        it.done = true;
        it.doneDay = m[1] ? imDay(m[1]) : null;
        l = l.slice(m[0].length);
      } else if ((m = /^(?:\([A-Z]\)\s+)?(?:\d{4}-\d\d-\d\d\s+)?/.exec(l))) l = l.slice(m[0].length);
      // sleek writes a multi-line task with U+0010 where its lines break: the first is the task, the rest its note
      const [first, ...more] = l.split('\u0010');
      it.note = more.join('\n');
      const words = [];
      let start = null,
        hidden = false;
      for (const w of first.split(/\s+/)) {
        const kv = /^([^\s:]+):(\S*)$/.exec(w),
          k = kv && kv[1].toLowerCase();
        if (/^[+@]\S/.test(w)) it.tags.push(w.slice(1));
        else if (kv && ['due', 't', 'rec', 'pri', 'h', 'hide'].includes(k)) {
          if (k === 'due') it.due = imDay(kv[2]);
          else if (k === 't') start = imDay(kv[2]);
          else if (k === 'rec') {
            it.rep = recRep(kv[2]);
            it.repWords = w;
          } else if (k === 'h' || k === 'hide') hidden = kv[2] !== '' && kv[2] !== '0';
        } else words.push(w);
      }
      // a hidden line (h:1) only holds lists and tags for its app
      if (hidden) continue;
      it.text = words.join(' ') || it.tags.map(g => '#' + g).join(' ');
      if (!it.done && !it.due && start && start > tk) it.due = start;
      // done with no day of its own: its due day, or today if that is still to come
      if (it.done && !it.doneDay && it.due) it.doneDay = it.due < tk ? it.due : tk;
      out.push(it);
    }
    return out;
  }
  // A Todoist repeat, in the English words its dates are written in: "every day", "every 3 weeks", "every mon, fri",
  // "every weekday", "every other month", "every 15th", "every last day", "every 2nd tue", "every jan 15", "every!
  // 3 days" (from the day it is done), with a time or an end ("until dec 31") or not. Anything else is null.
  const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
    ORD = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };
  const wdIn = w =>
    w.length >= 2
      ? WDL.findIndex(n => {
          const l = n.toLowerCase();
          return l.startsWith(w) || w === l + 's';
        })
      : -1;
  function wordsRep(s, until) {
    let v = String(s || '')
      .slice(0, 200)
      .toLowerCase()
      .replace(/[.,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const m0 = /^(?:every|ev)!?\s+(.+)$/.exec(v);
    if (/^(daily|weekly|monthly|yearly|annually)$/.test(v)) v = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annually: 'year' }[v];
    else if (m0) v = m0[1];
    else return null;
    // a time of day is left out
    v = v
      .replace(/\s+(?:at|@)\s+\S.*$/, '')
      .replace(/\s+\d{1,2}(?::\d\d\s*(?:am|pm)?|\s*(?:am|pm))$/, '')
      .trim();
    let m,
      rep = null;
    const n = x => (x === 'other' ? 2 : x ? +x : 1);
    if ((m = /^(other |\d{1,2} )?days?$/.exec(v))) rep = { freq: 'day', every: n(m[1] && m[1].trim()) };
    else if (/^(week|work)days?$/.test(v)) rep = { freq: 'week', every: 1, days: [0, 1, 2, 3, 4] };
    else if (/^weekends?$/.test(v)) rep = { freq: 'week', every: 1, days: [5, 6] };
    else if ((m = /^(other |\d{1,2} )?(week|month|year)s?$/.exec(v))) rep = { freq: m[2], every: n(m[1] && m[1].trim()) };
    else if ((m = /^(?:(other) )?([a-z]+(?:(?:, ?| and | & )[a-z]+)*)$/.exec(v)) && m[2].split(/, ?| and | & /).every(w => wdIn(w) > -1)) {
      rep = { freq: 'week', every: m[1] ? 2 : 1, days: [...new Set(m[2].split(/, ?| and | & /).map(wdIn))].sort((a, b) => a - b) };
    } else if ((m = /^(?:the )?(\d{1,2})(?:st|nd|rd|th)?(?: day)?(?: of (?:the|each|every) month)?$/.exec(v)) && +m[1] >= 1 && +m[1] <= 31)
      rep = { freq: 'month', every: 1, md: +m[1] };
    else if (/^(?:the )?last day(?: of (?:the|each|every) month)?$/.test(v)) rep = { freq: 'month', every: 1, md: 31 };
    else if ((m = /^(?:the )?([1-4])(?:st|nd|rd|th)|^(?:the )?(first|second|third|fourth|last)/.exec(v))) {
      const rest = v.slice(m[0].length).trim().replace(/ of (?:the|each|every) month$/, ''),
        w = wdIn(rest);
      if (w > -1) rep = { freq: 'month', every: 1, nth: m[1] ? +m[1] : ORD[m[2]], wd: w };
    } else if ((m = /^([a-z]{3,9}) (\d{1,2})(?:st|nd|rd|th)?$|^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,9})$/.exec(v))) {
      const mo = MON3.indexOf((m[1] || m[4]).slice(0, 3)) + 1,
        d = +(m[2] || m[3]);
      if (mo && d <= MAXD[mo - 1]) rep = { freq: 'year', every: 1, mo, md: d };
    }
    if (rep && until) rep.until = until;
    return rep && rep.every >= 1 && rep.every <= 99 ? rep : null;
  }
  // An iCalendar RRULE (TickTick writes its repeats so): the parts One Day can follow, or null. A repeat that ends after
  // a number of times, skips holidays or happens several times a day is not one of them.
  const RRD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
    MAXD = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function rruleRep(v) {
    const o = {};
    for (const part of String(v || '')
      .slice(0, 500)
      .replace(/^\s*RRULE:/i, '')
      .split(';')) {
      const i = part.indexOf('=');
      if (i > 0) o[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim().toUpperCase();
      else if (part.trim()) return null;
    }
    const freq = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[o.FREQ],
      num = (s, lo, hi) => (/^[+-]?\d{1,4}$/.test(s) && +s >= lo && +s <= hi ? +s : null);
    if (!freq || Object.keys(o).some(k => !['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'UNTIL', 'WKST'].includes(k))) return null;
    const rep = { freq, every: o.INTERVAL == null ? 1 : num(o.INTERVAL, 1, 99) };
    if (!rep.every) return null;
    if (o.BYDAY) {
      const ds = o.BYDAY.split(',').map(s => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s.trim()));
      if (ds.some(m => !m)) return null;
      if (freq === 'day' || freq === 'week') {
        // weekdays only; every day on some weekdays is every week on them
        if (o.BYSETPOS || ds.some(m => m[1]) || (freq === 'day' && rep.every > 1)) return null;
        rep.freq = 'week';
        rep.days = [...new Set(ds.map(m => RRD.indexOf(m[2])))].sort((a, b) => a - b);
      } else {
        // one weekday of the month: 2TU, -1FR, or TU with BYSETPOS=2; in a year, only with its month
        const n = ds.length === 1 ? num(ds[0][1] != null ? ds[0][1] : o.BYSETPOS, -1, 4) : null;
        if (!n || (freq === 'year' && !o.BYMONTH) || (ds[0][1] != null && o.BYSETPOS)) return null;
        rep.nth = n;
        rep.wd = RRD.indexOf(ds[0][2]);
      }
    } else if (o.BYSETPOS) return null;
    if (o.BYMONTH) {
      rep.mo = num(o.BYMONTH, 1, 12);
      if (!rep.mo || freq !== 'year') return null;
    }
    if (o.BYMONTHDAY) {
      // a date of the month (-1, the last day, in a monthly repeat); in a year, only with a month that has it
      rep.md = freq === 'month' && o.BYMONTHDAY === '-1' ? 31 : num(o.BYMONTHDAY, 1, 31);
      if (!rep.md || rep.nth || (freq !== 'month' && !rep.mo) || (rep.mo && rep.md > MAXD[rep.mo - 1])) return null;
    }
    if (o.UNTIL) {
      rep.until = imDay(o.UNTIL);
      if (!rep.until) return null;
    }
    return rep;
  }
  // rec:1w, rec:+2m, rec:3d, rec:1y, rec:1b (business days): "+" counts from the due date rather than from the day it
  // was done. One Day counts from the day either way.
  function recRep(v) {
    const m = /^\+?(?:(\d{1,3})([dbwmy])?|([dbwmy]))$/i.exec(v);
    if (!m) return null;
    const n = +m[1] || 1,
      u = (m[2] || m[3] || 'd').toLowerCase();
    if (u === 'b') return n === 1 ? { freq: 'week', every: 1, days: [0, 1, 2, 3, 4] } : null;
    return { freq: { d: 'day', w: 'week', m: 'month', y: 'year' }[u], every: n };
  }

  /* the import dialog: how many tasks, on which days, before they are added */
  const IM = {};
  'imp impCard impT impSub impList impNote impNo impGo'.split(' ').forEach(id => (IM[id] = document.getElementById(id)));
  let IMP = null,
    IMSEAL = false; // an import being sealed with the lock: no shortcut runs meanwhile, not even an undo
  const plainTitle = t => t.replace(TAGRE, '$1').replace(/\s+/g, ' ').trim() || t;
  function showImport(found) {
    const P = imPlan(found.items),
      from = AND.format(found.apps);
    if (P.big) return toast('That is more than this browser can keep: nothing was added');
    if (!P.n)
      return toast(
        P.full.size ? 'Those days are full: nothing was added' : P.undated ? 'Only done tasks without a date: nothing to add' : `Nothing to import from ${from}`,
      );
    if (pip) pip.close();
    closePops();
    closeMore();
    compose(false);
    const tk = todayKey(),
      ks = Object.keys(P.days),
      soon = ks.filter(k => k >= tk).sort(),
      before = ks.filter(k => k < tk).sort().reverse(),
      count = l => {
        const d = l.filter(t => t.done).length,
          o = l.length - d;
        return [o ? `${o} ${o > 1 ? 'tasks' : 'task'}` : '', d ? `${d} done` : ''].filter(Boolean).join(', ');
      },
      row = k => {
        const l = P.days[k],
          names = l.slice(0, 3).map(t => plainTitle(t.text));
        return `<li><span class="imk">${esc(dayLabel(k))}</span><span class="imc">${count(l)}</span><span class="imx">${esc(names.join(', '))}${l.length > 3 ? ', …' : ''}</span></li>`;
      },
      group = (title, keys) =>
        keys.length
          ? `<h3 class="imh">${title}</h3><ul class="imd">${keys.slice(0, 200).map(row).join('')}</ul>` +
            (keys.length > 200 ? `<p class="imm">and ${keys.length - 200} more days</p>` : '')
          : '';
    IM.impList.innerHTML =
      group('From today', soon) +
      (P.reps.length
        ? `<h3 class="imh">Repeating</h3><ul class="imd">${P.reps
            .slice(0, 200)
            .map(r => `<li><span class="imk">${esc(plainTitle(r.text))}</span><span class="imx">${esc(ruleText(r))}</span></li>`)
            .join('')}</ul>`
        : '') +
      group('Before today', before);
    const notes = [],
      tags = [...P.tags.keys()],
      s = (n, one, many) => `${n} ${n > 1 ? many : one}`;
    if (tags.length)
      notes.push(`Lists, projects and labels come in as tags: ${tags.slice(0, 5).map(g => '#' + g).join(', ')}${tags.length > 5 ? ` and ${tags.length - 5} more` : ''}.`);
    // already here, word for word, on the same days: most likely imported before
    if (P.dupes && P.dupes * 2 >= P.n)
      notes.unshift(`${P.dupes === P.n ? (P.n > 1 ? 'All of these are' : 'This one is') : `${P.dupes} of these are`} already in One Day, on the same ${P.dupes > 1 ? 'days' : 'day'}: adding them again would make doubles.`);
    if (P.noted) notes.push(`${s(P.noted, 'repeat', 'repeats')} One Day can’t follow ${P.noted > 1 ? 'are written in their notes' : 'is written in its note'}.`);
    if (P.over) notes.push(`${s(P.over, 'task repeats', 'tasks repeat')} past the 300 repeats One Day keeps: ${P.over > 1 ? 'they come' : 'it comes'} in once, ${P.over > 1 ? 'their repeat in their notes' : 'its repeat in its note'}.`);
    if (P.full.size)
      notes.push(`${P.cut ? s(P.cut, 'task', 'tasks') + ' left out: ' : ''}${P.full.size > 1 ? `${P.full.size} days are` : dayLabel([...P.full][0]) + ' is'} full (300 tasks a day).`);
    if (P.undated) notes.push(`${s(P.undated, 'done task', 'done tasks')} without a date ${P.undated > 1 ? 'are' : 'is'} left out.`);
    if (P.old) notes.push(`The oldest ${s(P.old, 'done task is', 'done tasks are')} left out: this browser can’t keep more.`);
    if (P.subcut) notes.push(`${s(P.subcut, 'sub-task', 'sub-tasks')} over 100 in a task ${P.subcut > 1 ? 'are' : 'is'} left out.`);
    if (P.whens) notes.push(`${s(P.whens, 'date', 'dates')} One Day couldn’t read ${P.whens > 1 ? 'are written in their notes' : 'is written in its note'}.`);
    if (found.left.length)
      notes.push(`${AND.format(found.left.map(([n, one, many]) => s(n, one, many)))} ${found.left.length > 1 || found.left[0][0] > 1 ? 'are' : 'is'} left out.`);
    notes.push(...found.said);
    IM.impNote.innerHTML = notes.map(x => `<p>${esc(x)}</p>`).join('');
    IM.impNote.hidden = !notes.length;
    IM.impT.textContent = P.n > 1 ? `${P.n} tasks from ${from}` : `A task from ${from}`;
    IM.impGo.textContent = P.n > 1 ? 'Add all' : 'Add';
    const ae = D().activeElement;
    IMP = { items: found.items, from, back: ae && ae !== D().body ? ae : null };
    // the file is read here; on the hosted page with sync, the tasks it adds are saved like any other
    IM.impSub.textContent = cloud.col
      ? 'Read here, in this browser. Like your other tasks, these are also saved in your private space on Claude.'
      : SYS
        ? `Read here, in this browser. Like your other tasks, these will sync to your ${CL[SYS.cloud].name}, encrypted.`
        : 'Read here, in this browser. Nothing is sent anywhere.';
    IM.impList.scrollTop = 0;
    home.inert = true;
    modalIn(TAP && TAP.el.isConnected && Date.now() - TAP.t < 1500 ? TAP.el : IMP.back, IM.imp, IM.impCard);
    imFade();
    guard('imp', () => closeImport());
    IM.impGo.focus({ preventScroll: true });
  }
  // the list fades at its foot while more is below, and takes the keyboard's focus only when it scrolls
  const imFade = () => {
    const l = IM.impList;
    l.classList.toggle('more', l.scrollTop + l.clientHeight < l.scrollHeight - 2);
    l.tabIndex = l.scrollHeight > l.clientHeight + 1 ? 0 : -1;
  };
  IM.impList.addEventListener('scroll', imFade, { passive: true });
  function closeImport() {
    const m = IMP;
    if (!m) return null;
    IMP = null;
    unguard('imp');
    modalOut(IM.imp, IM.impCard);
    if (!locked) home.inert = false;
    if (m.back && m.back.isConnected && !m.back.closest('[inert]')) m.back.focus({ preventScroll: true });
    return m;
  }
  IM.impNo.onclick = () => closeImport();
  IM.imp.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeImport();
  });
  IM.imp.addEventListener('click', e => {
    if (e.target === IM.imp) closeImport();
  });
  // Add all: planned again against the days as they are now, then added in one step that one undo takes back.
  // It is written once, and checked: if the browser can't keep it all, nothing is added.
  const TOOBIG = 'That is more than this browser can keep: nothing was added';
  IM.impGo.onclick = async () => {
    const m = closeImport();
    if (!m || locked) return;
    const P = imPlan(m.items);
    if (P.big || !P.n) {
      toast(P.big ? TOOBIG : 'Those days are full: nothing was added');
      return;
    }
    const keys = Object.keys(P.days);
    record(Object.keys(P.rules).length ? [...keys, cur] : keys);
    const rec = UN[UN.length - 1];
    Object.assign(S.rules, P.rules);
    for (const k of keys) day(k).tasks.push(...P.days[k]);
    let ok = commitMany(keys);
    // with the lock, the write is sealed a moment later: nothing else is done meanwhile, so it can still be taken back
    if (ok && vault) {
      home.inert = true;
      IMSEAL = true;
      try {
        await flush();
      } finally {
        IMSEAL = false;
        if (!locked) home.inert = false;
      }
      ok = sealOk;
    }
    if (locked) return;
    if (!ok) {
      if (UN[UN.length - 1] === rec) applySnap(UN.pop(), []);
      toast(TOOBIG);
      return;
    }
    closeSearch();
    ensure(cur);
    flip(() => {
      renderList();
      renderAux();
    });
    toast(`Imported ${P.n > 1 ? P.n + ' tasks' : 'a task'} from ${m.from}`, 'undo');
  };

  /* tag suggestions while typing */
  let SG = null;
  function sugCheck(el) {
    let text;
    if (el.tagName === 'INPUT') text = el.value.slice(0, el.selectionStart);
    else {
      const sel = D().getSelection();
      if (!sel.rangeCount || !sel.isCollapsed) return hideSug();
      const r = sel.getRangeAt(0);
      if (!el.contains(r.startContainer)) return hideSug();
      const pre = D().createRange();
      pre.selectNodeContents(el);
      pre.setEnd(r.startContainer, r.startOffset);
      text = pre.toString();
    }
    const m = text.match(/(?:^|\s)#([\p{L}\p{N}_\-\/]*)$/u);
    if (!m) return hideSug();
    const qn = norm(m[1]);
    const items = allTags()
      .filter(([g]) => norm(g).startsWith(qn) && norm(g) !== qn)
      .slice(0, 6);
    if (!items.length) return hideSug();
    SG = {
      el,
      pos: text.length,
      len: m[1].length,
      items,
      sel: SG && SG.el === el ? Math.min(SG.sel, items.length - 1) : 0,
    };
    renderSug();
  }
  function renderSug() {
    $.sug.innerHTML = SG.items
      .map(
        ([g, c], i) =>
          `<button type="button" role="option" data-i="${i}" class="${i === SG.sel ? 'sel' : ''}" aria-selected="${i === SG.sel}">${tdot(g)}#${esc(g)}<span>${c}</span></button>`,
      )
      .join('');
    let r;
    if (SG.el.tagName === 'INPUT') {
      const b = SG.el.getBoundingClientRect();
      r = { left: b.left - 4, top: b.top, bottom: b.bottom, width: 0 };
    } else {
      const rr = D().getSelection().getRangeAt(0).getBoundingClientRect();
      r = { left: rr.left - 12, top: rr.top, bottom: rr.bottom, width: 0 };
    }
    const w = $.sug.offsetWidth;
    r.left += w / 2;
    place($.sug, r, 'up');
  }
  function hideSug() {
    SG = null;
    $.sug.classList.remove('on');
  }
  function acceptSug(i) {
    if (!SG) return;
    const g = SG.items[i == null ? SG.sel : i][0],
      el = SG.el,
      ins = g + ' ',
      a = SG.pos - SG.len;
    if (el.tagName === 'INPUT') {
      const v = el.value;
      el.value = v.slice(0, a) + ins + v.slice(SG.pos).replace(/^\s/, '');
      const c = a + ins.length;
      el.setSelectionRange(c, c);
      if (el === $.input) $.add.classList.toggle('typing', !!el.value.trim());
    } else {
      const full = el.textContent;
      el.textContent = full.slice(0, a) + ins + full.slice(SG.pos).replace(/^\s/, '');
      const tn = el.firstChild,
        r = D().createRange();
      r.setStart(tn, Math.min(a + ins.length, tn.length));
      r.collapse(true);
      const s = D().getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    hideSug();
  }
  function sugKey(e) {
    if (!SG) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      SG.sel = (SG.sel + (e.key === 'ArrowDown' ? 1 : -1) + SG.items.length) % SG.items.length;
      renderSug();
      return true;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      acceptSug();
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideSug();
      return true;
    }
    return false;
  }
  $.sug.addEventListener('pointerdown', e => {
    e.preventDefault();
    const b = e.target.closest('button');
    if (b) acceptSug(+b.dataset.i);
  });

  /* filter by tag: the day shows only the tasks with that tag, in the task or in one of its sub-tasks.
     It stays on from day to day until it is cleared, and a task added meanwhile takes the tag. */
  function tagsIn(t) {
    return tagsOf([t.text, ...(t.subs || []).map(s => s.text)].join(' '));
  }
  function hasTag(t, g) {
    return tagsIn(t).includes(g);
  }
  function dayTags(k) {
    const m = new Map();
    for (const t of tasks(k)) for (const g of tagsIn(t)) m.set(g, (m.get(g) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
  function renderFilter() {
    const move = !RM.matches && $.fx.getClientRects().length > 0,
      r0 = move ? $.fx.getBoundingClientRect() : null,
      w0 = move ? r0.width : 0;
    if (move) $.fx.getAnimations().forEach(a => a.id === 'fw' && a.cancel());
    $.fx.classList.toggle('on', !!FX);
    $.fname.textContent = FX ? '#' + FX : '';
    $.fclr.hidden = !FX;
    $.fbtn.setAttribute('aria-label', FX ? `Filtered by #${FX}. Change the filter` : 'Filter by tag');
    $.fbtn.dataset.tip = FX ? 'Change the filter' : 'Filter by tag';
    $.input.placeholder = FX ? `Add a task to #${FX}` : 'Add a task';
    if (!move) return;
    const r1 = $.fx.getBoundingClientRect(),
      w1 = r1.width;
    if (Math.abs(w1 - w0) < 0.5) return;
    // short of room, it went to a line of its own under the date (or came back): it appears there, without
    // stretching across the jump
    if (Math.abs(r1.top - r0.top) > 1) {
      an($.fx, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { easing: POP.ease, duration: POP.dur });
      return;
    }
    $.fx.style.overflow = 'hidden';
    const a = $.fx.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: SP.dur, easing: SP.ease });
    a.id = 'fw';
    a.onfinish = a.oncancel = () => {
      if (!$.fx.getAnimations().some(x => x.id === 'fw' && x !== a)) $.fx.style.overflow = '';
    };
  }
  function setFilter(g) {
    FX = g || null;
    renderFilter();
    flip(() => {
      renderList();
      renderAux();
    });
  }
  // The list stays short: the day's tags, then the ones used lately. With more tags than that, a field finds any.
  const FMAX = 8;
  function recentTags(k) {
    const tk = todayKey(),
      lo = addDays(tk, -21),
      hi = addDays(tk, 7),
      last = new Map();
    for (const d of Object.keys(S.days)) {
      if (d < lo || d > hi || d === k) continue;
      for (const t of S.days[d].tasks) for (const g of tagsIn(t)) if (!(last.get(g) >= d)) last.set(g, d);
    }
    return [...last].sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([g]) => g);
  }
  function filterRows(q) {
    const day = dayTags(cur),
      on = new Map(day);
    if (q) {
      const nq = norm(q),
        all = allTags().map(([g]) => g),
        first = all.filter(g => norm(g).startsWith(nq)),
        then = all.filter(g => !norm(g).startsWith(nq) && norm(g).includes(nq));
      return [...first, ...then].slice(0, FMAX).map(g => [g, on.get(g) || 0]);
    }
    const rows = day.slice(0, FMAX);
    for (const g of recentTags(cur)) {
      if (rows.length >= FMAX) break;
      if (!on.has(g)) rows.push([g, 0]);
    }
    if (FX && !rows.some(([g]) => g === FX)) rows.unshift([FX, on.get(FX) || 0]);
    return rows;
  }
  function renderFtags(q) {
    const rows = filterRows(q);
    let h = '';
    if (!q && (FX || rows.length))
      h += `<div class="frow"><span class="fdot" aria-hidden="true"></span><button type="button" class="ftag" data-tag="" aria-pressed="${!FX}">All tasks<span>${tasks(cur).length}</span></button></div>`;
    h += rows
      .map(
        ([g, c]) =>
          `<div class="frow"><button type="button" class="fdot" data-tag="${esc(g)}"${cAttr(g)} aria-expanded="false" aria-label="${esc(dotLabel(g))}"></button><button type="button" class="ftag" data-tag="${esc(g)}" aria-pressed="${g === FX}">#${esc(g)}<span>${c || ''}</span></button></div>`,
      )
      .join('');
    $.ftags.innerHTML =
      h ||
      (q
        ? `<p class="fempty">No tag matches “${esc(q)}”.</p>`
        : '<p class="fempty">No tags yet. Type #something in a task to filter by it.</p>');
    [...$.ftags.children].forEach((c, i) =>
      an(c, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
        duration: 220,
        delay: Math.min(i, 8) * 16,
        fill: 'backwards',
      }),
    );
    ftEdges();
  }
  // The popover never leaves the window: it stops above the bottom edge (or the bottom bar, or the keyboard),
  // the title and the field stay, and the list scrolls inside it, its cut edges fading. Where the list is cut,
  // the cut goes through the middle of a tag: a half-shown row says there is more, even with no scrollbar.
  function fitFilter() {
    const vv = W().visualViewport,
      bar = $.mbar.getClientRects().length ? $.mbar.getBoundingClientRect().top : Infinity,
      bottom = Math.min(vv ? vv.offsetTop + vv.height : W().innerHeight, bar),
      top = $.fpop.offsetParent.getBoundingClientRect().top + $.fpop.offsetTop,
      h = Math.max(150, Math.floor(bottom - 12 - top)),
      t = $.ftags,
      // positions inside the popover, from the layout: its opening scale does not count
      y = el => {
        let v = 0;
        for (let n = el; n && n !== $.fpop; n = n.offsetParent) v += n.offsetTop;
        return v;
      };
    $.fpop.style.maxHeight = h + 'px';
    if (t.scrollHeight > t.clientHeight + 1) {
      const cut = y(t) + t.clientHeight;
      let mid = 0;
      for (const r of t.children) {
        const m = y(r) + r.offsetHeight / 2;
        if (m > cut) break;
        mid = m;
      }
      if (mid && cut - mid > 1) $.fpop.style.maxHeight = h - Math.round(cut - mid) + 'px';
    }
    ftEdges();
  }
  function ftEdges() {
    const t = $.ftags;
    t.classList.toggle('st', t.scrollTop > 1);
    t.classList.toggle('sb', t.scrollTop + t.clientHeight < t.scrollHeight - 1);
  }
  $.ftags.addEventListener('scroll', ftEdges, { passive: true });
  function openFilter() {
    closePops();
    const n = allTags().length,
      many = n > FMAX;
    $.fqL.hidden = !many;
    $.fq.value = '';
    $.fq.placeholder = `Find a tag among ${n}`;
    renderFtags('');
    $.ftags.scrollTop = 0;
    fitFilter();
    $.fpop.classList.add('on');
    guard('pops', () => closePops(true));
    $.fbtn.setAttribute('aria-expanded', 'true');
    hideTip(0);
    // no ring on opening: the field takes the focus, or the popover itself; the arrows lead into the list
    (many ? $.fq : $.fpop).focus({ preventScroll: true });
  }
  $.fq.addEventListener('input', () => renderFtags($.fq.value.trim().replace(/^#/, '')));
  $.fq.addEventListener('keydown', e => {
    const first = $.ftags.querySelector('.ftag');
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (first) first.click();
    } else if (e.key === 'ArrowDown' && first) {
      e.preventDefault();
      first.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if ($.fq.value) {
        $.fq.value = '';
        renderFtags('');
      } else closePops(true);
    }
  });
  $.fpop.addEventListener('keydown', e => {
    if (D().activeElement !== $.fpop || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const bs = $.ftags.querySelectorAll('.ftag');
    if (!bs.length) return;
    e.preventDefault();
    (e.key === 'ArrowDown' ? bs[0] : bs[bs.length - 1]).focus();
  });
  $.fbtn.onclick = () => ($.fpop.classList.contains('on') ? closePops() : openFilter());
  $.fclr.onclick = e => {
    setFilter(null);
    if (!e.detail) $.fbtn.focus({ preventScroll: true });
  };
  $.ftags.onclick = e => {
    const dot = e.target.closest('.fdot[data-tag]');
    if (dot) return swatches(dot, !e.detail);
    const sw = e.target.closest('[data-sw]');
    if (sw) return pickColour(sw, !e.detail);
    const b = e.target.closest('.ftag');
    if (!b) return;
    closePops(true);
    setFilter(b.dataset.tag);
  };
  /* A tag's colour, in two taps: its dot shows the colours under it, a colour is worn at once everywhere the tag
     is shown, and the colours fold away. The keyboard moves along them with the arrows. */
  const dotLabel = g => `Colour of #${g}: ${tcol(g) ? TCOLN[tcol(g)] : 'none'}`;
  function swatches(dot, keys) {
    const g = dot.dataset.tag,
      open = $.ftags.querySelector('.fsw:not(.out)'),
      same = !!open && open.dataset.tag === g;
    if (open) foldSwatches(open);
    // its own dot again: the colours fold away
    if (same) {
      if (keys) dot.focus({ preventScroll: true });
      return;
    }
    const c = tcol(g),
      sw = D().createElement('div');
    sw.className = 'fsw';
    sw.dataset.tag = g;
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', `Colour of #${g}`);
    sw.innerHTML = [...TCOL, '']
      .map(
        k =>
          `<button type="button" data-sw="${k}"${k ? ` data-c="${k}"` : ''} aria-pressed="${k === c}" aria-label="${k ? TCOLN[k] : 'No colour'}"></button>`,
      )
      .join('');
    dot.parentElement.after(sw);
    dot.setAttribute('aria-expanded', 'true');
    fitFilter();
    an(sw, [{ height: '0px', opacity: 0 }, { height: sw.offsetHeight + 'px', opacity: 1 }], { duration: SNAP.dur * 0.7, easing: SNAP.ease });
    [...sw.children].forEach((b, i) =>
      an(b, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], {
        duration: POP.dur * 0.8,
        easing: POP.ease,
        delay: i * 18,
        fill: 'backwards',
      }),
    );
    if (keys) (sw.querySelector('[aria-pressed="true"]') || sw.firstElementChild).focus({ preventScroll: true });
    sw.scrollIntoView({ block: 'nearest' });
  }
  function foldSwatches(sw) {
    const dot = $.ftags.querySelector(`.fdot[data-tag="${CSS.escape(sw.dataset.tag)}"]`);
    if (dot) dot.setAttribute('aria-expanded', 'false');
    delete sw.dataset.tag;
    sw.classList.add('out');
    then(an(sw, [{ height: sw.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 180, easing: 'ease-in' }), () => {
      sw.remove();
      if ($.fpop.classList.contains('on')) fitFilter();
    });
  }
  function pickColour(b, keys) {
    const sw = b.parentElement,
      g = sw.dataset.tag;
    if (!g) return;
    setTagColour(g, b.dataset.sw);
    const dot = $.ftags.querySelector(`.fdot[data-tag="${CSS.escape(g)}"]`);
    foldSwatches(sw);
    if (dot) {
      an(dot, [{ transform: 'scale(.6)' }, { transform: 'none' }], { duration: POP.dur, easing: POP.ease });
      if (keys) dot.focus({ preventScroll: true });
    }
  }
  function setTagColour(g, c) {
    if (!S.tags) S.tags = {};
    if (c && TCOL.includes(c)) S.tags[g] = c;
    else delete S.tags[g];
    persist();
    // everywhere the tag is shown, at once
    for (const d of [D(), document]) {
      d.querySelectorAll(`.tag[data-tag="${CSS.escape(g)}"], .fdot[data-tag="${CSS.escape(g)}"]`).forEach(n => {
        if (c) n.dataset.c = c;
        else delete n.dataset.c;
        if (n.classList.contains('fdot')) n.setAttribute('aria-label', dotLabel(g));
      });
    }
    if ($.srch.classList.contains('on')) renderSearch();
  }
  $.ftags.addEventListener('keydown', e => {
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const dot = $.ftags.querySelector(`.fdot[data-tag="${CSS.escape(b.parentElement.dataset.tag || '')}"]`);
      foldSwatches(b.parentElement);
      if (dot) dot.focus({ preventScroll: true });
      return;
    }
    if (!d) return;
    e.preventDefault();
    const bs = [...b.parentElement.children];
    bs[(bs.indexOf(b) + d + bs.length) % bs.length].focus();
  });
  $.ftags.addEventListener('keydown', e => {
    const bs = [...$.ftags.querySelectorAll('.ftag')],
      i = bs.indexOf(D().activeElement),
      d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!d || i < 0) return;
    e.preventDefault();
    if (i === 0 && d < 0 && !$.fqL.hidden) $.fq.focus();
    else bs[Math.max(0, Math.min(bs.length - 1, i + d))].focus();
  });

  /* A pasted list: one item per line. Bullets, numbers and checkboxes are left out, as Markdown, Notion, notes and
     to-do apps write them ("- [x]", ☑, ✅ make it done); a single line pastes as usual. In the composer, a line set
     further in than the one above becomes its sub-task, as Notion and Markdown nest them. */
  const BUL = /^(?:[•◦▪·‣⁃]\s*|(?:[-*+–—]|\d{1,3}[.)]|\(\d{1,3}\)|[a-zA-Z][.)])\s+)/,
    BOX = /^(?:\[( |x|X)?\]|([☐☑☒✅✔✓□▢◻⬜]))\uFE0F?\s*/,
    OPEN = '☐□▢◻⬜';
  function listItems(txt, max = 100) {
    const out = [];
    for (const line of linesOf(String(txt), max * 2)) {
      const raw = line.slice(0, 5000);
      let l = raw.replace(/\s+/g, ' ').trim(),
        done = false;
      l = l.replace(BUL, '');
      const b = BOX.exec(l);
      if (b) {
        done = (!!b[1] && b[1] !== ' ') || (!!b[2] && !OPEN.includes(b[2]));
        l = l.slice(b[0].length);
      }
      l = l.trim().slice(0, 500);
      // how far in the line starts (a tab counts as four spaces)
      if (l) out.push({ text: l, done, ind: raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length });
      if (out.length >= max) break;
    }
    return out;
  }
  // lines further in than the list's own margin go under the line above them, as its sub-tasks
  function nestItems(items) {
    const base = Math.min(...items.map(it => it.ind)),
      out = [];
    for (const it of items) {
      const top = out[out.length - 1];
      if (it.ind > base && top) (top.subs || (top.subs = [])).push({ text: it.text, done: it.done });
      else out.push({ text: it.text, done: it.done });
    }
    return out;
  }
  function pasteList(e, add) {
    const txt = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!txt || !/[\r\n]/.test(txt.trim())) return;
    const items = listItems(txt);
    if (items.length < 2) return;
    e.preventDefault();
    hideSug();
    add(items);
  }

  /* composer */
  $.input.addEventListener('input', () => {
    $.add.classList.toggle('typing', !!$.input.value.trim());
    sugCheck($.input);
  });
  $.input.addEventListener('blur', hideSug);
  // The plus adds what is typed, like Enter: a phone's keyboard hides its Enter behind a tick. Pressing it keeps the
  // focus in the field, so the keyboard stays up and the composer stays open for the next task. Empty, it goes to the field.
  const keepFocus = e => e.preventDefault();
  $.addGo.addEventListener('pointerdown', keepFocus);
  $.addGo.addEventListener('mousedown', keepFocus);
  $.addGo.onclick = () => {
    const v = $.input.value.replace(/\s+/g, ' ').trim();
    if (D().activeElement !== $.input) $.input.focus({ preventScroll: true });
    if (!v) return;
    $.input.value = '';
    $.add.classList.remove('typing');
    hideSug();
    addTask(v);
  };
  // A pasted list (one item per line) becomes as many tasks; what was typed stays in the composer.
  $.input.addEventListener('paste', e => pasteList(e, items => addTasks(nestItems(items))));
  $.input.addEventListener('keydown', e => {
    if (sugKey(e)) return;
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const v = $.input.value.replace(/\s+/g, ' ').trim();
      if (!v) return;
      $.input.value = '';
      $.add.classList.remove('typing');
      addTask(v);
    } else if (e.key === 'Escape') {
      $.input.value = '';
      $.add.classList.remove('typing');
      $.input.blur();
    } else if (e.key === 'ArrowUp' && !$.input.value) {
      const r = [...$.list.children].filter(n => !n.classList.contains('exit')).pop();
      if (r) {
        e.preventDefault();
        r.querySelector('.in .ck').focus();
      }
    }
  });

  /* the day a new task goes to: the day on screen, unless another one is picked.
     The pick holds until the task is added (or the day on screen changes), then goes back to the day on screen. */
  let addTo = null,
    addRule = null,
    DPX = 'add';
  const addDay = () => addTo || cur;
  const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayName = k => {
    const n = diff(todayKey(), k);
    return Math.abs(n) <= 1 ? relLabel(k).toLowerCase() : LONG.format(fromKey(k)) + (k.slice(0, 4) !== todayKey().slice(0, 4) ? ' ' + k.slice(0, 4) : '');
  };
  // The day chip follows its label: the words change at once, its width moves on a spring from wherever it is.
  function renderChip(pop) {
    const k = addDay(),
      r = addRule && cleanRule({ ...addRule, text: 'x', start: k }, 'x'),
      label = r ? ruleText(r, true) : dayLabel(k),
      move = label !== $.dlabel.textContent && !RM.matches && $.dchip.getClientRects().length > 0,
      w0 = move ? $.dchip.getBoundingClientRect().width : 0;
    if (move) $.dchip.getAnimations().forEach(a => a.id === 'cw' && a.cancel());
    $.dlabel.textContent = label;
    if (move) {
      const w1 = $.dchip.getBoundingClientRect().width;
      if (Math.abs(w1 - w0) > 0.5) {
        const a = $.dchip.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: SP.dur, easing: SP.ease });
        a.id = 'cw';
        $.dchip.style.overflow = 'hidden';
        a.onfinish = a.oncancel = () => {
          if (!$.dchip.getAnimations().some(x => x.id === 'cw' && x !== a)) $.dchip.style.overflow = '';
        };
      }
    }
    $.dchip.classList.toggle('set', k !== cur || !!r);
    $.dchip.classList.toggle('rep', !!r);
    $.dchip.setAttribute(
      'aria-label',
      r
        ? `${ruleText(r, true)}: new tasks repeat ${ruleText(r).toLowerCase()}, from ${dayName(k)}. Change`
        : `${dayLabel(k)}: new tasks go to ${dayName(k)}. Choose another day`,
    );
    if (pop)
      an($.dchip, [{ transform: 'scale(.9)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  }
  // Once a task is added, the next one starts from the day on screen again.
  function resetPick() {
    if (!addTo && !addRule) return;
    addTo = null;
    addRule = null;
    renderChip(true);
  }
  function setAddTo(k) {
    const was = addDay();
    addTo = k === cur ? null : k;
    renderChip(k !== was);
  }
  function addTasks(items) {
    // a repeating task brings no sub-tasks here: what was nested comes in as tasks of its own
    if (addRule) items = items.flatMap(it => [{ text: it.text, done: it.done }, ...(it.subs || [])]);
    if (FX) items = items.map(it => (tagsOf(it.text).includes(FX) ? it : { ...it, text: it.text + ' #' + FX }));
    const k = addDay(),
      room = 300 - tasks(k).length,
      list = items.slice(0, Math.max(0, room));
    if (!list.length) return toast('That day is full');
    record([k]);
    const now = Date.now();
    let first = null;
    const made = [];
    for (const it of list) {
      if (addRule) {
        const r = cleanRule({ ...addRule, text: it.text, start: k }, 'r' + uid());
        if (!r) continue;
        S.rules[r.id] = r;
        if (occurs(r, k)) {
          const o = fromRule(r, k);
          day(k).tasks.push(o);
          made.push(o.id);
        }
        first = first || nextOcc(r, k);
      } else {
        const t = { id: uid(), text: it.text, done: it.done };
        if (it.done) t.at = now;
        if (it.subs && it.subs.length)
          t.subs = it.subs.slice(0, 100).map(s => ({ id: uid(), text: s.text.slice(0, 300), done: !!s.done }));
        day(k).tasks.push(t);
        made.push(t.id);
      }
    }
    commit(k);
    const n = list.length,
      ns = addRule ? 0 : list.reduce((a, it) => a + (it.subs ? Math.min(100, it.subs.length) : 0), 0),
      what =
        `${n} ${addRule ? 'repeating task' : 'task'}${n === 1 ? '' : 's'}` +
        (ns ? ` and ${ns} sub-task${ns === 1 ? '' : 's'}` : ''),
      cut = items.length > list.length ? ` (that day is full, ${items.length - list.length} left out)` : '';
    if (k === cur && made.length) {
      flip(() => {
        renderList();
        renderAux();
      });
      const li = rowOf(made[made.length - 1]);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
      toast(`Added ${what}${cut}`, 'undo');
    } else {
      const to = k !== cur ? k : first || k,
        d = Math.sign(diff(cur, to)) || 1;
      if (to !== cur) nudge(d > 0 ? $.next : $.prev, d);
      toast(`Added ${what} to ${dayName(to)}${cut}`, 'undo');
    }
    if (addTo || addRule) resetPick();
  }
  function addElsewhere(text, k) {
    record([k]);
    day(k).tasks.push({ id: uid(), text, done: false });
    commit(k);
    const d = Math.sign(diff(cur, k)) || 1;
    nudge(d > 0 ? $.next : $.prev, d);
    an($.dchip, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], {
      duration: 420,
      easing: 'ease-out',
    });
    toast(`Added to ${dayName(k)}`, 'undo');
  }
  function renderDpop(d) {
    const r = addRule && cleanRule({ ...addRule, text: 'x', start: addDay() }, 'x');
    $.dpT.textContent = MO.format(dpM);
    $.dgrid.innerHTML = gridHTML(dpM, DPX === 'in' && IN ? IN.to : addDay());
    $.drepV.textContent = r ? ruleText(r, true) : 'Never';
    // a month with one row more or less: keep the picker above its chip
    if ($.dpop.classList.contains('on')) replacePops();
    if (d)
      an($.dgrid, [
        { opacity: 0, transform: `translateX(${d * 18}px)` },
        { opacity: 1, transform: 'none' },
      ]);
  }
  function openDpop(from = $.dchip) {
    closePops();
    hideTip(0);
    hideSug();
    DPX = from === $.inDay ? 'in' : 'add';
    const d = fromKey(DPX === 'in' && IN ? IN.to : addDay());
    dpM = new Date(d.getFullYear(), d.getMonth(), 1);
    $.drep.hidden = DPX === 'in';
    renderDpop(0);
    place($.dpop, from.getBoundingClientRect(), DPX === 'in' ? 'down' : 'up');
    guard('pops', () => closePops(true));
    from.setAttribute('aria-expanded', 'true');
    const s = $.dgrid.querySelector('.s');
    if (s) s.focus({ preventScroll: true });
  }
  function pickDay(k) {
    $.dpop.classList.remove('on');
    if (DPX === 'in') {
      if (IN) IN.to = k;
      renderInbox();
      $.inDay.setAttribute('aria-expanded', 'false');
      $.inYes.focus({ preventScroll: true });
      return;
    }
    setAddTo(k);
    $.dchip.setAttribute('aria-expanded', 'false');
    $.input.focus({ preventScroll: true });
  }
  // Called whenever focus may have left the composer: back to the day on screen.
  function composerLeft() {
    later(() => {
      const ae = D().activeElement;
      if (
        app.classList.contains('composing') &&
        !popOn() &&
        !(ae && ($.add.contains(ae) || $.dpop.contains(ae) || $.rpop.contains(ae)))
      )
        compose(false);
    }, 0);
  }
  $.dchip.onclick = () => ($.dpop.classList.contains('on') ? closePops(true) : openDpop());
  swipeMonths($.dgrid, d => {
    dpM = new Date(dpM.getFullYear(), dpM.getMonth() + d, 1);
    renderDpop(d);
  });
  $.dgrid.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (b) pickDay(b.dataset.k);
  };
  $.dq.onclick = e => {
    const b = e.target.closest('button[data-d]');
    if (!b) return;
    const tk = todayKey(),
      wd = (fromKey(tk).getDay() + 6) % 7;
    pickDay(b.dataset.d === 'today' ? tk : b.dataset.d === 'tomorrow' ? addDays(tk, 1) : addDays(tk, 7 - wd));
  };
  $.dpPrev.onclick = () => {
    dpM = new Date(dpM.getFullYear(), dpM.getMonth() - 1, 1);
    renderDpop(-1);
  };
  $.dpNext.onclick = () => {
    dpM = new Date(dpM.getFullYear(), dpM.getMonth() + 1, 1);
    renderDpop(1);
  };
  $.dpop.addEventListener('pointerdown', e => {
    if (!e.target.closest('button')) e.preventDefault();
  });
  $.add.addEventListener('focusout', composerLeft);
  $.dpop.addEventListener('focusout', () => DPX === 'add' && composerLeft());
  $.rpop.addEventListener('focusout', () => RP && RP.ctx === 'add' && composerLeft());
  $.drep.onclick = () => {
    const a = $.dchip.getBoundingClientRect();
    $.dpop.classList.remove('on');
    openRpop({ ctx: 'add', start: addDay(), rule: addRule, anchor: a, prefer: 'up', from: $.dchip, back: true });
  };

  /* the repeat editor, for new tasks (from the composer) or for a task (from its card) */
  let RP = null;
  function openRpop(o) {
    hideTip(0);
    const b = o.rule || {};
    RP = {
      ctx: o.ctx,
      id: o.id,
      start: o.start,
      had: !!o.rule,
      anchor: o.anchor,
      prefer: o.prefer,
      from: o.from,
      back: !!o.back,
      f: {
        freq: b.freq || 'week',
        every: b.every || 1,
        days: b.days ? [...b.days] : [wdOf(o.start)],
        nth: b.nth != null ? b.nth : null,
      },
    };
    $.rnone.textContent = o.ctx === 'task' ? (RP.had ? 'Stop repeating' : 'Cancel') : RP.had ? "Don't repeat" : 'Cancel';
    delete $.rnum.dataset.v;
    // Lay it out first, then place() shows it where it belongs: no flight from the corner.
    renderRp(false);
    place($.rpop, o.anchor, o.prefer);
    guard('pops', () => closePops(true));
    if (o.from) o.from.setAttribute('aria-expanded', 'true');
    const a = $.rseg.querySelector('[aria-checked="true"]');
    if (a) a.focus({ preventScroll: true });
  }
  function draftRule() {
    const f = RP.f,
      r = { freq: f.freq, every: f.every };
    if (f.freq === 'week') r.days = f.days;
    if (f.freq === 'month' && f.nth != null) r.nth = f.nth;
    return r;
  }
  function renderRp(anim, d) {
    const f = RP.f,
      s = fromKey(RP.start),
      h0 = $.rpop.offsetHeight;
    segMove($.rseg, $.rseg.querySelector(`[data-f="${f.freq}"]`), anim);
    roll($.rnum, String(f.every), d || 0);
    $.runit.textContent = f.freq + (f.every > 1 ? 's' : '');
    $.rdays.hidden = f.freq !== 'week';
    $.rdays.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', f.days.includes(+b.dataset.d)));
    $.rmon.hidden = f.freq !== 'month';
    const wd = WDL[wdOf(RP.start)],
      n = Math.ceil(s.getDate() / 7),
      opt = {
        date: `On the ${ord(s.getDate())}`,
        nth: n <= 4 ? `On the ${NTH[n]} ${wd}` : '',
        last: s.getDate() + 7 > dimOf(s) ? `On the last ${wd}` : '',
      },
      pick = f.nth == null ? 'date' : f.nth === -1 ? 'last' : 'nth';
    $.rmon.querySelectorAll('button').forEach(b => {
      const m = b.dataset.m;
      b.hidden = !opt[m];
      b.textContent = opt[m];
      b.setAttribute('aria-checked', m === pick);
      b.classList.toggle('on', m === pick);
    });
    const r = cleanRule({ ...draftRule(), text: 'x', start: RP.start }, 'x'),
      nx = nextOcc(r, RP.ctx === 'task' ? addDays(RP.start, 1) : RP.start);
    $.rsum.innerHTML = `${esc(ruleText(r))}${nx ? `<span>${RP.ctx === 'task' ? 'Then' : 'Next'}: ${esc(dayLabel(nx))}</span>` : ''}`;
    const h1 = $.rpop.offsetHeight;
    if (anim && Math.abs(h1 - h0) > 1) {
      place($.rpop, RP.anchor, RP.prefer);
      an($.rpop, [{ height: h0 + 'px' }, { height: h1 + 'px' }], { easing: SNAP.ease, duration: SNAP.dur });
    }
  }
  $.rseg.onclick = e => {
    const b = e.target.closest('button[data-f]');
    if (!b || !RP || b.dataset.f === RP.f.freq) return;
    RP.f.freq = b.dataset.f;
    renderRp(true);
  };
  function stepRp(d) {
    const v = Math.max(1, Math.min(99, RP.f.every + d));
    if (v === RP.f.every) return;
    RP.f.every = v;
    renderRp(false, d);
  }
  $.rminus.onclick = () => stepRp(-1);
  $.rplus.onclick = () => stepRp(1);
  $.rdays.onclick = e => {
    const b = e.target.closest('button[data-d]');
    if (!b || !RP) return;
    const n = +b.dataset.d,
      i = RP.f.days.indexOf(n);
    if (i > -1 && RP.f.days.length === 1) {
      an(b, [{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], {
        duration: 260,
        easing: 'ease-out',
      });
      return;
    }
    RP.f.days = i > -1 ? RP.f.days.filter(x => x !== n) : [...RP.f.days, n].sort((a, c) => a - c);
    renderRp(false);
    an(b, [{ transform: 'scale(.8)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  };
  $.rmon.onclick = e => {
    const b = e.target.closest('button[data-m]');
    if (!b || !RP) return;
    const m = b.dataset.m;
    RP.f.nth = m === 'date' ? null : m === 'last' ? -1 : Math.ceil(fromKey(RP.start).getDate() / 7);
    renderRp(false);
  };
  const sameRule = (r, f) =>
    !!r &&
    r.freq === f.freq &&
    r.every === f.every &&
    (f.freq !== 'week' || r.days.join() === f.days.join()) &&
    (f.freq !== 'month' || (r.nth == null ? null : r.nth) === (f.nth == null ? null : f.nth));
  function applyRp(on) {
    const o = RP;
    if (!o) return;
    const f = draftRule();
    $.rpop.classList.remove('on');
    if (o.from) o.from.setAttribute('aria-expanded', 'false');
    if (o.ctx === 'add') {
      if (on) addRule = f;
      else if (o.had) addRule = null;
      renderChip(true);
      if (!on && o.back) openDpop($.dchip);
      else $.input.focus({ preventScroll: true });
      return;
    }
    const t = find(o.id);
    if (o.from && o.from.isConnected) o.from.focus({ preventScroll: true });
    if (!t) return;
    if (on) {
      if (!sameRule(t.rule && S.rules[t.rule], f)) setRule(t, f);
    } else if (o.had) stopRule(t);
  }
  $.rdone.onclick = () => applyRp(true);
  $.rnone.onclick = () => applyRp(false);
  $.rpop.addEventListener('pointerdown', e => {
    if (!e.target.closest('button')) e.preventDefault();
  });
  function repeatFor(li, b) {
    if ($.rpop.classList.contains('on') && RP && RP.id === li.dataset.id) return closePops(true);
    const t = find(li.dataset.id);
    if (!t) return;
    closePops();
    openRpop({
      ctx: 'task',
      id: t.id,
      start: cur,
      rule: t.rule && S.rules[t.rule],
      anchor: b.getBoundingClientRect(),
      prefer: 'down',
      from: b,
    });
  }

  /* send a task: the whole task travels in the link, after the #, which browsers never send to a server */
  const b64 = {
    enc(u8) {
      let x = '';
      for (let i = 0; i < u8.length; i += 0x8000) x += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    dec(x) {
      const b = atob(x.replace(/-/g, '+').replace(/_/g, '/')),
        u8 = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
      return u8;
    },
  };
  // Through a (de)compression stream, refusing to grow past `max` bytes.
  async function through(u8, stream, max) {
    const rd = new Blob([u8]).stream().pipeThrough(stream).getReader(),
      parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      n += value.length;
      if (n > max) {
        rd.cancel();
        throw new Error('too large');
      }
      parts.push(value);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const v of parts) {
      out.set(v, o);
      o += v.length;
    }
    return out;
  }
  const packTask = t => {
    const o = { t: t.text };
    if (t.note) o.n = t.note;
    if (t.subs) o.s = t.subs.map(x => (x.done ? [x.text, 1] : [x.text]));
    return o;
  };
  // A task that comes in: its words, note (clean HTML) and sub-tasks, and, when the link says so, its own day and how it
  // repeats. A day already gone becomes today, unless the task repeats: then it is the day the repeat counts from.
  function incoming(text, note, subs, dayV, repV) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const ss = (Array.isArray(subs) ? subs : [])
      .filter(x => Array.isArray(x) && typeof x[0] === 'string')
      .map(x => ({ id: uid(), text: x[0].replace(/\s+/g, ' ').trim(), done: !!x[1] }))
      .filter(x => x.text);
    const [t] = clean([
      {
        id: uid(),
        text: text.replace(/\s+/g, ' ').trim(),
        done: false,
        note: typeof note === 'string' ? note : undefined,
        subs: ss.length ? ss : undefined,
      },
    ]);
    if (!t) return null;
    const asked = typeof repV === 'string' && !!repV.trim(),
      rep = asked ? linkRepeat(repV) : null;
    let own = typeof dayV === 'string' ? linkDay(dayV) : null;
    if (own && !rep && own < todayKey()) own = todayKey();
    return { task: t, own, rep, repBad: asked && !rep, fix: null };
  }
  const unpackTask = o => (o && typeof o === 'object' ? incoming(o.t, o.n, o.s, o.day, o.repeat) : null);
  // A day in a link: today, tomorrow, a weekday (the next one, today included) or YYYY-MM-DD.
  function linkDay(v) {
    v = String(v).trim().toLowerCase();
    const tk = todayKey(),
      w = v.length >= 3 ? WDL.findIndex(n => n.toLowerCase().startsWith(v)) : -1;
    if (v === 'today') return tk;
    if (v === 'tomorrow') return addDays(tk, 1);
    if (w > -1) return addDays(tk, (w - wdOf(tk) + 7) % 7);
    return DAYRE.test(v) && keyOf(fromKey(v)) === v ? v : null;
  }
  // How a task repeats: a word below, or an iCalendar RRULE made of the parts One Day can follow. Anything else is
  // no rule at all, rather than a different one. (parseRepeat in mcp/link.mjs follows the same rules.)
  const REPW = {
      daily: 'FREQ=DAILY',
      weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      weekends: 'FREQ=WEEKLY;BYDAY=SA,SU',
      weekly: 'FREQ=WEEKLY',
      monthly: 'FREQ=MONTHLY',
      yearly: 'FREQ=YEARLY',
      annually: 'FREQ=YEARLY',
    },
    RRK = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'UNTIL', 'COUNT', 'WKST', 'BYHOUR', 'BYMINUTE', 'BYSECOND'];
  // RRD and MAXD (the weekdays as iCalendar writes them, each month's longest length) are the import's, above
  function linkRepeat(v) {
    v = String(v).trim();
    if (!v || v.length > 200) return null;
    const w = v.toLowerCase();
    v = (Object.hasOwn(REPW, w) ? REPW[w] : v.replace(/^RRULE:/i, '')).toUpperCase();
    const o = {};
    for (const part of v.split(';')) {
      if (!part.trim()) continue;
      const i = part.indexOf('=');
      if (i < 1) return null;
      o[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    const freq = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[o.FREQ],
      num = (s, lo, hi) => (/^[+-]?\d{1,4}$/.test(s) && +s >= lo && +s <= hi ? +s : null);
    if (!freq || Object.keys(o).some(k => !RRK.includes(k))) return null;
    const every = o.INTERVAL == null ? 1 : num(o.INTERVAL, 1, freq === 'year' ? 8 : 99);
    if (every == null) return null;
    const sp = { freq, every };
    if (o.BYDAY) {
      const ds = o.BYDAY.split(',').map(s => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s.trim()));
      if (ds.some(m => !m)) return null;
      if (freq === 'day' || freq === 'week') {
        // weekdays only; "every day on these weekdays" is the same as every week on them
        if (o.BYSETPOS || ds.some(m => m[1]) || (freq === 'day' && every > 1)) return null;
        sp.freq = 'week';
        sp.days = [...new Set(ds.map(m => RRD.indexOf(m[2])))].sort((a, b) => a - b);
      } else {
        // one weekday of the month: 2TU, -1FR, or TU with BYSETPOS=2; in a year, only with its month
        const n = ds.length === 1 ? num(ds[0][1] != null ? ds[0][1] : o.BYSETPOS, -1, 4) : null;
        if (!n || (freq === 'year' && !o.BYMONTH) || (ds[0][1] != null && o.BYSETPOS)) return null;
        sp.nth = n;
        sp.wd = RRD.indexOf(ds[0][2]);
      }
    } else if (o.BYSETPOS) return null;
    if (o.BYMONTH) {
      sp.mo = num(o.BYMONTH, 1, 12);
      if (!sp.mo || freq !== 'year') return null;
    }
    if (o.BYMONTHDAY) {
      // a date of the month (-1, the last day, in a monthly repeat); in a year, only with a month that has it
      sp.md = freq === 'month' && o.BYMONTHDAY === '-1' ? 31 : num(o.BYMONTHDAY, 1, 31);
      if (!sp.md || sp.nth || (freq !== 'month' && !sp.mo) || (sp.mo && sp.md > MAXD[sp.mo - 1])) return null;
    }
    if (o.UNTIL) {
      const m = /^(\d{4})-?(\d\d)-?(\d\d)(T[\dZ]*)?$/.exec(o.UNTIL),
        k = m && `${m[1]}-${m[2]}-${m[3]}`;
      if (!k || keyOf(fromKey(k)) !== k) return null;
      sp.until = k;
    }
    if (o.COUNT) {
      sp.count = num(o.COUNT, 1, 1000);
      if (!sp.count) return null;
    }
    return sp;
  }
  // The day a link's repeat starts on, from day k: the first day from there that it fits (the 15th, the second Tuesday,
  // 14 March…), found month by month. A date that month lacks (the 31st in November) falls on its last day, as it will
  // in such months afterwards: the rule then starts from that date in an earlier month, and skips that start.
  function startOf(sp, k) {
    if (!sp.md && !sp.nth && !sp.mo) return { start: k };
    const d0 = fromKey(k),
      y = d0.getFullYear();
    for (let i = 0; i < 120; i++) {
      const m = d0.getMonth() + i,
        dim = new Date(y, m + 1, 0).getDate();
      if (sp.mo && new Date(y, m, 1).getMonth() + 1 !== sp.mo) continue;
      let date = Math.min(sp.md || d0.getDate(), dim);
      if (sp.nth) {
        const fw = (new Date(y, m, 1).getDay() + 6) % 7,
          lw = (new Date(y, m, dim).getDay() + 6) % 7;
        date = sp.nth === -1 ? dim - ((lw - sp.wd + 7) % 7) : 1 + ((sp.wd - fw + 7) % 7) + (sp.nth - 1) * 7;
      }
      const s = keyOf(new Date(y, m, date));
      if (s < k) continue;
      if (!sp.md || sp.md <= dim) return { start: s };
      if (sp.every > 1) continue;
      for (let j = 1; j <= 8; j++) {
        const pm = m - j * (sp.mo ? 12 : 1);
        if (new Date(y, pm + 1, 0).getDate() < sp.md) continue;
        const a = keyOf(new Date(y, pm, sp.md));
        return { start: a, skip: a, lead: j };
      }
    }
    return null;
  }
  // A rule's occurrences from a day on, in order, found without walking the calendar day by day (a repeat can come
  // every 99 months). Each one is checked with occurs(), which decides where the task appears.
  function* occFrom(r, from) {
    if (from < r.start) from = r.start;
    const s = fromKey(r.start),
      f = fromKey(from);
    for (let i = 0; i < 5000; i++) {
      let ks;
      if (r.freq === 'day') ks = [addDays(r.start, (Math.ceil(diff(r.start, from) / r.every) + i) * r.every)];
      else if (r.freq === 'week') {
        const mon = addDays(r.start, -wdOf(r.start)),
          w = (Math.ceil(Math.floor(diff(mon, from) / 7) / r.every) + i) * r.every;
        ks = r.days.map(d => addDays(mon, w * 7 + d));
      } else ks = [monthOcc(r, (Math.ceil(((f.getFullYear() - s.getFullYear()) * 12 + f.getMonth() - s.getMonth()) / r.every) + i) * r.every)];
      for (const k of ks) {
        if (k.length !== 10 || (r.until && k > r.until)) return;
        if (k >= from && occurs(r, k)) yield k;
      }
    }
  }
  // The day a monthly rule falls on, m months after its start's month.
  function monthOcc(r, m) {
    const s = fromKey(r.start),
      y = s.getFullYear(),
      mm = s.getMonth() + m,
      dim = new Date(y, mm + 1, 0).getDate();
    let date = Math.min(s.getDate(), dim);
    if (r.nth != null) {
      const wd = wdOf(r.start),
        fw = (new Date(y, mm, 1).getDay() + 6) % 7,
        lw = (new Date(y, mm, dim).getDay() + 6) % 7;
      date = r.nth === -1 ? dim - ((lw - wd + 7) % 7) : 1 + ((wd - fw + 7) % 7) + (r.nth - 1) * 7;
    }
    return keyOf(new Date(y, mm, date));
  }
  // A rule's n-th occurrence from its start, worked out rather than walked to (COUNT can be 1000), or null past the
  // year 9999. Only a monthly rule can skip its start (see startOf): its count then begins `lead` steps after it.
  function nthOcc(r, n, lead = 0) {
    let k;
    if (r.freq === 'day') k = addDays(r.start, (n - 1) * r.every);
    else if (r.freq === 'month') k = monthOcc(r, (n - 1 + lead) * r.every);
    else {
      const mon = addDays(r.start, -wdOf(r.start)),
        len = r.days.length,
        first = r.days.filter(d => addDays(mon, d) >= r.start).length;
      k =
        n <= first
          ? addDays(mon, r.days[len - first + n - 1])
          : addDays(mon, (Math.floor((n - first - 1) / len) + 1) * r.every * 7 + r.days[(n - first - 1) % len]);
    }
    return k.length === 10 && occurs({ ...r, until: null }, k) ? k : null;
  }
  // The rule a link's repeat makes from a day, with its first occurrence still to come, or none (it has ended).
  function ruleAt(sp, k, t) {
    const st = startOf(sp, k);
    if (!st) return null;
    const year = sp.freq === 'year',
      f = { freq: year ? 'month' : sp.freq, every: year ? sp.every * 12 : sp.every };
    if (f.freq === 'week') f.days = sp.days || [wdOf(st.start)];
    if (sp.nth) f.nth = sp.nth;
    if (sp.until) f.until = sp.until;
    if (st.skip) f.skip = [st.skip];
    const r = cleanRule({ ...f, text: t.text, note: t.note, subs: t.subs, start: st.start }, 'r' + uid());
    if (!r) return null;
    // COUNT ends it on its last occurrence
    const last = sp.count && nthOcc(r, sp.count, st.lead || 0);
    if (last && !(r.until && r.until < last)) r.until = last;
    const tk = todayKey(),
      first = occFrom(r, r.start > tk ? r.start : tk).next().value;
    return first ? { rule: r, first } : null;
  }
  // A note in a link is plain text, with the Markdown the note editor understands: **bold**, *italic*, `code`,
  // ~~strike~~, lists, and links. It is then cleaned like any other note.
  const MDI =
    /(`[^`\n]+`)|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|(?<![*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![*\w])|(?<![_\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?![_\w])|\[([^[\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|((?:https?:\/\/|www\.)[^\s<]*[^\s<.,;:!?)\]'"»])/gi;
  function mdLine(s) {
    let h = '',
      last = 0;
    for (const m of s.matchAll(MDI)) {
      if (m.index < last) continue;
      let url = m[8];
      h += esc(s.slice(last, m.index));
      last = m.index + m[0].length;
      // a bare address keeps the bracket that closes one of its own: …/wiki/Mercury_(planet)
      if (url && s[last] === ')' && url.split('(').length > url.split(')').length) {
        url += ')';
        last++;
      }
      const u = m[7] || url ? safeUrl(m[7] || url) : null;
      h += m[1]
        ? `<code>${esc(m[1].slice(1, -1))}</code>`
        : m[2]
          ? `<b>${mdLine(m[2])}</b>`
          : m[3]
            ? `<s>${mdLine(m[3])}</s>`
            : m[4] || m[5]
              ? `<i>${mdLine(m[4] || m[5])}</i>`
              : u
                ? `<a href="${esc(u)}">${esc(m[6] || url)}</a>`
                : esc(url || m[0]);
    }
    return h + esc(s.slice(last));
  }
  function mdNote(text) {
    let h = '',
      list = '';
    for (const ln of String(text).replace(/\r\n?/g, '\n').trim().split('\n')) {
      const m = /^\s*(?:([-*+•])|\d{1,3}[.)])\s+(.*)$/.exec(ln),
        kind = m ? (m[1] ? 'ul' : 'ol') : '';
      if (kind !== list) h += (list ? `</${list}>` : '') + (kind ? `<${kind}>` : '');
      list = kind;
      h += kind ? `<li>${mdLine(m[2])}</li>` : `<div>${mdLine(ln) || '<br>'}</div>`;
    }
    return h + (list ? `</${list}>` : '');
  }
  // The link an assistant can write by hand: #add?task=…&note=…&sub=…&day=…&repeat=…, each task=… starting a task and
  // the words after it describing that task. A day before the first task is the day of every task that names none.
  function readQuery(qs) {
    const raw = [];
    let def = null,
      it = null;
    for (const [k0, v] of new URLSearchParams(qs)) {
      const k = k0.trim().toLowerCase();
      if (k === 'task') {
        if (raw.length === 100) break;
        raw.push((it = { t: v, n: [], s: [], day: null, rep: null }));
      } else if (k === 'day' || k === 'date') {
        if (it) it.day = v;
        else def = v;
      } else if (!it) continue;
      else if (k === 'note') it.n.push(v);
      else if (k === 'sub' || k === 'subtask') it.s.push(v);
      else if (k === 'repeat') it.rep = v;
    }
    const sub = s => {
      const m = /^\s*(?:[-*•]\s+)?(?:\[([ xX])\]\s*)?([\s\S]*)$/.exec(s);
      return [m[2], m[1] && m[1] !== ' ' ? 1 : 0];
    };
    return raw
      .map(x =>
        incoming(
          x.t,
          x.n.length ? mdNote(x.n.join('\n').slice(0, 10000)) : undefined,
          x.s.slice(0, 100).map(sub),
          x.day != null ? x.day : def,
          x.rep,
        ),
      )
      .filter(Boolean);
  }
  async function linkFor(list) {
    const pl = list.length === 1 ? { v: 1, ...packTask(list[0]) } : { v: 1, d: list.map(packTask) };
    let u8 = new TextEncoder().encode(JSON.stringify(pl)),
      kind = 'j';
    if (window.CompressionStream)
      try {
        u8 = await through(u8, new CompressionStream('deflate-raw'), 1e6);
        kind = 'z';
      } catch (e) {}
    return location.href.split('#')[0] + '#add=' + kind + b64.enc(u8);
  }
  async function share(list, b) {
    if (b) an(b, [{ transform: 'scale(.9)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
    const many = list.length > 1;
    let url;
    try {
      url = await linkFor(list);
    } catch (e) {
      toast('This could not be put in a link');
      return;
    }
    if (url.length > 8000) {
      toast(many ? 'Too long to send as a link: send fewer tasks' : 'Too long to send as a link: shorten the note');
      return;
    }
    const nav = W().navigator;
    if (TOUCH && nav.share)
      try {
        await nav.share({ title: many ? `${list.length} tasks from One Day` : list[0].text.replace(TAGRE, '$1').trim() || 'A task', url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    try {
      await nav.clipboard.writeText(url);
      toast(many ? 'Link copied: whoever opens it can add these tasks' : 'Link copied: whoever opens it can add this task');
    } catch (e) {
      toast('This browser blocked the copy');
    }
  }
  const sendTask = (t, b) => t && share([t], b);
  // The open tasks of the day on screen: to someone else, or to yourself on another device.
  function sendDay(b) {
    const list = tasks(cur).filter(t => !t.done);
    if (!list.length) {
      toast('Nothing left to send on this day');
      return;
    }
    share(list, b);
  }
  let IN = null;
  const INRE = /^#add[=?]/;
  async function readIncoming() {
    if (locked) return;
    const h = location.hash;
    if (!INRE.test(h)) return;
    try {
      history.replaceState(null, '', location.href.split('#')[0]);
    } catch (e) {}
    try {
      let list = [];
      if (h.length > 32000) list = [];
      else if (h[4] === '?') list = readQuery(h.slice(5));
      else {
        const m = /^#add=([jz])([\w-]{4,24000})$/.exec(h);
        if (m) list = await readPacked(m[1], m[2]);
      }
      if (list.length) return showInbox(list);
    } catch (e) {
      IN = null;
      $.inbox.hidden = true;
      unguard('inbox');
      holdBehind(false);
    }
    toast('That link doesn’t hold a task');
  }
  async function readPacked(kind, data) {
    let pl = null;
    try {
      let u8 = b64.dec(data);
      if (kind === 'z') u8 = await through(u8, new DecompressionStream('deflate-raw'), 2e5);
      pl = JSON.parse(new TextDecoder().decode(u8));
    } catch (e) {}
    return pl && pl.v === 1 ? (Array.isArray(pl.d) ? pl.d.slice(0, 100) : [pl]).map(unpackTask).filter(Boolean) : [];
  }
  // The tasks go to one day, shown on the chip, unless the link puts them on different days: then each keeps its own,
  // and the chip, if any, holds the day for those that name none.
  function showInbox(list) {
    const own = new Set(list.map(it => it.own).filter(Boolean)),
      one = !own.size || (own.size === 1 && list.every(it => it.own));
    for (const it of list) {
      it.fix = one ? null : it.own;
      it.on = true;
    }
    IN = { list, to: (one && [...own][0]) || todayKey() };
    const many = list.length > 1;
    $.inbox.classList.toggle('multi', many);
    $.inT.textContent = many ? `${list.length} tasks for you` : 'A task for you';
    $.inList.hidden = !many;
    $.inList.innerHTML = many
      ? list
          .map(
            (it, i) =>
              `<li class="inl" data-i="${i}"><label><input type="checkbox" class="inck" checked><span class="inbx" aria-hidden="true">${IC.tick}</span><span class="intx"><span class="inlt">${titleHTML(it.task.text)}</span><span class="inlm"></span></span></label></li>`,
          )
          .join('')
      : '';
    $.inTitle.innerHTML = many ? '' : titleHTML(list[0].task.text);
    renderInbox();
    // what was open closes: the sent tasks are the one thing to answer
    closeMore();
    compose(false);
    closePops();
    closeSearch(false);
    holdBehind(true);
    $.inbox.style.top = q('header').offsetHeight - 6 + 'px';
    $.inbox.getAnimations().forEach(x => x.cancel());
    $.inbox.hidden = false;
    guard('inbox', () => closeInbox());
    $.inList.scrollTop = 0;
    fitList();
    an($.inbox, [{ opacity: 0, transform: 'translateY(-14px) scale(.97)' }, { opacity: 1, transform: 'none' }], {
      easing: POP.ease,
      duration: POP.dur,
    });
    $.inYes.focus({ preventScroll: true });
  }
  // A list too long for the dialog scrolls (its boxes take the keyboard there), and a faint lower edge says there is
  // more below until its end is in view.
  const fadeList = () =>
    $.inList.classList.toggle('fade', $.inList.scrollTop + $.inList.clientHeight < $.inList.scrollHeight - 2);
  const fitList = fadeList;
  $.inList.addEventListener('scroll', fadeList, { passive: true });
  window.addEventListener('resize', () => IN && fitList());
  // A task left unticked stays out; the button says how many go in.
  $.inList.addEventListener('change', e => {
    const c = e.target.closest('.inck'),
      li = c && c.closest('.inl');
    if (!li || !IN) return;
    IN.list[+li.dataset.i].on = c.checked;
    li.classList.toggle('off', !c.checked);
    renderInbox();
  });
  // Where an incoming task lands from a day: there, or, if it repeats, on its first occurrence still to come.
  function planOf(it, k) {
    if (it.memo && it.memo.k === k) return it.memo.p;
    const tk = todayKey(),
      r = it.rep && ruleAt(it.rep, k, it.task),
      p = r ? { k: r.first, t: fromRule(r.rule, r.first), r: r.rule } : { k: it.rep && k < tk ? tk : k, t: it.task };
    it.memo = { k, p };
    return p;
  }
  const dayShort = k => (Math.abs(diff(todayKey(), k)) <= 1 ? dayLabel(k).toLowerCase() : dayLabel(k));
  function inMeta(it, k) {
    const t = it.task,
      n = (t.subs || []).length,
      p = planOf(it, k),
      bits = [t.note ? 'Note' : '', n ? `${n} ${n > 1 ? 'sub-tasks' : 'sub-task'}` : ''];
    if (p.r) bits.push(`${ruleWords(p.r)}, from ${dayShort(p.k)}${p.r.until ? `, until ${dayShort(p.r.until)}` : ''}`);
    else {
      if (it.fix) bits.push(dayLabel(p.k));
      if (it.rep) bits.push('Its repeat is over');
      else if (it.repBad) bits.push('Repeat not understood');
    }
    return bits.filter(Boolean).join(' · ');
  }
  function renderInbox() {
    if (!IN) return;
    const many = IN.list.length > 1,
      metas = many ? $.inList.querySelectorAll('.inlm') : [$.inMeta],
      on = IN.list.filter(it => it.on);
    $.inDay.hidden = on.every(it => it.fix);
    $.inYes.textContent = !many ? 'Add' : on.length === IN.list.length ? 'Add all' : on.length ? `Add ${on.length}` : 'Add';
    $.inYes.disabled = !on.length;
    $.inDayL.textContent = dayLabel(IN.to);
    $.inDay.classList.toggle('set', IN.to !== todayKey());
    IN.list.forEach((it, i) => {
      const m = metas[i],
        s = inMeta(it, it.fix || IN.to);
      if (!m) return;
      m.textContent = s;
      m.hidden = !s;
    });
  }
  /* While they wait for an answer, the day behind dims and holds still: it does not scroll or turn, and nothing there
     takes a click, a tab or a key. */
  let inHeld = null;
  function holdBehind(on) {
    const v = $.inVeil;
    app.classList.toggle('inboxing', on);
    if (on && !inHeld) {
      inHeld = [q('header'), $.vp, $.mbar, $.more, document.getElementById('topbar'), document.getElementById('foot')]
        .filter(Boolean)
        .map(el => [el, el.inert]);
      for (const [el] of inHeld) el.inert = true;
    } else if (!on && inHeld) {
      for (const [el, was] of inHeld) el.inert = was;
      inHeld = null;
    }
    if (on) {
      v.getAnimations().forEach(x => x.cancel());
      delete v.dataset.out;
      if (v.hidden) {
        v.hidden = false;
        an(v, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
      }
    } else if (!v.hidden && !v.dataset.out) {
      v.dataset.out = '1';
      then(an(v, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease', fill: 'forwards' }), () => {
        if (!v.dataset.out) return;
        delete v.dataset.out;
        v.getAnimations().forEach(x => x.cancel());
        v.hidden = true;
      });
    }
  }
  // A click beside it changes nothing: the card stirs to say it waits for Add or Ignore (Escape and back are Ignore).
  // A click that only shut the day picker does just that.
  $.inVeil.addEventListener('click', () => {
    if (downPop || !IN || $.inbox.getAnimations().length) return;
    an($.inbox, [{ transform: 'none' }, { transform: 'scale(1.018)' }, { transform: 'none' }], {
      duration: 320,
      easing: 'cubic-bezier(.3,0,.3,1)',
    });
  });
  function closeInbox() {
    if ($.inbox.hidden) return;
    unguard('inbox');
    IN = null;
    holdBehind(false);
    if ($.dpop.classList.contains('on') && DPX === 'in') closePops();
    then(
      an($.inbox, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px) scale(.98)' }], {
        duration: 180,
        easing: 'ease',
      }),
      () => {
        if (!IN) $.inbox.hidden = true;
      },
    );
  }
  $.inNo.onclick = closeInbox;
  // All of them in one go, with one undo, whatever days they go to.
  $.inYes.onclick = () => {
    if (!IN) return;
    const list = IN.list.filter(it => it.on),
      { to } = IN,
      tk = todayKey();
    if (!list.length) return;
    // One Day keeps up to 300 repeats: past that, a task comes without its own. Those that have ended make room.
    const over = Object.keys(S.rules).filter(id => S.rules[id].until && S.rules[id].until < tk);
    let roomR = 300 - Object.keys(S.rules).length + over.length,
      bare = 0;
    const plans = list.map(it => {
        const p = planOf(it, it.fix || to);
        if (!p.r || roomR-- > 0) return p;
        bare++;
        return { k: p.k, t: it.task };
      }),
      rules = plans.some(p => p.r) && cur >= tk,
      keys = [...new Set([...plans.map(p => p.k), ...(rules ? [cur] : [])])];
    closeInbox();
    record(keys);
    const room = {},
      made = [];
    for (const p of plans) {
      if (!(p.k in room)) room[p.k] = 300 - tasks(p.k).length;
      if (room[p.k] <= 0) continue;
      room[p.k]--;
      if (p.r) S.rules[p.r.id] = p.r;
      day(p.k).tasks.push(p.t);
      made.push(p);
    }
    if (!made.length) {
      UN.pop();
      toast('That day is full');
      return;
    }
    // ended repeats go only when the new ones need their room
    if (Object.keys(S.rules).length > 300) for (const id of over) delete S.rules[id];
    // a new repeat may also fall on the day on screen
    if (rules) ensure(cur);
    keys.forEach(commit);
    const n = made.length,
      days = [...new Set(made.map(p => p.k))],
      cut =
        (n < plans.length ? ` (a day is full: ${plans.length - n} left out)` : '') +
        (bare ? ` (${bare} without ${bare > 1 ? 'their repeats' : 'its repeat'}: One Day keeps 300 at most)` : ''),
      here = made.map(p => (p.k === cur ? p.t.id : p.r && occurs(p.r, cur) && cur >= tk ? occId(p.r, cur) : null)).filter(Boolean);
    if (here.length) {
      flip(() => {
        renderList();
        renderAux();
      });
      const li = rowOf(here[0]);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
      here.forEach(id => rowOf(id) && flash(rowOf(id)));
    } else {
      const d = Math.sign(diff(cur, days[0])) || 1;
      nudge(d > 0 ? $.next : $.prev, d);
    }
    toast(
      (n === 1 && made[0].r
        ? `${ruleWords(made[0].r)}, from ${dayName(made[0].k)}${made[0].r.until ? `, until ${dayName(made[0].r.until)}` : ''}`
        : days.length > 1
          ? `Added ${n} tasks to ${days.length} days`
          : days[0] === cur
            ? n > 1
              ? `${n} tasks added`
              : 'Task added'
            : n > 1
              ? `Added ${n} tasks to ${dayName(days[0])}`
              : `Added to ${dayName(days[0])}`) + cut,
      'undo',
    );
  };
  $.inDay.onclick = () => ($.dpop.classList.contains('on') ? closePops(true) : openDpop($.inDay));

  /* phones: a bottom bar with search, the timer, a big add button, sending the day, and more */
  function bounce(b) {
    an(b.querySelector('svg'), [{ transform: 'scale(.78)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  }
  // The scrim shows behind the composer sheet, More, the timer sheet and search on a phone; it lets touches through as
  // it fades.
  const BARQ = '(max-width: 719px) and (hover: none)';
  let moreOpen = false;
  function syncScrim() {
    const el = $.scrim,
      want =
        moreOpen ||
        app.classList.contains('composing') ||
        (($.tpop.classList.contains('on') || $.srch.classList.contains('on')) && W().matchMedia(BARQ).matches);
    if (want) {
      el.getAnimations().forEach(x => x.cancel());
      delete el.dataset.out;
      if (el.hidden) {
        el.hidden = false;
        an(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
      }
    } else if (!el.hidden && !el.dataset.out) {
      el.dataset.out = '1';
      then(an(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease', fill: 'forwards' }), () => {
        if (!el.dataset.out) return;
        delete el.dataset.out;
        el.getAnimations().forEach(x => x.cancel());
        el.hidden = true;
      });
    }
  }
  function compose(on) {
    if (on === app.classList.contains('composing')) return;
    // closed while the keyboard is still up: the bottom bar waits for it to go, instead of flashing above it
    if (!on && TOUCH && kbUp()) {
      app.classList.add('kbgoing');
      clearTimeout(kbgoT);
      kbgoT = setTimeout(() => app.classList.remove('kbgoing'), 900);
    }
    app.classList.toggle('composing', on);
    if (on) guard('compose', () => compose(false));
    else unguard('compose');
    $.mbAdd.setAttribute('aria-expanded', on);
    $.mbAdd.setAttribute('aria-label', on ? 'Close' : 'Add a task');
    syncScrim();
    if (on) {
      $.input.focus({ preventScroll: true });
      an($.add, [{ transform: 'translateY(110%)' }, { transform: 'none' }], { easing: SP.ease, duration: SP.dur });
    } else if (D().activeElement === $.input) $.input.blur();
  }
  function sheetIn(el) {
    el.getAnimations().forEach(x => x.cancel());
    el.hidden = false;
    an(el, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { easing: SP.ease, duration: SP.dur });
  }
  function sheetOut(el, from = 0) {
    if (el.hidden) return;
    then(
      an(el, [{ transform: `translateY(${from}px)` }, { transform: 'translateY(105%)' }], {
        easing: SNAP.ease,
        duration: SNAP.dur * 0.8,
        fill: 'forwards',
      }),
      () => {
        el.hidden = true;
        el.getAnimations().forEach(x => x.cancel());
      },
    );
  }
  function openMore() {
    const f = document.getElementById('foot'),
      promo = f && f.querySelector('.promo'),
      kofi = f && f.querySelector('.kofi'),
      // the guide has its own button above; the links at the bottom keep the legal pages and the source
      links = f
        ? [...f.querySelectorAll('nav a')]
            .filter(x => !x.matches('.gd'))
            .map(x => x.cloneNode(true).outerHTML)
            .join('')
        : '',
      // where the bar is folded, what it let go of comes first (the floating window has its own way back)
      held = barFolded(),
      dark = themeNow() === 'dark';
    // the order: what the bar let go of, the offer to install (red, first on a phone), Undo and Redo, then the rest
    $.moreList.innerHTML =
      (held
        ? `<div class="sbk"><button type="button" class="sbk-b" data-act="search">${IC.search}<span>Search</span></button>` +
          `<button type="button" class="sbk-b" data-act="send">${IC.send}<span>Send this day</span></button></div>` +
          `<div class="sbk"><button type="button" class="sbk-b" data-act="theme">${dark ? IC.sun : IC.moon}<span>${dark ? 'Light mode' : 'Dark mode'}</span></button>` +
          (pip ? '' : `<button type="button" class="sbk-b" data-act="float">${IC.float}<span>Keep on top</span></button>`) +
          '</div>'
        : '') +
      (insHow() ? `<button type="button" class="sins" data-act="install">${IC.install}<span>Install One Day</span></button>` : '') +
      undoBtns() +
      syMoreBtn() +
      `<div class="sbk"><button type="button" class="sbk-b" data-act="import">${IC.up}<span>Import backup</span></button>` +
      `<button type="button" class="sbk-b" data-act="export">${IC.down}<span>${canTop ? 'Export backup' : 'Copy backup'}</span></button></div>` +
      (CAN_LOCK ? lockBtns() : '') +
      // the guide, a button of its own under the backups and the lock: in this window on a phone (back returns to the
      // day), in a tab of its own from a floating window
      `<div class="sgd"><a class="sbk-b" href="guide/"${TOUCH ? '' : ' target="_blank" rel="noopener"'}>${IC.help}<span>How to use One Day</span></a></div>` +
      (promo
        ? `<a class="spromo" href="${esc(promo.href)}" target="_blank" rel="noopener" referrerpolicy="strict-origin">${promo.innerHTML}</a>`
        : '') +
      (kofi ? freeLine(kofi, 'spromo kofi') : '') +
      `<p class="slinks">${links}</p>`;
    compose(false);
    closePops();
    sheetIn($.more);
    moreOpen = true;
    guard('more', () => closeMore());
    syncScrim();
    $.mbMore.setAttribute('aria-expanded', 'true');
    if (held) $.kb.setAttribute('aria-expanded', 'true');
    const first = $.moreList.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }
  // Undo on the left, Redo on the right, first in the drawer: on a phone, with no keys, the way to undo once the
  // message at the bottom has gone. Each says what it would do, and waits greyed while there is nothing for it.
  function undoBtns() {
    const b = (act, ic, word, e) =>
      `<button type="button" class="sbk-b sud" data-act="${act}"${!e ? ' disabled' : e.label ? ` aria-label="${esc(word + ': ' + e.label)}"` : ''}>${ic}<span>${word}${e && e.label ? `<small>${esc(e.label)}</small>` : ''}</span></button>`;
    return `<div class="sbk sun">${b('undo', IC.undo, 'Undo', UN[UN.length - 1])}${b('redo', IC.redo, 'Redo', RE[RE.length - 1])}</div>`;
  }
  function closeMore(from) {
    if (!moreOpen) return;
    moreOpen = false;
    unguard('more');
    // back to the button that opened it, unless what was chosen takes the focus next
    if (barFolded() && $.more.contains(D().activeElement)) $.kb.focus({ preventScroll: true });
    sheetOut($.more, from);
    $.mbMore.setAttribute('aria-expanded', 'false');
    $.kb.setAttribute('aria-expanded', 'false');
    syncScrim();
  }
  $.moreList.onclick = e => {
    // the guide comes up over the day: the drawer is shut at once, so the day under it, and the day you come back
    // to, have nothing left open
    if (e.target.closest('a[href^="guide/"]')) {
      closeMore();
      for (const el of [$.more, $.scrim]) el.getAnimations().forEach(x => x.finish());
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a || a.disabled) return;
    closeMore();
    // the floating window takes the card at once: the drawer is shut before it goes
    if (a.dataset.act === 'float') for (const el of [$.more, $.scrim]) el.getAnimations().forEach(x => x.finish());
    doAct(a.dataset.act);
  };
  // Drag a sheet down to close it, from anywhere on it that ok() allows. A drag never presses what it started on.
  function dragToClose(el, isOpen, close, cssBack, ok = () => true) {
    let s = null,
      swallow = 0;
    el.addEventListener('pointerdown', e => {
      if (!isOpen() || (e.pointerType === 'mouse' && e.button) || !ok(e)) return;
      s = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
    });
    el.addEventListener('pointermove', e => {
      if (!s || e.pointerId !== s.id) return;
      const dy = e.clientY - s.y,
        dx = e.clientX - s.x;
      if (!s.on) {
        if (Math.abs(dx) > 14 || dy < -8) {
          s = null;
          return;
        }
        if (dy < 8) return;
        s.on = true;
        try {
          el.setPointerCapture(s.id);
        } catch (err) {}
      }
      el.style.transition = 'none';
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    });
    const end = e => {
      if (!s || e.pointerId !== s.id) return;
      const dy = Math.max(0, e.clientY - s.y),
        on = s.on;
      s = null;
      if (!on) return;
      swallow = performance.now() + 450;
      el.style.transform = '';
      el.style.transition = '';
      if (e.type === 'pointerup' && dy > 64) close(dy);
      else if (!cssBack) an(el, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { easing: SP.ease, duration: SP.dur });
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'click',
      e => {
        if (performance.now() < swallow) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }
  // its scrollbar, when it has one, scrolls: a drag there does not pull the drawer down
  dragToClose($.more, () => moreOpen, closeMore, false, e => !(e.target === $.more && e.offsetX >= $.more.clientWidth));
  dragToClose(
    $.tpop,
    () => $.tpop.classList.contains('on') && W().matchMedia(BARQ).matches,
    dy =>
      then(
        an($.tpop, [{ transform: `translateY(${dy}px)`, opacity: 1 }, { transform: `translateY(${dy + 180}px)`, opacity: 0 }], {
          duration: 220,
          easing: 'ease-in',
          fill: 'forwards',
        }),
        () => {
          closePops();
          later(() => $.tpop.getAnimations().forEach(x => x.cancel()), 220);
        },
      ),
    true,
  );
  // search on a phone: from its handle or its bar, not from its results, which scroll
  dragToClose(
    $.srch,
    () => $.srch.classList.contains('on') && W().matchMedia(BARQ).matches,
    dy => closeSearch(true, dy),
    false,
    e => !e.target.closest('.sres'),
  );
  $.scrim.onclick = () => {
    closeMore();
    compose(false);
    closePops();
    closeSearch();
  };
  $.mbSearch.onclick = () => {
    bounce($.mbSearch);
    if ($.srch.classList.contains('on')) {
      closeSearch(false);
      return;
    }
    closeMore();
    compose(false);
    openSearch();
  };
  $.mbTimer.onclick = () => {
    bounce($.mbTimer);
    closeMore();
    compose(false);
    closeSearch(false);
    $.tpop.classList.contains('on') ? closePops(true) : openTimer();
  };
  $.mbAdd.onclick = () => {
    closeMore();
    closePops();
    compose(!app.classList.contains('composing'));
  };
  $.sendd.onclick = () => sendDay($.sendd);
  $.mbSend.onclick = () => {
    bounce($.mbSend);
    closeMore();
    compose(false);
    sendDay();
  };
  $.mbMore.onclick = () => {
    bounce($.mbMore);
    if (moreOpen) closeMore();
    else {
      closeSearch(false);
      openMore();
    }
  };
  // Popovers follow their anchor when the keyboard comes or goes.
  function replacePops() {
    if ($.fpop.classList.contains('on')) fitFilter();
    if ($.dpop.classList.contains('on')) {
      const from = DPX === 'in' ? $.inDay : $.dchip;
      place($.dpop, from.getBoundingClientRect(), DPX === 'in' ? 'down' : 'up');
    }
    if ($.rpop.classList.contains('on') && RP)
      place($.rpop, RP.from && RP.from.isConnected ? RP.from.getBoundingClientRect() : RP.anchor, RP.prefer);
  }
  window.addEventListener('resize', replacePops);
  // Is a keyboard up? Android makes room for it by shrinking the page (resizes-content); iOS covers the page (--kb).
  let fullH = innerHeight,
    fullW = innerWidth,
    kbWas = false,
    kbgoT = null;
  function kbUp() {
    if (innerWidth !== fullW) {
      fullW = innerWidth;
      fullH = innerHeight;
    }
    fullH = Math.max(fullH, innerHeight);
    const vv = window.visualViewport;
    return fullH - innerHeight > 120 || (!!vv && innerHeight - vv.height - vv.offsetTop > 120);
  }
  window.addEventListener('resize', () => {
    const up = kbUp();
    if (!up && app.classList.contains('kbgoing')) {
      clearTimeout(kbgoT);
      app.classList.remove('kbgoing');
    }
    // The keyboard put away with the system's back, the field still focused: an empty composer goes with it, in one
    // press. With words in it, it stays, its red plus one tap away (a second back closes it).
    if (
      kbWas &&
      !up &&
      TOUCH &&
      app.classList.contains('composing') &&
      D().activeElement === $.input &&
      !$.input.value.trim() &&
      !popOn()
    )
      compose(false);
    kbWas = up;
  });
  // iOS keeps the layout viewport when the keyboard opens: lift the composer sheet above it.
  if (window.visualViewport) {
    const vv = visualViewport,
      kb = () => {
        document.documentElement.style.setProperty('--kb', Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px');
        replacePops();
      };
    vv.addEventListener('resize', kb);
    vv.addEventListener('scroll', kb);
  }
  // Back from another page (the guide), the browser can hand the page back as it was left: nothing stays open, and
  // the page measures itself again (the window may have changed size meanwhile).
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    closeMore();
    compose(false);
    closePops();
    closeSearch(false);
    for (const el of [$.more, $.scrim]) el.getAnimations().forEach(x => x.finish());
    fullH = innerHeight;
    fullW = innerWidth;
    window.dispatchEvent(new Event('resize'));
    if (window.visualViewport) visualViewport.dispatchEvent(new Event('resize'));
  });
  window.addEventListener('hashchange', readIncoming);

  /* toast */
  let toastTm = null,
    toastAct = null;
  // `act`: 'undo', 'redo', or { label, run } for something else to do from the toast
  function toast(msg, act, ms = 4200) {
    const was = $.toast.classList.contains('on');
    // the message that offers to undo a change names it: Undo in More says it again once the message has gone
    const top = UN[UN.length - 1];
    if (act === 'undo' && top && !top.label) top.label = msg;
    $.toastTxt.textContent = msg;
    toastAct = act || null;
    $.undo.hidden = !act;
    $.undo.textContent = act === 'redo' ? 'Redo' : act && act.label ? act.label : 'Undo';
    $.toast.classList.toggle('plain', !act);
    $.toast.classList.add('on');
    if (was)
      an($.toast, [{ transform: 'translate(-50%,0) scale(.95)' }, { transform: 'translate(-50%,0)' }], {
        easing: POP.ease,
        duration: POP.dur,
      });
    stop(toastTm);
    toastTm = later(hideToast, ms);
  }
  function hideToast() {
    stop(toastTm);
    $.toast.classList.remove('on');
  }
  $.undo.onclick = () => {
    if (toastAct && toastAct.run) {
      const run = toastAct.run;
      hideToast();
      run();
    } else toastAct === 'redo' ? redo() : undo();
  };

  /* tooltips: app-styled, kept inside the window, gliding between neighbours */
  let tipFor = null,
    tipT = null,
    tipH = null,
    tipWarm = 0;
  function tipText(b) {
    if (b.classList.contains('mv')) return [`Move to ${WD.format(fromKey(addDays(cur, 1)))}`, ''];
    return [b.dataset.tip, b.dataset.key || ''];
  }
  function showTip(b) {
    const [t, k] = tipText(b);
    if (!t || !b.isConnected) return;
    $.tip.textContent = t;
    if (k) {
      const kb = D().createElement('kbd');
      kb.textContent = k;
      $.tip.append(kb);
    }
    const r = b.getBoundingClientRect();
    place($.tip, r, r.top > W().innerHeight * 0.5 ? 'up' : 'down');
    tipFor = b;
  }
  function queueTip(b, now) {
    stop(tipT);
    stop(tipH);
    if (now || $.tip.classList.contains('on') || performance.now() < tipWarm) showTip(b);
    else
      tipT = later(() => {
        tipT = null;
        if (b.matches(':hover')) showTip(b);
      }, 520);
  }
  function hideTip(ms) {
    stop(tipT);
    tipT = null;
    if (!$.tip.classList.contains('on')) {
      tipFor = null;
      return;
    }
    stop(tipH);
    const off = () => {
      $.tip.classList.remove('on');
      tipFor = null;
      tipWarm = performance.now() + 450;
    };
    if (ms) tipH = later(off, ms);
    else off();
  }
  // The same tooltips for the app and for the footer under the card.
  [app, document.getElementById('foot')].filter(Boolean).forEach(host => {
    host.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch' || P) return;
      const b = e.target.closest('[data-tip]');
      if (!b || b === tipFor) return;
      queueTip(b);
    });
    host.addEventListener('pointerout', e => {
      const b = e.target.closest('[data-tip]');
      if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return;
      stop(tipT);
      tipT = null;
      if (tipFor) hideTip(70);
    });
    host.addEventListener('pointerdown', () => hideTip(0), true);
    host.addEventListener('focusin', e => {
      const b = e.target.closest && e.target.closest('[data-tip]');
      if (b && b.matches(':focus-visible')) queueTip(b, true);
    });
    host.addEventListener('focusout', e => {
      if (tipFor && e.target === tipFor) hideTip(0);
    });
  });
  $.sc.addEventListener(
    'scroll',
    () => {
      hideTip(0);
      if ($.fmt.classList.contains('on') || $.lb.classList.contains('on')) onSel();
      if (SG) renderSug();
    },
    { passive: true },
  );

  /* keys */
  function onKey(e) {
    // the sync dialog takes Escape from anywhere while it is open (its own keys stay its own)
    if (SYD && e.key === 'Escape' && !locked && !LSM) {
      e.preventDefault();
      closeSync();
      return;
    }
    if (locked || LSM || IMP || IMSEAL || SYD) return;
    const t = e.target,
      typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName),
      k = e.key,
      kl = k.toLowerCase(),
      m = e.metaKey || e.ctrlKey,
      row = t.closest && t.closest('.row');
    if (P && P.mode === 'drag') {
      if (k === 'Escape') {
        e.preventDefault();
        cancelDrag();
      }
      return;
    }
    // sent tasks waiting for an answer (not once answered, while the dialog fades): Escape is Ignore (or shuts the
    // day picker first), undo and redo still work, and no other key reaches the day behind them; the picker keeps
    // its own arrows
    if (app.classList.contains('inboxing')) {
      if (k === 'Escape') {
        e.preventDefault();
        if (popOn()) closePops(true);
        else closeInbox();
        return;
      }
      const undoKey = m && !e.altKey && (kl === 'z' || kl === 'y');
      if (!undoKey && (m || e.altKey || !(popOn() && t.closest && t.closest('#dpop')))) return;
    }
    if (m && !e.altKey && (kl === 'z' || kl === 'y')) {
      const own = t.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(t.tagName) && t.type !== 'checkbox' && t.value);
      if (!own) {
        e.preventDefault();
        kl === 'y' || e.shiftKey ? redo() : undo();
      }
      return;
    }
    if (m && kl === 'k' && !(t.closest && t.closest('.note'))) {
      e.preventDefault();
      $.srch.classList.contains('on') ? closeSearch() : openSearch();
      return;
    }
    if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight') && !t.isContentEditable) {
      e.preventDefault();
      step(k === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (k === 'Escape' && $.srch.classList.contains('on')) {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (k === 'Escape' && (moreOpen || app.classList.contains('composing')) && !popOn()) {
      e.preventDefault();
      closeMore();
      compose(false);
      return;
    }
    if (typing || m) return;
    if (popOn()) {
      if (k === 'Escape') {
        e.preventDefault();
        closePops(true);
        return;
      }
      const g = t.closest && t.closest('.grid'),
        bs = g ? [...g.querySelectorAll('button')] : [],
        i = bs.indexOf(t),
        mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
      if (i > -1 && mv) {
        e.preventDefault();
        bs[Math.max(0, Math.min(bs.length - 1, i + mv))].focus();
        return;
      }
      if ((k === 't' || k === 'T') && $.tpop.classList.contains('on')) {
        e.preventDefault();
        closePops(true);
        return;
      }
      if (t.closest('#pop,#tpop,#dpop,#rpop,#fpop,#kpop')) return;
    }
    if (row && !t.closest('.more')) {
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        reorder(row.dataset.id, k === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault();
        const nb = row.nextElementSibling || row.previousElementSibling;
        removeTask(row.dataset.id, 'rm');
        if (nb) nb.querySelector('.in .ck').focus();
        else $.input.focus();
        return;
      }
      if (k === 'Enter' && t.classList.contains('ck')) {
        e.preventDefault();
        beginEdit(row.querySelector('.t'));
        return;
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        let n = row;
        do {
          n = k === 'ArrowUp' ? n.previousElementSibling : n.nextElementSibling;
        } while (n && n.classList.contains('exit'));
        if (n) n.querySelector('.in .ck').focus();
        else if (k === 'ArrowDown') $.input.focus();
        return;
      }
    }
    if (e.altKey) return;
    switch (k) {
      case 'ArrowLeft':
        step(-1);
        break;
      case 'ArrowRight':
        step(1);
        break;
      case 'd':
      case 'D':
      case 'Home':
        go(todayKey());
        break;
      case 't':
      case 'T':
        $.tpop.classList.contains('on') ? closePops(true) : openTimer();
        break;
      case 'n':
      case 'N':
        $.input.focus();
        break;
      case '/':
        openSearch();
        break;
      case 'p':
      case 'P':
        float();
        break;
      case 'f':
      case 'F':
        $.fpop.classList.contains('on') ? closePops(true) : openFilter();
        break;
      case 'l':
      case 'L':
        if (!vault) return;
        lockNow(true);
        break;
      case 'Escape':
        if (FX && t === D().body) setFilter(null);
        else if (t.blur) t.blur();
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  /* keep on top: Document Picture-in-Picture */
  let pip = null;
  const canTop = (() => {
    try {
      return window.top === window;
    } catch (e) {
      return false;
    }
  })();
  function setFloatUI(on) {
    $.float.setAttribute('aria-pressed', on);
    $.float.dataset.tip = on ? 'Back to the tab' : 'Keep on top';
  }
  async function float() {
    if (pip) {
      pip.close();
      return;
    }
    if (!('documentPictureInPicture' in window) || !canTop) {
      toast(
        canTop
          ? 'Keeping it on top needs Chrome or Edge.'
          : 'To keep it on top, open the app on its own in Chrome or Edge.',
        null,
        5600,
      );
      return;
    }
    try {
      pip = await documentPictureInPicture.requestWindow({ width: 380, height: 640 });
    } catch (e) {
      pip = null;
      toast('The browser didn’t open the floating window.');
      return;
    }
    const pd = pip.document,
      scheme = matchMedia('(prefers-color-scheme: dark)'),
      theme = () => document.documentElement.dataset.theme || (scheme.matches ? 'dark' : 'light');
    // The floating window follows the page, not the system: Windows can be dark while the browser is light.
    const syncTheme = () => {
      pd.documentElement.dataset.theme = theme();
      pd.documentElement.style.background = theme() === 'dark' ? '#0e0e0e' : '#fff';
    };
    pd.documentElement.lang = 'en';
    pd.title = 'One Day';
    syncTheme();
    scheme.addEventListener('change', syncTheme);
    // The floating document has no base URL of its own, so stylesheets get absolute URLs, and the app
    // moves in only once they have loaded: no flash of an unstyled page.
    const loads = [...document.querySelectorAll('link[rel=stylesheet]')].map(n => {
      const l = pd.createElement('link');
      l.rel = 'stylesheet';
      l.href = n.href;
      pd.head.append(l);
      return new Promise(r => (l.onload = l.onerror = r));
    });
    document.querySelectorAll('style').forEach(n => pd.head.append(n.cloneNode(true)));
    await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 1500))]);
    if (pip.closed) {
      pip = null;
      scheme.removeEventListener('change', syncTheme);
      return;
    }
    cancelDrag();
    closePops();
    hideTip(0);
    hideFmt();
    hideLb();
    hideSug();
    // a day being sealed ends here: its animations belong to this page, and its count is told at once, without a roll
    stopSeal();
    if (DDREADY && doneDays() !== DDC) ddSet(doneDays(), 0);
    // The card's place in the page is kept while it floats, so it comes back there: under the time and the
    // pills, above the footer, whatever the page holds around it.
    const spot = document.createComment('app');
    app.before(spot);
    pd.body.append(app);
    document.body.classList.add('floating');
    setFloatUI(true);
    // in there, the window's own close button brings the card back; the bar keeps what fits as the window changes
    app.classList.add('inpip');
    const fitRo = new pip.ResizeObserver(() => barFit());
    [BAR, $.tmb, $.todayb].forEach(n => n && fitRo.observe(n));
    barFit();
    pip.addEventListener('keydown', onKey);
    bindDoc(pd);
    tmLoop();
    pip.addEventListener(
      'pagehide',
      () => {
        scheme.removeEventListener('change', syncTheme);
        // Save any edit in progress while the floating document is still alive.
        const ae = pd.activeElement;
        if (ae && (ae.isContentEditable || ae.tagName === 'INPUT') && ae.blur) ae.blur();
        cancelDrag();
        closePops();
        hideToast();
        hideTip(0);
        hideFmt();
        hideLb();
        hideSug();
        stop(resortT);
        stop(noteT);
        settle();
        fitRo.disconnect();
        // the drawer stays in the floating window: shut at once, not on the page
        if (moreOpen) {
          closeMore();
          $.more.getAnimations().forEach(x => x.finish());
        }
        app.classList.remove('inpip');
        if (spot.parentNode) spot.replaceWith(app);
        else {
          const top = home.querySelector('#topbar');
          top ? top.after(app) : home.prepend(app);
        }
        pip = null;
        away();
        document.body.classList.remove('floating');
        setFloatUI(false);
        repaint();
        // back in the page: the bar keeps what fits there
        barFit();
        tmLoop();
      },
      { once: true },
    );
  }
  // Animations belong to the document they started in. When the floating window closes, any that ran
  // there stop applying, so the app is redrawn from its state instead of trusting what is on screen.
  function settle() {
    stopSeal();
    if (app.getAnimations) for (const a of app.getAnimations({ subtree: true })) a.cancel();
    app.querySelectorAll('.ghost,.exit,.dg .out,.sl,.rule .sheen').forEach(n => n.remove());
  }
  function repaint() {
    settle();
    for (const el of [$.num, $.tv, $.tbig, $.tpv, $.ddn]) delete el.dataset.v;
    DDC = null;
    ddPlace();
    $.list.textContent = '';
    renderHeader(0);
    renderList(true);
    renderAux();
    tmSync();
    tmRender(false);
    tpRender(0);
    sheet.snap();
  }
  $.float.onclick = float;

  /* light or dark in one click. The choice is kept; picking the system's own look follows the system again. */
  const THK = 'oneday.theme',
    sysDark = matchMedia('(prefers-color-scheme: dark)'),
    METAS = [...document.querySelectorAll('meta[name="theme-color"]')].map(m => [m, m.content]);
  let themePick = document.documentElement.dataset.theme || null;
  const themeNow = () => themePick || (sysDark.matches ? 'dark' : 'light');
  function applyTheme() {
    const root = document.documentElement,
      now = themeNow();
    if (themePick) root.dataset.theme = themePick;
    else delete root.dataset.theme;
    for (const [m, c] of METAS) m.content = themePick ? (themePick === 'dark' ? '#0e0e0e' : '#ffffff') : c;
    $.theme.setAttribute('aria-label', now === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    $.theme.dataset.tip = now === 'dark' ? 'Light mode' : 'Dark mode';
    if (pip) {
      pip.document.documentElement.dataset.theme = now;
      pip.document.documentElement.style.background = now === 'dark' ? '#0e0e0e' : '#fff';
    }
  }
  function toggleTheme() {
    const next = themeNow() === 'dark' ? 'light' : 'dark';
    themePick = next === (sysDark.matches ? 'dark' : 'light') ? null : next;
    try {
      if (themePick) localStorage.setItem(THK, themePick);
      else localStorage.removeItem(THK);
    } catch (e) {}
    applyTheme();
    if (tipFor === $.theme) showTip($.theme);
    an($.theme, [{ transform: 'rotate(-40deg) scale(.82)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  }
  $.theme.onclick = toggleTheme;
  sysDark.addEventListener('change', applyTheme);
  applyTheme();
  if (!('documentPictureInPicture' in window) || !canTop || TOUCH) $.float.hidden = true;
  document.getElementById('back').onclick = () => pip && pip.close();

  /* the lock: a random key encrypts the tasks (AES-GCM, 256 bits). That key is kept sealed by a key drawn from
     the passphrase (PBKDF2-SHA-256, 600,000 rounds) and, if chosen, by one from a passkey (WebAuthn PRF:
     fingerprint, face or device PIN). It all happens in this browser: nothing is sent anywhere, and nobody
     can open the tasks without the passphrase or the passkey. */
  const L = {};
  'lock lockForm lockPass lockErr lockGo lockBio lockForgot lockset lsForm lsT lsSub lsOld lsPass lsPass2 lsBio lsBioL lsWarn lsOk lsOkL lsOkT lsErr lsCancel lsGo'
    .split(' ')
    .forEach(id => (L[id] = document.getElementById(id)));
  const CAN_LOCK = !!(L.lock && window.isSecureContext && window.crypto && crypto.subtle && !window.claude),
    BIO =
      CAN_LOCK &&
      !!window.PublicKeyCredential &&
      !!navigator.credentials &&
      (location.protocol === 'https:' || location.hostname === 'localhost');
  const ITER = 600000,
    AWAY = 5 * 60e3,
    TE = new TextEncoder(),
    TD = new TextDecoder();
  let DEK = null,
    KID = '', // the id of the key this tab holds, to see when another tab changes it
    sealing = null,
    sealAgain = false,
    sealOk = true,
    fullAt = 0,
    introLater = false,
    LSM = null,
    bioOK = false;
  // fingerprint or face is offered where the device has it and the browser can derive a secret from a passkey
  if (BIO)
    Promise.all([
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
        ? PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
        : false,
      PublicKeyCredential.getClientCapabilities ? PublicKeyCredential.getClientCapabilities().catch(() => null) : null,
    ]).then(([uv, caps]) => {
      bioOK = !!uv && !(caps && caps['extension:prf'] === false);
    });
  const rnd = n => crypto.getRandomValues(new Uint8Array(n));
  function toB64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function passKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', TE.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }
  async function prfKey(secret, salt) {
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: TE.encode('one-day lock') },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }
  const dataKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function sealWith(key, bytes) {
    const iv = rnd(12);
    return { iv: toB64(iv), ct: toB64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) };
  }
  const unseal = async (key, b) =>
    new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(b.iv) }, key, fromB64(b.ct)));
  const plain = () => TE.encode(JSON.stringify({ days: S.days, rules: S.rules, tags: S.tags || {} }));
  // The passphrase opens the key, or nothing: a wrong one fails the AES-GCM check.
  async function passOpen(pass, v) {
    try {
      const kek = await passKey(pass, fromB64(v.kdf.salt), v.kdf.iter);
      return { kek, raw: await unseal(kek, v.pass) };
    } catch (e) {
      return null;
    }
  }
  async function byPass(pass, v) {
    const o = await passOpen(pass, v);
    return o ? o.raw : null;
  }

  // Every change is sealed again. Writes are chained, so the latest state always lands last. A seal writes only
  // the tasks, over the vault as it is stored now, and only with the key stored there: if another tab turned the
  // lock off or changed the key, this tab writes nothing.
  function sealSoon() {
    if (sealing) {
      sealAgain = true;
      return sealing;
    }
    sealing = (async () => {
      try {
        do {
          sealAgain = false;
          if (locked || !vault || !DEK) break;
          // sync's key and base go with the tasks they belong to, in the same write
          const dek = DEK,
            kid = KID,
            data = await sealWith(dek, plain()),
            sync = SYS ? await sealWith(dek, TE.encode(JSON.stringify(SYS))) : null;
          if (locked || !vault) break;
          // this tab took a new key meanwhile (a new passphrase): sealed again, with that one
          if (DEK !== dek || KID !== kid) {
            sealAgain = true;
            continue;
          }
          const cur = storedVault();
          if (!cur || (cur.kid || '') !== kid) {
            sealOk = false;
            later(() => obsolete(cur), 0);
            break;
          }
          vault = { ...cur, data };
          if (sync) vault.sync = sync;
          else delete vault.sync;
          localStorage.setItem(VK, JSON.stringify(vault));
          sealOk = true;
        } while (sealAgain);
      } catch (e) {
        sealOk = false;
        if (e && e.name === 'QuotaExceededError') full();
      }
      sealing = null;
    })();
    return sealing;
  }
  async function flush() {
    while (sealing) await sealing;
  }
  // the vault as it is stored now: another tab may have changed it
  function storedVault() {
    let v = null;
    try {
      v = JSON.parse(localStorage.getItem(VK));
    } catch (e) {}
    return okVault(v) ? v : null;
  }
  // another tab turned the lock on while this one held the tasks in clear: this one locks too
  function adoptVault() {
    const v = storedVault();
    if (!v) return false;
    vault = v;
    if (!locked) lockHere();
    return true;
  }
  // the key this tab holds is no longer the stored one (or the lock is gone): unlock again, or start over
  function obsolete(cur) {
    if (!cur) location.reload();
    else if (!locked) {
      vault = cur;
      lockHere();
    }
  }
  function full() {
    if (Date.now() - fullAt < 60e3) return;
    fullAt = Date.now();
    toast('This browser’s storage is full: your last changes aren’t saved');
  }
  // A tab still running an older One Day, or one that had not heard of the lock yet, may have written the tasks in
  // clear. Once unlocked, that copy is merged in task by task: a task the vault lacks is added (once), one both have
  // keeps the vault's version, since the copy in clear comes from a tab that is behind, and no task of the vault is
  // ever dropped. Sealed, and only then is that copy removed, if it is still the one merged. Returns the copy
  // merged, or null.
  function mergePlain() {
    let s = null;
    try {
      s = localStorage.getItem(LS);
    } catch (e) {}
    if (s == null) return null;
    let p = null;
    try {
      p = JSON.parse(s);
    } catch (e) {}
    if (p && p.days && typeof p.days === 'object') {
      const days = cleanDays(p.days),
        rules = cleanRules(p.rules);
      for (const k of Object.keys(days)) {
        const a = S.days[k],
          b = days[k];
        if (!a) {
          S.days[k] = b;
          continue;
        }
        const have = new Set(a.tasks.map(t => t.id));
        for (const t of b.tasks) {
          if (have.has(t.id)) continue;
          a.tasks.push(t);
          have.add(t.id);
        }
        a.u = Math.max(a.u || 0, b.u);
        if (b.moved) a.moved = 1;
      }
      for (const id of Object.keys(rules)) if (!S.rules[id]) S.rules[id] = rules[id];
      const tags = cleanTags(p.tags);
      if (!S.tags) S.tags = {};
      for (const g of Object.keys(tags)) if (!S.tags[g]) S.tags[g] = tags[g];
      IDX = null;
      TAGC = null;
    }
    return s;
  }
  async function dropPlain(s) {
    sealSoon();
    await flush();
    if (!sealOk || locked || !vault) return;
    try {
      if (localStorage.getItem(LS) === s) localStorage.removeItem(LS);
    } catch (e) {}
  }
  // a passkey no longer used: the device's passkey manager may forget it too
  function forgetPasskey(id) {
    try {
      if (window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential)
        PublicKeyCredential.signalUnknownCredential({
          rpId: location.hostname,
          credentialId: id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        }).catch(() => {});
    } catch (e) {}
  }

  // A passkey with the PRF extension gives the same secret each time it is used: that secret seals the key too.
  async function bioSecret(id, salt) {
    const a = await navigator.credentials.get({
      publicKey: {
        challenge: rnd(32),
        allowCredentials: [{ type: 'public-key', id }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    const r = a && a.getClientExtensionResults().prf;
    return r && r.results && r.results.first ? new Uint8Array(r.results.first) : null;
  }
  // The passkey belongs to this device's own authenticator (fingerprint, face or PIN), not to a key that can be
  // plugged in, and keeps one user id per vault, so setting it up again replaces it instead of adding one.
  async function bioMake(uid) {
    const salt = rnd(32),
      c = await navigator.credentials.create({
        publicKey: {
          rp: { name: 'One Day' },
          user: { id: fromB64(uid), name: 'One Day lock', displayName: 'One Day lock' },
          challenge: rnd(32),
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } },
        },
      });
    const id = new Uint8Array(c.rawId),
      ext = c.getClientExtensionResults().prf;
    if (!ext || ext.enabled === false) {
      forgetPasskey(toB64(id));
      return null;
    }
    // some authenticators only give the secret when the passkey is used, not when it is made
    let secret = ext.results && ext.results.first ? new Uint8Array(ext.results.first) : null;
    if (!secret) secret = await bioSecret(id, salt);
    if (!secret) {
      forgetPasskey(toB64(id));
      return null;
    }
    return { id, salt, secret };
  }
  async function bioSeal(m, raw) {
    const b = { id: toB64(m.id), salt: toB64(m.salt), ...(await sealWith(await prfKey(m.secret, m.salt), raw)) };
    m.secret.fill(0);
    return b;
  }

  // A message comes or goes without a jump: the card's height follows on a spring, from wherever it is.
  function say(card, out, msg) {
    if (out.textContent === msg) return;
    if (RM.matches || !card.getClientRects().length) {
      out.textContent = msg;
      return;
    }
    const h0 = card.offsetHeight;
    card.getAnimations().forEach(a => a.id === 'lh' && a.cancel());
    out.textContent = msg;
    const h1 = card.offsetHeight;
    if (msg) an(out, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    if (Math.abs(h1 - h0) < 1) return;
    const a = card.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: SNAP.dur, easing: SNAP.ease });
    a.id = 'lh';
    card.style.overflow = 'hidden';
    a.onfinish = a.oncancel = () => {
      if (!card.getAnimations().some(x => x.id === 'lh' && x !== a)) card.style.overflow = '';
    };
  }
  // Something is wrong: the message says what, the field that is wrong turns red and takes the focus,
  // and what is wrong shakes (the field, the box to tick, or the whole card for a wrong passphrase).
  function wrong(form, out, field, msg, at) {
    say(form, out, msg);
    form.querySelectorAll('[aria-invalid]').forEach(i => i.removeAttribute('aria-invalid'));
    if (field) {
      if (field.type === 'password') field.setAttribute('aria-invalid', 'true');
      field.focus({ preventScroll: true });
      if (field.select) field.select();
    }
    const el = at || form;
    el.getAnimations().forEach(a => a.id === 'shake' && a.cancel());
    const a = an(
      el,
      [
        { transform: 'none' },
        { transform: 'translateX(-9px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'none' },
      ],
      { duration: 380, easing: 'ease-out', composite: 'add' },
    );
    if (a) a.id = 'shake';
  }
  // A button at work says so, and its width follows its new words.
  function busy(b, label) {
    const w0 = b.offsetWidth;
    b.disabled = !!label;
    if (label) {
      if (!b.classList.contains('busy')) b.dataset.label = b.textContent;
      b.textContent = label;
    } else if (b.dataset.label) {
      b.textContent = b.dataset.label;
      delete b.dataset.label;
    }
    b.classList.toggle('busy', !!label);
    if (RM.matches || !w0) return;
    const w1 = b.offsetWidth;
    if (Math.abs(w1 - w0) > 0.5) b.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: SNAP.dur, easing: SNAP.ease });
  }
  // What was pressed last: the dialog grows from it (Safari does not focus a button that is clicked).
  let TAP = null;
  document.addEventListener(
    'pointerdown',
    e => {
      const el = e.target.closest && e.target.closest('button, a, label, [role="button"]');
      TAP = el ? { el, t: Date.now() } : null;
    },
    true,
  );
  // A message goes away as soon as what it was about is being fixed.
  [L.lockForm, L.lsForm].forEach(f =>
    f.addEventListener('input', e => {
      if (e.target.type !== 'password') return;
      e.target.removeAttribute('aria-invalid');
      say(f, f.querySelector('.lerr'), '');
    }),
  );
  L.lsOk.addEventListener('change', () => {
    if (L.lsOk.checked && /^Tick/.test(L.lsErr.textContent)) say(L.lsForm, L.lsErr, '');
  });

  /* the unlock screen */
  function showLock() {
    L.lockErr.textContent = '';
    L.lockPass.value = '';
    L.lockBio.hidden = !(vault && vault.bio && BIO);
    L.lock.getAnimations().forEach(a => a.cancel());
    L.lock.hidden = false;
    home.inert = true;
    lockUI();
    an(L.lockForm, [
      { opacity: 0, transform: 'translateY(14px) scale(.98)' },
      { opacity: 1, transform: 'none' },
    ]);
    if (!TOUCH) L.lockPass.focus({ preventScroll: true });
  }
  function hideLock() {
    home.inert = false;
    lockUI();
    then(an(L.lock, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: 'ease', fill: 'forwards' }), () => {
      if (locked) return;
      L.lock.hidden = true;
      L.lock.getAnimations().forEach(a => a.cancel());
    });
  }
  async function opened(raw) {
    const v = vault;
    let dek, j, sj;
    try {
      dek = await dataKey(raw);
      j = JSON.parse(TD.decode(await unseal(dek, v.data)));
      sj = await openSys(dek, v);
    } finally {
      raw.fill(0);
    }
    // another tab changed the key meanwhile: unlock again, with what is stored now
    const st = storedVault();
    if (!st || (st.kid || '') !== (v.kid || '')) {
      vault = st || vault;
      throw new Error('key changed');
    }
    S = { days: cleanDays(j && j.days), rules: cleanRules(j && j.rules), tags: cleanTags(j && j.tags) };
    SYS = sj;
    DEK = dek;
    KID = v.kid || '';
    locked = false;
    UN.length = 0;
    RE.length = 0;
    IDX = null;
    TAGC = null;
    cur = lastToday = todayKey();
    const merged = mergePlain();
    hideLock();
    ensure(cur);
    repaint();
    renderChip();
    if (merged != null) dropPlain(merged);
    if (introLater) {
      introLater = false;
      intro();
    }
    if (INRE.test(location.hash)) later(readIncoming, 600);
    syWake();
  }
  // sync's key and base, sealed in the vault with the tasks (null when sync is off, or it can't be read)
  async function openSys(dek, v) {
    if (!v.sync) return null;
    try {
      return cleanSys(JSON.parse(TD.decode(await unseal(dek, v.sync))));
    } catch (e) {
      return null;
    }
  }
  L.lockForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!locked || !vault || L.lockGo.disabled) return;
    const pass = L.lockPass.value;
    if (!pass) return wrong(L.lockForm, L.lockErr, L.lockPass, 'Enter your passphrase');
    say(L.lockForm, L.lockErr, '');
    busy(L.lockGo, 'Unlocking…');
    const raw = await byPass(pass, vault);
    busy(L.lockGo);
    if (!raw) return wrong(L.lockForm, L.lockErr, L.lockPass, 'That passphrase doesn’t open these tasks');
    try {
      await opened(raw);
    } catch (err) {
      L.lockErr.textContent = 'These tasks could not be opened';
    }
  });
  L.lockBio.onclick = async () => {
    if (!locked || !vault || !vault.bio) return;
    L.lockErr.textContent = '';
    let raw = null;
    try {
      const b = vault.bio,
        salt = fromB64(b.salt),
        secret = await bioSecret(fromB64(b.id), salt);
      if (secret) raw = await unseal(await prfKey(secret, salt), b);
    } catch (err) {}
    if (!raw) return wrong(L.lockForm, L.lockErr, null, 'That didn’t work. Use your passphrase.');
    try {
      await opened(raw);
    } catch (err) {
      L.lockErr.textContent = 'These tasks could not be opened';
    }
  };
  L.lockForgot.onclick = () => openLockset('reset');

  // Locking shows the lock screen at once, seals what was being typed behind it, then forgets the key and every
  // task until the next unlock. Lock now (the L key, the lock, the menu) locks every tab; five minutes away, only
  // the tab that was away.
  const BC = 'BroadcastChannel' in window ? new BroadcastChannel('one-day-lock') : null;
  if (BC) BC.onmessage = e => e.data === 'lock' && lockNow();
  async function lockNow(all) {
    if (!vault || locked) return;
    if (all && BC) BC.postMessage('lock');
    const ae = D().activeElement;
    if (ae && ae !== D().body && ae.blur) ae.blur();
    showLock();
    sealSoon();
    await flush();
    if (vault && !locked) lockHere(true);
  }
  function lockHere(shown) {
    if (pip) pip.close();
    locked = true;
    DEK = null;
    KID = '';
    // sync's key goes with the tasks: nothing syncs until the next unlock
    SYS = null;
    syLocked();
    // a settings dialog open now must not go on with what the lock wipes
    closeLockset(null);
    closeSync(true);
    closeImport();
    IM.impList.textContent = '';
    IM.impNote.textContent = '';
    IM.impT.textContent = '';
    closePops();
    closeSearch(false);
    closeInbox();
    closeMore();
    compose(false);
    hideSug();
    $.sug.textContent = '';
    $.toast.classList.remove('on');
    $.input.value = '';
    $.sq.value = '';
    UN.length = 0;
    RE.length = 0;
    noteSnap = null;
    S = { days: {}, rules: {}, tags: {} };
    IDX = null;
    TAGC = null;
    FX = null;
    renderFilter();
    $.ftags.textContent = '';
    $.inTitle.textContent = '';
    $.slist.textContent = '';
    repaint();
    if (!shown) showLock();
  }
  /* The lock, as one icon that tells its state (open: protect with a passphrase; shut: lock now): a pill above the
     card on a large screen, a button in the card's bar otherwise (in More on a phone). */
  const LP = document.getElementById('lpill');
  function lockUI() {
    const on = !!vault,
      t = on ? 'Lock now' : 'Protect with a passphrase';
    for (const b of [LP, $.lockb]) {
      if (!b) continue;
      b.hidden = !CAN_LOCK || (b === $.lockb && locked);
      b.classList.toggle('on', on);
      b.dataset.tip = t;
      b.setAttribute('aria-label', t);
      if (on) b.dataset.key = 'L';
      else delete b.dataset.key;
    }
  }
  const lockTap = () => {
    if (locked) return;
    if (vault) lockNow(true);
    else openLockset('on', lockDone);
  };
  $.lockb.onclick = lockTap;
  if (LP) LP.onclick = lockTap;
  lockUI();
  // On a large screen the time and the sun sit above the card, the sun beside the lock. Narrower, they go in the
  // card's bar: the time in the middle of the room between the chevrons and the buttons, the sun before the lock.
  const BIG = window.matchMedia('(min-width: 720px) and (min-height: 560px)'),
    TOPB = document.getElementById('topbar'),
    CLOCK = document.getElementById('clock'),
    BSP = q('.bar .sp');
  function placeTop() {
    if (!TOPB || !CLOCK || !BSP) return;
    if (BIG.matches) {
      TOPB.prepend(CLOCK);
      // the sun, then sync's cloud beside the lock: what keeps your tasks, side by side
      const after = document.getElementById('spill') || LP;
      if (after) after.before($.theme);
      else TOPB.append($.theme);
    } else {
      BSP.append(CLOCK);
      // the sun, sync's cloud, then the lock, as above the card
      (document.getElementById('syncb') || $.lockb).before($.theme);
    }
    ddPlace();
  }
  placeTop();
  BIG.addEventListener('change', placeTop);
  // On a phone the guide opens in this window, so the back button brings One Day back; a new tab or window there has
  // no way back but closing. (The drawer and search copy the footer's links, this one included.)
  if (TOUCH) document.querySelectorAll('a[href="guide/"]').forEach(a => a.removeAttribute('target'));

  /* Installing One Day, offered while it is not installed. Chrome and Edge lend their own prompt (beforeinstallprompt),
     which comes only while the app can be installed and is not; Safari has none, so it says where the browser keeps
     it. On a large screen the offer sits in the middle of the time's line; its cross puts it off for good into a small
     pill before the sun. Narrower, it waits behind one button with the sun and the lock. On a phone: first in More. */
  const INSK = 'oneday.install',
    INS = document.getElementById('ins'),
    IPILL = document.getElementById('ipill'),
    BAR = BSP && BSP.parentElement,
    PHONE = W().matchMedia(BARQ),
    APPQ = matchMedia(
      '(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: fullscreen), (display-mode: minimal-ui)',
    ),
    UA = navigator.userAgent,
    IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1),
    MACSAF = !IOS && /Macintosh/.test(UA) && /Version\/[\d.]+.*Safari\//.test(UA) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(UA),
    // a page of its own on the web: not a file on the disk, not inside another page
    WEB = canTop && /^https?:$/.test(location.protocol) && !window.claude;
  let insEv = null,
    insApp = APPQ.matches || navigator.standalone === true,
    insLater = false;
  try {
    insLater = localStorage.getItem(INSK) === 'later';
  } catch (e) {}
  const insHow = () => (insApp || !WEB ? null : insEv ? 'prompt' : IOS ? 'ios' : MACSAF ? 'mac' : null);
  function installUI() {
    const how = insHow(),
      big = BIG.matches,
      grouped = !!how && !big && !PHONE.matches;
    if (INS) INS.hidden = !how || !big || insLater;
    if (IPILL) IPILL.hidden = !how || !big || !insLater;
    if (TOPB) TOPB.classList.toggle('offer', !!INS && !INS.hidden);
    if (BAR) BAR.classList.toggle('grouped', grouped);
    syncKb();
    if (!grouped && $.kpop.classList.contains('on')) closePops();
  }
  /* The bar keeps what fits: in the floating window, in a browser's side panel, on a page zoomed in. When the buttons
     on the right stop fitting, the timer stays and the rest waits behind ⋮, in the drawer; folded and still short of
     room in the middle, the time steps out too. It is measured with everything showing, so the answer never
     flickers. A phone has its own bar at the bottom. */
  function barFolded() {
    return !!BAR && BAR.classList.contains('folded');
  }
  function barFit() {
    if (!BAR) return;
    BAR.classList.remove('folded');
    if (BSP) BSP.classList.remove('nomid');
    if (!PHONE.matches && (BAR.scrollWidth > BAR.clientWidth + 1 || midCramped())) {
      BAR.classList.add('folded');
      if (clockShows() && CLOCK.scrollWidth > BSP.clientWidth) BSP.classList.add('nomid');
    }
    syncKb();
  }
  // What sits in the middle keeps its place too: when the time, or the full days (at least their tick and number), do
  // not fit there, the buttons on the right make room the same way.
  function midCramped() {
    if (!BSP) return false;
    if (clockShows()) return CLOCK.scrollWidth > BSP.clientWidth;
    if (!DDC) return false;
    BSP.classList.add('fit');
    const need = $.dd.offsetWidth;
    BSP.classList.remove('fit');
    return need > BSP.clientWidth;
  }
  // ⋮ is the drawer where the bar is folded, and the install, theme and lock menu where those are grouped
  function syncKb() {
    const held = barFolded(),
      label = held ? 'More' : 'Install, theme and lock';
    $.kb.hidden = !held && !(BAR && BAR.classList.contains('grouped'));
    $.kb.dataset.tip = label;
    $.kb.setAttribute('aria-label', label);
    $.kb.setAttribute('aria-haspopup', held ? 'dialog' : 'menu');
    $.kb.setAttribute('aria-controls', held ? 'more' : 'kpop');
  }
  async function install() {
    const how = insHow();
    if (how === 'prompt') {
      // a prompt serves once: the offer goes until the browser lends a new one
      const ev = insEv;
      insEv = null;
      installUI();
      try {
        await ev.prompt();
        await ev.userChoice;
      } catch (e) {}
    } else if (how === 'ios') toast('Tap Share in your browser, then Add to Home Screen.', null, 6400);
    else if (how === 'mac') toast('In Safari’s menu bar, choose File, then Add to Dock.', null, 6400);
  }
  window.addEventListener('beforeinstallprompt', e => {
    // the offer is the app's to place, not a bar the browser pops up
    e.preventDefault();
    insEv = e;
    installUI();
  });
  window.addEventListener('appinstalled', () => {
    insEv = null;
    insApp = true;
    installUI();
    toast('One Day is installed.');
  });
  APPQ.addEventListener('change', () => {
    if (APPQ.matches) insApp = true;
    installUI();
  });
  BIG.addEventListener('change', installUI);
  PHONE.addEventListener('change', installUI);
  if (INS) {
    document.getElementById('insGo').onclick = install;
    document.getElementById('insX').onclick = () => {
      insLater = true;
      try {
        localStorage.setItem(INSK, 'later');
      } catch (e) {}
      hideTip(0);
      installUI();
      if (IPILL && !IPILL.hidden) {
        an(IPILL, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { easing: POP.ease, duration: POP.dur });
        IPILL.focus({ preventScroll: true });
      }
    };
  }
  if (IPILL) IPILL.onclick = install;
  // narrower: install, the theme and the lock in one menu, under its button
  function openKmenu() {
    closePops();
    const dark = themeNow() === 'dark',
      its = [];
    if (insHow()) its.push(['install', IC.install, 'Install One Day', ' red']);
    its.push(['theme', dark ? IC.sun : IC.moon, dark ? 'Light mode' : 'Dark mode', '']);
    if (CAN_LOCK && !locked) its.push(['lock', vault ? IC.lock : IC.unlock, vault ? 'Lock now' : 'Protect with a passphrase', '']);
    $.kpop.innerHTML = its
      .map(([k, i, l, c]) => `<button type="button" class="kit${c}" role="menuitem" data-k="${k}">${i}<span>${l}</span></button>`)
      .join('');
    const p = $.kpop.offsetParent.getBoundingClientRect(),
      b = $.kb.getBoundingClientRect();
    $.kpop.style.top = Math.round(b.bottom - p.top + 4) + 'px';
    $.kpop.style.right = Math.round(p.right - b.right) + 'px';
    $.kpop.classList.add('on');
    guard('pops', () => closePops(true));
    $.kb.setAttribute('aria-expanded', 'true');
    hideTip(0);
    $.kpop.querySelector('.kit').focus({ preventScroll: true });
  }
  $.kb.onclick = () => {
    if (barFolded()) moreOpen ? closeMore() : openMore();
    else $.kpop.classList.contains('on') ? closePops() : openKmenu();
  };
  $.kpop.onclick = e => {
    const b = e.target.closest('.kit');
    if (!b) return;
    closePops(true);
    if (b.dataset.k === 'install') install();
    else if (b.dataset.k === 'theme') toggleTheme();
    else if (b.dataset.k === 'lock') lockTap();
  };
  $.kpop.addEventListener('keydown', e => {
    const its = [...$.kpop.querySelectorAll('.kit')],
      i = its.indexOf(D().activeElement),
      n = { ArrowDown: (i + 1) % its.length, ArrowUp: (i - 1 + its.length) % its.length, Home: 0, End: its.length - 1 }[e.key];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePops(true);
    } else if (e.key === 'Tab') closePops();
    else if (n !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      its[n].focus();
    }
  });
  installUI();
  // how much room "Today" keeps in the bar while hidden (its words in the app's font)
  const todayRoom = () => $.todayb.parentElement.style.setProperty('--tw', $.todayb.offsetWidth + 6 + 'px');
  todayRoom();
  if (document.fonts) document.fonts.ready.then(todayRoom);
  // the bar folds again as its room changes: a window resized, a page zoomed, the time or "Today" changing width
  if (window.ResizeObserver && BAR) {
    const barRo = new ResizeObserver(() => barFit());
    [BAR, $.tmb, $.todayb, CLOCK].forEach(n => n && barRo.observe(n));
  }
  barFit();
  if (document.fonts) document.fonts.ready.then(barFit);
  /* and the time, its digits rolling like the timer's */
  const CLK = document.getElementById('cdg'),
    CLF = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  function clockTick(d) {
    if (!CLK) return;
    const now = new Date(),
      s = CLF.format(now),
      // every ten minutes, the full days take the time's place for a moment, instead of its digits rolling
      peek = d && now.getMinutes() % 10 === 0 && ddCan();
    roll(CLK, s, peek ? 0 : d);
    CLK.parentElement.setAttribute('aria-label', 'Time: ' + s);
    if (peek) ddPeek();
  }
  clockTick(0);
  later(() => {
    clockTick(1);
    setInterval(() => clockTick(1), 60e3);
  }, 60e3 - (Date.now() % 60e3) + 30);

  /* full days: the days that had tasks and saw every one of them ticked, today and before. They are counted from the
     tasks themselves, and a day missed takes nothing away: the count never starts again. A day gone by whose open
     tasks were carried to another (Bring here, or a task's arrow) keeps a mark, moved, and never counts: what it left
     undone went elsewhere. Putting a task off on its own day, or deleting it, leaves no mark. The count sits in the
     middle of the bar. Where the time sits there (a narrower window), it takes the time's place for five seconds: on
     opening, when it counts one more, and every ten minutes. */
  function doneDays() {
    const tk = todayKey();
    let n = 0;
    for (const k in S.days) {
      if (k > tk || S.days[k].moved) continue;
      const t = S.days[k].tasks;
      if (t.length && t.every(x => x.done)) n++;
    }
    return n;
  }
  // the time is in the bar, and shows (a phone shows it at the top of its screen instead)
  function clockShows() {
    return !!(CLOCK && BSP && CLOCK.parentElement === BSP && W().getComputedStyle(CLOCK).display !== 'none');
  }
  function ddPlace() {
    if (!BSP) return;
    stop(ddT);
    BSP.classList.remove('alt');
    BSP.classList.toggle('wclock', clockShows());
  }
  function ddRender() {
    if (!DDREADY || DDHOLD) return;
    const n = doneDays();
    if (n !== DDC) ddSet(n, DDC == null ? 0 : Math.sign(n - DDC));
  }
  function ddSet(n, d) {
    const was = $.dd.hidden,
      prev = DDC,
      words = n === 1 ? 'full day' : 'full days';
    DDC = n;
    // said in the bar's order whatever shows there (the time, or not enough room)
    $.ddsr.textContent = n ? `${n} ${words}` : '';
    if ($.ddw.textContent !== words) $.ddw.textContent = words;
    if (!n) {
      $.dd.hidden = true;
      barFit();
      return ddPlace();
    }
    $.dd.hidden = false;
    roll($.ddn, String(n), was ? 0 : d);
    if (was && d && !BSP.classList.contains('wclock')) ddIn(0);
    // a count that comes or grows may need the bar to make room
    if (was || String(n).length !== String(prev).length) barFit();
  }
  function ddIn(delay) {
    an($.ddv, [{ transform: 'translateY(140%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay, fill: 'backwards' });
  }
  function ddCan() {
    return !!DDC && clockShows() && !D().hidden;
  }
  // in the time's place, like a digit rolling in; the time rolls back five seconds later
  function ddSwap(on) {
    if (BSP.classList.contains('alt') === on) return;
    BSP.classList.toggle('alt', on);
    const inn = on ? $.ddv : CLK,
      out = on ? CLK : $.ddv;
    for (const el of [inn, out]) el.getAnimations().forEach(a => a.id === 'dd' && a.cancel());
    const a = an(out, [
        { transform: 'none', opacity: 1, visibility: 'visible' },
        { transform: 'translateY(-140%)', opacity: 0, visibility: 'visible' },
      ]),
      b = an(inn, [{ transform: 'translateY(140%)', opacity: 0 }, { transform: 'none', opacity: 1 }]);
    if (a) a.id = 'dd';
    if (b) b.id = 'dd';
  }
  function ddPeek(after) {
    if (!ddCan()) return after && after();
    const was = BSP.classList.contains('alt');
    ddSwap(true);
    stop(ddT);
    ddT = later(() => ddSwap(false), 5000);
    if (after) was || RM.matches ? after() : later(after, 420);
  }
  // one more, said in red for a moment (in black for a day before: red is today's)
  function ddHot(red) {
    $.dd.classList.add('hot');
    $.dd.classList.toggle('ink', !red);
    later(() => $.dd.classList.remove('hot'), 1400);
    an($.ddv.querySelector('.ddi'), [{ transform: 'scale(.4)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  }

  /* A day sealed: its last task ticked. That task's circle lifts off as a disc, grows into the middle of the day and
     draws a big check, light bursting round it; under it the full days count one more. Then the check, the number and
     its words fold into the count in the bar, each into its own place, and a light runs along the full rule. Once,
     when the last task is ticked: a reload, an undo or a redo only change the count. Without motion, the check and the
     count simply show for a moment, and the count in the bar changes at once, in red. No sound. */
  let dayShow = null;
  function stopSeal() {
    if (!dayShow) return;
    const s = dayShow;
    dayShow = null;
    s.t.forEach(stop);
    s.a.forEach(a => a && a.cancel());
    if (s.el) s.el.remove();
    $.dd.classList.remove('landing');
    // the time it rolled away comes back
    if (s.alt) ddSwap(false);
    DDHOLD = 0;
  }
  const SL = {
    lift: 60, // the disc leaves the ticked circle
    fly: 640, // and grows into the middle, on a spring
    land: 480, // when it is there, near enough: the check draws, the light bursts
    fold: 1850, // the check and the count fold into the bar
    folds: 620,
  };
  function sealDay(li) {
    const rm = RM.matches,
      red = cur === todayKey(),
      prev = DDC || 0,
      n = doneDays(),
      words = n === 1 ? 'full day' : 'full days',
      s = (dayShow = { t: [], a: [], el: null }),
      keep = a => (a && s.a.push(a), a),
      at = (fn, ms) => s.t.push(later(fn, ms));
    $.ddlive.textContent = `${red ? 'Today' : WD.format(fromKey(cur))}, all done. ${n} ${words}.`;
    later(() => ($.ddlive.textContent = ''), 7000);
    // where it all goes, in the card's own coordinates: the middle of what lies under the bar
    const A = app.getBoundingClientRect(),
      bar = BAR.getBoundingClientRect(),
      mb = $.mbar.getBoundingClientRect(),
      top = bar.bottom - A.top,
      bottom = (mb.height ? mb.top : Math.min(A.bottom, W().innerHeight)) - A.top,
      w = A.width,
      dia = Math.round(Math.max(64, Math.min(124, w * 0.3, (bottom - top) * 0.38))),
      fs = Math.round(dia * 0.4),
      tall = dia + 16 + fs + 6 + 20,
      cx = w / 2,
      cy = top + Math.max(dia / 2 + 8, (bottom - top - tall) / 2 + dia / 2);
    const ov = D_('div', 'sl' + (red ? ' red' : '') + (rm ? ' still' : ''));
    // its parts, placed through the style object: the page allows no style written in its markup
    ov.innerHTML =
      '<div class="sl-s"></div>' +
      (rm ? '' : `<div class="sl-ring"></div><div class="sl-rays">${'<b><i></i></b>'.repeat(12)}</div>`) +
      '<div class="sl-p sl-d"><div class="sl-y"><svg viewBox="0 0 100 100"><circle class="b" cx="50" cy="50" r="50"/>' +
      '<circle class="r" cx="50" cy="50" r="50"/><path pathLength="1" d="M28.6 52.1 43.1 66.6 71.4 35.5"/></svg></div></div>' +
      '<div class="sl-p sl-n"><div class="sl-y"><span class="sl-num"></span></div></div>' +
      `<div class="sl-p sl-w"><div class="sl-y"><span>${words}</span></div></div>`;
    const put = (sel, st) => {
      const e = ov.querySelector(sel);
      if (e) for (const k in st) e.style[k] = typeof st[k] === 'number' ? st[k] + 'px' : st[k];
    };
    put('.sl-s', { top, height: Math.max(0, bottom - top) });
    for (const sel of ['.sl-ring', '.sl-d']) put(sel, { left: cx - dia / 2, top: cy - dia / 2, width: dia, height: dia });
    put('.sl-rays', { left: cx, top: cy });
    ov.querySelectorAll('.sl-rays b').forEach((b, i) => (b.style.transform = `rotate(${i * 30}deg)`));
    put('.sl-n', { top: cy + dia / 2 + 16, fontSize: fs });
    put('.sl-w', { top: cy + dia / 2 + 16 + fs + 6 });
    ov.setAttribute('aria-hidden', 'true');
    app.append(ov);
    s.el = ov;
    const part = c => ov.querySelector('.sl-' + c),
      inner = c => part(c).firstElementChild,
      num = ov.querySelector('.sl-num');
    roll(num, String(prev && !rm ? prev : n), 0);
    // without motion: the check and the count show together for a moment, and the bar's count changes at once
    if (rm) {
      ddSet(n, 0);
      ddHot(red);
      if (clockShows()) ddPeek();
      const show = keep(an(ov, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'backwards' }));
      at(() => {
        const a = keep(an(ov, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
        then(a, () => stopSeal());
      }, 1500);
      return show;
    }
    // the scrim: the day steps back while the check is there
    keep(an(part('s'), [{ opacity: 0 }, { opacity: 1 }], { delay: SL.lift, duration: 320, easing: 'ease-out', fill: 'backwards' }));
    // the disc leaves the ticked circle: sideways on one curve, up and larger on a spring, so its path bends
    const ck = li && li.querySelector('.in .ck'),
      cb = ck ? ck.getBoundingClientRect() : null,
      dx = cb ? cb.left + cb.width / 2 - A.left - cx : 0,
      dy = cb ? cb.top + cb.height / 2 - A.top - cy : 40,
      s0 = cb ? cb.width / dia : 0.2;
    keep(an(part('d'), [{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { delay: SL.lift, duration: SL.fly, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' }));
    keep(an(inner('d'), [{ transform: `translateY(${dy}px) scale(${s0})` }, { transform: 'none' }], { delay: SL.lift, duration: SL.fly, easing: DROP.ease, fill: 'backwards' }));
    if (red) keep(an(ov.querySelector('.sl-d .r'), [{ opacity: 0 }, { opacity: 1 }], { delay: SL.lift + 80, duration: 360, easing: 'ease-in-out', fill: 'both' }));
    // the check draws as the disc arrives, and the disc answers it
    keep(an(ov.querySelector('.sl-d path'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay: SL.land, duration: 300, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' }));
    keep(an(ov.querySelector('.sl-d svg'), [{ transform: 'none' }, { transform: 'scale(1.07)', offset: 0.4 }, { transform: 'none' }], { delay: SL.land + 220, duration: 420, easing: 'ease-in-out' }));
    // the light bursts with it: a ring, and rays, the long ones first
    keep(
      an(
        part('ring'),
        [
          { transform: 'scale(.92)', opacity: 0 },
          { transform: 'none', opacity: 0.5, offset: 0.08 },
          { transform: 'scale(1.85)', opacity: 0 },
        ],
        { delay: SL.land + 40, duration: 760, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
      ),
    );
    ov.querySelectorAll('.sl-rays i').forEach((r, i) => {
      const long = i % 2 === 0,
        L = dia * (long ? 0.3 : 0.2),
        h = dia * (long ? 0.13 : 0.09);
      r.style.height = h + 'px';
      keep(
        an(
          r,
          [
            { transform: `translateY(${-dia / 2 - 2 - h}px) scaleY(.4)`, opacity: 0 },
            { transform: `translateY(${-dia / 2 - 3 - h}px) scaleY(.5)`, opacity: 1, offset: 0.06 },
            { transform: `translateY(${-dia / 2 - 6 - h - L * 0.55}px) scaleY(1)`, opacity: 1, offset: 0.35 },
            { transform: `translateY(${-dia / 2 - 8 - h - L}px) scaleY(.3)`, opacity: 0 },
          ],
          { delay: SL.land + 50 + (long ? 0 : 40), duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
        ),
      );
    });
    // under it, the count: it rises, then says one more
    keep(an(inner('n'), [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: SL.land + 200, fill: 'backwards' }));
    keep(an(inner('w'), [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: SL.land + 260, fill: 'backwards' }));
    if (prev) at(() => roll(num, String(n), 1), SL.land + 560);
    // then everything folds into the count in the bar, each part into its own place
    at(() => fold(s, red), SL.fold);
  }
  function fold(s, red) {
    const ov = s.el,
      keep = a => (a && s.a.push(a), a);
    if (!ov) return;
    DDHOLD = Math.max(0, DDHOLD - 1);
    // the count in the bar takes its new value out of sight, and where the time sits there, the time rolls away
    $.dd.classList.add('landing');
    const clock = clockShows();
    ddSet(doneDays(), 0);
    // a swap back the ten minutes' look had planned waits for the landing instead
    if (clock) stop(ddT);
    if (clock && !BSP.classList.contains('alt')) {
      s.alt = true;
      BSP.classList.add('alt');
      keep(an(CLK, [{ transform: 'none', opacity: 1, visibility: 'visible' }, { transform: 'translateY(-140%)', opacity: 0, visibility: 'visible' }]));
    }
    // the day comes back as they land, not before: they never cross the date in full view
    keep(an(ov.querySelector('.sl-s'), [{ opacity: 1 }, { opacity: 0 }], { delay: 340, duration: 320, easing: 'ease-in-out', fill: 'forwards' }));
    const icon = $.dd.querySelector('.ddi'),
      to = [
        ['d', icon, 0, 0.906],
        ['n', $.ddn, 50, 0],
        ['w', $.ddw, 90, 0],
      ];
    let last = null;
    for (const [c, el, delay, disc] of to) {
      const p = ov.querySelector('.sl-' + c),
        y = p.firstElementChild,
        b = (c === 'd' ? y : y.firstElementChild || y).getBoundingClientRect(),
        t = el ? el.getBoundingClientRect() : null;
      // no room for the count in the bar: the part just goes, where it is
      if (!t || !t.width || !b.width) {
        last = keep(an(y, [{ transform: 'none', opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { delay, duration: 360, easing: 'ease-in', fill: 'forwards' }));
        continue;
      }
      const sc = disc ? (t.width * disc) / b.width : t.height / b.height,
        dx = t.left + t.width / 2 - (b.left + b.width / 2),
        dy = t.top + t.height / 2 - (b.top + b.height / 2);
      keep(an(p, [{ transform: 'none' }, { transform: `translateX(${dx}px)` }], { delay, duration: SL.folds, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }));
      last = keep(
        an(
          y,
          [
            { transform: 'none', opacity: 1 },
            { transform: `translateY(${dy * 0.82}px) scale(${1 + (sc - 1) * 0.9})`, opacity: 1, offset: 0.82 },
            { transform: `translateY(${dy}px) scale(${sc})`, opacity: 0 },
          ],
          { delay, duration: SL.folds, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' },
        ),
      );
    }
    // they land: the count shows again, says it in red, and a light runs along the full rule
    s.t.push(
      later(() => {
        $.dd.classList.remove('landing');
        ddHot(red);
        sheen();
        if (clockShows()) {
          stop(ddT);
          ddT = later(() => ddSwap(false), 5000);
        }
      }, 90 + SL.folds * 0.86),
    );
    then(last, () => {
      if (dayShow === s) dayShow = null;
      ov.remove();
    });
  }
  // a light runs along the full rule
  function sheen() {
    if (RM.matches) return;
    const r = q('.rule'),
      sh = D_('span', 'sheen');
    r.append(sh);
    then(an(sh, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(250%)' }], { duration: 950, easing: 'cubic-bezier(.4,0,.2,1)' }), () => sh.remove());
  }
  // an element of the document the app is in, with its class
  function D_(tag, cls) {
    const e = D().createElement(tag);
    e.className = cls;
    return e;
  }
  PHONE.addEventListener('change', ddPlace);
  // back after ten minutes or more: like opening it
  let ddAway = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ddAway = Date.now();
    else if (ddAway && Date.now() - ddAway >= 10 * 60e3) later(ddPeek, 900);
  });
  DDREADY = true;
  ddPlace();
  // Away for five minutes: locked (not while the app floats on top, and again once it stops floating). While away,
  // the tasks are hidden, so the picture the system keeps for its app switcher shows none.
  let awayAt = 0,
    awayT = null;
  function away() {
    clearTimeout(awayT);
    home.classList.toggle('veil', document.hidden && !!vault && !locked && !pip);
    if (!document.hidden) {
      const late = awayAt && Date.now() - awayAt >= AWAY;
      awayAt = 0;
      if (late && vault && !locked && !pip) lockNow();
      return;
    }
    if (!vault || locked || pip) return;
    awayAt = Date.now();
    awayT = setTimeout(lockNow, AWAY);
  }
  document.addEventListener('visibilitychange', away);
  // another tab turned the lock on or off, changed the key, or wrote the tasks in clear
  window.addEventListener('storage', e => {
    if (e.key === LS) {
      if (e.newValue == null || !vault || locked || !DEK) return;
      const merged = mergePlain();
      if (merged == null) return;
      repaint();
      renderChip();
      dropPlain(merged);
      return;
    }
    if (e.key !== VK && e.key !== null) return;
    const v = storedVault();
    if (v && vault) {
      const same = (v.kid || '') === KID;
      vault = v;
      if (!locked && !same) lockHere();
    } else if (v && !locked) {
      vault = v;
      lockHere();
    } else if (!v && vault) location.reload();
  });
  lockReady = true;

  /* the lock's settings: turn on, change, turn off, open an encrypted backup, start over */
  const LST = {
    on: [
      'Protect One Day',
      'Choose a passphrase. Your tasks will be encrypted in this browser, and One Day will ask for it when it opens.',
      'Protect',
    ],
    change: ['Change the passphrase', 'Your tasks stay encrypted. Backups made before keep the passphrase they were made with.', 'Change'],
    off: ['Turn off protection', 'Your tasks will be stored in this browser without encryption again.', 'Turn off'],
    bio: ['Use fingerprint or face', 'Enter your passphrase, then confirm with your fingerprint, face or device PIN.', 'Set up'],
    biooff: ['Stop using fingerprint or face', 'Enter your passphrase. From now on, only it unlocks One Day.', 'Stop using'],
    ask: ['Encrypted backup', 'Enter the passphrase this backup was made with.', 'Open'],
    reset: [
      'Forgot the passphrase?',
      'Nobody can open these tasks without it, not even the maker of One Day. You can erase them and start again with an empty list.',
      'Erase',
    ],
  };
  function openLockset(mode, done, check) {
    if (!CAN_LOCK || LSM) return false;
    if (pip) pip.close();
    closePops();
    closeMore();
    compose(false);
    const [t, sub, go] = LST[mode],
      ae = D().activeElement,
      old = mode !== 'on' && mode !== 'reset';
    LSM = { mode, done, check, from: ae && ae !== D().body ? ae : null };
    guard('lockset', () => closeLockset(null));
    L.lsT.textContent = t;
    L.lsSub.textContent = sub;
    L.lsGo.textContent = go;
    L.lsGo.classList.toggle('danger', mode === 'reset');
    L.lsOld.hidden = !old;
    L.lsOld.placeholder = mode === 'ask' ? 'Passphrase' : 'Current passphrase';
    L.lsOld.setAttribute('aria-label', L.lsOld.placeholder);
    L.lsPass.hidden = L.lsPass2.hidden = !(mode === 'on' || mode === 'change');
    L.lsPass.placeholder = mode === 'change' ? 'New passphrase, 12 characters or more' : 'Passphrase, 12 characters or more';
    L.lsBioL.hidden = !(mode === 'on' && bioOK);
    L.lsWarn.hidden = mode !== 'on';
    L.lsOkL.hidden = !(mode === 'on' || mode === 'reset');
    L.lsOkT.textContent = mode === 'reset' ? 'Erase my tasks in this browser' : 'I understand';
    if (mode === 'on') L.lsOk.setAttribute('aria-describedby', 'lsWarn');
    else L.lsOk.removeAttribute('aria-describedby');
    for (const i of [L.lsOld, L.lsPass, L.lsPass2]) {
      i.value = '';
      i.removeAttribute('aria-invalid');
    }
    L.lsBio.checked = false;
    L.lsOk.checked = false;
    L.lsErr.textContent = '';
    L.lsGo.classList.remove('busy');
    delete L.lsGo.dataset.label;
    L.lsGo.disabled = false;
    home.inert = true;
    modalIn(TAP && TAP.el.isConnected && Date.now() - TAP.t < 1500 ? TAP.el : LSM.from);
    (old ? L.lsOld : mode === 'on' ? L.lsPass : L.lsOk).focus({ preventScroll: true });
    return true;
  }
  /* The dialog's motion. On a computer it grows from what opened it, over a scrim that dims and softens the
     page, and its parts settle in one after the other; on a phone it is a sheet that rises from the bottom.
     It leaves the way it came, faster, and can be caught on the way: opening again starts from where it is. */
  function modalIn(from, m = L.lockset, card = L.lsForm) {
    const sheet = W().matchMedia(BARQ).matches;
    m.getAnimations({ subtree: true }).forEach(a => a.cancel());
    m.classList.remove('out');
    m.hidden = false;
    card.style.transformOrigin = '';
    if (!sheet && from && from.isConnected) {
      const r = from.getBoundingClientRect(),
        c = card.getBoundingClientRect();
      if (r.width) card.style.transformOrigin = `${Math.round(r.left + r.width / 2 - c.left)}px ${Math.round(r.top + r.height / 2 - c.top)}px`;
    }
    an(m, [{ backgroundColor: 'rgb(0 0 0 / 0)', backdropFilter: 'blur(0px)' }, {}], { duration: 300, easing: 'ease-out' });
    an(card, [{ opacity: 0 }, { opacity: 1 }], { duration: sheet ? 120 : 200, easing: 'ease-out' });
    if (sheet) {
      an(card, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: SNAP.dur, easing: SNAP.ease });
      return;
    }
    an(card, [{ transform: 'scale(.9)' }, { transform: 'none' }], { duration: SNAP.dur, easing: SNAP.ease });
    [...card.children]
      .filter(c => c.getClientRects().length)
      .forEach((c, i) =>
        an(c, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
          duration: 300,
          delay: 50 + i * 18,
          easing: 'cubic-bezier(.2,.8,.2,1)',
          fill: 'backwards',
        }),
      );
  }
  function modalOut(m = L.lockset, card = L.lsForm) {
    const sheet = W().matchMedia(BARQ).matches,
      o = { easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' };
    m.classList.add('out');
    // no first keyframe: each part leaves from where it is now, even halfway in
    an(m, [{ backgroundColor: 'rgb(0 0 0 / 0)', backdropFilter: 'blur(0px)' }], { ...o, duration: 240 });
    const a = sheet
      ? an(card, [{ transform: 'translateY(100%)' }], { ...o, duration: 280 })
      : an(card, [{ opacity: 0, transform: 'scale(.94)' }], { ...o, duration: 190 });
    then(a, () => {
      if (!m.classList.contains('out')) return;
      m.hidden = true;
      m.classList.remove('out');
      m.getAnimations({ subtree: true }).forEach(x => x.cancel());
    });
  }
  function closeLockset(res) {
    const m = LSM;
    if (!m) return;
    LSM = null;
    unguard('lockset');
    modalOut();
    for (const i of [L.lsOld, L.lsPass, L.lsPass2]) i.value = '';
    if (!locked) home.inert = false;
    if (m.from && m.from.isConnected && !m.from.closest('[inert]')) m.from.focus({ preventScroll: true });
    else if (locked && !TOUCH) L.lockPass.focus({ preventScroll: true });
    if (m.done) m.done(res);
  }
  L.lsCancel.onclick = () => closeLockset(null);
  L.lockset.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeLockset(null);
  });
  L.lockset.addEventListener('click', e => {
    if (e.target === L.lockset) closeLockset(null);
  });
  // What a setting writes, it writes over the vault as stored, after a last check that this tab is still unlocked
  // with the stored key: a lock, or another tab, in the meantime and nothing is written.
  const still = cur => !locked && !!vault && !!cur && (cur.kid || '') === KID,
    BUSY = { err: 'One Day was locked or changed meanwhile. Nothing was changed.' };
  // The tasks as stored (another tab may have sealed some after this one), opened with this tab's key and sealed
  // with a new one; null if anything changed meanwhile.
  async function reseal(dek) {
    await flush();
    const cur = storedVault();
    if (!still(cur)) return null;
    const j = JSON.parse(TD.decode(await unseal(DEK, cur.data))),
      tasks = { days: cleanDays(j && j.days), rules: cleanRules(j && j.rules), tags: cleanTags(j && j.tags) },
      data = await sealWith(dek, TE.encode(JSON.stringify(tasks))),
      // sync's key and base, stored with those tasks, are sealed again with them
      sys = await openSys(DEK, cur),
      sync = sys ? await sealWith(dek, TE.encode(JSON.stringify(sys))) : null,
      now = storedVault();
    if (!still(now) || now.data.ct !== cur.data.ct) return null;
    return { cur: now, data, tasks, sys, sync };
  }
  // the vault with a new key: what it holds is sealed with it, sync's part included or left out
  const rekeyed = (v, r) => {
    const o = { ...v, data: r.data };
    if (r.sync) o.sync = r.sync;
    else delete o.sync;
    return o;
  };
  // this tab now holds the new key, and the tasks as they were stored
  function took(k, tasks, sys) {
    DEK = k.dek;
    KID = k.kid;
    S = tasks;
    SYS = sys;
    IDX = null;
    TAGC = null;
    repaint();
    renderChip();
  }
  // a new key for the tasks, sealed by the passphrase's key, and the tasks sealed by it
  async function newKey(kek) {
    const raw = rnd(32),
      dek = await dataKey(raw),
      pass = await sealWith(kek, raw);
    raw.fill(0);
    return { dek, pass, kid: toB64(rnd(12)) };
  }
  const LOCKDO = {
    async on(old, pass) {
      const raw = rnd(32),
        uid = toB64(rnd(16));
      // the passkey first, while the click still counts as one
      let made = null,
        bioFailed = false;
      if (L.lsBio.checked && !L.lsBioL.hidden) {
        try {
          made = await bioMake(uid);
        } catch (e) {}
        bioFailed = !made;
      }
      const salt = rnd(16),
        dek = await dataKey(raw),
        kek = await passKey(pass, salt, ITER),
        kid = toB64(rnd(12)),
        v = { v: 1, kid, uid, kdf: { iter: ITER, salt: toB64(salt) }, pass: await sealWith(kek, raw), data: await sealWith(dek, plain()) };
      if (made) v.bio = await bioSeal(made, raw);
      // what another tab wrote in clear meanwhile goes in too
      const merged = mergePlain();
      if (merged != null) v.data = await sealWith(dek, plain());
      // sync's key and base are sealed with the tasks from now on, never left in clear
      if (SYS) v.sync = await sealWith(dek, TE.encode(JSON.stringify(SYS)));
      // read it all back before the plain copy goes
      const back = await unseal(kek, v.pass);
      if (back.length !== 32 || back.some((x, i) => x !== raw[i])) throw new Error('lock check');
      raw.fill(0);
      back.fill(0);
      JSON.parse(TD.decode(await unseal(dek, v.data)));
      // another tab may have turned the lock on meanwhile: its vault stays
      if (locked || vault || localStorage.getItem(VK)) {
        if (v.bio) forgetPasskey(v.bio.id);
        return { err: 'One Day was just protected in another tab. Nothing was changed here.' };
      }
      localStorage.setItem(VK, JSON.stringify(v));
      vault = v;
      DEK = dek;
      KID = kid;
      // the copy in clear goes once what it held is sealed; one written since is merged and sealed first
      let now = null;
      try {
        now = localStorage.getItem(LS);
        if (now != null && now === merged) localStorage.removeItem(LS);
        else if (now != null) {
          const again = mergePlain();
          if (again != null) dropPlain(again);
        }
      } catch (e) {}
      if (merged != null || now != null) {
        repaint();
        renderChip();
      }
      lockUI();
      return {
        toast: bioFailed
          ? 'One Day is protected. Fingerprint or face couldn’t be set up, so use your passphrase.'
          : 'One Day is protected. Your tasks are encrypted.',
      };
    },
    // A new passphrase brings a new key for the tasks: an old copy of the vault and the old passphrase open
    // nothing written from now on. Fingerprint or face, which opened the old key, has to be set up again.
    async change(old, pass) {
      const was = await byPass(old, vault);
      if (!was) return { err: 'That isn’t the current passphrase', el: 'old' };
      was.fill(0);
      const salt = rnd(16),
        k = await newKey(await passKey(pass, salt, ITER)),
        r = await reseal(k.dek);
      if (!r) return BUSY;
      const { bio, ...rest } = r.cur;
      vault = rekeyed({ ...rest, kid: k.kid, kdf: { iter: ITER, salt: toB64(salt) }, pass: k.pass }, r);
      localStorage.setItem(VK, JSON.stringify(vault));
      took(k, r.tasks, r.sys);
      if (bio) forgetPasskey(bio.id);
      return { toast: bio ? 'Passphrase changed. Set up fingerprint or face again if you want it.' : 'Passphrase changed' };
    },
    // Off: the tasks in clear are the ones in the vault, opened with the passphrase, not whatever this tab holds.
    async off(old) {
      const raw = await byPass(old, vault);
      if (!raw) return { err: 'That isn’t the current passphrase', el: 'old' };
      await flush();
      const cur = storedVault();
      let j, sys;
      try {
        const dk = await dataKey(raw);
        j = JSON.parse(TD.decode(await unseal(dk, cur.data)));
        sys = await openSys(dk, cur);
      } finally {
        raw.fill(0);
      }
      const now = storedVault();
      if (!still(now) || now.data.ct !== cur.data.ct) return BUSY;
      const data = { days: cleanDays(j && j.days), rules: cleanRules(j && j.rules), tags: cleanTags(j && j.tags) };
      // sync's key and base stay with the tasks they belong to, now in clear like them
      localStorage.setItem(LS, JSON.stringify(sys ? { ...data, sync: sys } : data));
      localStorage.removeItem(VK);
      if (now.bio) forgetPasskey(now.bio.id);
      S = data;
      SYS = sys;
      IDX = null;
      TAGC = null;
      vault = null;
      DEK = null;
      KID = '';
      lockUI();
      repaint();
      renderChip();
      return { toast: 'Protection is off. Your tasks are no longer encrypted.' };
    },
    // Fingerprint or face: the passkey first, while the click still counts as one; then the passphrase says
    // whether it may open the key.
    async bio(old) {
      const uid = vault.uid || toB64(rnd(16));
      let made = null;
      try {
        made = await bioMake(uid);
      } catch (e) {}
      if (!made) return { err: 'Fingerprint or face couldn’t be set up here' };
      const raw = await byPass(old, vault);
      if (!raw) {
        made.secret.fill(0);
        forgetPasskey(toB64(made.id));
        return { err: 'That isn’t the current passphrase', el: 'old' };
      }
      const b = await bioSeal(made, raw);
      raw.fill(0);
      await flush();
      const cur = storedVault();
      if (!still(cur)) {
        forgetPasskey(b.id);
        return BUSY;
      }
      if (cur.bio) forgetPasskey(cur.bio.id);
      vault = { ...cur, uid, bio: b };
      localStorage.setItem(VK, JSON.stringify(vault));
      return { toast: 'Fingerprint, face or device PIN can now unlock One Day' };
    },
    // Stopping it brings a new key for the tasks: the passkey and an old copy of the vault open nothing new.
    async biooff(old) {
      const o = await passOpen(old, vault);
      if (!o) return { err: 'That isn’t the current passphrase', el: 'old' };
      o.raw.fill(0);
      const k = await newKey(o.kek),
        r = await reseal(k.dek);
      if (!r) return BUSY;
      const { bio, ...rest } = r.cur;
      vault = rekeyed({ ...rest, kid: k.kid, pass: k.pass }, r);
      localStorage.setItem(VK, JSON.stringify(vault));
      took(k, r.tasks, r.sys);
      if (bio) forgetPasskey(bio.id);
      return { toast: 'Only your passphrase unlocks One Day now' };
    },
    async reset() {
      const v = storedVault();
      if (v && v.bio) forgetPasskey(v.bio.id);
      localStorage.removeItem(VK);
      // (sync's key and sign-in went with the vault; the copy in the cloud stays, and opens with its own passphrase)
      try {
        localStorage.removeItem(LS);
      } catch (e) {}
      location.reload();
      return { wait: true };
    },
  };
  L.lsForm.addEventListener('submit', async e => {
    e.preventDefault();
    const m = LSM;
    if (!m || L.lsGo.disabled) return;
    const old = L.lsOld.value,
      p1 = L.lsPass.value,
      p2 = L.lsPass2.value,
      no = (msg, el, at) => wrong(L.lsForm, L.lsErr, el, msg, at);
    if (!L.lsOld.hidden && !old) return no('Enter the passphrase', L.lsOld, L.lsOld);
    if (!L.lsPass.hidden) {
      if (p1.length < 12) return no('Use 12 characters or more', L.lsPass, L.lsPass);
      if (p1 !== p2) return no('The two passphrases are not the same', L.lsPass2, L.lsPass2);
    }
    if (!L.lsOkL.hidden && !L.lsOk.checked)
      return no(m.mode === 'reset' ? 'Tick the box to erase them' : 'Tick “I understand” first', L.lsOk, L.lsOkL);
    say(L.lsForm, L.lsErr, '');
    busy(
      L.lsGo,
      { on: 'Protecting…', change: 'Changing…', off: 'Turning off…', ask: 'Opening…', reset: 'Erasing…', bio: 'Setting up…', biooff: 'Stopping…' }[
        m.mode
      ],
    );
    let res;
    try {
      res = await (m.mode === 'ask' ? m.check(old) : LOCKDO[m.mode](old, p1));
    } catch (err) {
      res = { err: 'Something went wrong. Nothing was changed.' };
    }
    if (res && res.wait) return;
    busy(L.lsGo);
    if (LSM !== m) return;
    if (res && res.err) return no(res.err, res.el === 'old' ? L.lsOld : null);
    closeLockset(res);
  });
  function lockDone(res) {
    if (!res) return;
    if (res.toast) toast(res.toast);
    if ($.srch.classList.contains('on')) {
      renderSearch();
      $.sq.focus({ preventScroll: true });
    }
  }
  function openBackup(v) {
    if (!okVault({ ...v, v: 1, bio: null })) {
      toast('That file isn’t a One Day backup');
      return Promise.resolve(null);
    }
    if (!CAN_LOCK) {
      toast('This browser can’t open encrypted backups');
      return Promise.resolve(null);
    }
    return new Promise(res => {
      const ok = openLockset(
        'ask',
        r => res(r && r.data),
        async pass => {
          const raw = await byPass(pass, v);
          if (!raw) return { err: 'That passphrase doesn’t open this backup', el: 'old' };
          let u8 = await unseal(await dataKey(raw), v.data);
          raw.fill(0);
          // the copy sync keeps in a cloud is an encrypted backup too, its tasks compressed before they are sealed
          if (v.z) u8 = await through(u8, new DecompressionStream('deflate-raw'), 64e6);
          const j = JSON.parse(TD.decode(u8));
          return { data: j && typeof j === 'object' ? j : { days: {} } };
        },
      );
      if (!ok) res(null);
    });
  }
  function lockActs() {
    if (!CAN_LOCK) return [];
    if (!vault) return [['lock', IC.lock, 'Protect with a passphrase']];
    return [
      ['locknow', IC.lock, 'Lock now'],
      ['lockchange', IC.key, 'Change passphrase'],
      vault.bio
        ? ['biooff', IC.finger, 'Stop using fingerprint or face']
        : bioOK
          ? ['bioon', IC.finger, 'Use fingerprint or face']
          : null,
      ['lockoff', IC.unlock, 'Turn off protection'],
    ].filter(Boolean);
  }
  // In More on a phone: centred buttons like the backups'. Several stack in one rounded group, like an action sheet.
  function lockBtns() {
    const a = lockActs();
    return `<div class="slk${a.length > 1 ? ' grp' : ''}">${a
      .map(([k, i, l]) => `<button type="button" class="sbk-b" data-act="${k}">${i}<span>${l}</span></button>`)
      .join('')}</div>`;
  }
  // In search before you type: what the lock's own button doesn't do (it protects, then locks)
  function lockChips() {
    const a = lockActs().filter(([k]) => k !== 'lock' && k !== 'locknow');
    return a.length
      ? `<div class="chips">${a.map(([k, i, l]) => `<button type="button" class="chip" data-act="${k}">${i}${l}</button>`).join('')}</div>`
      : '';
  }
  function dataHint() {
    const sy = SYS && CL[SYS.cloud].name;
    if (vault)
      return sy
        ? `Your tasks are encrypted, in this browser and in your ${sy}.`
        : 'Your tasks are encrypted and stored only in this browser.';
    if (sy) return `Your tasks are stored in this browser, and encrypted in your ${sy}.`;
    return cloud.col
      ? 'Your tasks are saved in this browser and in your private space on Claude.'
      : 'Your tasks are stored only in this browser. Nothing is sent anywhere.';
  }
  function doAct(a) {
    if (a === 'export') exportData();
    else if (a === 'import') $.impf.click();
    else if (a === 'sync') openSync();
    else if (a === 'lock') openLockset('on', lockDone);
    else if (a === 'locknow') lockNow(true);
    else if (a === 'lockchange') openLockset('change', lockDone);
    else if (a === 'lockoff') openLockset('off', lockDone);
    else if (a === 'bioon') openLockset('bio', lockDone);
    else if (a === 'biooff') openLockset('biooff', lockDone);
    else if (a === 'install') install();
    else if (a === 'search') openSearch();
    else if (a === 'send') sendDay();
    else if (a === 'theme') toggleTheme();
    else if (a === 'float') float();
    else if (a === 'undo') undo();
    else if (a === 'redo') redo();
  }
  if (locked) showLock();

  /* sync: the hosted page keeps days in a private store; the local file keeps them in this browser */
  const cloud = {
    col: null,
    ready: false,
    remote: {},
    t: {},
    busy: new Set(),
    dirty: new Set(),
    async init() {
      if (vault || !window.claude || typeof claude.use !== 'function') return;
      let db, us, id;
      try {
        [db, us] = await Promise.all([claude.use('db'), claude.use('user')]);
        if (!db || !us) return;
        id = await us.id();
        if (!id) return;
        this.col = db.collection('data/users/' + id);
      } catch (e) {
        this.col = null;
        return;
      }
      this.col.onSnapshot(
        s => this.onSnap(s),
        () => {
          this.col = null;
        },
      );
    },
    onSnap(s) {
      let ch = false,
        chCur = false;
      for (const d of s.docs) {
        if (!d.id.startsWith('day-')) continue;
        const k = d.id.slice(4),
          v = d.data();
        if (!v || !/^\d{4}-\d\d-\d\d$/.test(k)) continue;
        const u = +v.u || 0;
        this.remote[k] = u;
        const loc = S.days[k];
        if (!loc || u > loc.u) {
          S.days[k] = { u, tasks: clean(v.tasks), ...(v.moved && { moved: 1 }) };
          ch = true;
          if (k === cur) chCur = true;
        }
      }
      if (!s.metadata.fromCache && !this.ready) {
        this.ready = true;
        for (const k in S.days) if (S.days[k].u > 0 && S.days[k].u > (this.remote[k] || 0)) this.push(k);
      }
      if (ch) {
        persist();
        if (chCur && !$.list.querySelector('.editing,.note.editing') && !P) flip(() => renderList());
        renderAux();
      }
    },
    push(k) {
      if (!this.col || vault) return;
      clearTimeout(this.t[k]);
      this.t[k] = setTimeout(() => this.write(k), 450);
    },
    async write(k) {
      if (!this.col) return;
      if (this.busy.has(k)) {
        this.dirty.add(k);
        return;
      }
      this.busy.add(k);
      const v = S.days[k];
      try {
        await this.col.doc('day-' + k).set({ u: v.u, tasks: clean(v.tasks), ...(v.moved && { moved: 1 }) });
        this.remote[k] = v.u;
      } catch (e) {
        if (e && e.code === 'unavailable') setTimeout(() => this.push(k), 1200 + Math.random() * 1200);
        else if (
          e &&
          ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)
        )
          this.col = null;
      }
      this.busy.delete(k);
      if (this.dirty.delete(k)) this.write(k);
    },
  };

  /* Sync with your cloud. The tasks also live in your own Google Drive, Dropbox or OneDrive, in the one folder One Day
     may open there, as one file sealed here with a passphrase: AES-GCM with a random key, which a key drawn from the
     passphrase (PBKDF2-SHA-256, as the lock's) seals in turn. One Day has no server in this: you sign in on the cloud's
     own page, the browser then talks to the cloud directly, and the cloud only ever holds that sealed file. It is also
     an encrypted backup: Import backup opens it with the passphrase.
     Each device keeps the copy it last agreed with the cloud (its base), written with the tasks so the two always match,
     and sealed with them when the lock is on. A sync knows from it what changed on each side since:
     - the unit is a task, known by its id on whatever day it is, merged field by field: its words, done, note,
       sub-tasks (by their ids), its day and its repeat. A field changed on both sides takes the side whose day changed
       last; a task's place in its day follows the side that reordered;
     - an edit beats a deletion; a task deleted on one side and left alone on the other goes everywhere;
     - repeats merge by rule, the days they skip added up; tag colours by tag; occurrences still to come that nobody
       touched follow their repeat as it now is;
     - a day's mark that open tasks were carried from it (moved, which keeps it out of the full days) follows the side
       that changed it;
     - with no base (a first sync, or a copy there that doesn't come from this device's last one), nothing is deleted:
       both sides are kept, and a mark on either side stays.
     Offline, changes wait here, and go up once the connection is back. While locked, nothing syncs: the key is sealed. */
  const SYF = 'one-day.json',
    SYCH = 'one-day-oauth',
    // One Day's public id at each cloud, from the app registered there for One Day's own addresses (a copy published
    // elsewhere registers its own: docs/sync-setup.md). None of them is a secret: a cloud only sends its answer to the
    // addresses registered with it, and the answer only opens with what this page keeps (PKCE's verifier, or the
    // sign-in's random state). A cloud without an id says in the dialog that it isn't set up yet.
    CLOUD_IDS = {
      google: '15640435825-74i2vrs9cj7pj0dchm37kobnp5lohigg.apps.googleusercontent.com',
      dropbox: 'j77qztjuwc2el8m',
      onedrive: '7a934264-2185-4d42-adb0-7fedeca442a7',
    },
    SYON = !!(CAN_LOCK && WEB && window.fetch && window.CompressionStream && window.DecompressionStream),
    CL = {
      // logo: the cloud's own artwork, as its owner publishes it for apps that work with it (public/clouds/)
      google: {
        name: 'Google Drive',
        co: 'Google',
        where: 'in a hidden folder of your Google Drive that only One Day can open',
        sub: 'A hidden folder only One Day opens',
        logo: 'clouds/google-drive.svg',
      },
      dropbox: { name: 'Dropbox', co: 'Dropbox', where: 'in One Day’s own folder of your Dropbox, under Apps', sub: 'One Day’s own folder, under Apps', logo: 'clouds/dropbox.svg' },
      // beside its icon, Microsoft asks for the product's full name; the sign-in is for personal accounts only
      onedrive: {
        name: 'OneDrive',
        label: 'Microsoft OneDrive',
        co: 'Microsoft',
        where: 'in One Day’s own folder of your OneDrive, under Apps',
        sub: 'A personal account: One Day’s own folder, under Apps',
        logo: 'clouds/onedrive.svg',
      },
    },
    SYST = { s: 'off', at: 0, why: '' }; // how sync is going: off, idle, busy, offline, auth, pass, error
  let SYD = null, // the dialog, while it is open
    SYW = null, // a sign-in waiting for its answer
    SYPEND = null, // a sign-in done, its passphrase still to come: held in this page only
    SYENV = null, // the copy in the cloud, sealed with a passphrase this device doesn't hold yet
    SYBACK = null, // a sign-in that came back to this page (a phone opens the cloud's page in this window)
    SYKEY = null, // the sync key, ready to use: [its bytes as stored, the key]
    SYBUSY = null,
    SYAGAIN = false,
    SYQUIET = false,
    syT = null,
    syTold = '',
    syLast = '';
  class SyErr extends Error {
    constructor(kind, status) {
      super(kind);
      this.kind = kind;
      this.status = status || 0;
    }
  }
  // sync's key and base as kept with the tasks, checked; anything else is no sync at all
  function cleanSys(o) {
    if (!o || typeof o !== 'object' || o.v !== 1 || !['google', 'dropbox', 'onedrive'].includes(o.cloud)) return null;
    const k = o.key;
    if (
      !k ||
      typeof k.raw !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(k.raw) ||
      typeof k.kid !== 'string' ||
      !k.kdf ||
      typeof k.kdf.salt !== 'string' ||
      !Number.isInteger(k.kdf.iter) ||
      k.kdf.iter < 1e5 ||
      k.kdf.iter > 5e6 ||
      !okBlob(k.pass)
    )
      return null;
    const a = o.auth,
      sys = {
        v: 1,
        cloud: o.cloud,
        key: { raw: k.raw, kid: k.kid, kdf: { iter: k.kdf.iter, salt: k.kdf.salt }, pass: { iv: k.pass.iv, ct: k.pass.ct } },
        file: o.file && typeof o.file.id === 'string' && typeof o.file.ver === 'string' ? { id: o.file.id, ver: o.file.ver } : null,
        base: typeof o.base === 'string' ? o.base : null,
        anc: typeof o.anc === 'string' ? o.anc : null,
        lh: typeof o.lh === 'string' ? o.lh : '',
      };
    // the sign-in to the cloud: its token, and what renews it where the cloud allows
    if (a && typeof a.a === 'string' && (+a.ax > 0 || (typeof a.r === 'string' && a.r)))
      sys.auth = { a: a.a, ax: +a.ax, r: typeof a.r === 'string' ? a.r : '', rx: +a.rx || 0 };
    return sys;
  }

  /* talking to a cloud: no cookie, no referrer, and nothing kept by the browser's cache */
  async function syFetch(url, o = {}) {
    // a request that gets no answer is given up after 45 seconds: nothing waits on it for ever
    const ac = new AbortController(),
      t = setTimeout(() => ac.abort(), 45e3);
    try {
      return await fetch(url, { ...o, signal: ac.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch (e) {
      // no connection at all, or one that didn't get through (a network in the way, the cloud down, no answer)
      throw new SyErr(navigator.onLine ? 'unreachable' : 'offline');
    } finally {
      clearTimeout(t);
    }
  }
  async function syText(r) {
    if (+r.headers.get('content-length') > 20e6) throw new SyErr('big');
    const t = await r.text();
    if (t.length > 20e6) throw new SyErr('big');
    return t;
  }
  // The sign-in: kept with sync's key, so with the tasks (sealed with them when the lock is on). Before sync is on (a
  // sign-in whose passphrase is still to come), it is held in this page only.
  function syAuth() {
    if (SYS) return SYS.auth ? { cloud: SYS.cloud, ...SYS.auth } : null;
    return SYPEND;
  }
  function syKeepAuth(a) {
    if (SYS && (!a || a.cloud === SYS.cloud)) {
      if (a) SYS.auth = { a: a.a || '', ax: +a.ax || 0, r: a.r || '', rx: +a.rx || 0 };
      else delete SYS.auth;
      syQuiet();
      return;
    }
    SYPEND = a ? { cloud: a.cloud, a: a.a || '', ax: +a.ax || 0, r: a.r || '', rx: +a.rx || 0 } : null;
  }
  const syLock = (name, fn) => (navigator.locks ? navigator.locks.request(name, fn) : fn());
  // a token to call with: the one kept while it lasts (a minute's margin), else a new one where the cloud renews it;
  // null when only a sign-in will do. Tabs renew one at a time.
  async function syBearer(c) {
    const ok = a => a && a.cloud === c && a.a && a.ax > Date.now() + 60e3;
    let a = syAuth();
    if (ok(a)) return a.a;
    if (!a || a.cloud !== c || !a.r || (a.rx && a.rx < Date.now() + 60e3) || !CL[c].renew) return null;
    return syLock('one-day-sync-auth', async () => {
      a = syAuth();
      if (ok(a)) return a.a;
      if (!a || a.cloud !== c || !a.r) return null;
      const t = await CL[c].renew(a.r);
      if (!t) {
        syKeepAuth({ ...a, a: '', ax: 0, r: '' });
        return null;
      }
      syKeepAuth({ ...a, ...t, r: t.r || a.r });
      syTabs('auth');
      return t.a;
    });
  }
  async function syCall(c, url, o = {}, again = true) {
    const tok = await syBearer(c);
    if (!tok) throw new SyErr('auth');
    const r = await syFetch(url, { ...o, headers: { ...o.headers, Authorization: 'Bearer ' + tok } });
    if (r.status === 401) {
      // refused before its end: renewed once, where the cloud allows it
      const a = syAuth();
      if (a && a.a === tok) syKeepAuth({ ...a, a: '', ax: 0 });
      if (again && a && a.r) return syCall(c, url, o, false);
      throw new SyErr('auth');
    }
    return r;
  }
  async function syForm(url, fields) {
    const r = await syFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }),
      j = await r.json().catch(() => null);
    return { r, j: j && typeof j === 'object' ? j : null };
  }
  // a sign-in's code traded for tokens
  async function syGrant(url, fields) {
    const { r, j } = await syForm(url, fields);
    if (!r.ok || !j || typeof j.access_token !== 'string') throw new SyErr('signin', r.status);
    return j;
  }
  // a token renewed, or null when the cloud says no (access taken back, or its time is up)
  async function syRenew(url, fields) {
    const { r, j } = await syForm(url, fields);
    if (r.status === 400 || r.status === 401) return null;
    if (!r.ok || !j || typeof j.access_token !== 'string') throw new SyErr('http', r.status);
    return j;
  }
  const syTok = (j, s) => ({ a: j.access_token, ax: Date.now() + (+j.expires_in || s) * 1000 }),
    // where each cloud sends you back: One Day's own page for it, never anywhere else
    syBack = () => new URL('oauth/', location.href).href.replace(/[?#].*$/, '');

  /* Google Drive: One Day's hidden folder there (the appDataFolder, scope drive.appdata), which no other app and no other
     file can reach. Google gives a page without a server one way to sign in: a token in the address it sends back,
     good for an hour, with nothing to renew it; after that, a click signs in again. */
  const GD = 'https://www.googleapis.com/drive/v3',
    GU = 'https://www.googleapis.com/upload/drive/v3/files',
    GS = 'https://www.googleapis.com/auth/drive.appdata';
  async function gOk(r) {
    if (r.ok) return r;
    const j = await r.json().catch(() => null),
      why = (j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || '';
    if (r.status === 404) throw new SyErr('gone', 404);
    if (why === 'storageQuotaExceeded') throw new SyErr('full', r.status);
    if (r.status === 429 || /rateLimit/i.test(why)) throw new SyErr('slow', r.status);
    throw new SyErr('http', r.status);
  }
  Object.assign(CL.google, {
    url: (st, ch, again) =>
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: CLOUD_IDS.google,
        redirect_uri: syBack(),
        response_type: 'token',
        scope: GS,
        state: st,
        // the first time, the account is yours to pick; signing in again goes straight back
        ...(again ? {} : { prompt: 'select_account' }),
      }),
    async take(ans) {
      if (!ans.token) throw new SyErr(ans.error === 'access_denied' ? 'denied' : 'signin');
      if (ans.scope && !ans.scope.split(/[\s+]+/).includes(GS)) throw new SyErr('scope');
      return { a: ans.token, ax: Date.now() + (+ans.expires || 3600) * 1000 };
    },
    async list() {
      const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name = '${SYF}'`, fields: 'files(id,version)', orderBy: 'createdTime', pageSize: '20' }),
        j = await (await gOk(await syCall('google', `${GD}/files?${q}`))).json();
      return (j.files || []).filter(f => f && typeof f.id === 'string').map(f => ({ id: f.id, ver: String(f.version) }));
    },
    async read(f) {
      return syText(await gOk(await syCall('google', `${GD}/files/${encodeURIComponent(f.id)}?alt=media`)));
    },
    async write(f, text) {
      let r;
      if (f) {
        // Drive can't refuse a write over a file changed meanwhile: its version is checked just before
        const now = await (await gOk(await syCall('google', `${GD}/files/${encodeURIComponent(f.id)}?fields=version`))).json();
        if (String(now.version) !== f.ver) throw new SyErr('conflict');
        r = await syCall('google', `${GU}/${encodeURIComponent(f.id)}?uploadType=media&fields=id,version`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
      } else {
        const bd = 'one-day-' + b64.enc(rnd(12)),
          meta = JSON.stringify({ name: SYF, parents: ['appDataFolder'], mimeType: 'application/json' });
        r = await syCall('google', `${GU}?uploadType=multipart&fields=id,version`, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${bd}` },
          body: `--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${bd}--`,
        });
      }
      const j = await (await gOk(r)).json();
      return { id: j.id, ver: String(j.version) };
    },
    async remove(f) {
      try {
        await gOk(await syCall('google', `${GD}/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' }));
      } catch (e) {
        if (e.kind !== 'gone') throw e;
      }
    },
    // Giving the token back takes One Day's access away from every device at once, so only when its copy goes too.
    // Google's address for it doesn't answer pages (no CORS): the request goes, its answer can't be read.
    revoke(a) {
      if (a && a.a)
        syFetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'token=' + encodeURIComponent(a.a),
        }).catch(() => {});
    },
  });

  /* Dropbox: One Day's app folder, the only folder its access reaches (Apps, then the folder's name, which you may move
     or rename). Signed in with PKCE once: a token for a few hours, and what renews it until sync stops here. */
  const DA = 'https://api.dropboxapi.com',
    DC = 'https://content.dropboxapi.com';
  async function dOk(r) {
    if (r.ok) return r;
    const j = await r.json().catch(() => null),
      s = (j && j.error_summary) || '';
    if (/^path\/not_found|\/not_found/.test(s)) throw new SyErr('gone', 404);
    if (/^path\/conflict/.test(s)) throw new SyErr('conflict');
    if (/insufficient_space/.test(s)) throw new SyErr('full', r.status);
    if (r.status === 429) throw new SyErr('slow', 429);
    throw new SyErr('http', r.status);
  }
  // Dropbox-API-Arg carries JSON in a header: anything past ASCII is escaped
  const dArg = v => JSON.stringify(v).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const dRpc = (path, arg) =>
    syCall('dropbox', `${DA}/2/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg) });
  Object.assign(CL.dropbox, {
    // it refuses a write over a version other than the one read: a write that succeeds is never lost unseen
    cas: true,
    url: (st, ch) =>
      'https://www.dropbox.com/oauth2/authorize?' +
      new URLSearchParams({
        client_id: CLOUD_IDS.dropbox,
        response_type: 'code',
        redirect_uri: syBack(),
        state: st,
        code_challenge: ch,
        code_challenge_method: 'S256',
        token_access_type: 'offline',
        scope: 'files.metadata.read files.content.read files.content.write',
      }),
    async take(ans, ver) {
      if (!ans.code) throw new SyErr(ans.error === 'access_denied' ? 'denied' : 'signin');
      const j = await syGrant(`${DA}/oauth2/token`, {
        code: ans.code,
        grant_type: 'authorization_code',
        client_id: CLOUD_IDS.dropbox,
        code_verifier: ver,
        redirect_uri: syBack(),
      });
      return { ...syTok(j, 14400), r: typeof j.refresh_token === 'string' ? j.refresh_token : '' };
    },
    async renew(rt) {
      const j = await syRenew(`${DA}/oauth2/token`, { grant_type: 'refresh_token', refresh_token: rt, client_id: CLOUD_IDS.dropbox });
      return j && syTok(j, 14400);
    },
    async list() {
      try {
        const j = await (await dOk(await dRpc('files/get_metadata', { path: '/' + SYF }))).json();
        return j['.tag'] === 'file' && typeof j.id === 'string' ? [{ id: j.id, ver: String(j.rev) }] : [];
      } catch (e) {
        if (e.kind === 'gone') return [];
        throw e;
      }
    },
    async read(f) {
      return syText(await dOk(await syCall('dropbox', `${DC}/2/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': dArg({ path: f.id }) } })));
    },
    // written over the version read, and only over it: another device's write in between is a conflict
    async write(f, text) {
      const arg = { path: '/' + SYF, mode: f ? { '.tag': 'update', update: f.ver } : 'add', autorename: false, mute: true, strict_conflict: true },
        j = await (
          await dOk(
            await syCall('dropbox', `${DC}/2/files/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dArg(arg) },
              body: text,
            }),
          )
        ).json();
      return { id: j.id, ver: String(j.rev) };
    },
    async remove(f) {
      try {
        await dOk(await dRpc('files/delete_v2', { path: f.id }));
      } catch (e) {
        if (e.kind !== 'gone') throw e;
      }
    },
    // the token goes back, and the refresh token with it: this device is signed out of Dropbox, the others are not
    revoke(a) {
      if (!a || a.cloud !== 'dropbox') return;
      (async () => {
        const t = a.a && a.ax > Date.now() + 30e3 ? a.a : a.r ? (await this.renew(a.r).catch(() => null) || {}).a : '';
        if (t) await syFetch(`${DA}/2/auth/token/revoke`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
      })().catch(() => {});
    },
  });

  /* OneDrive: One Day's app folder (Apps, then One Day), the only folder its access (Files.ReadWrite.AppFolder)
     reaches, in a personal Microsoft account. Signed in with PKCE: a token for an hour, and what renews it for a day,
     Microsoft's limit for an app in a browser; then a click signs in again. */
  const ML = 'https://login.microsoftonline.com/consumers/oauth2/v2.0',
    MG = 'https://graph.microsoft.com/v1.0/me/drive',
    MS = 'Files.ReadWrite.AppFolder offline_access';
  async function mOk(r) {
    if (r.ok) return r;
    const j = await r.json().catch(() => null),
      code = (j && j.error && j.error.code) || '';
    if (r.status === 404) throw new SyErr('gone', 404);
    if (r.status === 409 || r.status === 412) throw new SyErr('conflict');
    if (r.status === 507 || code === 'quotaLimitReached' || code === 'insufficientStorage') throw new SyErr('full', r.status);
    if (r.status === 429 || r.status === 503) throw new SyErr('slow', r.status);
    throw new SyErr('http', r.status);
  }
  Object.assign(CL.onedrive, {
    url: (st, ch, again) =>
      `${ML}/authorize?` +
      new URLSearchParams({
        client_id: CLOUD_IDS.onedrive,
        response_type: 'code',
        redirect_uri: syBack(),
        response_mode: 'fragment',
        scope: MS,
        state: st,
        code_challenge: ch,
        code_challenge_method: 'S256',
        ...(again ? {} : { prompt: 'select_account' }),
      }),
    async take(ans, ver) {
      if (!ans.code) throw new SyErr(ans.error === 'access_denied' ? 'denied' : 'signin');
      const j = await syGrant(`${ML}/token`, {
        client_id: CLOUD_IDS.onedrive,
        grant_type: 'authorization_code',
        code: ans.code,
        redirect_uri: syBack(),
        code_verifier: ver,
        scope: MS,
      });
      return { ...syTok(j, 3600), r: typeof j.refresh_token === 'string' ? j.refresh_token : '', rx: Date.now() + 864e5 };
    },
    async renew(rt) {
      const j = await syRenew(`${ML}/token`, { client_id: CLOUD_IDS.onedrive, grant_type: 'refresh_token', refresh_token: rt, scope: MS });
      return j && { ...syTok(j, 3600), ...(typeof j.refresh_token === 'string' ? { r: j.refresh_token } : {}) };
    },
    async list() {
      try {
        const j = await (await mOk(await syCall('onedrive', `${MG}/special/approot:/${SYF}?$select=id,eTag,file`))).json();
        return j.file && typeof j.id === 'string' ? [{ id: j.id, ver: String(j.eTag) }] : [];
      } catch (e) {
        if (e.kind === 'gone') return [];
        throw e;
      }
    },
    // The file's bytes come from its download address, which answers a page without a token. Graph's own address for
    // them answers with a redirect, which a page can't follow there.
    async read(f) {
      const j = await (await mOk(await syCall('onedrive', `${MG}/items/${encodeURIComponent(f.id)}?$select=id,@microsoft.graph.downloadUrl`))).json(),
        u = j['@microsoft.graph.downloadUrl'];
      if (typeof u !== 'string' || !/^https:\/\//.test(u)) throw new SyErr('gone', 404);
      const r = await syFetch(u);
      if (!r.ok) throw new SyErr(r.status === 404 ? 'gone' : 'http', r.status);
      return syText(r);
    },
    async write(f, text) {
      if (f) {
        // checked just before, and again by If-Match: another device's write in between is a conflict
        const now = await this.list();
        if (!now.length || now[0].id !== f.id || now[0].ver !== f.ver) throw new SyErr('conflict');
      }
      const r = await syCall(
        'onedrive',
        f ? `${MG}/items/${encodeURIComponent(f.id)}/content` : `${MG}/special/approot:/${SYF}:/content?@microsoft.graph.conflictBehavior=fail`,
        { method: 'PUT', headers: { 'Content-Type': 'text/plain', ...(f ? { 'If-Match': f.ver } : {}) }, body: text },
      );
      const j = await (await mOk(r)).json();
      return { id: j.id, ver: String(j.eTag) };
    },
    async remove(f) {
      try {
        await mOk(await syCall('onedrive', `${MG}/items/${encodeURIComponent(f.id)}`, { method: 'DELETE' }));
      } catch (e) {
        if (e.kind !== 'gone') throw e;
      }
    },
    // a page has no way to give Microsoft its tokens back: they are forgotten here, and run out
    revoke() {},
  });

  /* Signing in, on the cloud's own page. On a computer it opens in a window of its own, opened by the click itself
     (browsers block one opened later), and its answer comes back on a channel only this site's pages hear. On a phone
     this page goes there, and the cloud sends it back to oauth/, which hands the answer to One Day as it opens. Either
     way only the sign-in this page started is taken: its state is random, and a code is useless without PKCE's
     verifier, which never leaves this page. */
  function syWin() {
    if (TOUCH) return null;
    try {
      return window.open('about:blank', 'one-day-sign-in', 'popup,width=520,height=720');
    } catch (e) {
      return null;
    }
  }
  async function sySignIn(c, win, again) {
    const pop = !!win,
      st = b64.enc(rnd(18)) + (pop ? '.p' : '.r'),
      ver = b64.enc(rnd(48)),
      ch = b64.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode(ver)))),
      url = CL[c].url(st, ch, again);
    if (!pop) {
      try {
        sessionStorage.setItem('oneday.signin', JSON.stringify({ st, ver, c, at: Date.now() }));
      } catch (e) {
        throw new SyErr('signin');
      }
      // This page usually goes, and comes back with the answer (syBackIn). Where it stays (a home-screen app may show
      // the cloud's page in a view of its own), the answer comes on the channel instead.
      const got = syAnswer(st);
      location.assign(url);
      return CL[c].take(await got, ver);
    }
    try {
      win.location.href = url;
    } catch (e) {
      throw new SyErr('popup');
    }
    let ans;
    try {
      ans = await syAnswer(st);
    } finally {
      try {
        win.close();
      } catch (e) {}
    }
    return CL[c].take(ans, ver);
  }
  function syAnswer(st) {
    return new Promise((res, rej) => {
      let bc = null;
      try {
        bc = new BroadcastChannel(SYCH);
      } catch (e) {}
      const end = () => {
          clearTimeout(t);
          window.removeEventListener('message', onMsg);
          window.removeEventListener('storage', onStore);
          if (bc) bc.close();
          if (SYW && SYW.st === st) SYW = null;
        },
        take = d => {
          if (!d || d.type !== 'one-day-oauth' || d.state !== st) return;
          end();
          try {
            localStorage.removeItem('oneday.signedin');
          } catch (e) {}
          res(d);
        },
        onMsg = e => e.origin === location.origin && take(e.data),
        // left by oauth/ for a tab it couldn't reach on the channel
        onStore = e => {
          if (e.key !== 'oneday.signedin' || !e.newValue) return;
          try {
            take(JSON.parse(e.newValue));
          } catch (x) {}
        },
        t = setTimeout(() => {
          end();
          rej(new SyErr('timeout'));
        }, 5 * 60e3);
      if (bc) bc.onmessage = e => take(e.data);
      window.addEventListener('message', onMsg);
      window.addEventListener('storage', onStore);
      SYW = {
        st,
        cancel() {
          end();
          rej(new SyErr('cancel'));
        },
      };
    });
  }
  // Back from the cloud's page: the answer oauth/ left (in this tab, or for it), if it answers the sign-in this tab
  // started. One left for another tab is left alone, unless it is old.
  function syBackIn() {
    let a = null,
      p = null,
      kept = null;
    try {
      p = JSON.parse(sessionStorage.getItem('oneday.signin'));
      a = JSON.parse(sessionStorage.getItem('oneday.signedin'));
      kept = JSON.parse(localStorage.getItem('oneday.signedin'));
      sessionStorage.removeItem('oneday.signedin');
      sessionStorage.removeItem('oneday.signin');
      if (kept && ((p && kept.state === p.st) || !(Date.now() - kept.at < 15 * 60e3))) localStorage.removeItem('oneday.signedin');
    } catch (e) {}
    if (!a && kept && p && kept.state === p.st) a = kept;
    if (!a || !p || typeof a.state !== 'string' || a.state !== p.st || !CL[p.c] || !(Date.now() - p.at < 15 * 60e3)) return null;
    return { c: p.c, ans: a, ver: p.ver };
  }

  /* the sealed copy */
  async function syKeyOf(key) {
    // locked, the key is out of reach: a sync still under way stops here
    if (locked) throw new SyErr('locked');
    if (SYKEY && SYKEY[0] === key.raw) return SYKEY[1];
    const k = await dataKey(fromB64(key.raw));
    SYKEY = [key.raw, k];
    return k;
  }
  // One Day's file in the cloud, or null for anything else
  function syEnv(text) {
    let j = null;
    try {
      j = JSON.parse(text);
    } catch (e) {}
    const v = j && j.app === 'one-day' && j.vault;
    return v && typeof v.kid === 'string' && okVault({ ...v, v: 1, bio: null, sync: null }) ? j : null;
  }
  // A copy's place in the line of copies: its id, the ids of the copies before it (the last 64), how many came before
  // it (rev), and the line it belongs to (epoch: a copy made anew, after the file was gone, starts a new line).
  const syLine = p => ({
    pid: typeof p.pid === 'string' && IDRE.test(p.pid) ? p.pid : '',
    hist: Array.isArray(p.hist) ? p.hist.filter(x => typeof x === 'string' && IDRE.test(x)).slice(0, 64) : [],
    rev: Number.isInteger(p.rev) && p.rev > 0 ? p.rev : 0,
    epoch: typeof p.epoch === 'string' && IDRE.test(p.epoch) ? p.epoch : '',
  });
  function syClean(p) {
    p = p && typeof p === 'object' ? p : {};
    return { ...syLine(p), days: cleanDays(p.days), rules: cleanRules(p.rules), tags: cleanTags(p.tags) };
  }
  async function syOpen(env, key) {
    try {
      let u8 = await unseal(await syKeyOf(key), env.vault.data);
      if (env.vault.z) u8 = await through(u8, new DecompressionStream('deflate-raw'), 64e6);
      return syClean(JSON.parse(TD.decode(u8)));
    } catch (e) {
      throw e && e.kind === 'locked' ? e : new SyErr('alien');
    }
  }
  // the copy as it goes up: an encrypted One Day backup, its tasks compressed, then sealed
  async function syPack(P, key) {
    const u8 = await through(TE.encode(JSON.stringify(P)), new CompressionStream('deflate-raw'), 64e6);
    return JSON.stringify({
      app: 'one-day',
      version: 2,
      kind: 'sync',
      vault: { v: 1, kid: key.kid, kdf: key.kdf, pass: key.pass, z: 1, data: await sealWith(await syKeyOf(key), u8) },
    });
  }
  async function syMake(c, pass) {
    const raw = rnd(32),
      salt = rnd(16),
      kek = await passKey(pass, salt, ITER),
      key = { raw: toB64(raw), kid: toB64(rnd(12)), kdf: { iter: ITER, salt: toB64(salt) }, pass: await sealWith(kek, raw) };
    raw.fill(0);
    return { v: 1, cloud: c, key, file: null, base: null, lh: '' };
  }
  // the passphrase opens the key of the copy there, which must open its tasks too
  async function syJoin(c, pass, env) {
    const v = env.vault,
      o = await passOpen(pass, v);
    if (!o) return null;
    const key = { raw: toB64(o.raw), kid: v.kid, kdf: { iter: v.kdf.iter, salt: v.kdf.salt }, pass: { iv: v.pass.iv, ct: v.pass.ct } };
    o.raw.fill(0);
    await syOpen(env, key);
    return { v: 1, cloud: c, key, file: null, base: null, lh: '' };
  }
  // a copy kept here (the base, the one before it), small: compressed, as the browser keeps it with the tasks
  async function syPackBase(P) {
    const j = JSON.stringify({ ...syLine(P), days: P.days, rules: P.rules, tags: P.tags });
    return b64.enc(await through(TE.encode(j), new CompressionStream('deflate-raw'), 64e6));
  }
  async function syBase(s) {
    if (!s) return null;
    try {
      const p = JSON.parse(TD.decode(await through(b64.dec(s), new DecompressionStream('deflate-raw'), 64e6)));
      return p && typeof p.pid === 'string' && p.days && p.rules ? { ...syLine(p), days: p.days, rules: p.rules, tags: p.tags || {} } : null;
    } catch (e) {
      return null;
    }
  }
  // JSON with keys in order: the same tasks always read the same
  function syJ(v) {
    if (Array.isArray(v)) return '[' + v.map(syJ).join(',') + ']';
    if (v && typeof v === 'object')
      return (
        '{' +
        Object.keys(v)
          .sort()
          .filter(k => v[k] !== undefined)
          .map(k => JSON.stringify(k) + ':' + syJ(v[k]))
          .join(',') +
        '}'
      );
    return v === undefined ? 'null' : JSON.stringify(v);
  }
  // what the tasks say, without when each day changed: days with tasks (and the mark of one whose open tasks were
  // carried on), repeats, tag colours
  function syCanon(st) {
    const d = {};
    for (const k in st.days) {
      const x = st.days[k];
      if (x.moved) d[k] = { t: x.tasks, m: 1 };
      else if (x.tasks.length) d[k] = x.tasks;
    }
    return syJ({ d, r: st.rules, t: st.tags || {} });
  }
  async function syHash(st) {
    return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode(syCanon(st)))).subarray(0, 18));
  }
  const syNow = () => JSON.parse(JSON.stringify({ days: S.days, rules: S.rules, tags: S.tags || {} })),
    // the first day's examples, untouched: a device that joins with only these brings none of them
    syFresh = st => !Object.keys(st.rules).length && !Object.keys(st.tags || {}).length && Object.values(st.days).every(d => !d.u);

  /* the merge */
  const syEq = (a, b) => syJ(a) === syJ(b),
    syArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // One order from two: `a`'s, with what only `b` holds put in after what comes before it in `b`.
  function syOrder(a, b, keep) {
    const order = a.filter(id => keep.has(id)),
      seen = new Set(order);
    b.forEach((id, i) => {
      if (!keep.has(id) || seen.has(id)) return;
      let j = i - 1;
      while (j >= 0 && !seen.has(b[j])) j--;
      order.splice(j < 0 ? 0 : order.indexOf(b[j]) + 1, 0, id);
      seen.add(id);
    });
    for (const id of keep) if (!seen.has(id)) order.push(id);
    return order;
  }
  // which side's order leads: the one that reordered since the base, else the one that wins
  const syLead = (lo, ro, bo, lw) => (bo && syArr(lo, bo) ? [ro, lo] : bo && syArr(ro, bo) ? [lo, ro] : lw ? [lo, ro] : [ro, lo]);
  // A task's sub-tasks, merged like tasks: by id, words and done each from the side that changed them. With nothing to
  // tell who changed what (no base, or a repeat's occurrence made on each device, its sub-tasks of different ids),
  // every sub-task stays, the same words once, ticked where either side ticked it.
  function sySubs(B, L, R, lw, has) {
    if (!has) {
      const out = (lw ? L : R).map(s => ({ ...s }));
      for (const o of lw ? R : L) {
        const same = out.find(s => s.id === o.id || s.text === o.text);
        if (!same) out.push({ ...o });
        else if (o.done) same.done = true;
      }
      return out.slice(0, 100);
    }
    const bm = new Map((B || []).map(s => [s.id, s])),
      lm = new Map(L.map(s => [s.id, s])),
      rm = new Map(R.map(s => [s.id, s])),
      pick = (b, l, r) => (l === r ? l : b !== undefined && l === b ? r : b !== undefined && r === b ? l : lw ? l : r),
      got = new Map();
    for (const id of new Set([...lm.keys(), ...rm.keys()])) {
      const l = lm.get(id),
        r = rm.get(id),
        b = bm.get(id);
      if (l && r) got.set(id, { id, text: pick(b && b.text, l.text, r.text), done: pick(b && !!b.done, !!l.done, !!r.done) });
      else {
        const x = l || r;
        if (b && syEq(b, x)) continue;
        got.set(id, { ...x });
      }
    }
    const [a, z] = syLead(L.map(s => s.id), R.map(s => s.id), B ? B.map(s => s.id) : null, lw);
    return syOrder(a, z, new Set(got.keys()))
      .map(id => got.get(id))
      .slice(0, 100);
  }
  // The same id on two days (an old backup imported after a task moved): the copies after the first day take ids of
  // their own, made from their day, so every device names them alike and no copy is lost.
  function syIds(st) {
    const seen = new Set();
    let days = null;
    for (const k of Object.keys(st.days).sort()) {
      const ts = st.days[k].tasks;
      let out = null;
      ts.forEach((t, i) => {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          return;
        }
        let id = t.id.slice(0, 30) + '-' + k.replace(/-/g, '');
        for (let n = 1; seen.has(id); n++) id = t.id.slice(0, 29 - String(n).length) + n + '-' + k.replace(/-/g, '');
        seen.add(id);
        (out || (out = ts.slice()))[i] = { ...t, id };
      });
      if (out) (days || (days = { ...st.days }))[k] = { ...st.days[k], tasks: out };
    }
    return days ? { ...st, days } : st;
  }
  // Two versions of the tasks, and the one they both came from (null when there is none): one that holds both.
  function syMerge(B, L, R) {
    B = B && syIds(B);
    L = syIds(L);
    R = syIds(R);
    const uOf = (st, k) => (st.days[k] && +st.days[k].u) || 0,
      where = st => {
        const m = new Map();
        for (const k in st.days) for (const t of st.days[k].tasks) m.set(t.id, { k, t });
        return m;
      },
      bm = B ? where(B) : null,
      lm = where(L),
      rm = where(R),
      // a value changed on one side takes that side; changed on both, `lw` says which side wins
      pick = (b, l, r, lw, has) => (syEq(l, r) ? l : has && syEq(l, b) ? r : has && syEq(r, b) ? l : lw ? l : r),
      out = new Map();
    for (const id of new Set([...lm.keys(), ...rm.keys()])) {
      const l = lm.get(id),
        r = rm.get(id),
        b = bm && bm.get(id);
      if (l && r) {
        // A repeat's occurrence made on each device before either synced has no base of its own: its repeat is one,
        // since both were made from it.
        const rr = !b && l.t.rule && l.t.rule === r.t.rule && l.k === r.k && id === occId({ id: l.t.rule }, l.k) && (L.rules[l.t.rule] || R.rules[l.t.rule]),
          lw = uOf(L, l.k) >= uOf(R, r.k),
          has = !!b || !!rr,
          bt = b ? b.t : rr ? { text: rr.text, done: false, note: rr.note || '', rule: l.t.rule } : {},
          t = { id, text: pick(bt.text, l.t.text, r.t.text, lw, has) },
          // with nothing to tell who changed it, a tick wins
          dn = has
            ? pick([!!bt.done, bt.at || 0], [!!l.t.done, l.t.at || 0], [!!r.t.done, r.t.at || 0], lw, true)
            : l.t.done || r.t.done
              ? [true, Math.max(l.t.done ? l.t.at || 0 : 0, r.t.done ? r.t.at || 0 : 0)]
              : [false, 0];
        t.done = dn[0];
        if (dn[0] && dn[1]) t.at = dn[1];
        const note = pick(bt.note || '', l.t.note || '', r.t.note || '', lw, has),
          subs = sySubs(b ? bt.subs : null, l.t.subs || [], r.t.subs || [], lw, !!b),
          rule = pick(bt.rule || '', l.t.rule || '', r.t.rule || '', lw, has);
        if (note) t.note = note;
        if (subs.length) t.subs = subs;
        if (rule) t.rule = rule;
        out.set(id, { k: pick(b && b.k, l.k, r.k, lw, !!b), t });
      } else {
        const x = l || r;
        // gone from the other side: deleted there, unless it changed here since (an edit beats a deletion)
        if (b && b.k === x.k && syEq(b.t, x.t)) continue;
        out.set(id, x);
      }
    }
    const byDay = new Map();
    for (const [id, v] of out) (byDay.get(v.k) || byDay.set(v.k, new Set()).get(v.k)).add(id);
    const days = {};
    for (const k of new Set([...Object.keys(L.days), ...Object.keys(R.days), ...byDay.keys()])) {
      const keep = byDay.get(k) || new Set(),
        ids = st => (st && st.days[k] ? st.days[k].tasks.map(t => t.id) : []),
        [a, z] = syLead(ids(L), ids(R), B && B.days[k] ? ids(B) : null, uOf(L, k) >= uOf(R, k));
      if (!keep.size && !L.days[k] && !R.days[k]) continue;
      days[k] = { u: Math.max(uOf(L, k), uOf(R, k)), tasks: syOrder(a, z, keep).map(id => out.get(id).t) };
      // the day's mark (moved: open tasks carried from it, so it can't be a full day) follows the side that changed
      // it, an undo included; with nothing to tell who did, a mark on either side stays
      const mv = st => !!(st && st.days[k] && st.days[k].moved),
        moved = B && B.days[k] ? pick(mv(B), mv(L), mv(R), uOf(L, k) >= uOf(R, k), true) : mv(L) || mv(R);
      if (moved) days[k].moved = 1;
    }
    // repeats: each as a whole, except the days it skips, which add up (one put back on a side goes)
    const rules = {},
      skips = (b, l, r) => {
        const bs = new Set(b || []),
          ls = new Set(l || []),
          rs = new Set(r || []);
        return [...new Set([...ls, ...rs])].filter(d => (ls.has(d) && rs.has(d)) || !bs.has(d)).sort();
      },
      def = x => {
        const { skip, ...d } = x;
        return d;
      };
    for (const id of new Set([...Object.keys(L.rules), ...Object.keys(R.rules)])) {
      const l = L.rules[id],
        r = R.rules[id],
        b = B && B.rules[id];
      if (l && r) {
        const sk = skips(b && b.skip, l.skip, r.skip),
          x = cleanRule({ ...pick(b ? def(b) : null, def(l), def(r), true, !!b), ...(sk.length ? { skip: sk } : {}) }, id);
        if (x) rules[id] = x;
      } else {
        const x = l || r;
        if (b && syEq(b, x)) continue;
        rules[id] = x;
      }
    }
    // tag colours, tag by tag
    const tags = {},
      tl = L.tags || {},
      tr = R.tags || {},
      tb = (B && B.tags) || {};
    for (const g of new Set([...Object.keys(tl), ...Object.keys(tr)])) {
      const l = tl[g],
        r = tr[g];
      if (l && r) tags[g] = pick(tb[g], l, r, true, !!B);
      else if (!(B && tb[g] === (l || r))) tags[g] = l || r;
    }
    const M = { days, rules, tags };
    sySettle(M, [L, R, B]);
    return M;
  }
  // An occurrence still to come that nobody touched follows its repeat as it now is: gone with it or off its new days,
  // its words its words, on the days after the repeat starts (or starts again: a repeat changed from a task's card
  // starts on that day, which keeps its task, as it does on the device it was changed on). One that was ticked or
  // changed stays, a task of its own once its repeat is gone.
  const syLike = (t, r) =>
    t.text === r.text &&
    (t.note || '') === (r.note || '') &&
    syEq((t.subs || []).map(s => [s.text, !!s.done]), (r.subs || []).map(s => [s.text, false]));
  function sySettle(M, from) {
    const tk = todayKey();
    for (const k in M.days) {
      const d = M.days[k],
        next = [];
      for (const t of d.tasks) {
        if (!t.rule) {
          next.push(t);
          continue;
        }
        const r = M.rules[t.rule],
          plain = k >= tk && !t.done && t.id === occId({ id: t.rule }, k) && from.some(st => st && st.rules[t.rule] && syLike(t, st.rules[t.rule]));
        if (plain) {
          if (r && k <= r.start) next.push(t);
          else if (r && occurs(r, k)) next.push(syLike(t, r) ? t : fromRule(r, k));
          continue;
        }
        if (r) next.push(t);
        else {
          const x = { ...t };
          delete x.rule;
          next.push(x);
        }
      }
      d.tasks = next;
    }
  }

  /* one sync: what changed here goes up, what changed there comes down */
  function syncSoon(ms = 2500) {
    if (!SYS || locked) return;
    clearTimeout(syT);
    syT = setTimeout(() => {
      syT = null;
      syncNow();
    }, ms);
  }
  function syncNow() {
    clearTimeout(syT);
    syT = null;
    if (!SYS || locked) return Promise.resolve();
    if (SYBUSY) {
      SYAGAIN = true;
      return SYBUSY;
    }
    SYBUSY = (async () => {
      try {
        do {
          SYAGAIN = false;
          // one sync at a time in this browser, whatever the tab
          await syLock('one-day-sync', () => syRun());
        } while (SYAGAIN && SYS && !locked);
      } finally {
        SYBUSY = null;
      }
    })();
    return SYBUSY;
  }
  function syState(s, why = '', k = '') {
    SYST.s = s;
    SYST.why = why;
    SYST.k = k;
    if (s === 'idle') SYST.at = Date.now();
    syUI();
  }
  function syQuiet() {
    SYQUIET = true;
    try {
      persist();
    } finally {
      SYQUIET = false;
    }
  }
  const syEditing = () => !!($.list.querySelector('.editing,.note.editing') || P || IMSEAL || LSM);
  async function syRun() {
    const sys = SYS;
    if (!sys || locked || SYST.s === 'pass') return;
    const c = CL[sys.cloud],
      live = () => SYS === sys && !locked,
      E = { days: {}, rules: {}, tags: {} };
    if (!navigator.onLine) return syState('offline');
    let dirty = false;
    const was = SYST.s,
      wasWhy = SYST.why,
      wasK = SYST.k,
      slow = setTimeout(() => SYS === sys && !locked && syState('busy'), 400);
    try {
      for (let n = 0; n < 4; n++) {
        const L0 = syNow(),
          lh = await syHash(L0);
        // changes here not in the cloud yet: worth saying so if a sign-in is needed
        dirty = lh !== sys.lh;
        const files = await c.list();
        if (!live()) return;
        const f = files[0] || null,
          B0 = await syBase(sys.base),
          A0 = sys.anc ? await syBase(sys.anc) : null;
        let R = null;
        if (f && B0 && files.length === 1 && sys.file && f.id === sys.file.id && f.ver === sys.file.ver) {
          // the cloud holds what was agreed last time
          sys.anc = null;
          if (!dirty) return syDone(sys, false);
          R = B0;
        } else if (f) {
          const got = [];
          for (const x of files) {
            const env = syEnv(await c.read(x));
            if (!live()) return;
            if (!env) continue;
            // sealed again elsewhere, with a passphrase this device doesn't hold yet
            if (env.vault.kid !== sys.key.kid) {
              SYENV = env;
              syState('pass');
              syTell();
              return;
            }
            got.push(await syOpen(env, sys.key));
          }
          if (!live()) return;
          if (!got.length) throw new SyErr('alien');
          R = got[0];
          // two devices each made a copy at the same moment: both stay whole
          for (const g of got.slice(1))
            R = { ...syMerge(null, R, g), pid: R.pid, rev: Math.max(R.rev, g.rev), epoch: R.epoch, hist: [...new Set([...R.hist, g.pid, ...g.hist])].slice(0, 64) };
        }
        // What both sides came from. The copy agreed last, if the cloud's comes from it; else the copy this device's
        // last write came from, if that write was written over; else, on the same line and further along, the latest
        // copy known to have been in the cloud. Anything else (a first sync, a copy made anew): none, and nothing is
        // deleted.
        const from = x => !!x && !!R && (R.pid === x.pid || R.hist.includes(x.pid));
        let B = null,
          fork = false;
        if (from(B0)) B = B0;
        else if (from(A0)) B = A0;
        // further along than the ids it keeps can show: taken to come from the copy agreed last
        else if (R && B0 && R.epoch && R.epoch === B0.epoch && R.rev - B0.rev > R.hist.length) B = A0 || B0;
        // Close enough that the ids would show the copy agreed last, yet they don't: the cloud's copy went back (an
        // older version restored there) and went on from it. Nothing is deleted, and the next write starts a line of
        // its own, so no device takes that copy for one that comes from its own.
        else if (R && B0 && R.epoch && R.epoch === B0.epoch) fork = true;
        const L = R && !B && !sys.file && syFresh(L0) ? E : L0,
          M = syMerge(B, L, R || E);
        if (syEditing()) {
          if (SYST.s === 'busy' && was !== 'busy') syState(was, wasWhy, wasK);
          return syncSoon(1500);
        }
        syApply(L0, M);
        if (R && R !== B0) {
          // what came down is here now: it is what this device has agreed with the cloud
          sys.base = await syPackBase(R);
          sys.anc = null;
          sys.lh = await syHash(R);
          sys.file = { id: f.id, ver: f.ver };
          if (!live()) return;
          syQuiet();
        }
        if (R && files.length === 1 && syCanon(M) === syCanon(R)) return syDone(sys, false);
        const Pk = {
          pid: uid(),
          rev: (R ? R.rev : B0 ? B0.rev : 0) + 1,
          // the line goes on; a copy made anew (none there), or one gone back, starts one of its own
          epoch: (!fork && R && R.epoch) || uid(),
          hist: (R ? [R.pid, ...R.hist] : B0 ? [B0.pid, ...B0.hist] : []).filter(Boolean).slice(0, 64),
          days: M.days,
          rules: M.rules,
          tags: M.tags,
        };
        let nf;
        try {
          nf = await c.write(f, await syPack(Pk, sys.key));
        } catch (e) {
          // another device wrote in between, or the copy went: read again, and merge again
          if (e.kind === 'conflict' || e.kind === 'gone') continue;
          throw e;
        }
        if (!live()) return;
        for (const x of files.slice(1)) await c.remove(x).catch(() => {});
        sys.file = nf;
        // Where the cloud refuses a write over another (Dropbox), this one is now the copy agreed. Elsewhere another
        // device may still write over it unseen: the copy it came from is kept, to fall back on until it shows up.
        sys.anc = !c.cas && R ? await syPackBase(R) : null;
        sys.base = await syPackBase(Pk);
        sys.lh = await syHash(Pk);
        return syDone(sys, true);
      }
      syState('error', 'Another device kept syncing at the same moment. One Day tries again in a moment.');
      syncSoon(30e3);
    } catch (e) {
      if (!live()) return;
      const k = e && e.kind;
      if (k === 'offline') syState('offline');
      else if (k === 'auth') {
        syState('auth');
        if (dirty) syTell();
      } else {
        syState('error', syWhy(e, sys.cloud), k);
        syncSoon(k === 'slow' ? 60e3 : 120e3);
      }
    } finally {
      clearTimeout(slow);
    }
  }
  function syDone(sys, wrote) {
    if (SYS !== sys || locked) return;
    if (wrote) syQuiet();
    syTold = '';
    syState('idle');
  }
  // What came from the cloud goes into the tasks here; what changed here since the sync read them stays too.
  function syApply(L, M) {
    const now = syNow(),
      A = syCanon(now) === syCanon(L) ? M : syMerge(L, now, M);
    if (syCanon(A) === syCanon(now)) return;
    const days = cleanDays(A.days),
      rules = cleanRules(A.rules),
      tags = cleanTags(A.tags),
      // a day changed: its tasks, or its mark (see doneDays)
      dk = (ds, k) => (ds[k] ? [ds[k].tasks, !!ds[k].moved] : [[], false]),
      one = k => syJ(dk(days, k)) !== syJ(dk(now.days, k)),
      changed = Object.keys({ ...days, ...now.days }).filter(one),
      rulesNew = !syEq(rules, now.rules);
    S.days = days;
    S.rules = rules;
    S.tags = tags;
    IDX = null;
    TAGC = null;
    syDropUndo(changed, rulesNew);
    SYQUIET = true;
    try {
      ensure(cur);
      persist();
    } finally {
      SYQUIET = false;
    }
    if (changed.includes(cur) || rulesNew)
      flip(() => {
        renderList();
        renderAux();
      });
    else renderAux();
    if ($.srch.classList.contains('on')) renderSearch();
  }
  // An undo from before the cloud's changes came in would take them away: those that touch what changed are dropped,
  // and a toast still offering one goes.
  function syDropUndo(ks, rules) {
    let gone = false;
    for (const st of [UN, RE])
      for (let i = st.length - 1; i >= 0; i--)
        if (rules || Object.keys(st[i].days).some(k => ks.includes(k))) {
          st.splice(i, 1);
          gone = true;
        }
    if (gone && (toastAct === 'undo' || toastAct === 'redo')) hideToast();
  }
  function syWhy(e, c) {
    const n = c ? CL[c].name : 'your cloud';
    switch (e && e.kind) {
      case 'offline':
        return `No connection to ${n}. Try again once you’re online.`;
      case 'unreachable':
        return `${n} couldn’t be reached. One Day tries again in a moment.`;
      case 'popup':
        return 'Your browser blocked the sign-in window. Allow pop-ups for One Day, then try again.';
      case 'denied':
        return `${n} wasn’t given access, so nothing changed.`;
      case 'scope':
        return `One Day needs its own folder in ${n}: tick it when ${CL[c].co} asks.`;
      case 'timeout':
      case 'signin':
        return `Signing in to ${n} didn’t finish. Try again.`;
      case 'auth':
        return `Sign in to ${n} again to sync.`;
      case 'full':
        return `Your ${n} is full: make room there, and sync goes on.`;
      case 'slow':
        return `${n} asked One Day to slow down. It tries again in a minute.`;
      case 'alien':
        return `The file One Day keeps in your ${n} can’t be read.`;
      case 'big':
        return `The copy in your ${n} is larger than One Day can hold.`;
      default:
        return `${n} couldn’t do that${e && e.status ? ` (${e.status})` : ''}. One Day tries again in a moment.`;
    }
  }

  /* on screen: a cloud beside the lock (a pill above the card on a large screen, a button in the card's bar otherwise),
     a button in More (on a phone, or behind ⋮ where the bar is folded), and the dialog */
  const SPILL = document.getElementById('spill'),
    SYNCB = document.getElementById('syncb'),
    syAtt = () => !!SYS && ['auth', 'pass', 'error'].includes(SYST.s);
  function syLabel() {
    if (!SYS) return 'Sync with your cloud';
    const n = CL[SYS.cloud].name;
    return (
      {
        busy: `Syncing with ${n}…`,
        offline: 'Offline: your changes will sync later',
        auth: `Sign in to ${n} again to sync`,
        pass: 'Enter your new sync passphrase',
        error: `Sync with ${n} is paused`,
      }[SYST.s] || `Synced with ${n}`
    );
  }
  function syUI() {
    const lab = syLabel(),
      had = SYNCB && SYNCB.hidden;
    for (const b of [SPILL, SYNCB]) {
      if (!b) continue;
      b.hidden = !SYON || locked;
      b.dataset.s = SYS ? SYST.s : 'off';
      b.dataset.tip = lab;
      b.setAttribute('aria-label', lab);
      if (tipFor === b && !b.hidden) showTip(b);
    }
    // a button more in the card's bar: it folds again if they no longer fit
    if (SYNCB && SYNCB.hidden !== had) barFit();
    $.mbMore.classList.toggle('att', syAtt());
    // ⋮ shows it only where the bar is folded, its drawer holding sync's button
    $.kb.classList.toggle('att', syAtt());
    if (SYD && SYD.step === 'on') syDraw();
    if (lab === syLast) return;
    syLast = lab;
    const hint = $.slist.querySelector('.sdata .shint');
    if (hint) hint.textContent = dataHint();
    const mb = moreOpen && $.moreList.querySelector('[data-act="sync"]');
    if (mb) {
      mb.querySelector('span').textContent = lab;
      mb.classList.toggle('att', syAtt());
    }
  }
  function syMoreBtn() {
    return SYON
      ? `<div class="ssy"><button type="button" class="sbk-b${syAtt() ? ' att' : ''}" data-act="sync">${IC.cloud}<span>${esc(syLabel())}</span></button></div>`
      : '';
  }
  // something waits on you (a sign-in, a new passphrase): said once, with the way to do it
  function syTell() {
    if (SYD || !SYS || syTold === SYST.s) return;
    const n = CL[SYS.cloud].name;
    if (SYST.s === 'auth') {
      syTold = 'auth';
      toast(`Sign in to ${n} again to sync`, { label: 'Sign in', run: syAgain }, 8000);
    } else if (SYST.s === 'pass') {
      syTold = 'pass';
      toast('Your sync passphrase changed on another device', { label: 'Enter it', run: () => openSync({ step: 'rekey' }) }, 8000);
    }
  }
  for (const b of [SPILL, SYNCB]) if (b) b.onclick = () => openSync();

  const SY = {};
  'syncd syForm syT sySub syCh syOn sySt syLi syPass syPass2 syOkL syWarn syOk syEraseL syErase syEraseT syErr syNo syGo syHint'
    .split(' ')
    .forEach(id => (SY[id] = document.getElementById(id)));
  function openSync(o) {
    if (!SYON || !SY.syncd || SYD || LSM || IMP || locked) return;
    if (pip) pip.close();
    closePops();
    closeMore();
    compose(false);
    const ae = D().activeElement;
    SYD = { step: SYS ? 'on' : 'pick', c: SYS ? SYS.cloud : null, env: o && o.step === 'rekey' ? SYENV : null, ...o, from: ae && ae !== D().body ? ae : null };
    guard('syncd', () => closeSync());
    home.inert = true;
    for (const i of [SY.syPass, SY.syPass2]) i.value = '';
    SY.syOk.checked = SY.syErase.checked = false;
    SY.syErr.textContent = '';
    syDraw();
    modalIn(TAP && TAP.el.isConnected && Date.now() - TAP.t < 1500 ? TAP.el : SYD.from, SY.syncd, SY.syForm);
    syFocus();
  }
  // While a button is at work (erasing, opening), the dialog stays: what it does needs it. The lock closes it anyway.
  function closeSync(force) {
    const m = SYD;
    if (!m) return;
    if (!force && SY.syGo.classList.contains('busy')) {
      // the device's back stays the dialog's, still at work
      guard('syncd', () => closeSync());
      return;
    }
    SYD = null;
    unguard('syncd');
    if (SYW) SYW.cancel();
    // signed in, but sync never turned on: that sign-in is of no use
    if (!SYS) SYPEND = null;
    modalOut(SY.syncd, SY.syForm);
    for (const i of [SY.syPass, SY.syPass2]) i.value = '';
    if (!locked) home.inert = false;
    if (m.from && m.from.isConnected && !m.from.closest('[inert]')) m.from.focus({ preventScroll: true });
  }
  function syFocus() {
    const m = SYD;
    if (!m) return;
    const el =
      m.step === 'pick'
        ? SY.syCh.querySelector('button:not(:disabled)') || SY.syNo
        : ['new', 'join', 'rekey'].includes(m.step)
          ? SY.syPass
          : m.step === 'stop' || m.step === 'reset'
            ? SY.syErase
            : m.step === 'on'
              ? SY.syGo
              : SY.syNo;
    if (el && !el.hidden) el.focus({ preventScroll: true });
  }
  function syStatus() {
    const n = CL[SYS.cloud].name;
    switch (SYST.s) {
      case 'busy':
        return ['Syncing…'];
      case 'offline':
        return [`Offline. Your changes are kept here, and go to your ${n} once you’re back online.`];
      case 'auth':
        return [`Sign in to ${n} again to keep syncing.`, 'signin', 'Sign in'];
      case 'pass':
        return ['Your sync passphrase was changed on another device.', 'rekey', 'Enter it'];
      case 'error':
        // a copy there that can't be read is no use: the way out is to start it again from here
        return SYST.k === 'alien' ? [SYST.why, 'forgot', 'Start over'] : [SYST.why || syWhy(null, SYS.cloud), 'now', 'Try again'];
      default:
        return [SYST.at ? `Up to date. Synced at ${CLF.format(SYST.at)}.` : 'Up to date.', 'now', 'Sync now'];
    }
  }
  function syDraw() {
    const m = SYD;
    if (!m) return;
    const c = m.c,
      n = c ? CL[c].name : '',
      st = m.step,
      pass = ['new', 'join', 'rekey'].includes(st);
    let t = '',
      sub = '',
      go = '',
      no = 'Cancel',
      hint = '';
    SY.syCh.hidden = st !== 'pick';
    SY.syOn.hidden = st !== 'on';
    SY.syPass.hidden = !pass;
    SY.syPass2.hidden = st !== 'new';
    SY.syOkL.hidden = st !== 'new';
    SY.syEraseL.hidden = st !== 'stop' && st !== 'reset';
    SY.syPass.autocomplete = st === 'new' ? 'new-password' : 'current-password';
    SY.syPass.placeholder = st === 'new' ? 'Passphrase, 12 characters or more' : 'Sync passphrase';
    SY.syPass.setAttribute('aria-label', st === 'new' ? 'New sync passphrase' : 'Sync passphrase');
    if (st === 'pick') {
      t = 'Sync with your cloud';
      sub = 'The same tasks on your phone and your computer, kept in your own cloud. They’re encrypted here with a passphrase before they leave, so neither your cloud nor One Day can read them.';
      hint = 'One Day keeps one small file there, and nothing else. Stop whenever you like.';
      SY.syCh.innerHTML = Object.keys(CL)
        .map(k => {
          const on = !!CLOUD_IDS[k],
            logo = CL[k].logo ? `<img src="${CL[k].logo}" alt="" width="28" height="28" decoding="async">` : '';
          return `<button type="button" class="syc" data-c="${k}"${on ? '' : ' disabled'}><i class="syl syl-${k}" aria-hidden="true">${logo}</i><b>${esc(CL[k].label || CL[k].name)}</b><span>${esc(on ? CL[k].sub : 'Not set up yet')}</span></button>`;
        })
        .join('');
    } else if (st === 'wait') {
      t = `Signing in to ${n}`;
      sub = `Finish in the window that opened. ${CL[c].co} asks you to let One Day use its own folder there, and nothing else.`;
    } else if (st === 'go') {
      t = `Opening ${n}…`;
      sub = 'Sign in there, and you’ll come straight back to One Day.';
    } else if (st === 'new') {
      t = 'Choose a sync passphrase';
      sub = `It encrypts your tasks here, before they go to your ${n}. You’ll type it once on each device you sync.`;
      go = 'Start syncing';
      if (vault) hint = 'It can be the same as your lock’s passphrase.';
    } else if (st === 'join' || st === 'rekey') {
      t = st === 'join' ? 'Enter your sync passphrase' : 'Your sync passphrase changed';
      sub =
        st === 'join'
          ? `Your ${n} already holds tasks from One Day. Enter the passphrase you chose when you turned sync on.`
          : `The tasks in your ${n} were sealed again on another device, with a new passphrase. Enter it to keep syncing.`;
      go = 'Sync';
      hint = '<button class="lnk" type="button" data-sy="forgot">Forgot it?</button>';
    } else if (st === 'reset') {
      t = `Start over in your ${n}?`;
      sub = `Nobody can recover the passphrase. You can erase the tasks One Day keeps in your ${n}, then sync this device’s tasks there under a new passphrase. Your other devices will ask for it.`;
      SY.syEraseT.textContent = `Erase One Day’s copy from my ${n}`;
      go = 'Erase';
    } else if (st === 'on') {
      t = 'Sync is on';
      sub = `Your tasks are kept ${CL[c].where}, encrypted with your sync passphrase.`;
      const [line, act, lab] = syStatus(),
        h = `<span class="syd" data-s="${esc(SYST.s)}" aria-hidden="true"></span><span>${esc(line)}</span>${
          act ? ` <button class="lnk" type="button" data-sy="${act}">${esc(lab)}</button>` : ''
        }`;
      if (SY.sySt.dataset.h !== h) {
        // the focus stays in the dialog when what it was on is drawn again
        const had = SY.sySt.contains(D().activeElement);
        SY.sySt.innerHTML = SY.sySt.dataset.h = h;
        if (had) (SY.sySt.querySelector('button') || SY.syGo).focus({ preventScroll: true });
      }
      SY.syLi.innerHTML = [
        `${CL[c].co} sees one file and when it changes, never a task.`,
        `On your other devices, open One Day, choose Sync with your cloud, then ${n} with the same account and the same passphrase.`,
        'Offline, your changes wait here, and go up once you’re back online.',
      ]
        .map(x => `<li>${esc(x)}</li>`)
        .join('');
      go = 'Done';
      no = 'Stop syncing';
    } else if (st === 'stop') {
      t = 'Stop syncing here?';
      sub = `Your tasks stay in this browser, and in your ${n} for your other devices.`;
      SY.syEraseT.textContent = `Also erase One Day’s copy from your ${n}`;
      if (SY.syErase.checked) hint = 'Stop syncing on your other devices first: one still syncing would put the copy back.';
      go = 'Stop syncing';
      no = 'Keep syncing';
    }
    SY.syT.textContent = t;
    SY.sySub.textContent = sub;
    SY.syGo.hidden = !go;
    SY.syGo.textContent = go;
    SY.syGo.classList.toggle('danger', st === 'reset' || (st === 'stop' && SY.syErase.checked));
    SY.syNo.hidden = !no;
    SY.syNo.textContent = no;
    SY.syHint.innerHTML = hint;
    SY.syHint.hidden = !hint;
  }
  // a cloud picked: its sign-in opens from this very click
  function syPick(c) {
    if (!SYD || !CLOUD_IDS[c]) return;
    const win = syWin();
    SYD.c = c;
    SYD.step = win ? 'wait' : 'go';
    say(SY.syForm, SY.syErr, '');
    syDraw();
    syFocus();
    const m = SYD;
    sySignIn(c, win)
      .then(tok => syGot(c, tok))
      .then(
        got => {
          if (SYD !== m) return;
          if (got.again) {
            m.step = 'on';
            syDraw();
            return;
          }
          m.step = got.step;
          m.env = got.env || null;
          syDraw();
          syFocus();
        },
        e => {
          if (SYD !== m || (e && e.kind === 'cancel')) return;
          m.step = 'pick';
          syDraw();
          wrong(SY.syForm, SY.syErr, null, syWhy(e, c));
          // a file there that One Day can't read: the way out is to start it again
          if (e && e.kind === 'alien') {
            SY.syHint.innerHTML = `<button class="lnk" type="button" data-sy="forgot">Start over in your ${esc(CL[c].name)}</button>`;
            SY.syHint.hidden = false;
          }
        },
      );
  }
  // signed in again to the cloud in use, from a click (the toast, or the dialog)
  function syAgain() {
    if (!SYS) return;
    const c = SYS.cloud,
      win = syWin();
    if (SYD) {
      SYD.step = win ? 'wait' : 'go';
      syDraw();
    }
    const m = SYD;
    sySignIn(c, win, true)
      .then(tok => syGot(c, tok))
      .then(
        () => {
          if (SYD && SYD === m) {
            m.step = 'on';
            syDraw();
          }
        },
        e => {
          if (e && e.kind === 'cancel') return;
          if (SYD && SYD === m) {
            m.step = 'on';
            syDraw();
            wrong(SY.syForm, SY.syErr, null, syWhy(e, c));
          } else toast(syWhy(e, c));
        },
      );
  }
  // signed in: on with sync (the cloud in use), or what the cloud holds says what comes next
  async function syGot(c, tok) {
    const a = syAuth();
    syKeepAuth({ v: 1, cloud: c, ...tok, r: tok.r || (a && a.cloud === c ? a.r || '' : '') });
    if (SYS && SYS.cloud === c) {
      syTold = '';
      SYST.s = 'idle';
      syUI();
      // the other tabs take this sign-in too
      syTabs('auth');
      syncNow();
      return { again: true };
    }
    const files = await CL[c].list();
    if (!files.length) return { step: 'new' };
    const env = syEnv(await CL[c].read(files[0]));
    if (!env) throw new SyErr('alien');
    return { step: 'join', env };
  }
  // back from the cloud's page in this window: on from where the sign-in left off
  async function syFinish(b) {
    try {
      const got = await syGot(b.c, await CL[b.c].take(b.ans, b.ver));
      if (got.again) toast(`Signed in to ${CL[b.c].name} again`);
      else openSync({ step: got.step, c: b.c, env: got.env || null });
    } catch (e) {
      if (e && e.kind === 'cancel') return;
      if (SYS) toast(syWhy(e, b.c));
      else {
        openSync({ step: 'pick' });
        if (SYD) wrong(SY.syForm, SY.syErr, null, syWhy(e, b.c));
      }
    }
  }
  function syStart(sys) {
    if (SYD && SYD.step === 'rekey' && SYS && SYS.cloud === sys.cloud) {
      // the new key, and no base: the copy there and this device's tasks are both kept
      SYS.key = sys.key;
      SYS.base = null;
      SYS.anc = null;
      SYS.file = null;
      SYS.lh = '';
    } else {
      // the sign-in held meanwhile goes with the key, kept with the tasks from now on
      const p = SYPEND && SYPEND.cloud === sys.cloud ? SYPEND : null;
      if (p) sys.auth = { a: p.a, ax: p.ax, r: p.r, rx: p.rx };
      SYS = sys;
    }
    SYPEND = null;
    SYKEY = null;
    SYENV = null;
    syTold = '';
    SYST.s = 'busy';
    syQuiet();
    syUI();
    syTabs('start');
    if (SYD) {
      SYD.step = 'on';
      syDraw();
      syFocus();
    }
    syncNow();
  }
  // Other tabs of this browser each hold the tasks as they read and changed them, and sync's state with those. When
  // sync is turned on, off, given a new key or signed in again here, sync tells them, and each takes only sync's part:
  // off, or the key and sign-in with no base of its own (its next sync keeps both sides then, so nothing a tab did is
  // lost), or the new sign-in. No tab's tasks are ever replaced by another's.
  const SYBC = 'BroadcastChannel' in window ? new BroadcastChannel('one-day-sync') : null;
  function syTabs(t) {
    if (!SYBC) return;
    const sys = SYS,
      m = t === 'stop' || !sys ? { t: 'stop' } : { t, cloud: sys.cloud, kid: sys.key.kid, key: sys.key, auth: sys.auth || null };
    try {
      SYBC.postMessage(m);
    } catch (e) {}
  }
  if (SYBC)
    SYBC.onmessage = e => {
      const d = e.data;
      // locked, a tab holds no sync: the next unlock reads it as stored
      if (!d || typeof d !== 'object' || locked) return;
      if (d.t === 'stop') {
        if (!SYS) return;
        SYS = null;
        SYKEY = null;
        SYENV = null;
        clearTimeout(syT);
        syT = null;
        SYST.s = 'off';
        if (SYD && SYD.step !== 'pick') closeSync(true);
        syUI();
        return;
      }
      if (d.t === 'auth') {
        if (!SYS || SYS.cloud !== d.cloud || SYS.key.kid !== d.kid || !d.auth) return;
        // kept in this tab, and written with its tasks next time: the tab that signed in has written it already
        SYS.auth = { a: d.auth.a || '', ax: +d.auth.ax || 0, r: d.auth.r || '', rx: +d.auth.rx || 0 };
        if (SYST.s === 'auth') {
          syTold = '';
          syState('idle');
          syncSoon(400);
        }
        return;
      }
      if (d.t === 'start') {
        if (SYS && SYS.cloud === d.cloud && SYS.key.kid === d.kid) return;
        const sys = cleanSys({ v: 1, cloud: d.cloud, key: d.key, auth: d.auth });
        if (!sys) return;
        SYS = sys;
        SYKEY = null;
        SYENV = null;
        syTold = '';
        SYST.s = sys.auth ? 'idle' : 'auth';
        if (SYD && SYD.step === 'pick') closeSync(true);
        syUI();
        syncSoon(800);
      }
    };
  // Off here: the sign-in and the key leave this browser, the tasks stay. With `erase`, One Day's copy in the cloud
  // goes first; if that fails, sync stays on and says why.
  // With `keep`, the sign-in stays in this page: to start over in the same cloud.
  async function syStop(erase, keep) {
    const sys = SYS;
    if (!sys) return '';
    const c = CL[sys.cloud];
    SYS = null;
    // the sign-in, held in this page meanwhile, to erase the copy with
    SYPEND = sys.auth ? { cloud: sys.cloud, ...sys.auth } : null;
    clearTimeout(syT);
    syT = null;
    // the other tabs stop first, so that none of them puts the copy back while it goes
    syTabs('stop');
    if (SYBUSY) await SYBUSY.catch(() => {});
    if (erase)
      try {
        // after any sync under way in this browser, and before the next one
        await syLock('one-day-sync', async () => {
          for (const f of await c.list()) await c.remove(f);
        });
      } catch (e) {
        SYPEND = null;
        if (!locked) {
          // still on: so are the other tabs, with no base of their own (their next sync keeps both sides)
          SYS = sys;
          syTabs('start');
        }
        return syWhy(e, sys.cloud);
      }
    if (!keep && (erase || sys.cloud === 'dropbox')) c.revoke(syAuth());
    if (!keep) SYPEND = null;
    SYKEY = null;
    SYENV = null;
    SYST.s = 'off';
    syQuiet();
    syUI();
    return '';
  }
  SY.syCh.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (b && !b.disabled) syPick(b.dataset.c);
  });
  SY.syForm.addEventListener('click', e => {
    const b = e.target.closest('[data-sy]');
    if (!b || !SYD) return;
    const a = b.dataset.sy;
    if (a === 'now') syncNow();
    else if (a === 'signin') syAgain();
    else if (a === 'rekey') {
      SYD.step = 'rekey';
      SYD.env = SYENV;
      syDraw();
      syFocus();
    } else if (a === 'forgot') {
      SYD.step = 'reset';
      SY.syErase.checked = false;
      say(SY.syForm, SY.syErr, '');
      syDraw();
      syFocus();
    }
  });
  SY.syErase.addEventListener('change', () => {
    if (SY.syErase.checked && /^Tick/.test(SY.syErr.textContent)) say(SY.syForm, SY.syErr, '');
    syDraw();
  });
  SY.syOk.addEventListener('change', () => {
    if (SY.syOk.checked && /^Tick/.test(SY.syErr.textContent)) say(SY.syForm, SY.syErr, '');
  });
  SY.syForm.addEventListener('input', e => {
    if (e.target.type !== 'password') return;
    e.target.removeAttribute('aria-invalid');
    say(SY.syForm, SY.syErr, '');
  });
  SY.syNo.onclick = () => {
    const m = SYD;
    if (!m) return;
    if (m.step === 'on') {
      m.step = 'stop';
      SY.syErase.checked = false;
    } else if (m.step === 'stop') m.step = 'on';
    else return closeSync();
    say(SY.syForm, SY.syErr, '');
    syDraw();
    syFocus();
  };
  SY.syncd.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeSync();
  });
  SY.syncd.addEventListener('click', e => {
    if (e.target === SY.syncd) closeSync();
  });
  SY.syForm.addEventListener('submit', async e => {
    e.preventDefault();
    const m = SYD;
    if (!m || SY.syGo.disabled || SY.syGo.hidden) return;
    const no = (msg, el, at) => wrong(SY.syForm, SY.syErr, el, msg, at);
    if (m.step === 'on') return closeSync();
    if (m.step === 'new') {
      const p1 = SY.syPass.value,
        p2 = SY.syPass2.value;
      if (p1.length < 12) return no('Use 12 characters or more', SY.syPass, SY.syPass);
      if (p1 !== p2) return no('The two passphrases are not the same', SY.syPass2, SY.syPass2);
      if (!SY.syOk.checked) return no('Tick “I understand” first', SY.syOk, SY.syOkL);
      say(SY.syForm, SY.syErr, '');
      busy(SY.syGo, 'Encrypting…');
      let sys = null;
      try {
        sys = await syMake(m.c, p1);
      } catch (err) {}
      busy(SY.syGo);
      if (SYD !== m) return;
      if (!sys) return no('Something went wrong. Nothing was changed.');
      return syStart(sys);
    }
    if (m.step === 'join' || m.step === 'rekey') {
      const p = SY.syPass.value;
      if (!p) return no('Enter the passphrase', SY.syPass, SY.syPass);
      if (!m.env) return no(syWhy(new SyErr('alien'), m.c));
      say(SY.syForm, SY.syErr, '');
      busy(SY.syGo, 'Opening…');
      let sys = null,
        bad = null;
      try {
        sys = await syJoin(m.c, p, m.env);
      } catch (err) {
        bad = err;
      }
      busy(SY.syGo);
      if (SYD !== m) return;
      if (bad) return no(syWhy(bad, m.c));
      if (!sys) return no(`That passphrase doesn’t open the tasks in your ${CL[m.c].name}`, SY.syPass);
      return syStart(sys);
    }
    if (m.step === 'reset') {
      if (!SY.syErase.checked) return no('Tick the box to erase it', SY.syErase, SY.syEraseL);
      say(SY.syForm, SY.syErr, '');
      busy(SY.syGo, 'Erasing…');
      let why = '';
      try {
        // this device's own sync, if any, stops first: it would put the copy back
        if (SYS) why = await syStop(false, true);
        for (const f of await CL[m.c].list()) await CL[m.c].remove(f);
      } catch (err) {
        why = syWhy(err, m.c);
      }
      busy(SY.syGo);
      if (SYD !== m) return;
      if (why) return no(why);
      m.step = 'new';
      m.env = null;
      SY.syErase.checked = false;
      syDraw();
      syFocus();
      return;
    }
    if (m.step === 'stop') {
      const erase = SY.syErase.checked,
        n = CL[m.c].name;
      say(SY.syForm, SY.syErr, '');
      busy(SY.syGo, erase ? 'Erasing…' : 'Stopping…');
      const why = await syStop(erase);
      busy(SY.syGo);
      if (SYD !== m) return;
      if (why) return no(why);
      closeSync();
      toast(erase ? `Sync is off, and One Day’s copy is gone from your ${n}` : 'Sync is off on this device');
    }
  });
  // the lock closed: the key went with the tasks, and nothing syncs until the next unlock
  function syLocked() {
    clearTimeout(syT);
    syT = null;
    SYKEY = null;
    SYENV = null;
    SYST.s = 'off';
    syUI();
  }
  // started, or unlocked: sync takes up where it was
  function syWake() {
    if (!SYON || locked) return;
    const back = SYBACK;
    SYBACK = null;
    if (SYS) {
      const a = syAuth();
      SYST.s = !a || a.cloud !== SYS.cloud ? 'auth' : navigator.onLine ? 'idle' : 'offline';
      syUI();
      syncSoon(700);
    } else syUI();
    if (back) syFinish(back);
  }
  function syBoot() {
    if (!SYON) return;
    SYBACK = syBackIn();
    syncHook = () => {
      if (SYS && !SYQUIET) syncSoon();
    };
    window.addEventListener('online', () => syncSoon(300));
    window.addEventListener('offline', () => {
      if (SYS && !['auth', 'pass'].includes(SYST.s)) syState('offline');
    });
    document.addEventListener('visibilitychange', () => {
      if (!SYS || locked) return;
      // changes still waiting go up before the page is put away; back, what changed elsewhere comes in
      if (document.hidden) {
        if (syT) syncNow();
      } else syncSoon(400);
    });
    // while One Day is open, what other devices did comes in every couple of minutes
    setInterval(() => {
      if (SYS && !locked && !document.hidden) syncNow();
    }, 120e3);
    syWake();
  }

  /* the day turning over while the app is open */
  setInterval(() => {
    const tk = todayKey();
    if (tk === lastToday) return;
    const was = cur === lastToday;
    lastToday = tk;
    if (was) go(tk, 1);
    else {
      renderHeader(0);
      renderAux();
    }
    renderChip();
  }, 20000);

  /* the sheet: on a large screen the app is a card whose height follows its content on a spring.
     Content that already animates its own height (cards opening, rows collapsing) is followed closely;
     sudden changes (another day, a new task, search) are eased in. */
  const SHEETQ = '(min-width: 720px) and (min-height: 560px)';
  const sheet = {
    w: null,
    mq: null,
    h: 0,
    v: 0,
    target: 0,
    raf: 0,
    rw: null,
    last: 0,
    get on() {
      const w = W();
      if (w !== this.w) {
        this.w = w;
        this.mq = w.matchMedia(SHEETQ);
      }
      return this.mq.matches;
    },
    max() {
      const m = parseFloat(getComputedStyle(app).maxHeight);
      return isNaN(m) ? Infinity : m;
    },
    // the day's own height: what the card is without a set height
    dayH() {
      return q('header').offsetHeight + $.stage.offsetHeight + $.add.offsetHeight;
    },
    natural() {
      let h = this.dayH();
      if ($.srch.classList.contains('on'))
        h = Math.max(h, q('.sbar').offsetHeight + 16 + 40 + $.slist.offsetHeight + ($.spicks.hidden ? 0 : $.spicks.offsetHeight + 18));
      return Math.min(h, this.max());
    },
    // At rest the card goes back to its own height, unless search needs more: then it keeps that.
    rest() {
      app.style.height = this.on && this.target > Math.min(this.dayH(), this.max()) + 0.5 ? this.target + 'px' : '';
    },
    snap() {
      this.stop();
      this.h = this.target = this.on ? this.natural() : 0;
      this.rest();
    },
    check() {
      if (!this.on) {
        if (this.raf || app.style.height) this.stop();
        return;
      }
      const t = this.natural();
      if (Math.abs(t - this.target) < 0.5) return;
      this.target = t;
      if (RM.matches || !this.h) return this.snap();
      if (this.raf) return;
      app.style.height = this.h + 'px';
      app.classList.toggle('resizing', t < this.max() - 0.5);
      this.last = performance.now();
      this.rw = W();
      this.raf = this.rw.requestAnimationFrame(n => this.tick(n));
    },
    tick(now) {
      this.raf = 0;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - this.last) / 1000)),
        n = Math.ceil(dt * 240),
        st = dt / n,
        k = 330,
        c = 34;
      this.last = now;
      let h = this.h,
        v = this.v;
      for (let i = 0; i < n; i++) {
        v += (-k * (h - this.target) - c * v) * st;
        h += v * st;
      }
      this.h = h;
      this.v = v;
      if (Math.abs(h - this.target) < 0.5 && Math.abs(v) < 6) return this.stop();
      app.style.height = h.toFixed(2) + 'px';
      this.raf = this.rw.requestAnimationFrame(t => this.tick(t));
    },
    stop() {
      if (this.raf)
        try {
          this.rw.cancelAnimationFrame(this.raf);
        } catch (e) {}
      this.raf = 0;
      this.v = 0;
      this.h = this.target;
      this.rest();
      app.classList.remove('resizing');
    },
    init() {
      if (!window.ResizeObserver) return;
      const ro = new ResizeObserver(() => this.check());
      [q('header'), $.stage, $.add, $.slist].forEach(n => ro.observe(n));
      window.addEventListener('resize', () => (this.on ? this.check() : this.stop()));
      this.snap();
    },
  };

  /* first paint: one orchestrated entrance, held until the type has loaded */
  ensure(cur);
  renderHeader(0);
  renderList(true);
  renderAux();
  renderChip();
  tmSync();
  tmRender(false);
  tpRender(0);
  function intro() {
    app.classList.remove('pre');
    home.classList.add('shown');
    calm(2000);
    sheet.init();
    // where the time sits in the bar, the full days take its place once the day has come in
    later(ddPeek, RM.matches ? 1200 : 2600);
    if (RM.matches) return;
    if (!$.dd.hidden && !BSP.classList.contains('wclock')) ddIn(260);
    if (sheet.on) {
      an(app, [{ opacity: 0, transform: 'translateY(16px) scale(.985)' }, { opacity: 1, transform: 'none' }], {
        duration: SP.dur * 1.2,
        fill: 'backwards',
      });
      an(document.getElementById('foot'), [{ opacity: 0 }, { opacity: 1 }], {
        duration: 500,
        delay: 700,
        easing: 'ease',
        fill: 'backwards',
      });
    }
    const B = { fill: 'backwards' };
    const f = fill.style.transform;
    fill.style.transition = 'none';
    fill.style.transform = 'translateX(-100%)';
    fill.getBoundingClientRect();
    fill.style.transition = '';
    later(() => {
      fill.style.transform = f;
    }, 720);
    an(q('.rule'), [{ transform: 'scaleX(0)' }, { transform: 'none' }], { ...B, duration: SP.dur * 1.4 });
    [$.prev, $.next, $.sb, $.tmb, $.sendd, $.float, $.theme].forEach((b, i) =>
      an(
        b,
        [
          { opacity: 0, transform: 'scale(.5)' },
          { opacity: 1, transform: 'none' },
        ],
        { ...B, delay: 110 + i * 45, easing: POP.ease, duration: POP.dur },
      ),
    );
    $.num
      .querySelectorAll('.dg i')
      .forEach((n, i) =>
        an(n, [{ transform: 'translateY(112%)' }, { transform: 'none' }], {
          ...B,
          delay: 180 + i * 85,
          duration: SP.dur * 1.3,
        }),
      );
    [$.wd, q('.mo'), $.rel].forEach((n, i) =>
      an(
        n,
        [
          { opacity: 0, transform: 'translateY(10px)' },
          { opacity: 1, transform: 'none' },
        ],
        { ...B, delay: 300 + i * 60 },
      ),
    );
    const items = [$.carry, ...$.list.children, $.empty].filter(n => !n.hidden);
    items.forEach((n, i) => {
      const d = 420 + Math.min(i, 10) * 55;
      an(
        n,
        [
          { opacity: 0, transform: 'translateY(18px)' },
          { opacity: 1, transform: 'none' },
        ],
        { ...B, delay: d },
      );
      const rg = n.querySelector && n.querySelector('.in .rg');
      if (rg)
        an(rg, [{ strokeDashoffset: 64.4 }, { strokeDashoffset: 0 }], {
          ...B,
          delay: d + 40,
          duration: 760,
          easing: 'cubic-bezier(.65,0,.25,1)',
        });
      const dot = n.querySelector && n.classList.contains('done') && n.querySelector('.in .ck i');
      if (dot)
        an(dot, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
          ...B,
          delay: d + 380,
          easing: POP.ease,
          duration: POP.dur,
        });
    });
    an(
      $.add,
      [
        { opacity: 0, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'none' },
      ],
      { ...B, delay: 440 + Math.min(items.length, 10) * 55 },
    );
  }
  Promise.race([
    Promise.all(
      ['800 100px Archivo', '16px Archivo', '600 16px Archivo'].map(f =>
        document.fonts ? document.fonts.load(f) : 0,
      ),
    ).catch(() => 0),
    new Promise(r => setTimeout(r, 1200)),
  ]).then(() => (locked ? (introLater = true) : intro()));
  bindDoc(document);
  cloud.init();
  syBoot();
  if (!locked && INRE.test(location.hash)) later(readIncoming, RM.matches ? 0 : 900);
  if (
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost') &&
    document.querySelector('link[rel=manifest]')
  )
    navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist && matchMedia('(display-mode: standalone)').matches)
    navigator.storage
      .persisted()
      .then(p => p || navigator.storage.persist())
      .catch(() => {});
}
