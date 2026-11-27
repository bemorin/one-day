/*! One Day — its address moved, from day.bemorin.com to getone.day. MIT License. */
'use strict';
/* One Day moved from day.bemorin.com to getone.day. A browser keeps a site's tasks for that site's address alone, so
   the old address can't simply send everyone on: what this browser keeps there decides, here, before anything else
   runs.
   - Nothing kept there: on to getone.day at once, with the rest of the address (an assistant's #add link as well).
   - Tasks kept, not moved yet: One Day opens as before and offers to bring them over (see "moving to getone.day" in
     app.js). They go from page to page, in this browser, never through a server.
   - Moved: on to getone.day, every time. If the tasks kept here changed since (an old tab, say), it offers again.
     The copy left here goes only when asked, from getone.day, and after a yes here.
   Nothing is sent anywhere from this page. */
const MOVE = (() => {
  const OLD = 'https://day.bemorin.com',
    NEW = 'https://getone.day';
  // The tasks kept here, in a few characters: the same tasks always give the same mark, whatever else is kept with
  // them (sync's key, say). FNV-1a: it tells a change, it is no secret.
  const sig = (v1, vk) => {
    let s = '';
    try {
      const v = vk && JSON.parse(vk);
      if (v && v.data) s = 'v' + JSON.stringify(v.data);
      else {
        const o = v1 && JSON.parse(v1);
        if (o && o.days) s = 't' + JSON.stringify({ days: o.days, rules: o.rules || {}, tags: o.tags || {} });
      }
    } catch (e) {}
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return s.length.toString(36) + '.' + (h >>> 0).toString(36);
  };
  const me = location.origin === OLD ? 'old' : location.origin === NEW ? 'new' : '',
    base = { OLD, NEW, sig };
  if (me !== 'old') return Object.freeze({ ...base, mode: me });

  const ls = k => {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    put = (k, v) => {
      try {
        localStorage.setItem(k, v);
        return true;
      } catch (e) {
        return false;
      }
    },
    drop = k => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    },
    // the address without what follows #, also for what is sent on to getone.day
    clean = () => {
      h = '';
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {}
    };
  // Tasks kept here: locked ones (they can't be seen, so they count), or anything One Day was given. The day it shows
  // the first time, never touched, isn't kept at all; what can't be read counts, so One Day opens on it.
  const kept = (v1, vk) => {
    if (vk) return true;
    if (!v1) return false;
    try {
      const o = JSON.parse(v1);
      if (!o || typeof o !== 'object') return false;
      if (o.sync) return true;
      if (o.rules && Object.keys(o.rules).length) return true;
      if (o.tags && Object.keys(o.tags).length) return true;
      return !!o.days && typeof o.days === 'object' && Object.values(o.days).some(d => d && d.u);
    } catch (e) {
      return true;
    }
  };
  let h = location.hash;
  const v1 = ls('oneday.v1'),
    vk = ls('oneday.vault'),
    has = kept(v1, vk),
    now = has ? sig(v1, vk) : '',
    page = location.pathname === '/' || location.pathname === '/index.html';
  let moved = null;
  try {
    moved = JSON.parse(ls('oneday.moved'));
  } catch (e) {}
  if (!moved || typeof moved !== 'object' || moved.to !== NEW) moved = null;
  // a move by link that never came back within a day (a Cancel at getone.day, say): its number and copy go
  try {
    const w = JSON.parse(ls('oneday.moving'));
    if (w && !(Date.now() - w.at < 864e5)) drop('oneday.moving');
  } catch (e) {
    drop('oneday.moving');
  }
  // the Android app's mark, kept by this address for its tab: getone.day is told it too, as the address can't carry it
  let play = false;
  try {
    play = sessionStorage.getItem('oneday.app') === 'android' && !/[?&]app=android(&|$)/.test(location.search);
  } catch (e) {}
  const mode = m => Object.freeze({ ...base, mode: m, moved, has }),
    // on to getone.day: the same page there, with what follows ? and #, unless told otherwise
    on = (hash = h, path = location.pathname) => {
      const q = location.search + (play ? (location.search ? '&' : '?') + 'app=android' : '');
      location.replace(NEW + path + q + hash);
      return mode('gone');
    };

  if (page) {
    // Back from getone.day, once the tasks sent there by a link are added (after a yes there): the number this browser
    // kept for that move, which no other page can know, says they arrived. Then sync stops here (its key and sign-in
    // leave what this browser keeps, and the other tabs stop too), and this browser remembers the move.
    const back = /^#moved=([\w-]{8,40})\.([0-9a-f]{64})$/.exec(h);
    if (back) {
      let w = null;
      try {
        w = JSON.parse(ls('oneday.moving'));
      } catch (e) {}
      if (w && w.id === back[1] && w.sum === back[2] && Date.now() - w.at < 864e5) {
        try {
          const o = v1 && JSON.parse(v1);
          if (o && o.sync) {
            delete o.sync;
            put('oneday.v1', JSON.stringify(o));
          }
          const v = vk && JSON.parse(vk);
          if (v && v.sync) {
            delete v.sync;
            put('oneday.vault', JSON.stringify(v));
          }
        } catch (e) {}
        try {
          const bc = new BroadcastChannel('one-day-sync');
          bc.postMessage({ t: 'stop' });
          bc.close();
        } catch (e) {}
        const m = { to: NEW, at: Date.now(), n: +w.n || 0, sig: w.sig || now, how: 'link' };
        // with the copy that went, to tell later what changed here since (see moveMerge in app.js), if there is room
        if (!(typeof w.keep === 'string' && put('oneday.moved', JSON.stringify({ ...m, keep: w.keep })))) put('oneday.moved', JSON.stringify(m));
        drop('oneday.moving');
        return on(typeof w.hash === 'string' && /^#add[=?]/.test(w.hash) ? w.hash : '', '/');
      }
      // not this browser's move, or one long gone: nothing is remembered, and getone.day, where it came from, opens
      return on('', '/');
    }
    // asked from getone.day: the copy left here, cleared after a yes
    if (h === '#clear-old-copy') {
      if (moved && !has) return on('#old-copy-cleared', '/');
      if (moved && now === moved.sig) {
        clearCard(moved);
        return mode('clear');
      }
      clean();
      if (moved) return mode('again');
    }
    // asked from getone.day, which holds no tasks yet: offered here (again, even after a move), or nothing to bring
    if (h === '#bring') {
      if (!has) return on('#nothing-to-bring', '/');
      clean();
      return mode('old');
    }
  }
  if (moved) {
    if (!has) return on();
    if (now !== moved.sig) return mode('again');
    // moved by a backup file, from an app on a Home Screen: no other page can reach the copy kept here, so nothing is
    // sent on; One Day says where it lives now, and the copy stays at hand
    return moved.how === 'file' ? mode('filed') : on();
  }
  return has ? mode('old') : on();

  // Clear the old copy? Its own small card: One Day doesn't open behind it.
  function clearCard(m) {
    document.documentElement.classList.add('gone');
    document.addEventListener('DOMContentLoaded', () => {
      const card = document.getElementById('mvclr'),
        yes = document.getElementById('mvcYes'),
        no = document.getElementById('mvcNo');
      if (!card || !yes || !no) return on('', '/');
      card.hidden = false;
      no.onclick = () => on('', '/');
      card.addEventListener('keydown', e => e.key === 'Escape' && on('', '/'));
      yes.onclick = () => {
        // the lock's passkey belonged to this address: the device's passkey manager may forget it now
        try {
          const v = JSON.parse(ls('oneday.vault'));
          if (v && v.bio && typeof v.bio.id === 'string' && window.PublicKeyCredential && PublicKeyCredential.signalUnknownCredential)
            PublicKeyCredential.signalUnknownCredential({
              rpId: location.hostname,
              credentialId: v.bio.id.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
            }).catch(() => {});
        } catch (e) {}
        for (const k of ['oneday.v1', 'oneday.vault', 'oneday.timer', 'oneday.theme', 'oneday.install', 'oneday.signedin', 'oneday.moving']) drop(k);
        // only that the move happened stays, so that every visit goes on: no task, and not the copy that went
        put('oneday.moved', JSON.stringify({ to: NEW, at: m.at, sig: m.sig, cleared: Date.now() }));
        on('#old-copy-cleared', '/');
      };
      // the safe choice first: Enter keeps the copy
      no.focus();
    });
  }
})();
