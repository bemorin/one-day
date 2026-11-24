/*! One Day — where a cloud sends you back after you sign in to it (see "sync" in app.js). MIT License.
   The cloud's answer is in this page's address, after ? or #: a one-time code, or for Google a token, with the random
   state of the sign-in One Day started. On a computer the sign-in has a window of its own: the answer goes to One Day
   on a channel only this site's pages hear, and the window closes. On a phone the cloud's page opened in One Day's own
   window: the answer is left for this tab alone (its session storage), and One Day opens again with it. One Day takes it
   only if its state is the one it is waiting for. Nothing is sent anywhere, and the address is cleaned at once. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search),
    h = new URLSearchParams(location.hash.slice(1));
  function get(k) {
    return (h.get(k) || q.get(k) || '').slice(0, 4096);
  }
  var ans = {
    type: 'one-day-oauth',
    state: get('state'),
    code: get('code'),
    token: get('access_token'),
    expires: get('expires_in'),
    scope: get('scope'),
    error: get('error'),
  };
  try {
    history.replaceState(null, '', location.pathname);
  } catch (e) {}
  var note = document.getElementById('note');
  if (/\.p$/.test(ans.state)) {
    try {
      var bc = new BroadcastChannel('one-day-oauth');
      bc.postMessage(ans);
      bc.close();
    } catch (e) {}
    try {
      if (window.opener) window.opener.postMessage(ans, location.origin);
    } catch (e) {}
    setTimeout(function () {
      window.close();
      if (note) note.textContent = 'You can close this window and go back to One Day.';
    }, 250);
  } else {
    try {
      sessionStorage.setItem('oneday.signedin', JSON.stringify(ans));
    } catch (e) {}
    location.replace('../');
  }
})();
