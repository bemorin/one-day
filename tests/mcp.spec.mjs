import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { oneDayLink, parseRepeat, isDay, DEFAULT_URL } from '../mcp/link.mjs';

// The MCP server in mcp/, spoken to over stdio as Claude Desktop or Claude Code would.
const SERVER = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));
function mcp(env = {}) {
  const p = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] }),
    got = [],
    waiting = [];
  createInterface({ input: p.stdout }).on('line', l => {
    const m = JSON.parse(l),
      w = waiting.shift();
    if (w) w(m);
    else got.push(m);
  });
  const next = () => (got.length ? Promise.resolve(got.shift()) : new Promise(r => waiting.push(r)));
  return {
    send: m => p.stdin.write((typeof m === 'string' ? m : JSON.stringify(m)) + '\n'),
    next,
    ask(m) {
      this.send({ jsonrpc: '2.0', ...m });
      return next();
    },
    close: () => new Promise(r => (p.on('exit', r), p.stdin.end())),
  };
}
const meta = (v = '2026-07-28') => ({ _meta: { 'io.modelcontextprotocol/protocolVersion': v, 'io.modelcontextprotocol/clientCapabilities': {} } });
const tasks = [
  { title: 'Plan the week #work', note: '**Monday** first\n- email\n- calls', subtasks: ['Check the calendar', 'Book a room'], day: 'tomorrow' },
  { title: 'Stretch', repeat: 'weekdays' },
];

