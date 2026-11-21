/*! One Day — a calm, one-day-at-a-time task list. MIT License. */
'use strict';
{
  const app = document.getElementById('app'),
    home = document.getElementById('home'),
    q = s => app.querySelector(s),
    $ = {};
  'num dnum meta wd mo rel prev next todayb sb tmb tv float vp sc stage list empty carry carryTxt bring add input toast toastTxt undo pop popT grid pmPrev pmNext tpop seg tset trun tpv tminus tplus tpre tstart tbig tunit tsec tprog tpause tadd tstop tip fmt fmtIn lb lbA lbRm sug srch sq sx sres hl slist scount impf dchip dlabel dpop dq dpT dpPrev dpNext dgrid'
    .split(' ')
    .forEach(id => ($[id] = q('#' + id)));
  const fill = q('.rule i'),
    RM = matchMedia('(prefers-reduced-motion: reduce)'),
    D = () => app.ownerDocument,
    W = () => D().defaultView || window;
  const TOUCH = matchMedia('(hover: none)').matches;
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
    MO = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
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
        return o;
      });
  let S = null;
  try {
    S = JSON.parse(localStorage.getItem(LS));
  } catch (e) {}
  if (!S || !S.days || typeof S.days !== 'object') {
    const T = (text, x = {}) => ({
      id: uid() + Math.random().toString(36).slice(2, 4),
      text,
      done: false,
      ...x,
    });
    S = { days: {} };
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
    const days = {};
    for (const k of Object.keys(S.days)) {
      const v = S.days[k];
      if (DAYRE.test(k) && v && typeof v === 'object') days[k] = { u: +v.u || 0, tasks: clean(v.tasks) };
    }
    S.days = days;
  }
  let cur = todayKey(),
    lastToday = cur,
    IDX = null,
    TAGC = null;
  const tasks = k => (S.days[k] ? S.days[k].tasks : []),
    day = k => S.days[k] || (S.days[k] = { u: 0, tasks: [] });
  const find = id => tasks(cur).find(t => t.id === id),
    rowOf = id => $.list.querySelector(`.row[data-id="${CSS.escape(id)}"]`),
    subOf = (li, sid) => li.querySelector(`.sub[data-sid="${CSS.escape(sid)}"]`);
  const ordered = k => {
    const t = tasks(k);
    return [...t.filter(x => !x.done), ...t.filter(x => x.done).sort((a, b) => (a.at || 0) - (b.at || 0))];
  };
  const hasOpen = k => tasks(k).some(t => !t.done);
  function persist() {
    IDX = null;
    try {
      localStorage.setItem(LS, JSON.stringify(S));
    } catch (e) {}
  }
  function commit(k) {
    day(k).u = Date.now();
    persist();
    cloud.push(k);
  }

  /* undo history */
  const UN = [],
    RE = [];
  const snap = keys => ({
    cur,
    days: Object.fromEntries([...new Set(keys)].map(k => [k, JSON.parse(JSON.stringify(day(k)))])),
  });
  function pushUndo(s) {
    UN.push(s);
    if (UN.length > 80) UN.shift();
    RE.length = 0;
  }
  const record = keys => pushUndo(snap(keys));
  function applySnap(e, into) {
    into.push({ ...snap(Object.keys(e.days)), cur: e.cur });
    for (const k in e.days) {
      S.days[k] = { u: 0, tasks: e.days[k].tasks };
      commit(k);
    }
    if (!(cur in e.days)) go(e.cur);
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
    Object.assign(g.style, {
      left: el.offsetLeft + 'px',
      top: el.offsetTop + 'px',
      width: el.offsetWidth + 'px',
      margin: 0,
      background: 'none',
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
    fill.style.transform = `scaleX(${n ? dn / n : 0})`;
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
    $.todayb.tabIndex = isT ? -1 : 0;
    $.todayb.setAttribute('aria-hidden', isT);
    $.dnum.textContent = dt.getDate() + ' ';
  }

  /* rows */
  const IC = {
    mv: '<svg viewBox="0 0 20 20"><path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5"/></svg>',
    rm: '<svg viewBox="0 0 20 20"><path d="m5.5 5.5 9 9m0-9-9 9"/></svg>',
    ex: '<svg viewBox="0 0 20 20"><path d="m5.5 8 4.5 4.5L14.5 8"/></svg>',
    plus: '<svg viewBox="0 0 18 18"><path d="M9 3.5v11M3.5 9h11"/></svg>',
    list: '<svg viewBox="0 0 14 14"><path d="m2 4 1.3 1.3L5.6 3M7.5 4.2H12M2 9.4l1.3 1.3 2.3-2.3M7.5 9.6H12"/></svg>',
    note: '<svg viewBox="0 0 14 14"><path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h5.5"/></svg>',
  };
  const CK =
    '<i></i><svg viewBox="0 0 22 22"><circle class="rg" cx="11" cy="11" r="10.25"/><circle class="pr" cx="11" cy="11" r="10.25"/><path d="M6.6 11.4l3 3 5.8-6.3"/></svg>';
  const SCK =
    '<i></i><svg viewBox="0 0 18 18"><circle class="rg" cx="9" cy="9" r="8.25"/><path d="M5.3 9.3l2.5 2.5 4.8-5.2"/></svg>';
  const TAGRE = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_\-\/]*)/gu;
  const tagsOf = text => [...new Set([...String(text).matchAll(TAGRE)].map(m => m[2].toLowerCase()))];
  function titleHTML(text) {
    let h = '',
      last = 0;
    for (const m of String(text).matchAll(TAGRE)) {
      const i = m.index + m[1].length;
      h +=
        esc(text.slice(last, i)) +
        `<span class="tag" data-tag="${esc(m[2].toLowerCase())}">#${esc(m[2])}</span>`;
      last = i + 1 + m[2].length;
    }
    return h + esc(text.slice(last));
  }
  const openIds = new Set();
  function makeRow(t) {
    const li = D().createElement('li');
    li.className = 'row';
    li.dataset.id = t.id;
    li.innerHTML = `<div class="card"><div class="in"><button class="ck" type="button" role="checkbox" aria-checked="false" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">${CK}</button><div class="tx"><span class="t"></span><button class="mt" type="button" hidden></button></div><div class="acts"><button class="ib ex" type="button" data-tip="Notes and sub-tasks" aria-label="Notes and sub-tasks" aria-expanded="false">${IC.ex}</button><button class="ib mv" type="button" data-tip="Move to next day" aria-label="Move to next day">${IC.mv}</button><button class="ib rm" type="button" data-tip="Delete" aria-label="Delete">${IC.rm}</button></div></div><div class="more" hidden><div class="mi"><div class="note is-empty" tabindex="0" role="textbox" aria-multiline="true" aria-label="Note" data-ph="Add a note"></div><ul class="subs"></ul><div class="sadd"><span class="plus" aria-hidden="true">${IC.plus}</span><input type="text" placeholder="Add a sub-task" aria-label="Add a sub-task" maxlength="300" enterkeyhint="done" autocomplete="off"></div></div></div></div>`;
    return li;
  }
  function updateMeta(li, t) {
    const subs = t.subs || [],
      sd = subs.filter(s => s.done).length,
      ck = li.querySelector('.in .ck');
    ck.style.setProperty(
      '--off',
      subs.length && !t.done ? (64.4 * (1 - sd / subs.length)).toFixed(2) : '64.4',
    );
    const mt = li.querySelector('.mt'),
      has = !!(subs.length || t.note);
    mt.hidden = !has;
    if (has) {
      const h =
        (subs.length ? `<span>${IC.list}${sd}/${subs.length}</span>` : '') +
        (t.note ? `<span>${IC.note}</span>` : '');
      if (mt.dataset.v !== h) {
        mt.innerHTML = h;
        mt.dataset.v = h;
      }
      mt.setAttribute(
        'aria-label',
        [subs.length ? `${sd}/${subs.length} sub-tasks done` : '', t.note ? (subs.length ? 'has a note' : 'Has a note') : '']
          .filter(Boolean)
          .join(', ') + ', show details',
      );
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
      c.setAttribute('aria-checked', s.done);
      c.setAttribute('aria-label', s.text);
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
  function updateRow(li, t) {
    li.classList.toggle('done', t.done);
    const ck = li.querySelector('.in .ck');
    ck.setAttribute('aria-checked', t.done);
    ck.setAttribute('aria-label', t.text);
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
    const open = openIds.has(t.id);
    if (li.classList.contains('open') !== open) {
      li.classList.toggle('open', open);
      li.querySelector('.more').hidden = !open;
      li.querySelector('.ex').setAttribute('aria-expanded', open);
    }
  }
  function renderList(fresh) {
    const ae = D().activeElement,
      want = ordered(cur),
      map = new Map(),
      added = [];
    for (const n of $.list.children) if (!n.classList.contains('exit')) map.set(n.dataset.id, n);
    let prev = null;
    for (const t of want) {
      let n = map.get(t.id);
      if (n) map.delete(t.id);
      else {
        n = makeRow(t);
        added.push(n);
      }
      updateRow(n, t);
      let ref = prev ? prev.nextSibling : $.list.firstChild;
      while (ref && ref.classList.contains('exit')) ref = ref.nextSibling;
      if (n !== ref) $.list.insertBefore(n, ref);
      prev = n;
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
    const rows = [...$.list.children].filter(r => !r.classList.contains('exit'));
    const first = new Map(rows.map(r => [r.dataset.id, r.getBoundingClientRect().top]));
    mutate();
    for (const r of $.list.children) {
      if (r.classList.contains('exit')) continue;
      const f = first.get(r.dataset.id);
      r.getAnimations().forEach(a => {
        if (a.id === 'flip') a.cancel();
      });
      if (f == null) continue;
      const dy = f - r.getBoundingClientRect().top,
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
    for (const k in S.days) if (k < tk) for (const t of S.days[k].tasks) if (!t.done) out.push([k, t]);
    return out;
  }
  function renderAux() {
    const { n } = status();
    $.empty.hidden = n > 0;
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
    const k = addDay();
    if (k !== cur) return addElsewhere(text, k);
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
    record([cur]);
    t.done = !t.done;
    if (t.done) t.at = Date.now();
    else delete t.at;
    commit(cur);
    const li = rowOf(id);
    updateRow(li, t);
    const { n, dn } = status();
    if (t.done)
      an(li.querySelector('.in .ck'), [{ transform: 'scale(.8)' }, { transform: 'none' }], {
        easing: POP.ease,
        duration: POP.dur,
      });
    if (t.done && n && dn === n)
      an($.num, [{ transform: 'translateY(-7px)' }, { transform: 'none' }], {
        easing: POP.ease,
        duration: POP.dur,
        delay: 120,
      });
    resortSoon(t.done ? 560 : 260);
  }
  function removeTask(id, how) {
    const k = cur,
      nk = addDays(k, 1),
      arr = tasks(k),
      i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    record(how === 'mv' ? [k, nk] : [k]);
    const [t] = arr.splice(i, 1);
    if (how === 'mv') {
      t.done = false;
      delete t.at;
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
      open = ids.map(id => d.tasks.find(t => t.id === id)).filter(Boolean);
    if (
      open.map(t => t.id).join() ===
      d.tasks
        .filter(t => !t.done)
        .map(t => t.id)
        .join()
    )
      return false;
    record([cur]);
    d.tasks = [...open, ...d.tasks.filter(t => t.done)];
    commit(cur);
    return true;
  }
  function reorder(id, dir) {
    const ids = tasks(cur)
        .filter(t => !t.done)
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
      moving.push(...d.tasks.filter(t => !t.done));
      d.tasks = d.tasks.filter(t => t.done);
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
      const tg = p.tgt.closest('.tag');
      if (tg) {
        openSearch('#' + tg.dataset.tag + ' ');
        return;
      }
      tapRow(p.li, p.tgt, e.clientX, e.clientY);
    }
  }
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
    addTo = null;
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
  let wAcc = 0,
    wLock = false,
    wT = null;
  app.addEventListener(
    'wheel',
    e => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || P || $.srch.classList.contains('on')) return;
      e.preventDefault();
      stop(wT);
      wT = later(() => {
        wAcc = 0;
        wLock = false;
      }, 200);
      if (wLock) return;
      wAcc += e.deltaX;
      if (Math.abs(wAcc) > 46) {
        wLock = true;
        step(wAcc > 0 ? 1 : -1);
      }
    },
    { passive: false },
  );

  /* popovers: month and timer */
  let popM = null,
    dpM = null;
  const popOn = () => ['pop', 'tpop', 'dpop'].some(id => $[id].classList.contains('on'));
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
  function openMonth() {
    closePops();
    const d = fromKey(cur);
    popM = new Date(d.getFullYear(), d.getMonth(), 1);
    renderPop(0);
    $.pop.classList.add('on');
    $.meta.setAttribute('aria-expanded', 'true');
    const s = $.grid.querySelector('.s');
    if (s) s.focus({ preventScroll: true });
  }
  function openTimer() {
    closePops();
    $.tpop.classList.add('on');
    $.tmb.setAttribute('aria-expanded', 'true');
    segRender(false);
    tmShowRun(TM.st !== 'idle', false);
    tpRender(0);
    tmRender(false);
    hideTip(0);
    (TM.st === 'idle' ? $.tstart : $.tpause).focus({ preventScroll: true });
  }
  function closePops(back) {
    const wasM = $.pop.classList.contains('on'),
      wasT = $.tpop.classList.contains('on'),
      wasD = $.dpop.classList.contains('on');
    $.pop.classList.remove('on');
    $.tpop.classList.remove('on');
    $.dpop.classList.remove('on');
    $.meta.setAttribute('aria-expanded', 'false');
    $.tmb.setAttribute('aria-expanded', 'false');
    $.dchip.setAttribute('aria-expanded', 'false');
    if (back) {
      if (wasM) $.meta.focus({ preventScroll: true });
      else if (wasT) $.tmb.focus({ preventScroll: true });
      else if (wasD) $.dchip.focus({ preventScroll: true });
    }
    if (wasD) composerLeft();
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
  $.grid.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (b) {
      closePops(true);
      go(b.dataset.k);
    }
  };
  function onOutside(e) {
    const t = e.target && e.target.closest ? e.target : null;
    if (popOn() && !(t && t.closest('#pop,#meta,#tpop,#tmb,#dpop,#dchip'))) closePops();
    if (t && t.closest('#fmt,#lb,#sug,#toast,.srch,#dpop')) return;
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
  function segRender(anim) {
    const bs = [...$.seg.querySelectorAll('button')],
      a = bs.find(b => b.dataset.m === TM.mode) || bs[0],
      ind = $.seg.querySelector('i');
    bs.forEach(b => b.setAttribute('aria-checked', b === a));
    if (!anim) ind.style.transition = 'none';
    ind.style.width = a.offsetWidth + 'px';
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
    if (!anim) {
      ind.getBoundingClientRect();
      ind.style.transition = '';
    }
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
      const tags = allTags();
      prevIds = new Set();
      $.sq.setAttribute('aria-expanded', 'false');
      $.slist.removeAttribute('role');
      $.scount.textContent = '';
      $.slist.innerHTML =
        `<p class="shint">Search tasks, notes and sub-tasks on every day. Type # to filter by tag.</p>` +
        (tags.length
          ? `<div class="chips">${tags
              .slice(0, 40)
              .map(
                ([g, c]) =>
                  `<button type="button" class="chip" data-tag="${esc(g)}">#${esc(g)}<span>${c}</span></button>`,
              )
              .join('')}</div>`
          : '') +
        `<div class="sdata"><p class="shint">${cloud.col ? 'Your tasks are saved in this browser and in your private space on Claude.' : 'Your tasks are stored only in this browser. Nothing is sent anywhere.'}</p><div class="chips"><button type="button" class="chip" data-act="export">${canTop ? 'Export backup' : 'Copy backup'}</button><button type="button" class="chip" data-act="import">Import backup</button></div>${aboutHTML()}</div>`;
      moveHl();
      return;
    }
    SR = search(qs);
    SEL = 0;
    $.sq.setAttribute('aria-expanded', SR.length ? 'true' : 'false');
    if (SR.length) $.slist.setAttribute('role', 'listbox');
    else $.slist.removeAttribute('role');
    $.scount.textContent = SR.length ? `${SR.length} ${SR.length > 1 ? 'results' : 'result'}` : 'No results';
    if (!SR.length) {
      $.slist.innerHTML = `<p class="shint">No tasks match “${esc(qs.trim())}”.</p>`;
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
      return `<button type="button" role="option" id="sr-${i}" tabindex="-1" class="sr${t.done ? ' done' : ''}" data-i="${i}" data-id="${esc(t.id)}"><span class="mini"></span><span class="tt"><span class="ti">${hlText(title, words)}</span>${tags.map(g => `<span class="tag" data-tag="${esc(g)}">#${esc(g)}</span> `).join('')}${sn ? `<span class="sn">${sn}</span>` : ''}</span><span class="dd">${esc(dayLabel(r.e.k))}</span></button>`;
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
    const links = [...f.querySelectorAll('a')].map(a => a.cloneNode(true).outerHTML);
    return `<p class="about">${links.join('')}</p>`;
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
    $.srch.inert = false;
    $.srch.classList.add('on');
    renderSearch();
    $.sq.focus({ preventScroll: true });
    const n = $.sq.value.length;
    $.sq.setSelectionRange(n, n);
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
  function closeSearch(restore = true) {
    if (!$.srch.classList.contains('on')) return;
    $.srch.classList.remove('on');
    $.srch.inert = true;
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
      act.dataset.act === 'export' ? exportData() : $.impf.click();
      return;
    }
    const tg = e.target.closest('[data-tag]');
    if (tg) {
      $.sq.value = '#' + tg.dataset.tag + ' ';
      renderSearch();
      $.sq.focus();
      return;
    }
    const b = e.target.closest('.sr');
    if (b) openResult(+b.dataset.i);
  });
  $.slist.addEventListener('pointermove', e => {
    const b = e.target.closest('.sr');
    if (b && +b.dataset.i !== SEL) {
      SEL = +b.dataset.i;
      moveHl();
    }
  });

  /* backup: export and import */
  function exportData() {
    const data = JSON.stringify(
      { app: 'one-day', version: 1, exported: new Date().toISOString(), days: S.days },
      null,
      1,
    );
    if (canTop) {
      try {
        const u = URL.createObjectURL(new Blob([data], { type: 'application/json' })),
          a = D().createElement('a');
        a.href = u;
        a.download = `one-day-backup-${todayKey()}.json`;
        D().body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 4000);
        toast('Backup downloaded');
        return;
      } catch (e) {}
    }
    navigator.clipboard.writeText(data).then(
      () => toast('Backup copied to the clipboard'),
      () => toast('This browser blocked the backup'),
    );
  }
  $.impf.addEventListener('change', async () => {
    const f = $.impf.files && $.impf.files[0];
    $.impf.value = '';
    if (!f) return;
    if (f.size > 5e6) {
      toast('That file is too large to be a backup');
      return;
    }
    let j = null;
    try {
      j = JSON.parse(await f.text());
    } catch (e) {}
    if (!j || j.app !== 'one-day' || !j.days || typeof j.days !== 'object') {
      toast('That file isn’t a One Day backup');
      return;
    }
    const keys = Object.keys(j.days)
      .filter(k => /^\d{4}-\d\d-\d\d$/.test(k))
      .slice(0, 5000);
    if (!keys.length) {
      toast('That backup is empty');
      return;
    }
    record(keys);
    let added = 0;
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
    toast(
      added ? `Imported ${added} ${added > 1 ? 'tasks' : 'task'}` : 'Nothing new in that backup',
      added ? 'undo' : null,
    );
  });

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
          `<button type="button" role="option" data-i="${i}" class="${i === SG.sel ? 'sel' : ''}" aria-selected="${i === SG.sel}">#${esc(g)}<span>${c}</span></button>`,
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

  /* composer */
  $.input.addEventListener('input', () => {
    $.add.classList.toggle('typing', !!$.input.value.trim());
    sugCheck($.input);
  });
  $.input.addEventListener('blur', hideSug);
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
     The pick holds while you keep adding, and goes back to the day on screen once you leave the composer. */
  let addTo = null;
  const addDay = () => addTo || cur;
  const LONG = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayName = k => {
    const n = diff(todayKey(), k);
    return Math.abs(n) <= 1 ? relLabel(k).toLowerCase() : LONG.format(fromKey(k)) + (k.slice(0, 4) !== todayKey().slice(0, 4) ? ' ' + k.slice(0, 4) : '');
  };
  function renderChip(pop) {
    const k = addDay();
    $.dlabel.textContent = dayLabel(k);
    $.dchip.classList.toggle('set', k !== cur);
    $.dchip.setAttribute('aria-label', `${dayLabel(k)}: new tasks go to ${dayName(k)}. Choose another day`);
    if (pop)
      an($.dchip, [{ transform: 'scale(.9)' }, { transform: 'none' }], { easing: POP.ease, duration: POP.dur });
  }
  function setAddTo(k) {
    const was = addDay();
    addTo = k === cur ? null : k;
    renderChip(k !== was);
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
    $.dpT.textContent = MO.format(dpM);
    $.dgrid.innerHTML = gridHTML(dpM, addDay());
    if (d)
      an($.dgrid, [
        { opacity: 0, transform: `translateX(${d * 18}px)` },
        { opacity: 1, transform: 'none' },
      ]);
  }
  function openDpop() {
    closePops();
    hideTip(0);
    hideSug();
    const d = fromKey(addDay());
    dpM = new Date(d.getFullYear(), d.getMonth(), 1);
    renderDpop(0);
    place($.dpop, $.dchip.getBoundingClientRect(), 'up');
    $.dchip.setAttribute('aria-expanded', 'true');
    const s = $.dgrid.querySelector('.s');
    if (s) s.focus({ preventScroll: true });
  }
  function pickDay(k) {
    setAddTo(k);
    $.dpop.classList.remove('on');
    $.dchip.setAttribute('aria-expanded', 'false');
    $.input.focus({ preventScroll: true });
  }
  // Called whenever focus may have left the composer: back to the day on screen.
  function composerLeft() {
    later(() => {
      const ae = D().activeElement;
      if (addTo && !$.dpop.classList.contains('on') && !(ae && ($.add.contains(ae) || $.dpop.contains(ae)))) {
        addTo = null;
        renderChip();
      }
    }, 0);
  }
  $.dchip.onclick = () => ($.dpop.classList.contains('on') ? closePops(true) : openDpop());
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
  $.dpop.addEventListener('focusout', composerLeft);

  /* toast */
  let toastTm = null,
    toastAct = null;
  function toast(msg, act, ms = 4200) {
    const was = $.toast.classList.contains('on');
    $.toastTxt.textContent = msg;
    toastAct = act || null;
    $.undo.hidden = !act;
    $.undo.textContent = act === 'redo' ? 'Redo' : 'Undo';
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
    toastAct === 'redo' ? redo() : undo();
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
    if (m && !e.altKey && (kl === 'z' || kl === 'y')) {
      const own = t.isContentEditable || (/^(INPUT|TEXTAREA)$/.test(t.tagName) && t.value);
      if (!own) {
        e.preventDefault();
        kl === 'y' || e.shiftKey ? redo() : undo();
      }
      return;
    }
    if (m && kl === 'k' && !(t.closest && t.closest('.note'))) {
      e.preventDefault();
      openSearch();
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
      if (t.closest('#pop,#tpop,#dpop')) return;
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
      case 'Escape':
        if (t.blur) t.blur();
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
      th = document.documentElement.dataset.theme;
    pd.documentElement.lang = 'en';
    if (th) pd.documentElement.dataset.theme = th;
    pd.title = 'One Day';
    document.querySelectorAll('link[rel=stylesheet],style').forEach(n => pd.head.append(n.cloneNode(true)));
    cancelDrag();
    closePops();
    hideTip(0);
    hideFmt();
    hideLb();
    hideSug();
    pd.body.append(app);
    document.body.classList.add('floating');
    setFloatUI(true);
    pip.addEventListener('keydown', onKey);
    bindDoc(pd);
    tmLoop();
    pip.addEventListener(
      'pagehide',
      () => {
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
        home.prepend(app);
        pip = null;
        document.body.classList.remove('floating');
        setFloatUI(false);
        repaint();
        tmLoop();
      },
      { once: true },
    );
  }
  // Animations belong to the document they started in. When the floating window closes, any that ran
  // there stop applying, so the app is redrawn from its state instead of trusting what is on screen.
  function settle() {
    if (app.getAnimations) for (const a of app.getAnimations({ subtree: true })) a.cancel();
    app.querySelectorAll('.ghost,.exit,.dg .out').forEach(n => n.remove());
  }
  function repaint() {
    settle();
    for (const el of [$.num, $.tv, $.tbig, $.tpv]) delete el.dataset.v;
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
  if (!('documentPictureInPicture' in window) || !canTop || TOUCH) $.float.hidden = true;
  document.getElementById('back').onclick = () => pip && pip.close();

  /* sync: the hosted page keeps days in a private store; the local file keeps them in this browser */
  const cloud = {
    col: null,
    ready: false,
    remote: {},
    t: {},
    busy: new Set(),
    dirty: new Set(),
    async init() {
      if (!window.claude || typeof claude.use !== 'function') return;
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
          S.days[k] = { u, tasks: clean(v.tasks) };
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
      if (!this.col) return;
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
        await this.col.doc('day-' + k).set({ u: v.u, tasks: clean(v.tasks) });
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
    natural() {
      let h = q('header').offsetHeight + $.stage.offsetHeight + $.add.offsetHeight;
      if ($.srch.classList.contains('on'))
        h = Math.max(h, q('.sbar').offsetHeight + 16 + 40 + $.slist.offsetHeight);
      return Math.min(h, this.max());
    },
    snap() {
      this.stop();
      this.h = this.target = this.on ? this.natural() : 0;
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
      app.style.height = '';
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
  renderHeader(0);
  renderList(true);
  renderAux();
  renderChip();
  tmSync();
  tmRender(false);
  tpRender(0);
  function intro() {
    app.classList.remove('pre');
    sheet.init();
    if (RM.matches) return;
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
    fill.style.transform = 'scaleX(0)';
    fill.getBoundingClientRect();
    fill.style.transition = '';
    later(() => {
      fill.style.transform = f;
    }, 720);
    an(q('.rule'), [{ transform: 'scaleX(0)' }, { transform: 'none' }], { ...B, duration: SP.dur * 1.4 });
    [$.prev, $.next, $.sb, $.tmb, $.float].forEach((b, i) =>
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
  ]).then(intro);
  bindDoc(document);
  cloud.init();
  if (
    'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost') &&
    document.querySelector('link[rel=manifest]')
  )
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
