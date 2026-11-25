/* One Day's app for iPhone, iPad and Mac: this runs in each page of the app, before the page's own code.
   The app serves the site from inside itself (oneday://localhost/) and keeps what the page saves in a file of its own,
   because a web view's storage is not the app's to keep: iOS may empty it when the device runs short of space.
   - Every change to a key the page keeps (localStorage, the `oneday.*` keys) goes to the app, numbered in one line:
     `oneday.app` holds the last number here, and the app's file holds the last one it got.
   - When a page opens, the newer copy wins: the app's file when the web view's copy is older or gone; the web view's
     when the app missed its last changes (it was closed before it wrote them), and then they all go to the app.
   - The app has no service worker (its files are in the app already) and no passkeys (a passkey belongs to a website:
     the app will unlock with Face ID or Touch ID instead).
   The app puts what it holds, { platform, version, seq, items }, in place of the BOOT mark on the last line. */
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
      value: Object.freeze({ platform: String(boot.platform || ''), version: String(boot.version || '') }),
    });
  } catch (e) {}

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
    kept = k => typeof k === 'string' && k.startsWith('oneday.') && k !== SEQ,
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
