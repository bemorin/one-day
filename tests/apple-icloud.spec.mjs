// iCloud in One Day's app for iPhone, iPad and Mac, against a made-up iCloud: the app's bridge (apple/Shared/bridge.js)
// runs as the app runs it, and the app's iCloud bridge (CloudBridge.swift) is played here, answering as it answers.
// Each test's devices are browser contexts of their own (their own storage), sharing the same iCloud.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openCopy } from './clouds.mjs';

const BRIDGE = readFileSync(new URL('../apple/Shared/bridge.js', import.meta.url), 'utf8');
const PASS = 'a long sync passphrase';
const key = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const seed = text => ({ days: { [key(new Date())]: { u: 1, tasks: [{ id: 'f1', text, done: false }] } }, rules: {}, tags: {} });
const texts = p => Object.values(p.days).flatMap(d => d.tasks.map(t => t.text));

// The record One Day keeps in iCloud, and the account the device is signed in to. A write names the tag of the copy it
// builds on, and is refused over any other (as CloudKit refuses it): none for a first copy.
class ICloud {
  constructor() {
    this.copy = null;
    this.account = { status: 'available', user: '_a1b2c3' };
    this.writes = 0;
    this.saves = 0;
    this.lists = 0;
    this.refuseNext = 0;
  }
  answer(q) {
    switch (q.op) {
      case 'account':
        return { ...this.account };
      case 'fetch':
        this.lists++;
        return this.copy ? { ...this.copy } : null;
      case 'save':
        this.saves++;
        if (this.refuseNext > 0) {
          this.refuseNext--;
          return { error: 'conflict' };
        }
        if ((q.tag || null) !== (this.copy ? this.copy.tag : null)) return { error: 'conflict' };
        this.writes++;
        this.copy = { tag: `t${this.writes}`, text: q.text };
        return { tag: this.copy.tag };
      case 'delete':
        this.copy = null;
        return true;
      default:
        return { error: 'refused' };
    }
  }
}

/* a device running the app: its storage, the app's bridges, the same iCloud as the others */
async function appDevice(browser, baseURL, cloud, o = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 860 } }),
    errors = [];
  await ctx.exposeFunction('__icloud', q => cloud.answer(q));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.webkit = {
      messageHandlers: {
        oneday: { postMessage() {} },
        onedayCloud: {
          async postMessage(q) {
            const r = await window.__icloud(JSON.parse(JSON.stringify(q)));
            if (r && r.error) throw new Error(r.error);
            return r;
          },
        },
      },
    };
  });
  await page.addInitScript({
    content: BRIDGE.replace('/*BOOT*/null', JSON.stringify({ platform: 'ios', version: '1.0 (1)', icloud: o.icloud !== false, seq: 0, items: {} })),
  });
  if (o.seed)
    await page.addInitScript(data => {
      if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(data));
    }, o.seed);
  await page.goto(baseURL + '/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
  return { ctx, page, errors };
}
const row = (page, text) => page.locator('#list .row', { hasText: text });
async function openDialog(page) {
  await page.locator('#spill:visible, #syncb:visible').first().click();
  await expect(page.locator('#syncd')).toBeVisible();
}
const idle = async page => {
  await expect(page.locator('#syT')).toHaveText('Sync is on', { timeout: 20000 });
  await expect(page.locator('#sySt .syd')).toHaveAttribute('data-s', 'idle', { timeout: 20000 });
};
// iCloud, then the passphrase: no sign-in page, the device's account is the one
async function connect(page, { join = false } = {}) {
  await openDialog(page);
  await expect(page.locator('#syT')).toHaveText('Sync with your cloud');
  await page.locator('#syCh [data-c="icloud"]').click();
  await expect(page.locator('#syT')).toHaveText(join ? 'Enter your sync passphrase' : 'Choose a sync passphrase', { timeout: 15000 });
  await page.locator('#syPass').fill(PASS);
  if (!join) {
    await page.locator('#syPass2').fill(PASS);
    await page.locator('#syOk').check();
  }
  await page.locator('#syGo').click();
  await idle(page);
}

