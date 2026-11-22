import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';

/* Importing from other apps. The sample files in tests/fixtures/imports are made up, written the way each app writes
   its export today. The clock is held on Tuesday 24 November 2026 so that their dates fall where the tests expect. */
const NOW = new Date('2026-11-24T12:00:00Z');
test.use({ timezoneId: 'Europe/Paris' });
const fixture = name => readFileSync(new URL(`./fixtures/imports/${name}`, import.meta.url));
const file = (name, body, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) });

// A .zip as Todoist's backups and Google Takeout write one: deflated entries, then the central directory.
function zip(entries) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, body] of entries) {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(body),
      packed = deflateRawSync(data),
      fname = Buffer.from(name),
      crc = crc32(data),
      local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fname.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, fname, packed);
    centrals.push(central, fname);
    offset += 30 + fname.length + packed.length;
  }
  const dir = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

async function open(page, { days = {}, rules = {} } = {}) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(data => {
    if (!localStorage.getItem('oneday.v1')) localStorage.setItem('oneday.v1', JSON.stringify(data));
  }, { days, rules });
  await page.goto('/');
  await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oneday.v1')));
const row = (page, text) => page.locator('#list .row', { hasText: text });
async function pick(page, ...files) {
  await page.locator('#impf').setInputFiles(files);
  await expect(page.locator('#imp')).toBeVisible();
}

