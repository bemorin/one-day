import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// The iPhone and Mac app's bridge (apple/Shared/bridge.js), run as the app runs it: before the page's own code, with
// the app's side faked (window.webkit.messageHandlers.oneday keeps what the page sends it).
const BRIDGE = readFileSync(new URL('../apple/Shared/bridge.js', import.meta.url), 'utf8');

const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayWith = text => JSON.stringify({ days: { [key(new Date())]: { u: 1, tasks: [{ id: 't1', text, done: false }] } }, rules: {}, tags: {} });
const row = (page, text) => page.locator('#list .row', { hasText: text });
const sent = page => page.evaluate(() => window.__sent);

// `kept`: what the web view's own storage holds when the page opens. `boot`: what the app's file holds.
async function inApp(page, boot, kept) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (kept)
    await page.addInitScript(k => {
      if (!sessionStorage.getItem('seeded')) {
        for (const [n, v] of Object.entries(k)) localStorage.setItem(n, v);
        sessionStorage.setItem('seeded', '1');
      }
    }, kept);
  await page.addInitScript(() => {
    window.__sent = [];
    window.webkit = { messageHandlers: { oneday: { postMessage: m => window.__sent.push(JSON.parse(JSON.stringify(m))) } } };
  });
  await page.addInitScript({ content: BRIDGE.replace('/*BOOT*/null', JSON.stringify({ platform: 'ios', version: '1.0 (1)', ...boot })) });
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
}

test('app: the copy in the app comes back when the web view lost its storage', async ({ page }) => {
  await inApp(page, { seq: 5, items: { 'oneday.v1': dayWith('From the app file') } });
  await expect(row(page, 'From the app file')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('oneday.app'))).not.toBeNull();
  expect((await sent(page)).filter(m => m.op === 'store.all')).toEqual([]);
});

test('app: each change goes to the app, numbered in order, and a removed key goes too', async ({ page }) => {
  await inApp(page, { seq: 0, items: {} });
  await page.locator('#input').fill('Buy bread');
  await page.locator('#input').press('Enter');
  await expect(row(page, 'Buy bread')).toBeVisible();
  await expect
    .poll(async () => (await sent(page)).some(m => m.op === 'store.set' && m.key === 'oneday.v1' && m.value.includes('Buy bread')))
    .toBe(true);
  await page.locator('#theme').click();
  await page.locator('#theme').click();
  await expect.poll(async () => (await sent(page)).some(m => m.op === 'store.remove' && m.key === 'oneday.theme')).toBe(true);
  const all = (await sent(page)).filter(m => m.op.startsWith('store.'));
  const seqs = all.map(m => m.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(new Set(seqs).size).toBe(seqs.length);
  expect(await page.evaluate(() => localStorage.getItem('oneday.app'))).toBe(String(seqs.at(-1)));
  expect(all.some(m => m.op === 'store.set' && m.key === 'oneday.theme' && m.value === 'dark')).toBe(true);
});

test('app: what the web view kept wins when it is newer, and the app gets all of it', async ({ page }) => {
  await inApp(page, { seq: 3, items: { 'oneday.v1': dayWith('Older copy') } }, { 'oneday.v1': dayWith('Kept by the web view'), 'oneday.app': '9' });
  await expect(row(page, 'Kept by the web view')).toBeVisible();
  await expect(row(page, 'Older copy')).toHaveCount(0);
  const first = (await sent(page)).find(m => m.op === 'store.all');
  expect(first.seq).toBe(9);
  expect(first.items['oneday.v1']).toContain('Kept by the web view');
});

test('app: a key the app no longer holds leaves the web view too', async ({ page }) => {
  await inApp(page, { seq: 4, items: { 'oneday.v1': dayWith('Plain day') } }, { 'oneday.theme': 'dark', 'oneday.app': '1' });
  await expect(row(page, 'Plain day')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('oneday.theme'))).toBeNull();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
});

test('app: only the oneday keys of localStorage go; no service worker, no passkeys; errors reach the app', async ({ page }) => {
  await inApp(page, { seq: 0, items: {} });
  const env = await page.evaluate(() => {
    sessionStorage.setItem('oneday.signin', 'x');
    localStorage.setItem('other', 'y');
    setTimeout(() => {
      throw new Error('boom');
    });
    return ['serviceWorker' in navigator, 'PublicKeyCredential' in window, JSON.stringify(window.oneDayApp)];
  });
  expect(env).toEqual([false, false, '{"platform":"ios","version":"1.0 (1)"}']);
  await expect.poll(async () => (await sent(page)).some(m => m.op === 'error' && m.message.includes('boom'))).toBe(true);
  const keys = (await sent(page)).filter(m => m.op === 'store.set').map(m => m.key);
  expect(keys).not.toContain('oneday.signin');
  expect(keys).not.toContain('other');
});

test('app: outside the app, the bridge does nothing', async ({ page }) => {
  await page.addInitScript({ content: BRIDGE.replace('/*BOOT*/null', JSON.stringify({ seq: 9, items: { 'oneday.v1': dayWith('Never shown') } })) });
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  await expect(row(page, 'Never shown')).toHaveCount(0);
  expect(await page.evaluate(() => ['serviceWorker' in navigator, 'oneDayApp' in window])).toEqual([true, false]);
});