test.describe('iCloud in the app', () => {
  test.describe.configure({ timeout: 90000 });

  test('the app offers iCloud alone, by its name and without a logo; the website keeps its three clouds', async ({ browser, baseURL, page }) => {
    const A = await appDevice(browser, baseURL, new ICloud());
    await openDialog(A.page);
    const clouds = A.page.locator('#syCh .syc');
    await expect(clouds).toHaveCount(1);
    await expect(clouds.locator('b')).toHaveText('iCloud');
    await expect(clouds.locator('span')).toHaveText('Your own iCloud: a space only One Day opens');
    await expect(clouds.locator('img')).toHaveCount(0);
    await expect(clouds).toBeEnabled();
    expect(A.errors).toEqual([]);
    await A.ctx.close();

    await page.goto(baseURL + '/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await openDialog(page);
    await expect(page.locator('#syCh .syc')).toHaveCount(3);
    await expect(page.locator('#syCh [data-c="icloud"]')).toHaveCount(0);
  });

  test('iCloud on: only a sealed copy goes, and a second device joins with the passphrase and gets the tasks', async ({ browser, baseURL }) => {
    const cloud = new ICloud(),
      A = await appDevice(browser, baseURL, cloud, { seed: seed('Water the fern') });
    await connect(A.page);
    expect(cloud.copy.text).toContain('"kind":"sync"');
    expect(cloud.copy.text).not.toContain('Water the fern');
    expect(texts(await openCopy(cloud.copy.text, PASS))).toContain('Water the fern');

    const B = await appDevice(browser, baseURL, cloud);
    await connect(B.page, { join: true });
    await B.page.keyboard.press('Escape');
    await expect(row(B.page, 'Water the fern')).toBeVisible({ timeout: 15000 });
    expect([...A.errors, ...B.errors]).toEqual([]);
    await A.ctx.close();
    await B.ctx.close();
  });

  test('a write that meets another one is read again and merged, not lost', async ({ browser, baseURL }) => {
    const cloud = new ICloud(),
      A = await appDevice(browser, baseURL, cloud, { seed: seed('Water the fern') });
    await connect(A.page);
    await A.page.keyboard.press('Escape');
    const saves = cloud.saves;
    cloud.refuseNext = 1;
    await A.page.locator('#input').fill('Call the bank');
    await A.page.locator('#input').press('Enter');
    await A.page.locator('#input').evaluate(n => n.blur());
    await expect.poll(() => cloud.saves, { timeout: 20000 }).toBeGreaterThanOrEqual(saves + 2);
    await expect.poll(async () => texts(await openCopy(cloud.copy.text, PASS)), { timeout: 20000 }).toContain('Call the bank');
    expect(A.errors).toEqual([]);
    await A.ctx.close();
  });

  test('no iCloud account on the device: the dialog says where to sign in, and nothing starts', async ({ browser, baseURL }) => {
    const cloud = new ICloud();
    cloud.account = { status: 'noaccount', user: '' };
    const A = await appDevice(browser, baseURL, cloud);
    await openDialog(A.page);
    await A.page.locator('#syCh [data-c="icloud"]').click();
    await expect(A.page.locator('#syErr')).toHaveText('Sign in to iCloud in Settings on this device, then try again.');
    await expect(A.page.locator('#syT')).toHaveText('Sync with your cloud');
    expect(cloud.copy).toBeNull();
    await A.ctx.close();
  });

  test('another iCloud account on the device: sync stops with a word, and nothing goes to it', async ({ browser, baseURL }) => {
    const cloud = new ICloud(),
      A = await appDevice(browser, baseURL, cloud, { seed: seed('Water the fern') });
    await connect(A.page);
    const writes = cloud.writes;
    cloud.account = { status: 'available', user: '_someone_else' };
    await A.page.locator('#sySt [data-sy="now"]').click();
    await expect(A.page.locator('#sySt')).toContainText('That’s not the Apple account this device syncs with', { timeout: 15000 });
    expect(cloud.writes).toBe(writes);
    await A.ctx.close();
  });

  test('a build without iCloud shows it, not set up', async ({ browser, baseURL }) => {
    const A = await appDevice(browser, baseURL, new ICloud(), { icloud: false });
    await openDialog(A.page);
    const c = A.page.locator('#syCh [data-c="icloud"]');
    await expect(c).toBeDisabled();
    await expect(c.locator('span')).toHaveText('Not set up yet');
    await A.ctx.close();
  });
});
