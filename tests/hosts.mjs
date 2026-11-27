// One Day at its two real addresses, day.bemorin.com (the old one) and getone.day, inside the test's browser:
// each request is answered from public/ as Cloudflare Pages answers it (scripts/pages.mjs, _headers included), so
// nothing goes online and the pages get exactly their own origins, headers and windows.
// A browser follows a redirect without asking the test again (Playwright routes only the first address), so every
// redirect here is made in the page instead, and anything not answered here is refused: nothing reaches the network.
import { answer } from '../scripts/pages.mjs';

export const OLD = 'https://day.bemorin.com',
  NEW = 'https://getone.day';

const hop = to => ({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(to)})</script>` });

// `patch`: [find (text or RegExp), replace] pairs for app.js, each of which must find something; `on`: a hook that
// may change one answer
export async function hosts(ctx, { patch = [], on = null } = {}) {
  // first, so that it comes last: whatever nothing else answers is refused
  await ctx.route(/.*/, route => route.abort('blockedbyclient'));
  for (const origin of [OLD, NEW])
    await ctx.route(origin + '/**', async route => {
      const url = new URL(route.request().url());
      let a = await answer(url);
      if (on) a = (await on(url, a)) || a;
      if (a.status >= 300 && a.status < 400 && a.headers.Location) return route.fulfill(hop(new URL(a.headers.Location, url).href));
      let body = a.body;
      if (url.pathname === '/app.js' && patch.length) {
        body = String(body);
        for (const [x, y] of patch) {
          if (x instanceof RegExp ? !x.test(body) : !body.includes(x)) throw new Error(`${x} not found in app.js`);
          body = body.replace(x, y);
        }
      }
      await route.fulfill({ status: a.status, headers: a.headers, body });
    });
}

// A made-up cloud (tests/clouds.mjs) whose sign-in page sends the browser back with a redirect: sent back from the
// page instead, so that One Day's addresses answer here too.
export async function cloudAt(ctx, cloud) {
  await cloud.route(ctx);
  const [pattern, handle] = {
    Drive: ['https://accounts.google.com/o/oauth2/v2/auth**', 'auth'],
    Dropbox: ['https://www.dropbox.com/oauth2/authorize**', 'auth'],
    OneDrive: ['https://login.microsoftonline.com/**', 'login'],
  }[cloud.constructor.name];
  // routed after the cloud's own, so this one answers: the same answer, its redirect made in the page
  await ctx.route(pattern, route =>
    cloud[handle](
      new Proxy(route, {
        get: (r, k) =>
          k === 'fulfill'
            ? o => (o && o.status === 302 && o.headers && o.headers.location ? r.fulfill(hop(o.headers.location)) : r.fulfill(o))
            : typeof r[k] === 'function'
              ? r[k].bind(r)
              : r[k],
      }),
    ),
  );
}
