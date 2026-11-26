/* One Day's app for iPhone, iPad and Mac: this runs in each page of the app, before the page's own code.
   The app serves the site from inside itself (oneday://localhost/) and keeps what the page saves in a file of its own,
   because a web view's storage is not the app's to keep: iOS may empty it when the device runs short of space.
   - Every change to a key the page keeps goes to the app, numbered in one line: `oneday.app` holds the last number
     here, and the app's file holds the last one it got. The keys are listed (KEYS): the tasks, the lock's vault, the
     timer, the theme. Nothing else, a cloud's sign-in answer least of all.
   - When a page opens, the newer copy wins: the app's file when the web view's copy is older or gone; the web view's
     when the app missed its last changes (it was closed before it wrote them), and then they all go to the app.
   - The app has no service worker (its files are in the app already) and no passkeys (a passkey belongs to a website:
     the app will unlock with Face ID or Touch ID instead).
   The app puts what it holds, { platform, version, icloud, seq, items }, in place of the BOOT mark on the last line.
   iCloud itself has a bridge of its own, which answers (webkit.messageHandlers.onedayCloud; see CloudBridge.swift). */
(function (boot) {
  'use strict';
  const host = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.oneday;
  if (!host || !boot || typeof boot !== 'object') return;
  const post = m => {
    try {
      host.postMessage(m);
    } catch (e) {}
  };

  try {
    delete Navigator.prototype.serviceWorker;
  } catch (e) {}
  try {
    delete window.PublicKeyCredential;
  } catch (e) {}
  try {
    Object.defineProperty(window, 'oneDayApp', {
      value: Object.freeze({ platform: String(boot.platform || ''), version: String(boot.version || ''), icloud: boot.icloud === true }),
    });
  } catch (e) {}

  // The footer's coffee goes to Ko-fi, a payment outside the App Store, which an app may not offer. In the app it is an
  // apple instead: a tip through Apple, in the app's own sheet (TipJar.swift). More and search's foot copy the footer's
  // link as it is, so they follow; a click on any of them opens the sheet and goes nowhere.
  const apple = () => {
    const k = document.querySelector('#foot .kofi');
    if (!k) return;
    k.textContent = 'Buy me an 🍎';
    k.setAttribute('aria-label', 'Buy me an apple, a tip through the App Store');
    k.setAttribute('href', '#tip');
    k.removeAttribute('target');
    k.removeAttribute('rel');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apple, { once: true });
  else apple();
  addEventListener(
    'click',
    e => {
      const a = e.target && e.target.closest && e.target.closest('a.kofi');
      if (!a) return;
      e.preventDefault();
      post({ op: 'tip' });
    },
    true,
  );

  // what goes wrong in the page reaches the app's log
  addEventListener('error', e => {
    if (e.error || e.message) post({ op: 'error', message: `${e.message || e.error} (${e.filename || ''}:${e.lineno || 0})` });
  });
  addEventListener('unhandledrejection', e => {
    const r = e.reason;
    post({ op: 'rejection', message: String((r && (r.stack || r.message)) || r) });
  });

  let ls = null;
  try {
    ls = window.localStorage;
  } catch (e) {}
  if (!ls) return;
  const P = Storage.prototype,
    get = P.getItem,
    set = P.setItem,
    del = P.removeItem,
    clear = P.clear,
    keyAt = P.key,
    SEQ = 'oneday.app',
    KEYS = new Set(['oneday.v1', 'oneday.vault', 'oneday.timer', 'oneday.theme']),
    kept = k => KEYS.has(k),
    items = boot.items && typeof boot.items === 'object' ? boot.items : {},
    ours = () => {
      const o = {};
      for (let i = 0; i < ls.length; i++) {
        const k = keyAt.call(ls, i);
        if (kept(k)) o[k] = get.call(ls, k);
      }
      return o;
    };
  let seq = Math.max(0, parseInt(get.call(ls, SEQ), 10) || 0);
  const bootSeq = Math.max(0, Math.floor(+boot.seq) || 0);
  if (seq < bootSeq) {
    // the app's file is newer: the web view lost its storage, or the app's copy moved on without it
    try {
      for (const k of Object.keys(ours())) if (!Object.prototype.hasOwnProperty.call(items, k)) del.call(ls, k);
      for (const k of Object.keys(items)) if (kept(k) && typeof items[k] === 'string') set.call(ls, k, items[k]);
      seq = bootSeq;
      set.call(ls, SEQ, String(seq));
    } catch (e) {
      post({ op: 'error', message: `The app's saved copy did not fit in the page: ${e && e.name}` });
    }
  } else if (seq > bootSeq) {
    // the app missed the last changes made here: they all go to it now
    post({ op: 'store.all', seq, items: ours() });
  }

  const next = () => {
    seq++;
    try {
      set.call(ls, SEQ, String(seq));
    } catch (e) {}
    return seq;
  };
  P.setItem = function (k, v) {
    set.call(this, k, v);
    k = String(k);
    if (this === ls && kept(k)) post({ op: 'store.set', seq: next(), key: k, value: String(v) });
  };
  P.removeItem = function (k) {
    k = String(k);
    const had = this === ls && kept(k) && get.call(ls, k) !== null;
    del.call(this, k);
    if (had) post({ op: 'store.remove', seq: next(), key: k });
  };
  P.clear = function () {
    const mine = this === ls;
    clear.call(this);
    if (mine) post({ op: 'store.all', seq: next(), items: {} });
  };
})(/*BOOT*/null);
