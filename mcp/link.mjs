// One Day links. The tasks travel in the address, after the #, which browsers never send to a server:
//   https://day.bemorin.com/#add?task=…&note=…&sub=…&day=…&repeat=…
// This module builds that link and checks it holds what One Day can read. The format is described in
// docs/links.md; the app reads it in public/app.js (readQuery, linkDay, linkRepeat).

export const DEFAULT_URL = 'https://day.bemorin.com/';
export const LIMITS = { tasks: 100, title: 500, note: 10000, subtasks: 100, subtask: 300, link: 8000 };

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// A day: today, tomorrow, a weekday (the next one, today included) or YYYY-MM-DD.
export function isDay(v) {
  v = String(v).trim().toLowerCase();
  if (v === 'today' || v === 'tomorrow') return true;
  if (v.length >= 3 && WEEKDAYS.some(n => n.startsWith(v))) return true;
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

// How a task repeats: a word, or an iCalendar RRULE made of the parts One Day can follow. The same rules as
// linkRepeat() in public/app.js: what it returns null for, One Day would not repeat.
const WORDS = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekends: 'FREQ=WEEKLY;BYDAY=SA,SU',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
  annually: 'FREQ=YEARLY',
};
const PARTS = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'UNTIL', 'COUNT', 'WKST', 'BYHOUR', 'BYMINUTE', 'BYSECOND'];
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const MAXD = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function parseRepeat(v) {
  v = String(v).trim();
  if (!v || v.length > 200) return null;
  const w = v.toLowerCase();
  v = (Object.hasOwn(WORDS, w) ? WORDS[w] : v.replace(/^RRULE:/i, '')).toUpperCase();
  const o = {};
  for (const part of v.split(';')) {
    if (!part.trim()) continue;
    const i = part.indexOf('=');
    if (i < 1) return null;
    o[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  const freq = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[o.FREQ],
    num = (s, lo, hi) => (/^[+-]?\d{1,4}$/.test(s) && +s >= lo && +s <= hi ? +s : null);
  if (!freq || Object.keys(o).some(k => !PARTS.includes(k))) return null;
  const every = o.INTERVAL == null ? 1 : num(o.INTERVAL, 1, freq === 'year' ? 8 : 99);
  if (every == null) return null;
  const sp = { freq, every };
  if (o.BYDAY) {
    const ds = o.BYDAY.split(',').map(s => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s.trim()));
    if (ds.some(m => !m)) return null;
    if (freq === 'day' || freq === 'week') {
      if (o.BYSETPOS || ds.some(m => m[1]) || (freq === 'day' && every > 1)) return null;
      sp.freq = 'week';
      sp.days = [...new Set(ds.map(m => DAYS.indexOf(m[2])))].sort((a, b) => a - b);
    } else {
      const n = ds.length === 1 ? num(ds[0][1] != null ? ds[0][1] : o.BYSETPOS, -1, 4) : null;
      if (!n || (freq === 'year' && !o.BYMONTH) || (ds[0][1] != null && o.BYSETPOS)) return null;
      sp.nth = n;
      sp.wd = DAYS.indexOf(ds[0][2]);
    }
  } else if (o.BYSETPOS) return null;
  if (o.BYMONTH) {
    sp.mo = num(o.BYMONTH, 1, 12);
    if (!sp.mo || freq !== 'year') return null;
  }
  if (o.BYMONTHDAY) {
    // a date of the month (-1, the last day, in a monthly repeat); in a year, only with a month that has it
    sp.md = freq === 'month' && o.BYMONTHDAY === '-1' ? 31 : num(o.BYMONTHDAY, 1, 31);
    if (!sp.md || sp.nth || (freq !== 'month' && !sp.mo) || (sp.mo && sp.md > MAXD[sp.mo - 1])) return null;
  }
  if (o.UNTIL) {
    const m = /^(\d{4})-?(\d\d)-?(\d\d)(T[\dZ]*)?$/.exec(o.UNTIL);
    if (!m || !isDay(`${m[1]}-${m[2]}-${m[3]}`)) return null;
    sp.until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (o.COUNT) {
    sp.count = num(o.COUNT, 1, 1000);
    if (!sp.count) return null;
  }
  return sp;
}

// The app's address, without any # part: https, or plain http only on this computer (a copy being developed). On a
// plain-http page, anyone on the way could serve a script that reads the tasks after the #. No user:password@ either.
export function appUrl(v) {
  try {
    const u = new URL(String(v || '').trim());
    const local = u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    if ((u.protocol !== 'https:' && !local) || u.username || u.password) return null;
    u.hash = '';
    return u.href;
  } catch (e) {
    return null;
  }
}

const words = v => String(v).replace(/\s+/g, ' ').trim();

// tasks: [{ title, note?, subtasks?, day?, repeat? }]. Returns { url, count }, or throws an Error whose message says
// what to change, one line per problem.
export function oneDayLink(tasks, base = DEFAULT_URL) {
  const L = LIMITS;
  if (!Array.isArray(tasks) || !tasks.length)
    throw new Error('Give at least one task: tasks is a list of { title, note?, subtasks?, day?, repeat? }.');
  if (tasks.length > L.tasks) throw new Error(`One link holds up to ${L.tasks} tasks: split them into several links.`);
  const p = new URLSearchParams(),
    bad = [];
  tasks.forEach((t, i) => {
    const at = `tasks[${i}]`;
    if (!t || typeof t !== 'object' || Array.isArray(t)) return bad.push(`${at} must be an object with a title.`);
    const title = typeof t.title === 'string' ? words(t.title) : '';
    if (!title) bad.push(`${at}.title is missing.`);
    else if (title.length > L.title) bad.push(`${at}.title is longer than ${L.title} characters.`);
    p.append('task', title);
    if (t.day != null && t.day !== '') {
      if (typeof t.day !== 'string' || !isDay(t.day))
        bad.push(`${at}.day "${t.day}" is not a day: use today, tomorrow, a weekday (monday…sunday) or YYYY-MM-DD.`);
      else p.append('day', t.day.trim());
    }
    if (t.repeat != null && t.repeat !== '') {
      if (typeof t.repeat !== 'string' || !parseRepeat(t.repeat))
        bad.push(
          `${at}.repeat "${t.repeat}" is not a repeat One Day can follow: use daily, weekdays, weekends, weekly, monthly, yearly, or an RRULE with FREQ=DAILY|WEEKLY|MONTHLY|YEARLY and INTERVAL, BYDAY (MO…SU, or 1MO…4MO and -1MO in a month), BYMONTHDAY, BYMONTH, UNTIL or COUNT.`,
        );
      else p.append('repeat', t.repeat.trim());
    }
    if (t.note != null && t.note !== '') {
      if (typeof t.note !== 'string') bad.push(`${at}.note must be text.`);
      else if (t.note.length > L.note) bad.push(`${at}.note is longer than ${L.note} characters.`);
      else if (t.note.trim()) p.append('note', t.note.replace(/\r\n?/g, '\n').trim());
    }
    if (t.subtasks != null) {
      if (!Array.isArray(t.subtasks)) bad.push(`${at}.subtasks must be a list of texts.`);
      else if (t.subtasks.length > L.subtasks) bad.push(`${at} has more than ${L.subtasks} sub-tasks.`);
      else
        t.subtasks.forEach((s, j) => {
          const w = typeof s === 'string' ? words(s) : '';
          if (!w) bad.push(`${at}.subtasks[${j}] is empty.`);
          else if (w.length > L.subtask) bad.push(`${at}.subtasks[${j}] is longer than ${L.subtask} characters.`);
          // One Day reads a leading "- ", "* " or "[x] " as list marks: such a sub-task goes behind an empty box
          else p.append('sub', /^(?:[-*•]\s|\[[ xX]\])/.test(w) ? '[ ] ' + w : w);
        });
    }
  });
  if (bad.length) throw new Error('The link could not be made:\n- ' + bad.join('\n- '));
  const root = appUrl(base) || DEFAULT_URL,
    url = root + '#add?' + p.toString();
  if (url.length > L.link)
    throw new Error(
      `The link would be ${url.length} characters long, more than the ${L.link} that travel safely: split the tasks into several links, or shorten the notes.`,
    );
  return { url, count: tasks.length };
}
