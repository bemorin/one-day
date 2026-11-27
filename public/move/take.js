/*! One Day — where the tasks from day.bemorin.com come in (see "moving to getone.day" in app.js). MIT License.
   One Day at day.bemorin.com opened this window to hand it the tasks that browser keeps there, page to page: only that
   address's page is listened to, and only the window that opened this one. The tasks are kept aside in this browser's
   storage for getone.day, until One Day opens here and adds them, overwriting nothing; then this window closes, or
   becomes One Day. A long link after # is the other way in: the tasks are taken out of the address at once, One Day
   asks before adding them, and only then tells day.bemorin.com that they arrived. Nothing is sent anywhere. */
(() => {
  'use strict';
  const OLD = 'https://day.bemorin.com',
    note = document.getElementById('note'),
    go = document.getElementById('go'),
    TE = new TextEncoder(),
    TD = new TextDecoder(),
    say = (t, link) => {
      note.textContent = t;
      go.hidden = !link;
    };
  const hex = async s =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', TE.encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  // the same Base64 as One Day's links (URL-safe, no padding)
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
  // through a (de)compression stream, refusing to grow past `max` bytes
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
  // One Day's own move, in the shape app.js sends it: its tasks in clear, or still locked
  const fits = p =>
    !!p &&
    typeof p === 'object' &&
    p.kind === 'one-day-move' &&
    p.v === 1 &&
    ((!!p.tasks && typeof p.tasks === 'object' && !!p.tasks.days && typeof p.tasks.days === 'object') ||
      (!!p.vault && typeof p.vault === 'object' && !!p.vault.data));
  // kept aside, compressed, for One Day to add when it opens here: '' when kept, or why not
  async function keep(json, sum, via, id = '') {
    let p = null;
    try {
      p = JSON.parse(json);
    } catch (e) {}
    if (!fits(p)) return 'bad';
    const z = b64.enc(await through(TE.encode(json), new CompressionStream('deflate-raw'), 64e6));
    try {
      localStorage.setItem('oneday.incoming', JSON.stringify({ v: 1, via, from: OLD, at: Date.now(), sum, z, ...(id ? { id } : {}) }));
    } catch (e) {
      return 'full';
    }
    return '';
  }
  const WHY = {
    full: 'This browser has no room left for these tasks at getone.day.',
    bad: 'These tasks could not be read.',
  };

  // The link way: the tasks after #, taken out of the address before anything else, and kept with the number
  // day.bemorin.com gave the move. One Day opens here and asks; once they are added, it hands that number back.
  const h = location.hash;
  if (/^#v1\./.test(h)) {
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) {}
    fromLink(h.slice(4));
    return;
  }
  async function fromLink(rest) {
    const m = /^([\w-]{8,40})\.([\w-]+)$/.exec(rest);
    if (!m) return say('That link doesn’t hold tasks.', true);
    let sum = '',
      why = 'bad';
    try {
      const json = TD.decode(await through(b64.dec(m[2]), new DecompressionStream('deflate-raw'), 64e6));
      sum = await hex(json);
      why = await keep(json, sum, 'link', m[1]);
    } catch (e) {
      why = 'bad';
    }
    if (why) return say(WHY[why], true);
    say('Your tasks are at getone.day.');
    location.replace('../');
  }

  // The window way: One Day at day.bemorin.com opened this window, and is told it is ready.
  const op = window.opener;
  if (!op) return say('Nothing is on its way here. To bring your tasks over, open One Day at day.bemorin.com in this browser.', true);
  const tell = m => {
    try {
      op.postMessage({ type: 'one-day-move', v: 1, ...m }, OLD);
    } catch (e) {}
  };
  let after = null;
  addEventListener('message', async e => {
    if (e.origin !== OLD || e.source !== op) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.type !== 'one-day-move' || d.v !== 1) return;
    if (d.step === 'data') {
      if (
        typeof d.id !== 'string' ||
        !/^[\w-]{8,40}$/.test(d.id) ||
        typeof d.json !== 'string' ||
        d.json.length > 6e7 ||
        typeof d.sum !== 'string' ||
        !/^[0-9a-f]{64}$/.test(d.sum)
      )
        return;
      let why = 'bad';
      try {
        if ((await hex(d.json)) === d.sum) why = await keep(d.json, d.sum, 'window');
      } catch (err) {
        why = 'bad';
      }
      if (why) {
        say(WHY[why], true);
        return tell({ step: 'failed', id: d.id, why });
      }
      say('Your tasks are at getone.day.');
      tell({ step: 'done', id: d.id, sum: d.sum });
      // in case day.bemorin.com says nothing more (its tab closed meanwhile): One Day opens here
      clearTimeout(after);
      after = setTimeout(() => location.replace('../'), 15e3);
    } else if (d.step === 'close') {
      clearTimeout(after);
      window.close();
      say('Done: One Day is open in the other tab. You can close this one.', true);
    } else if (d.step === 'open') {
      // an installed app's move: this window becomes One Day, with the link's tasks it was opened with, if any
      clearTimeout(after);
      location.replace('../' + (typeof d.hash === 'string' && /^#add[=?]/.test(d.hash) ? d.hash : ''));
    }
  });
  tell({ step: 'ready' });
})();
