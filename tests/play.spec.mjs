// One Day's app on Google Play: the website itself, which Chrome opens full screen at ./?app=android (android/ holds
// how the app is made). There the coffee (Ko-fi, a payment outside Google Play) is left out; the website keeps it.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ANDROID = {
  viewport: { width: 412, height: 860 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
};

async function open(page, path = '/') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('oneday.v1'))
      localStorage.setItem(
        'oneday.v1',
        JSON.stringify({ days: { [new Date().toLocaleDateString('sv')]: { u: 1, tasks: [{ id: 'a1', text: 'Water the plants', done: false, note: 'The <b>fern</b> first' }] } } }),
      );
  });
  await page.goto(path);
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
}
// Chrome names the app that opened the page (android-app://<package>/); Playwright can't send such a referrer itself.
const cameFrom = (page, referrer) =>
  page.addInitScript(r => Object.defineProperty(Document.prototype, 'referrer', { configurable: true, get: () => r }), referrer);

test.describe('in the app on Google Play', () => {
  test.use(ANDROID);

  test('opened at ./?app=android: no coffee in the footer, More or the guide; the address loses the mark; a reload keeps it', async ({ page, baseURL }) => {
    await open(page, '/?app=android');
    // the mark leaves the address at once, and stays with the app's tab
    expect(page.url()).toBe(baseURL + '/');
    expect(await page.evaluate(() => sessionStorage.getItem('oneday.app'))).toBe('android');
    await expect(page.locator('#foot .kofi')).toHaveCount(0);
    await expect(page.locator('#foot .promo')).toHaveCount(1);
    // More: dogood.day stays, alone
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#more .spromo')).toHaveCount(1);
    await expect(page.locator('#more .spromo')).toContainText('dogood.day');
    await expect(page.locator('#more .kofi')).toHaveCount(0);
    await expect(page.locator('#more')).not.toContainText('coffee');
    await expect(page.locator('#more')).not.toContainText('☕');
    // installed by definition: never an offer to install
    await expect(page.locator('#moreList .sins')).toHaveCount(0);
    await page.locator('#scrim').tap({ position: { x: 60, y: 120 } });
    await expect(page.locator('#more')).toBeHidden();
    await page.reload();
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await expect(page.locator('#foot .kofi')).toHaveCount(0);
    // the guide opens in the app's tab, which remembers: it leaves its coffee out too
    await page.goto('/guide/');
    await expect(page.locator('#free')).toBeVisible();
    await expect(page.locator('.kofi')).toHaveCount(0);
    await expect(page.locator('#free + p')).toHaveText(
      'None of them. One Day is free and open source, under the MIT licence, and its code is on GitHub.',
    );
  });

  test('installed by definition: a prompt lent by Chrome still offers nothing', async ({ page }) => {
    await open(page, '/?app=android');
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => Promise.resolve();
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(e);
    });
    await page.locator('#mbMore').tap();
    await expect(page.locator('#more')).toBeVisible();
    await expect(page.locator('#moreList .sins')).toHaveCount(0);
  });

  test('a link opened in the app: Chrome names the app as where it came from, and the coffee stays out', async ({ page }) => {
    await cameFrom(page, 'android-app://com.bemorin.oneday/');
    await open(page);
    await expect(page.locator('#foot .kofi')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('oneday.app'))).toBe('android');
  });

  test("a link opened in Chrome from another app (Gmail, say) is the website: the coffee stays", async ({ page }) => {
    await cameFrom(page, 'android-app://com.google.android.gm/');
    await open(page);
    await expect(page.locator('#foot .kofi')).toHaveCount(1);
    expect(await page.evaluate(() => sessionStorage.getItem('oneday.app'))).toBeNull();
  });

  test("the same phone's Chrome keeps the coffee: the mark lives in the app's tab only", async ({ page, context }) => {
    await open(page, '/?app=android');
    await expect(page.locator('#foot .kofi')).toHaveCount(0);
    // a tab of the browser: same tasks (localStorage is shared), its own session
    const web = await context.newPage();
    await open(web);
    await expect(web.locator('#foot .kofi')).toHaveCount(1);
    await web.locator('#mbMore').tap();
    await expect(web.locator('#more .spromo.kofi')).toHaveText('This app is free. If you want, buy me a ☕.');
    await expect(web.locator('#list .row', { hasText: 'Water the plants' })).toBeVisible();
  });

  test("the app's address with a link from an assistant: the tasks come in, and the mark goes", async ({ page, baseURL }) => {
    await open(page, '/?app=android#add?task=Buy+bread');
    await expect(page.locator('#inbox')).toBeVisible();
    await expect(page.locator('#inTitle')).toHaveText('Buy bread');
    expect(page.url()).not.toContain('app=android');
    expect(page.url().startsWith(baseURL + '/')).toBe(true);
    await expect(page.locator('#foot .kofi')).toHaveCount(0);
  });
});

test.describe('in the app on Google Play, on a larger screen (a tablet, a Chromebook)', () => {
  test.use({ viewport: { width: 600, height: 860 } });
  test("search's foot copies the footer's links, without the coffee", async ({ page }) => {
    await open(page, '/?app=android');
    await page.locator('#sb').click();
    const about = page.locator('#slist .about');
    await expect(about).toBeVisible();
    await expect(about.locator('.promo')).toHaveCount(1);
    await expect(about.locator('.kofi')).toHaveCount(0);
    await expect(about.locator('.links a')).toHaveCount(5);
  });

});

test.describe('in the app on Google Play, on a Chromebook', () => {
  test('a day sent from the app carries no mark', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, '/?app=android');
    const b = page.locator('#list .row', { hasText: 'Water the plants' });
    await b.locator('.mt').click();
    await b.locator('.sbtn').click();
    await expect(page.locator('#toast')).toContainText('Link copied');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#add=z[\w-]+$/);
    expect(link).not.toContain('app=');
  });
});

test.describe('on the website', () => {
  test('the coffee is in the footer and the guide, as always', async ({ page }) => {
    await open(page);
    await expect(page.locator('#foot .kofi')).toHaveText('Buy me a ☕');
    expect(await page.evaluate(() => sessionStorage.getItem('oneday.app'))).toBeNull();
    await page.goto('/guide/');
    await expect(page.locator('#free + p .kofi a')).toHaveAttribute('href', 'https://ko-fi.com/bemorin');
    await expect(page.locator('#free + p')).toContainText('If it helps your days, you can buy me a coffee.');
  });
});

test.describe("the app's Digital Asset Links", () => {
  test('/.well-known/assetlinks.json lets the app on Google Play open the site full screen, as JSON', async ({ request }) => {
    const r = await request.get('/.well-known/assetlinks.json');
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toMatch(/^application\/json/);
    const links = await r.json();
    expect(links).toHaveLength(1);
    const [{ relation, target }] = links;
    expect(relation).toEqual(['delegate_permission/common.handle_all_urls']);
    expect(target.namespace).toBe('android_app');
    expect(target.package_name).toBe('com.bemorin.oneday');
    expect(target.sha256_cert_fingerprints.length).toBeGreaterThanOrEqual(1);
    for (const f of target.sha256_cert_fingerprints) expect(f).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    // the app's own copy says the same: the upload key's fingerprint is among them
    const twa = JSON.parse(readFileSync(new URL('../android/twa-manifest.json', import.meta.url), 'utf8'));
    expect(twa.packageId).toBe(target.package_name);
    for (const f of twa.fingerprints.map(x => x.value)) expect(target.sha256_cert_fingerprints).toContain(f);
  });
});
