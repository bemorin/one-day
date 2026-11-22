import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, utimesSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';

/* Importing from other apps. The sample files in tests/fixtures/imports are made up, written the way each app writes
   its export today. The clock is held on Tuesday 24 November 2026 so that their dates fall where the tests expect. */
const NOW = new Date('2026-11-24T12:00:00Z');
test.use({ timezoneId: 'Europe/Paris' });
const fixture = name => readFileSync(new URL(`./fixtures/imports/${name}`, import.meta.url));
const file = (name, body, mimeType = 'text/plain') => ({ name, mimeType, buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) });
// A file on disk saved at a given moment: Todoist counts its dates from the day of the export.
function saved(name, body, when = NOW) {
  const p = join(mkdtempSync(join(tmpdir(), 'one-day-')), name);
  writeFileSync(p, body);
  utimesSync(p, when, when);
  return p;
}

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
    // the days the import made are not left behind, empty
    expect(back.days['2026-11-23']).toBeUndefined();
    expect(back.rules).toEqual({});
  });

  test('Google Takeout, as its .zip: days from scheduled_time, the history, sub-tasks, and the repeats each list keeps', async ({ page }) => {
    await open(page);
    const json = fixture('Tasks.json');
    await pick(page, file('takeout-20261124T090000Z-001.zip', zip([['Takeout/archive_browser.html', '<html></html>'], ['Takeout/Tasks/Tasks.json', json]]), 'application/zip'));
    await expect(page.locator('#impT')).toHaveText('9 tasks from Google Tasks');
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: /^Today/ })).toContainText('2 tasks');
    await expect(rows.filter({ hasText: /^Tomorrow/ })).toContainText('Renew the passport');
    await expect(rows.filter({ hasText: /^Thu 26 Nov/ })).toContainText('Dentist, Take out the recycling');
    await expect(rows.filter({ hasText: /^Tue 8 Dec/ })).toContainText('Book club');
    await expect(rows.filter({ hasText: /^Take out the recycling/ })).toContainText('Every Monday and Thursday');
    await expect(rows.filter({ hasText: /^Book club/ })).toContainText('Every month on the second Tuesday');
    await expect(rows.filter({ hasText: /^Yesterday/ })).toContainText('1 done');
    await expect(rows.filter({ hasText: /^Fri 20 Nov/ })).toContainText('Call the bank');
    await expect(rows.filter({ hasText: /^Fri 2 Oct/ })).toContainText('Sort the old photos');
    await expect(page.locator('#impNote')).toContainText('come in as tags: #home.');
    await expect(page.locator('#impNote')).toContainText('1 repeat One Day can’t follow is written in its note.');
    await page.locator('#impGo').click();
    await expect(page.locator('#toast')).toContainText('Imported 9 tasks from Google Tasks');
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => t.text),
      passport = s.days['2026-11-25'].tasks[0];
    expect(passport.text).toBe('Renew the passport');
    expect(passport.subs.map(x => [x.text, x.done])).toEqual([
      ['Print the photos', false],
      ['Fill in the form', true],
    ]);
    expect(passport.note).toContain('<a href="https://example.org/passport-form"');
    expect(passport.note).toContain('Use black ink.');
    expect(texts('2026-11-24')).toEqual(['Reply to the landlord', 'Stretch #home']);
    expect(s.days['2026-11-24'].tasks[0].note).toContain('<a href="https://keep.google.com/#NOTE/1a2b3c4d5e6f"');
    expect(s.days['2026-11-24'].tasks[1].note).toContain('Repeats in Google Tasks: every day, 10 times');
    expect(texts('2026-11-26')).toEqual(['Dentist', 'Take out the recycling #home']);
    expect(texts('2026-12-08')).toEqual(['Book club #home']);
    expect(Object.values(s.rules).map(r => [r.text, r.freq, r.start, r.days || r.nth])).toEqual([
      ['Take out the recycling #home', 'week', '2026-11-26', [0, 3]],
      ['Book club #home', 'month', '2026-12-08', 2],
    ]);
    expect(s.days['2026-11-23'].tasks.map(t => [t.text, t.done])).toEqual([['Take out the recycling #home', true]]);
    expect(texts('2026-11-20')).toEqual(['Call the bank']);
    expect(texts('2026-10-02')).toEqual(['Sort the old photos']);
  });

  test('older Takeout files: a due date alone stays on its day, a maker’s midnight lands on that day west of Greenwich', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/Los_Angeles', viewport: { width: 1280, height: 860 } }),
      page = await ctx.newPage();
    await open(page);
    const json = JSON.stringify({
      kind: 'tasks#taskLists',
      items: [
        {
          kind: 'tasks#taskList',
          id: 'l1',
          title: 'Errands',
          items: [
            { kind: 'tasks#task', id: 'a', title: 'Post the parcel', status: 'needsAction', due: '2026-11-25T00:00:00.000Z', position: '00000000000000000001' },
            { kind: 'tasks#task', id: 'b', title: 'Return the keys', status: 'needsAction', due: '2026-11-26T08:00:00.000Z', position: '00000000000000000000' },
            { kind: 'tasks#task', id: 'c', title: 'Call the bank', status: 'completed', completed: '2026-11-20T16:45:00.000Z', position: '00000000000000000002' },
          ],
        },
      ],
    });
    await pick(page, file('Tasks.json', json, 'application/json'));
    await page.locator('#impGo').click();
    const s = await stored(page);
    expect(s.days['2026-11-25'].tasks.map(t => t.text)).toEqual(['Post the parcel #errands']);
    // 08:00 UTC is midnight in Los Angeles
    expect(s.days['2026-11-26'].tasks.map(t => t.text)).toEqual(['Return the keys #errands']);
    // done at 16:45 UTC on the 20th: 08:45 that morning in Los Angeles
    expect(s.days['2026-11-20'].tasks.map(t => t.text)).toEqual(['Call the bank #errands']);
    await ctx.close();
  });

  test('TickTick: the history, checklists and sub-tasks, RRULE repeats; Won’t do and notes stay behind', async ({ page }) => {
    await open(page);
    await pick(page, file('TickTick-backup-2026-11-24.csv', fixture('TickTick-backup-2026-11-24.csv'), 'text/csv'));
    await expect(page.locator('#impT')).toHaveText('7 tasks from TickTick');
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: /^Today/ })).toContainText('Weekend groceries');
    await expect(rows.filter({ hasText: /^Tomorrow/ })).toContainText('Take the bins out');
    await expect(rows.filter({ hasText: /^Thu 26 Nov/ })).toContainText('Send the quarterly report, Water the plants');
    await expect(rows.filter({ hasText: /^Mon 30 Nov/ })).toContainText('Pay the rent');
    await expect(rows.filter({ hasText: /^Water the plants/ })).toContainText('Every Monday and Thursday');
    await expect(rows.filter({ hasText: /^Yesterday/ })).toContainText('Book the meeting room');
    await expect(rows.filter({ hasText: /^Tue 3 Nov/ })).toContainText('Renew the insurance');
    const note = page.locator('#impNote');
    await expect(note).toContainText('come in as tags: #projects, #work, #finance, #shopping, #home.');
    await expect(note).toContainText('1 repeat One Day can’t follow is written in its note.');
    await expect(note).toContainText('1 task marked Won’t do and 1 note are left out.');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => t.text);
    const groceries = s.days['2026-11-24'].tasks[0];
    expect(groceries.text).toBe('Weekend groceries #shopping');
    expect(groceries.subs.map(x => [x.text, x.done])).toEqual([
      ['Milk', true],
      ['Eggs', false],
      ['Coffee beans', false],
    ]);
    const report = s.days['2026-11-26'].tasks[0];
    expect(report.text).toBe('Send the quarterly report #projects #work #finance');
    expect(report.note).toBe('<div>Attach the <b>summary</b> sheet.</div><div>The numbers: <a href="https://example.com/q4" target="_blank" rel="noopener noreferrer">https://example.com/q4</a></div>');
    expect(report.subs.map(x => [x.text, x.done])).toEqual([
      ['Check the totals', true],
      ['Collect the figures', false],
    ]);
    expect(texts('2026-11-25')).toEqual(['Take the bins out #home']);
    expect(s.days['2026-11-25'].tasks[0].note).toContain('Repeats in TickTick: ERULE:NAME=CUSTOM;BYDATE=20261125,20261209');
    expect(texts('2026-11-30')).toEqual(['Pay the rent #home']);
    expect(Object.values(s.rules).map(r => [r.text, r.freq, r.start, r.days || null, r.skip || null])).toEqual([
      ['Water the plants', 'week', '2026-11-26', [0, 3], null],
      ['Pay the rent #home', 'month', '2026-10-31', null, ['2026-10-31']],
    ]);
    expect(s.days['2026-11-23'].tasks.map(t => [t.text, t.done])).toEqual([['Book the meeting room #projects', true]]);
    expect(texts('2026-11-03')).toEqual(['Renew the insurance']);
    const all = Object.values(s.days).flatMap(d => d.tasks.map(t => t.text));
    expect(all.some(t => /vendor|Book ideas/.test(t))).toBe(false);
  });

  test('Todoist, a project exported as CSV: dates from the day of the export, sub-tasks by INDENT, labels, comments', async ({ page }) => {
    await open(page);
    await pick(page, saved('Home.csv', fixture('Home.csv')));
    await expect(page.locator('#impT')).toHaveText('7 tasks from Todoist');
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: /^Today/ })).toContainText('Clean the gutters, Pantry staples');
    await expect(rows.filter({ hasText: /^Tomorrow/ })).toContainText('Call the plumber');
    await expect(rows.filter({ hasText: /^Sat 28 Nov/ })).toContainText('Weekly shop');
    await expect(rows.filter({ hasText: /^Mon 30 Nov/ })).toContainText('Water the plants, Pay the rent');
    await expect(rows.filter({ hasText: /^Water the plants/ })).toContainText('Every Monday');
    await expect(rows.filter({ hasText: /^Sat 21 Nov/ })).toContainText('Renew the passport, finally');
    await expect(page.locator('#impNote')).toContainText('come in as tags: #home, #phone, #green-thumb, #errands.');
    await expect(page.locator('#impNote')).toContainText('1 repeat One Day can’t follow is written in its note.');
    await expect(page.locator('#impNote')).not.toContainText('when the file was saved');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => t.text);
    expect(texts('2026-11-24')).toEqual(['Clean the gutters #home', 'Pantry staples #home']);
    expect(s.days['2026-11-24'].tasks[0].note).toContain('Repeats in Todoist: every 2nd and 4th sat');
    const plumber = s.days['2026-11-25'].tasks[0];
    expect(plumber.text).toBe('Call the plumber #home #phone');
    expect(plumber.note).toContain('Ask about the kitchen tap too');
    expect(plumber.note).toContain('Deadline: Saturday 28 November');
    const passport = s.days['2026-11-21'].tasks[0];
    expect(passport.text).toBe('Renew the passport, finally #home');
    expect(passport.note).toBe('<div>Bring two photos.</div><div>The old passport is in the &quot;misc&quot; drawer.</div>');
    expect(passport.subs.map(x => x.text)).toEqual(['Book the photo booth']);
    const shop = s.days['2026-11-28'].tasks[0];
    expect(shop.text).toBe('Weekly shop #home #errands');
    expect(shop.subs.map(x => x.text)).toEqual(['Oat milk']);
    expect(shop.note).toContain('<a href="https://example.com/list" target="_blank" rel="noopener noreferrer">shared note</a>');
    expect(shop.note).toContain('<b>Oat milk:</b> Barista edition if they have it');
    expect(texts('2026-11-30')).toEqual(['Water the plants #home #green-thumb', 'Pay the rent #home']);
    expect(Object.values(s.rules).map(r => [r.text, r.freq, r.start, r.days || null])).toEqual([
      ['Water the plants #home #green-thumb', 'week', '2026-11-24', [0]],
      ['Pay the rent #home', 'month', '2026-10-31', null],
    ]);
    // a section is no task
    expect(Object.values(s.days).flatMap(d => d.tasks.map(t => t.text)).some(t => /^Groceries/.test(t))).toBe(false);
  });

  test('Todoist, a file saved days ago: its dates count from that day, and the dialog says so', async ({ page }) => {
    await open(page);
    await pick(page, saved('Home.csv', fixture('Home.csv'), new Date('2026-11-22T18:00:00Z')));
    await expect(page.locator('#impNote')).toContainText('they count from Sunday 22 November, when the file was saved.');
    await expect(page.locator('#impList li').filter({ hasText: /^Yesterday/ })).toContainText('Call the plumber');
    await expect(page.locator('#impList li').filter({ hasText: /^Thu 26 Nov/ })).toContainText('Weekly shop');
  });

  test('Todoist backups, as their .zip: one project a file, short dates in the account’s language', async ({ page }) => {
    await open(page);
    await pick(
      page,
      file(
        'backup.zip',
        zip([
          ['Work [6X7rM8jvh9QPh2vw].csv', fixture('Work [6X7rM8jvh9QPh2vw].csv')],
          ['Zuhause [6X7rM8jvh9QPh2vx].csv', fixture('Zuhause [6X7rM8jvh9QPh2vx].csv')],
        ]),
        'application/zip',
      ),
    );
    await expect(page.locator('#impT')).toHaveText('6 tasks from Todoist');
    await expect(page.locator('#impNote')).toContainText('1 date One Day couldn’t read is written in its note.');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => t.text);
    expect(texts('2026-11-26')).toEqual(['Send the invoice #work']);
    expect(texts('2026-12-03')).toEqual(['Prepare the slides #work']);
    // the weekly review's next Friday, then the German account's 27 Nov
    expect(texts('2026-11-27')).toEqual(['Weekly review #work', 'Fenster putzen #zuhause']);
    // a title keeps the words of its link, the link goes to the note
    expect(texts('2026-11-24')).toEqual(['Read the guide before Monday #work', 'Müll rausbringen #zuhause']);
    expect(s.days['2026-11-24'].tasks[0].note).toContain('<a href="https://example.com/guide" target="_blank" rel="noopener noreferrer">the guide</a>');
    // planned for the dialog, then again for Add all: the link is there once
    expect(s.days['2026-11-24'].tasks[0].note.match(/example\.com\/guide/g)).toHaveLength(1);
    expect(s.days['2026-11-24'].tasks[1].note).toContain('Date in Todoist: jeden Dienstag');
    expect(Object.values(s.rules).map(r => [r.text, r.days])).toEqual([['Weekly review #work', [4]]]);
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
    // a table with no column that names a task
    await page.locator('#impf').setInputFiles([file('budget.csv', 'Date,Amount\n2026-11-01,12.50\n', 'text/csv')]);
    await expect(page.locator('#toast')).toContainText('That file isn’t a backup or an export One Day can read');
    await page.locator('#impf').setInputFiles([file('big.zip', zip([['Tasks.json', Buffer.alloc(41e6, 32)]]), 'application/zip')]);
    await expect(page.locator('#toast')).toContainText('That file is too large to import');
    await expect(page.locator('#imp')).toBeHidden();
    expect((await stored(page)).days).toEqual({});
  });

  test('Evernote (.enex): a checklist note becomes a task and its sub-tasks; its Tasks land on their days', async ({ page }) => {
    await open(page);
    await pick(page, file('Errands.enex', fixture('Errands.enex'), 'application/xml'));
    await expect(page.locator('#impT')).toHaveText('6 tasks from Evernote');
    const rows = page.locator('#impList li');
    await expect(rows.filter({ hasText: /^Today/ })).toContainText('Weekend errands, Packing list');
    await expect(rows.filter({ hasText: /^Tomorrow/ })).toContainText('Call the bank about the card');
    await expect(rows.filter({ hasText: /^Thu 26 Nov/ })).toContainText('Put the bins out');
    await expect(rows.filter({ hasText: /^Sat 28 Nov/ })).toContainText('Book the car service');
    await expect(rows.filter({ hasText: /^Put the bins out/ })).toContainText('Every Thursday');
    await expect(rows.filter({ hasText: /^Sat 21 Nov/ })).toContainText('Pay the parking fine');
    await expect(page.locator('#impNote')).toContainText('come in as tags: #errands, #home, #weekend-errands, #travel.');
    await expect(page.locator('#impNote')).toContainText('1 note without a checklist or task is left out.');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => t.text);
    expect(texts('2026-11-24')).toEqual(['Weekend errands #errands #home', 'Packing list #errands #travel']);
    const [errands, packing] = s.days['2026-11-24'].tasks;
    expect(errands.subs.map(x => [x.text, x.done])).toEqual([
      ['Buy bin bags', true],
      ['Return the library books', false],
    ]);
    expect(errands.note).toContain('<b>Saturday</b>');
    expect(errands.note).toContain('<a href="https://example.com/shop" target="_blank" rel="noopener noreferrer">example.com/shop</a>');
    expect(errands.note).not.toMatch(/Content not supported|placeholder|data-|<input/);
    expect(packing.subs.map(x => [x.text, x.done])).toEqual([
      ['Passport', true],
      ['Phone charger', false],
      ['Rain jacket', false],
    ]);
    expect(packing.note).toBe('<div>Check the weather the day before.</div>');
    expect(texts('2026-11-25')).toEqual(['Call the bank about the card #errands']);
    expect(s.days['2026-11-25'].tasks[0].note).toContain('Ask for a new card &amp; a new PIN.');
    expect(texts('2026-11-26')).toEqual(['Put the bins out #errands #weekend-errands #home']);
    expect(texts('2026-11-28')).toEqual(['Book the car service #errands #weekend-errands #home']);
    expect(s.days['2026-11-21'].tasks.map(t => [t.text, t.done])).toEqual([['Pay the parking fine #errands #weekend-errands #home', true]]);
    expect(Object.values(s.rules).map(r => [r.freq, r.start, r.days])).toEqual([['week', '2026-11-26', [3]]]);
  });

  test('a large Evernote export is read as it streams: its pictures stay out', async ({ page }) => {
    await open(page);
    const big = fixture('Errands.enex')
      .toString()
      .replace(/(<data encoding="base64">)[^<]*/, (m, a) => a + 'A'.repeat(21e6));
    await pick(page, saved('Errands.enex', big));
    await expect(page.locator('#impT')).toHaveText('6 tasks from Evernote');
  });

  test('a table from Coda or a spreadsheet: columns found by name, dates day first or month first', async ({ page }) => {
    await open(page);
    await pick(page, file('To-do list 2.csv', fixture('To-do list 2.csv'), 'text/csv'), file('Taches.csv', fixture('Taches.csv'), 'text/csv'));
    await expect(page.locator('#impT')).toHaveText('6 tasks from To-do list 2 and Taches');
    await expect(page.locator('#impNote')).not.toContainText('are read as');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => [t.text, t.done]);
    // done with a due date still to come: done today
    expect(texts('2026-11-24')).toEqual([
      ['Order donuts for the party', true],
      ['Find a popcorn machine rental', false],
      ['Appeler le garage #voiture', false],
      ['Arroser les plantes #maison', false],
    ]);
    expect(texts('2026-12-05')).toEqual([['Invite people to the tournament', false]]);
    expect(texts('2026-11-20')).toEqual([['Réserver le train #voyage #vacances', true]]);
    expect(s.days['2026-11-24'].tasks[2].note).toBe('<div>Demander un devis pour les pneus</div>');
    expect(s.days['2026-11-24'].tasks[3].note).toBe('<div>Le ficus aussi ;</div><div>et le basilic</div>');
  });

  test('dates a table leaves open (4/6) are read as this browser writes them, and the dialog says so', async ({ page }) => {
    await open(page);
    await pick(page, file('Chores.csv', 'Task,Due\nCall Sam,4/6/2027\n', 'text/csv'));
    await expect(page.locator('#impNote')).toContainText('Dates such as 4/6/2026 are read as month/day, as this browser writes them.');
    await page.locator('#impGo').click();
    expect((await stored(page)).days['2027-04-06'].tasks.map(t => t.text)).toEqual(['Call Sam']);
  });
});