test.describe('MCP server', () => {
  test('clients that start with initialize get the tool, and a call returns a One Day link', async () => {
    const s = mcp();
    const init = await s.ask({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'one-day' } });
    s.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const list = await s.ask({ id: 2, method: 'tools/list' });
    expect(list.id).toBe(2);
    expect(list.result.tools.map(t => t.name)).toEqual(['make_one_day_link']);
    expect(list.result.tools[0].annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    const call = await s.ask({ id: 3, method: 'tools/call', params: { name: 'make_one_day_link', arguments: { tasks } } });
    expect(call.result.isError).toBe(false);
    expect(call.result.content[0].text).toContain(DEFAULT_URL + '#add?task=Plan+the+week+%23work&day=tomorrow&note=');
    // an unknown version gets the latest of the earlier ones
    const old = await s.ask({ id: 4, method: 'initialize', params: { protocolVersion: '2024-01-01', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
    expect(old.result.protocolVersion).toBe('2025-11-25');
    await s.close();
  });

  test('stateless clients (2026-07-28) discover it, and an unknown version is refused with the ones it speaks', async () => {
    const s = mcp();
    const d = await s.ask({ id: 'd', method: 'server/discover', params: meta() });
    expect(d.result).toMatchObject({ resultType: 'complete', capabilities: { tools: {} }, cacheScope: 'public' });
    expect(d.result.supportedVersions).toContain('2026-07-28');
    expect(d.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('one-day');
    const list = await s.ask({ id: 2, method: 'tools/list', params: meta() });
    expect(list.result).toMatchObject({ resultType: 'complete', cacheScope: 'public' });
    expect(list.result.ttlMs).toBeGreaterThan(0);
    const call = await s.ask({ id: 3, method: 'tools/call', params: { name: 'make_one_day_link', arguments: { tasks }, ...meta() } });
    expect(call.result).toMatchObject({ resultType: 'complete', isError: false });
    const no = await s.ask({ id: 4, method: 'tools/list', params: meta('1900-01-01') });
    expect(no.error).toMatchObject({ code: -32022, data: { requested: '1900-01-01' } });
    expect(no.error.data.supported).toContain('2026-07-28');
    await s.close();
  });

  test('mistakes come back as words an assistant can act on', async () => {
    const s = mcp();
    const bad = await s.ask({
      id: 1,
      method: 'tools/call',
      params: { name: 'make_one_day_link', arguments: { tasks: [{ title: ' ', day: 'next friday', repeat: 'FREQ=HOURLY', subtasks: [''] }] } },
    });
    expect(bad.result.isError).toBe(true);
    for (const w of ['tasks[0].title', 'tasks[0].day', 'tasks[0].repeat', 'tasks[0].subtasks[0]']) expect(bad.result.content[0].text).toContain(w);
    expect((await s.ask({ id: 2, method: 'tools/call', params: { name: 'nope', arguments: {} } })).error.code).toBe(-32602);
    expect((await s.ask({ id: 3, method: 'resources/list' })).error.code).toBe(-32601);
    s.send('not json');
    expect((await s.next()).error.code).toBe(-32700);
    // a notification gets no answer: the next message is the ping's
    s.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 9 } });
    expect(await s.ask({ id: 4, method: 'ping' })).toEqual({ jsonrpc: '2.0', id: 4, result: {} });
    await s.close();
  });

  test('its link opens in One Day with everything in it', async ({ page, baseURL }) => {
    const s = mcp({ ONE_DAY_URL: baseURL });
    const call = await s.ask({ id: 1, method: 'tools/call', params: { name: 'make_one_day_link', arguments: { tasks } } });
    await s.close();
    const url = call.result.content[0].text.split('\n')[0];
    expect(url.startsWith(baseURL + '/#add?')).toBe(true);
    await page.clock.setFixedTime(new Date('2026-11-23T10:00:00'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    await page.goto(url);
    await expect(page.locator('#inT')).toHaveText('2 tasks for you');
    await expect(page.locator('#inList .inlm')).toHaveText(['Note · 2 sub-tasks · Tomorrow', 'Every weekday, from today']);
    await page.locator('#inYes').click();
    await expect(page.locator('#list .row', { hasText: 'Stretch' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    const r = page.locator('#list .row', { hasText: 'Plan the week' });
    await r.locator('.mt').click();
    await expect(r.locator('.note b')).toHaveText('Monday');
    await expect(r.locator('.note li')).toHaveText(['email', 'calls']);
    await expect(r.locator('.sub')).toHaveText(['Check the calendar', 'Book a room']);
  });

  test('the server and the app agree on what a day and a repeat are', async ({ page }) => {
    const reps = [
      'daily', 'Weekly', 'weekdays', 'yearly', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH', 'FREQ=DAILY;BYDAY=SA,SU', 'FREQ=MONTHLY;BYDAY=-1FR',
      'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1', 'FREQ=MONTHLY;BYMONTHDAY=31', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', 'FREQ=WEEKLY;COUNT=4;WKST=SU',
      'FREQ=DAILY;UNTIL=20271231T000000Z', 'FREQ=WEEKLY;BYHOUR=9', 'FREQ=MONTHLY;INTERVAL=99', 'FREQ=YEARLY;INTERVAL=9',
      'FREQ=MONTHLY;BYDAY=MO,TU', 'FREQ=MONTHLY;BYDAY=5MO', 'FREQ=MONTHLY;BYMONTHDAY=-1', 'FREQ=MONTHLY;BYMONTHDAY=1,15',
      'FREQ=WEEKLY;BYMONTH=3', 'FREQ=YEARLY;BYDAY=1MO', 'FREQ=YEARLY;BYWEEKNO=20', 'FREQ=HOURLY', 'FREQ=DAILY;INTERVAL=2;BYDAY=MO',
      'FREQ=DAILY;UNTIL=20260230', 'FREQ=DAILY;COUNT=0', 'every monday', '',
    ];
    const days = ['today', 'Tomorrow', 'fri', 'thurs', 'sunday', '2026-12-31', '2028-02-29', 'mo', '2026-02-30', '26-12-01', 'next week', 'sunny'];
    await page.clock.setFixedTime(new Date('2026-11-23T10:00:00'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#app')).not.toHaveClass(/\bpre\b/);
    const e = encodeURIComponent;
    await page.goto('/#add?' + reps.map((r, i) => `task=R${i}&repeat=${e(r)}`).join('&'));
    const rm = await page.locator('#inList .inlm').allTextContents();
    expect(rm.map(t => !t.includes('Repeat not understood'))).toEqual(reps.map(r => !r || !!parseRepeat(r)));
    await page.locator('#inNo').click();
    // the first two make the tasks go to different days, so each line says its own
    await page.goto('/#add?task=A&day=2026-12-24&task=B&day=2026-12-25&' + days.map((d, i) => `task=D${i}&day=${e(d)}`).join('&'));
    const dm = (await page.locator('#inList .inlm').allTextContents()).slice(2);
    expect(dm.map(t => t !== '')).toEqual(days.map(isDay));
  });

  test('a link is refused when it would be too long to travel, and the address can be another copy of One Day', () => {
    expect(() => oneDayLink([{ title: 'x', note: 'y'.repeat(9000) }])).toThrow(/8000/);
    expect(() => oneDayLink(Array.from({ length: 101 }, () => ({ title: 'x' })))).toThrow(/100 tasks/);
    expect(() => oneDayLink([])).toThrow(/at least one task/);
    expect(oneDayLink([{ title: 'Hi' }], 'https://example.com/day/#old').url).toBe('https://example.com/day/#add?task=Hi');
    expect(oneDayLink([{ title: 'Hi' }], 'javascript:alert(1)').url).toBe(DEFAULT_URL + '#add?task=Hi');
    expect(oneDayLink([{ title: '(a) & b + c = d #e' }]).url).toBe(DEFAULT_URL + '#add?task=%28a%29+%26+b+%2B+c+%3D+d+%23e');
  });
});