test.describe('importing from other apps', () => {
  test('todo.txt and done.txt: the history on its days, +projects and @contexts as tags, rec: as a repeat', async ({ page, baseURL }) => {
    const seen = [];
    await open(page, { days: { '2026-11-24': { u: 1, tasks: [{ id: 'k1', text: 'Already here', done: false }] } } });
    page.on('request', r => seen.push(r.url()));
    await page.keyboard.press('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#slist [data-act="import"]').click()]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([file('todo.txt', fixture('todo.txt')), file('done.txt', fixture('done.txt'))]);
    const dlg = page.locator('#imp');
    await expect(dlg).toBeVisible();
    await expect(page.locator('#impT')).toHaveText('11 tasks from todo.txt');
    await expect(page.locator('#impGo')).toBeFocused();
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: 'Today' })).toContainText('4 tasks');
    await expect(rows.filter({ hasText: 'Thu 26 Nov' })).toContainText('Pick up the parcel');
    await expect(rows.filter({ hasText: 'Tue 1 Dec' })).toContainText('2 tasks');
    await expect(rows.filter({ hasText: /^Water the plants/ })).toContainText('Every Tuesday');
    await expect(rows.filter({ hasText: /^Pay the gym membership/ })).toContainText('Every month on the 1st');
    await expect(rows.filter({ hasText: 'Yesterday' })).toContainText('2 done');
    await expect(rows.filter({ hasText: 'Thu 19 Nov' })).toContainText('Book the dentist');
    await expect(page.locator('#impNote')).toContainText('#home, #phone, #errands, #reading, #travel and 2 more');
    await expect(page.locator('#impNote')).toContainText('1 repeat One Day can’t follow is written in its note');
    await page.locator('#impGo').click();
    await expect(dlg).toBeHidden();
    await expect(page.locator('#toast')).toContainText('Imported 11 tasks from todo.txt');
    await expect(row(page, 'Call the plumber about the leak')).toBeVisible();
    await expect(row(page, 'Already here')).toBeVisible();
    const s = await stored(page),
      texts = k => (s.days[k] ? s.days[k].tasks.map(t => t.text) : []);
    expect(texts('2026-11-24')).toEqual([
      'Already here',
      'Call the plumber about the leak #home #phone',
      'Water the plants #home',
      'Read the article on https://example.com/notes #reading',
      'Back up the laptop #admin',
    ]);
    expect(texts('2026-11-26')).toEqual(['Pick up the parcel #errands']);
    expect(texts('2026-12-01')).toEqual(['Plan the winter trip #travel', 'Pay the gym membership #home']);
    expect(texts('2026-11-23')).toEqual(['Buy stamps #errands', 'Send the invoice #work']);
    expect(texts('2026-11-21')).toEqual(['Return the library books #errands']);
    expect(s.days['2026-11-23'].tasks.every(t => t.done && t.at)).toBe(true);
    const backup = s.days['2026-11-24'].tasks.find(t => t.text.startsWith('Back up'));
    expect(backup.note).toContain('Repeats in todo.txt: rec:3b');
    expect(backup.rule).toBeUndefined();
    const rules = Object.values(s.rules);
    expect(rules.map(r => [r.text, r.freq, r.every, r.start, r.days || null])).toEqual([
      ['Water the plants #home', 'week', 1, '2026-11-24', [1]],
      ['Pay the gym membership #home', 'month', 1, '2026-12-01', null],
    ]);
    // nothing left the page
    expect(seen.filter(u => !u.startsWith(baseURL))).toEqual([]);
    // one undo takes it all back
    await page.locator('#undo').click();
    await expect(row(page, 'Call the plumber about the leak')).toHaveCount(0);
    const back = await stored(page);
    expect(back.days['2026-11-24'].tasks.map(t => t.text)).toEqual(['Already here']);
    expect(back.days['2026-11-23'].tasks).toEqual([]);
    expect(back.rules).toEqual({});
  });

  test('Google Takeout, as its .zip: lists as tags, done tasks on the day they were done, sub-tasks under their task', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    const json = fixture('Tasks.json');
    await pick(page, file('takeout-20261124T090000Z-001.zip', zip([['Takeout/archive_browser.html', '<html></html>'], ['Takeout/Tasks/Tasks.json', json]]), 'application/zip'));
    await expect(page.locator('#impT')).toHaveText('6 tasks from Google Tasks');
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: 'Tomorrow' })).toContainText('Renew the passport');
    await expect(rows.filter({ hasText: 'Fri 20 Nov' })).toContainText('Call the bank');
    await expect(rows.filter({ hasText: 'Fri 2 Oct' })).toContainText('Sort the old photos');
    await expect(page.locator('#impList')).not.toContainText('deleted');
    await page.locator('#impGo').click();
    await expect(page.locator('#toast')).toContainText('Imported 6 tasks from Google Tasks');
    const s = await stored(page),
      passport = s.days['2026-11-25'].tasks[0];
    expect(passport.text).toBe('Renew the passport');
    expect(passport.subs.map(x => [x.text, x.done])).toEqual([
      ['Print the photos', false],
      ['Fill in the form', true],
    ]);
    expect(passport.note).toContain('<a href="https://example.org/passport-form"');
    expect(passport.note).toContain('Use black ink.');
    expect(s.days['2026-11-24'].tasks.map(t => t.text)).toEqual(['Reply to the landlord', 'Oat milk #groceries']);
    expect(s.days['2026-11-24'].tasks[0].note).toContain('About the heating');
    expect(s.days['2026-11-22'].tasks.map(t => [t.text, t.done])).toEqual([['Coffee beans #groceries', true]]);
    expect(s.days['2026-10-02'].tasks.map(t => t.text)).toEqual(['Sort the old photos']);
  });

  test('a due date written as midnight UTC stays on its day west of Greenwich', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1280, height: 860 } }),
      page = await ctx.newPage();
    await open(page);
    await pick(page, file('Tasks.json', fixture('Tasks.json'), 'application/json'));
    await page.locator('#impGo').click();
    const s = await stored(page);
    expect(s.days['2026-11-25'].tasks[0].text).toBe('Renew the passport');
    // done at 16:45 UTC on the 20th: 08:45 that morning in Los Angeles
    expect(s.days['2026-11-20'].tasks[0].text).toBe('Call the bank');
    await ctx.close();
  });

  test('Cancel and Escape add nothing; focus goes back to Import', async ({ page }) => {
    await open(page);
    await page.keyboard.press('/');
    const chip = page.locator('#slist [data-act="import"]');
    await chip.focus();
    await page.locator('#impf').setInputFiles([file('todo.txt', fixture('todo.txt'))]);
    await expect(page.locator('#imp')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#imp')).toBeHidden();
    await expect(page.locator('#srch')).toHaveClass(/\bon\b/);
    await expect(chip).toBeFocused();
    await page.locator('#impf').setInputFiles([file('todo.txt', fixture('todo.txt'))]);
    await page.locator('#impNo').click();
    await expect(page.locator('#imp')).toBeHidden();
    expect((await stored(page)).days).toEqual({});
  });

  test('One Day’s limits hold: 300 tasks a day, 100 sub-tasks a task', async ({ page }) => {
    const full = Array.from({ length: 298 }, (_, i) => ({ id: 'f' + i, text: 'Task ' + i, done: false }));
    await open(page, { days: { '2026-11-24': { u: 1, tasks: full } } });
    const kids = Array.from({ length: 105 }, (_, i) => ({ kind: 'tasks#task', id: 'c' + i, title: 'Step ' + (i + 1), status: 'needsAction', parent: 'p1', position: String(i).padStart(20, '0') }));
    const json = JSON.stringify({
      kind: 'tasks#taskLists',
      items: [{ kind: 'tasks#taskList', id: 'l1', title: 'Moving', items: [{ kind: 'tasks#task', id: 'p1', title: 'Pack the flat', status: 'needsAction', due: '2026-11-27T00:00:00.000Z' }, ...kids] }],
    });
    await pick(page, file('Tasks.json', json, 'application/json'), file('todo.txt', 'One\nTwo\nThree\nFour\nFive\n'));
    await expect(page.locator('#impT')).toHaveText('3 tasks from Google Tasks and todo.txt');
    await expect(page.locator('#impNote')).toContainText('3 tasks left out: Today is full (300 tasks a day).');
    await expect(page.locator('#impNote')).toContainText('5 sub-tasks over 100 in a task are left out.');
    await page.locator('#impGo').click();
    const s = await stored(page);
    expect(s.days['2026-11-24'].tasks).toHaveLength(300);
    expect(s.days['2026-11-24'].tasks.slice(-2).map(t => t.text)).toEqual(['One', 'Two']);
    expect(s.days['2026-11-27'].tasks[0].subs).toHaveLength(100);
    expect(s.days['2026-11-27'].tasks[0].subs[99].text).toBe('Step 100');
  });

  test('an export cannot run code or break the page', async ({ page }) => {
    await open(page);
    const json = JSON.stringify({
      kind: 'tasks#taskLists',
      items: [
        {
          kind: 'tasks#taskList',
          title: '"><img src=x onerror="window.__pwned=1">',
          items: [
            {
              kind: 'tasks#task',
              id: 'x"] .row, body[a="',
              title: 'Evil <img src=x onerror="window.__pwned=1">',
              notes: '<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"> [click](javascript:window.__pwned=1) **kept**',
              status: 'needsAction',
            },
            { kind: 'tasks#task', id: 'y', title: '<svg onload="window.__pwned=1">', parent: 'x"] .row, body[a="', status: 'needsAction' },
          ],
        },
      ],
    });
    await pick(page, file('Tasks.json', json, 'application/json'));
    await expect(page.locator('#impList')).toContainText('Evil <img src=x onerror="window.__pwned=1">');
    await expect(page.locator('#impList img, #impNote img')).toHaveCount(0);
    await page.locator('#impGo').click();
    const r = row(page, 'Evil <img');
    await expect(r).toBeVisible();
    await r.locator('.mt').click();
    await expect(r.locator('.note b')).toHaveText('kept');
    await expect(r.locator('.note img, .note script, .note a')).toHaveCount(0);
    await expect(r.locator('.sub .st')).toHaveText('<svg onload="window.__pwned=1">');
    await expect(r.locator('.tag')).toHaveText('#img-srcx-onerrorwindow__pwned1');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('a file it cannot read, or a .zip that would grow too large, adds nothing', async ({ page }) => {
    await open(page);
    await page.locator('#impf').setInputFiles([file('contacts.csv', 'Name,Phone\nSam,0102030405\n', 'text/csv')]);
    await expect(page.locator('#toast')).toContainText('That file isn’t a backup or an export One Day can read');
    await page.locator('#impf').setInputFiles([file('big.zip', zip([['Tasks.json', Buffer.alloc(41e6, 32)]]), 'application/zip')]);
    await expect(page.locator('#toast')).toContainText('That file is too large to import');
    await expect(page.locator('#imp')).toBeHidden();
    expect((await stored(page)).days).toEqual({});
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('More → Import backup: what comes in shows as a sheet from the bottom, its buttons under the thumb', async ({ page }) => {
    await open(page);
    await page.locator('#mbMore').tap();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#moreList [data-act="import"]').tap()]);
    await chooser.setFiles([file('todo.txt', fixture('todo.txt'))]);
    await expect(page.locator('#imp')).toBeVisible();
    await page.waitForTimeout(450);
    const card = await page.locator('#impCard').boundingBox(),
      go = await page.locator('#impGo').boundingBox();
    expect(Math.round(card.y + card.height)).toBe(844);
    expect(go.height).toBeGreaterThanOrEqual(44);
    await page.locator('#impGo').tap();
    await expect(page.locator('#toast')).toContainText('Imported 8 tasks from todo.txt');
  });
});

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
const scanned = async (page, scheme) => {
  await page.emulateMedia({ colorScheme: scheme });
  await open(page);
  await pick(page, file('todo.txt', fixture('todo.txt')), file('done.txt', fixture('done.txt')));
  await page.waitForTimeout(450);
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
};
test.describe('the import dialog, scanned (axe, WCAG 2.2 AA)', () => {
  for (const scheme of ['light', 'dark']) test(`computer, ${scheme}`, ({ page }) => scanned(page, scheme));
  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    for (const scheme of ['light', 'dark']) test(`phone, ${scheme}`, ({ page }) => scanned(page, scheme));
  });
});