test.describe('importing from other apps, at the edges', () => {
  // Five years of history in one export: one write to add it all, one to take it back.
  test('a long history is added and taken back at once, and leaves no empty days behind', async ({ page }) => {
    await open(page);
    const items = Array.from({ length: 9000 }, (_, i) => {
      const d = new Date(Date.UTC(2021, 11, 1) + Math.floor(i / 5) * 864e5);
      return { kind: 'tasks#task', id: 't' + i, title: 'Done thing ' + i, status: 'completed', completed: d.toISOString() };
    });
    await pick(page, file('Tasks.json', JSON.stringify({ kind: 'tasks#taskLists', items: [{ kind: 'tasks#tasks', title: 'Archive', items }] }), 'application/json'));
    await expect(page.locator('#impT')).toHaveText('9000 tasks from Google Tasks');
    await page.evaluate(() => {
      window.__writes = 0;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...a) {
        window.__writes++;
        return set.apply(this, a);
      };
    });
    let t = Date.now();
    await page.locator('#impGo').click();
    await expect(page.locator('#toast')).toContainText('Imported 9000 tasks from Google Tasks');
    expect(Date.now() - t).toBeLessThan(6000);
    expect(await page.evaluate(() => window.__writes)).toBeLessThan(5);
    expect(Object.keys((await stored(page)).days).length).toBe(1800);
    t = Date.now();
    await page.locator('#undo').click();
    await expect(page.locator('#toast')).toContainText('Undone');
    expect(Date.now() - t).toBeLessThan(6000);
    expect((await stored(page)).days).toEqual({});
  });

  test('if the browser can’t keep it all, nothing is added', async ({ page }) => {
    await open(page, { days: { '2026-11-24': { u: 1, tasks: [{ id: 'k1', text: 'Already here', done: false }] } } });
    await pick(page, file('todo.txt', fixture('todo.txt')));
    // the storage refuses anything as large as the import
    await page.evaluate(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'oneday.v1' && String(v).includes('Call the plumber')) throw new DOMException('full', 'QuotaExceededError');
        return set.call(this, k, v);
      };
    });
    await page.locator('#impGo').click();
    await expect(page.locator('#toast')).toContainText('That is more than this browser can keep: nothing was added');
    await expect(row(page, 'Call the plumber')).toHaveCount(0);
    await expect(row(page, 'Already here')).toBeVisible();
    const s = await stored(page);
    expect(s.days['2026-11-24'].tasks.map(t => t.text)).toEqual(['Already here']);
    expect(s.rules).toEqual({});
  });

  test('the same export twice: the dialog says they are already here', async ({ page }) => {
    await open(page);
    await pick(page, file('todo.txt', fixture('todo.txt')));
    await expect(page.locator('#impNote')).not.toContainText('already in One Day');
    await page.locator('#impGo').click();
    await expect(page.locator('#toast')).toContainText('Imported 8 tasks');
    await pick(page, file('todo.txt', fixture('todo.txt')));
    await expect(page.locator('#impNote p').first()).toHaveText('All of these are already in One Day, on the same days: adding them again would make doubles.');
  });

  test('past the 300 repeats One Day keeps, a repeat comes in once, its repeat in its note', async ({ page }) => {
    const rules = {};
    for (let i = 0; i < 299; i++) rules['r' + i] = { id: 'r' + i, text: 'Old ' + i, start: '2026-01-01', freq: 'month', every: 1 };
    await open(page, { rules });
    await pick(page, file('todo.txt', 'Water the plants rec:+1w due:2026-11-24\nPay the gym rec:1m due:2026-12-01\n'));
    await expect(page.locator('#impNote')).toContainText('1 task repeats past the 300 repeats One Day keeps: it comes in once, its repeat in its note.');
    await page.locator('#impGo').click();
    const s = await stored(page);
    expect(Object.keys(s.rules)).toHaveLength(300);
    expect(s.days['2026-12-01'].tasks[0].note).toContain('Repeats in todo.txt: rec:1m');
    expect(s.days['2026-12-01'].tasks[0].rule).toBeUndefined();
  });

  test('crafted cells and archives can’t freeze the page', async ({ page }) => {
    await open(page);
    const tt = fixture('TickTick-backup-2026-11-24.csv').toString().replace('"Projects"', `"a${'/'.repeat(30000)}b"`),
      td = 'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\n' + `task,Water @${'x@'.repeat(20000)},,4,1,,,every${' '.repeat(100000)}x,en,Europe/Paris\n`;
    let t = Date.now();
    await pick(page, file('TickTick-backup.csv', tt, 'text/csv'), file('Home.csv', td, 'text/csv'));
    expect(Date.now() - t).toBeLessThan(5000);
    await page.locator('#impNo').click();
    // a .zip whose 60 entries all point at the same stored file: read once
    const big = Buffer.from('Buy milk\n'.repeat(200000)),
      one = zip([['todo.txt', big]]),
      at = one.readUInt32LE(one.length - 6),
      entry = one.subarray(at, one.length - 22),
      dir = Buffer.concat(Array.from({ length: 60 }, () => entry)),
      end = Buffer.from(one.subarray(one.length - 22));
    end.writeUInt16LE(60, 8);
    end.writeUInt16LE(60, 10);
    end.writeUInt32LE(dir.length, 12);
    t = Date.now();
    await pick(page, file('many.zip', Buffer.concat([one.subarray(0, at), dir, end]), 'application/zip'));
    expect(Date.now() - t).toBeLessThan(5000);
    await expect(page.locator('#impT')).toHaveText('300 tasks from todo.txt');
  });

  test('plain lists stay plain lists: a "+44" or a box at the start doesn’t make them todo.txt or JSON', async ({ page }) => {
    await open(page);
    await pick(page, file('groceries.txt', '[ ] milk\n[x] eggs\n'), file('calls.txt', '- Call the plumber +44 7700 900123\n- [ ] Book the dentist\n  - ask about Friday\n'));
    await page.locator('#impGo').click();
    const s = await stored(page);
    expect(s.days['2026-11-24'].tasks.map(t => [t.text, t.done])).toEqual([
      ['milk', false],
      ['eggs', true],
      ['Call the plumber +44 7700 900123', false],
      ['Book the dentist', false],
    ]);
    expect(s.days['2026-11-24'].tasks[3].subs.map(x => x.text)).toEqual(['ask about Friday']);
  });

  test('TickTick rows that name each other as parent both come in', async ({ page }) => {
    await open(page);
    const head = '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"';
    const csv = `"Date: 2026-11-24+0000"\n"Version: 7.1"\n${head}\n"","Inbox","First","TEXT","","","N","","","","","0","0","","","0","Europe/Paris","false","false",,,"list","1","2"\n"","Inbox","Second","TEXT","","","N","","","","","0","0","","","0","Europe/Paris","false","false",,,"list","2","1"\n`;
    await pick(page, file('TickTick-backup.csv', csv, 'text/csv'));
    await page.locator('#impGo').click();
    const t = (await stored(page)).days['2026-11-24'].tasks;
    expect(t.map(x => [x.text, (x.subs || []).map(y => y.text)])).toEqual([
      ['First', []],
      ['Second', []],
    ]);
  });

  test('a line of sub-tasks thousands long is read in one go', async ({ page }) => {
    await open(page);
    const head = '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"';
    const rows = Array.from({ length: 10000 }, (_, i) => `"","Inbox","Step ${i}","TEXT","","","N","","","","","0","0","","","0","Europe/Paris","false","false",,,"list","${i + 1}","${i || ''}"`);
    const chain = Array.from({ length: 20000 }, (_, i) => ({ kind: 'tasks#task', id: 'g' + i, title: 'Part ' + i, status: 'needsAction', ...(i ? { parent: 'g' + (i - 1) } : {}) }));
    const t = Date.now();
    await pick(
      page,
      file('TickTick-backup.csv', `"Date: 2026-11-24+0000"\n"Version: 7.1"\n${head}\n${rows.join('\n')}\n`, 'text/csv'),
      file('Tasks.json', JSON.stringify({ kind: 'tasks#taskLists', items: [{ kind: 'tasks#tasks', title: 'Chain', items: chain }] }), 'application/json'),
    );
    expect(Date.now() - t).toBeLessThan(5000);
    await expect(page.locator('#impT')).toHaveText('2 tasks from TickTick and Google Tasks');
    await expect(page.locator('#impNote')).toContainText('29798 sub-tasks over 100 in a task are left out.');
  });

  test('a crafted Evernote export can’t freeze the page', async ({ page }) => {
    await open(page);
    const enex =
      '<?xml version="1.0" encoding="UTF-8"?><en-export><note>' +
      '<title>'.repeat(100000) +
      `<content><![CDATA[<en-note><div><en-todo checked="true"/>Kept</div>${'<div'.repeat(60000)}${'<en-todo'.repeat(30000)}]]></content>` +
      `<task>${'<title>'.repeat(50000)}</task>${'<reminder-time>'.repeat(40000)}</note></en-export>`;
    const t = Date.now();
    await pick(page, file('Crafted.enex', enex, 'application/xml'));
    expect(Date.now() - t).toBeLessThan(5000);
    // its checklist comes in; a task with no title, or titles never closed, doesn't
    await expect(page.locator('#impT')).toHaveText('A task from Evernote');
  });

  test('a table’s dates in any usual shape: 24.11.26, a weekday first, 26th, 12/31/99, midnight UTC', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'America/New_York', viewport: { width: 1280, height: 860 } }),
      page = await ctx.newPage();
    await open(page);
    await pick(
      page,
      file('Aufgaben.csv', 'Aufgabe;Erledigt;Fällig\nReifen wechseln;nein;24.11.26\nSteuer;nein;01.12.26\nArzt;ja;20.11.26\n', 'text/csv'),
      file('Dates.csv', 'Task,Due\nA,"Wednesday, November 25, 2026"\nB,"Nov 26th, 2026"\nC,12/31/99\nD,2026-11-27T00:00:00.000Z\nE,2026-11-28T00:00:00+00:00\n', 'text/csv'),
    );
    await expect(page.locator('#impNote')).not.toContainText('couldn’t read');
    await page.locator('#impGo').click();
    const s = await stored(page),
      texts = k => s.days[k].tasks.map(t => [t.text, t.done]);
    expect(texts('2026-11-24')).toEqual([['Reifen wechseln', false]]);
    expect(texts('2026-12-01')).toEqual([['Steuer', false]]);
    expect(texts('2026-11-20')).toEqual([['Arzt', true]]);
    expect(texts('2026-11-25')).toEqual([['A', false]]);
    expect(texts('2026-11-26')).toEqual([['B', false]]);
    expect(texts('1999-12-31')).toEqual([['C', false]]);
    expect(texts('2026-11-27')).toEqual([['D', false]]);
    expect(texts('2026-11-28')).toEqual([['E', false]]);
    await ctx.close();
  });

  test('a short plain list with one line that begins with a date stays a plain list', async ({ page }) => {
    await open(page);
    await pick(page, file('errands.txt', '2026-12-01 Dentist\nBuy milk\nCall Sam\n'));
    await page.locator('#impGo').click();
    expect((await stored(page)).days['2026-11-24'].tasks.map(t => t.text)).toEqual(['2026-12-01 Dentist', 'Buy milk', 'Call Sam']);
  });

  test('Google: a midnight made two hours east still lands on its day', async ({ browser }) => {
    const ctx = await browser.newContext({ timezoneId: 'Europe/London', viewport: { width: 1280, height: 860 } }),
      page = await ctx.newPage();
    await open(page);
    const json = JSON.stringify({
      kind: 'tasks#taskLists',
      items: [
        {
          kind: 'tasks#tasks',
          title: 'Trips',
          items: [
            { kind: 'tasks#task', id: 'a', title: 'Pack', status: 'needsAction', scheduled_time: [{ current: true, start: '2026-11-24T22:00:00Z' }] },
            { kind: 'tasks#task', id: 'b', title: 'Taxi at 22:30', status: 'needsAction', scheduled_time: [{ current: true, start: '2026-11-24T22:00:00.000431Z' }] },
          ],
        },
      ],
    });
    await pick(page, file('Tasks.json', json, 'application/json'));
    await page.locator('#impGo').click();
    const s = await stored(page);
    // midnight in Athens is 22:00 in London, the day before; a timed task keeps its own day
    expect(s.days['2026-11-25'].tasks.map(t => t.text)).toEqual(['Pack #trips']);
    expect(s.days['2026-11-24'].tasks.map(t => t.text)).toEqual(['Taxi at 22:30 #trips']);
    await ctx.close();
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
