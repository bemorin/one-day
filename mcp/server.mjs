#!/usr/bin/env node
/*! One Day for assistants: a local MCP server with one tool, make_one_day_link. MIT License. */
// It turns tasks into a One Day link and does nothing else: it reads JSON-RPC on stdin, answers on stdout, opens no
// network connection, writes no file and keeps nothing between calls. The tasks reach One Day only when the user opens
// the link, and they travel in it after the #, which browsers never send to a server.
//
// It speaks both generations of the Model Context Protocol over stdio: the stateless one (2026-07-28: server/discover,
// the version in each request's _meta) and the earlier one that starts with initialize (2024-11-05 to 2025-11-25).
import { createInterface } from 'node:readline';
import { oneDayLink, appUrl, DEFAULT_URL, LIMITS } from './link.mjs';

const INFO = { name: 'one-day', title: 'One Day', version: '1.0.0' };
const MODERN = ['2026-07-28'],
  LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
  VERSIONS = [...MODERN, ...LEGACY];
const BASE = appUrl(process.env.ONE_DAY_URL) || DEFAULT_URL;
const INSTRUCTIONS =
  'make_one_day_link puts tasks in a link that adds them to One Day, a private to-do list that keeps tasks in the ' +
  "user's browser. Nothing is sent anywhere: give the link to the user, who opens it and confirms.";

const TOOL = {
  name: 'make_one_day_link',
  title: 'Make a One Day link',
  description:
    `Turns tasks into a link that adds them to One Day (${BASE}), a private to-do list that keeps tasks only in the ` +
    "user's browser. Use it when the user wants tasks, to-dos or a plan in One Day. Several tasks, each with an " +
    'optional note, sub-tasks, day and repeat, go in one link. Nothing is sent anywhere: the tasks travel inside the ' +
    "link, after the #. Give the link to the user; opening it shows the tasks in One Day, which adds them once the user " +
    'confirms.',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: LIMITS.tasks,
        description: 'The tasks, in the order they should appear.',
        items: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              maxLength: LIMITS.title,
              description: 'What to do, as it should read in the list. Words starting with # become tags (#work).',
            },
            note: {
              type: 'string',
              maxLength: LIMITS.note,
              description:
                'Optional details. Plain text with line breaks; **bold**, *italic*, `code`, ~~strike~~, "- " lists and links are kept.',
            },
            subtasks: {
              type: 'array',
              maxItems: LIMITS.subtasks,
              items: { type: 'string', maxLength: LIMITS.subtask },
              description: 'Optional checklist inside the task.',
            },
            day: {
              type: 'string',
              description:
                'Optional: today, tomorrow, a weekday (monday…sunday: the next one, today included) or a date as YYYY-MM-DD. ' +
                'Leave it out to let the user pick the day (today by default). For a repeating task, the day it starts from.',
            },
            repeat: {
              type: 'string',
              description:
                'Optional: daily, weekdays, weekends, weekly, monthly, yearly, or an iCalendar RRULE such as ' +
                'FREQ=WEEKLY;BYDAY=MO,TH, FREQ=WEEKLY;INTERVAL=2, FREQ=MONTHLY;BYDAY=-1FR (last Friday), ' +
                'FREQ=MONTHLY;BYMONTHDAY=15 or FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14, with UNTIL=YYYYMMDD or COUNT=n if it ends. ' +
                'weekly and monthly follow the weekday or date of the task’s day.',
            },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    },
    required: ['tasks'],
    additionalProperties: false,
  },
  annotations: { title: 'Make a One Day link', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const DAY_MS = 864e5;
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message, data) => ({ jsonrpc: '2.0', id, error: data ? { code, message, data } : { code, message } });

function call(id, params, more) {
  if (params.name !== TOOL.name) return fail(id, -32602, `Unknown tool: ${params.name}`);
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  let text, isError;
  try {
    const { url, count } = oneDayLink(args.tasks, BASE),
      what = count > 1 ? `${count} tasks` : 'the task';
    text =
      `${url}\n\nShow this link to the user as a clickable link, such as “Add ${count > 1 ? `${count} tasks` : 'it'} to One Day”. ` +
      `Opening it shows ${what} in One Day, which adds ${count > 1 ? 'them' : 'it'} once the user confirms. ` +
      'Nothing was sent anywhere: everything is inside the link, after the #.';
    isError = false;
  } catch (e) {
    text = e.message;
    isError = true;
  }
  return ok(id, { resultType: 'complete', content: [{ type: 'text', text }], isError, ...more });
}

function handle(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return fail(null, -32600, 'Invalid request');
  // This server sends no requests, so a response coming in has nothing to answer.
  if ('result' in m || 'error' in m) return null;
  if (m.id === null) return fail(null, -32600, 'Invalid request: an id is a string or a number');
  const isRequest = m.id !== undefined;
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return isRequest ? fail(m.id, -32600, 'Invalid request') : null;
  // Notifications (initialized, cancelled…) need no answer.
  if (!isRequest) return null;
  const { id, method } = m,
    params = m.params && typeof m.params === 'object' ? m.params : {},
    asked = params._meta && params._meta['io.modelcontextprotocol/protocolVersion'];
  if (asked !== undefined && method !== 'initialize' && !VERSIONS.includes(asked))
    return fail(id, -32022, 'Unsupported protocol version', { supported: VERSIONS, requested: asked });
  // stateless requests (2026-07-28) get the server's name in every result
  const more = asked !== undefined ? { _meta: { 'io.modelcontextprotocol/serverInfo': INFO } } : {};
  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0],
        capabilities: { tools: {} },
        serverInfo: INFO,
        instructions: INSTRUCTIONS,
      });
    case 'server/discover':
      return ok(id, {
        resultType: 'complete',
        supportedVersions: VERSIONS,
        capabilities: { tools: {} },
        _meta: { 'io.modelcontextprotocol/serverInfo': INFO },
        instructions: INSTRUCTIONS,
        ttlMs: DAY_MS,
        cacheScope: 'public',
      });
    case 'ping':
      return ok(id, asked !== undefined ? { resultType: 'complete', ...more } : {});
    case 'tools/list':
      return ok(id, { resultType: 'complete', tools: [TOOL], ttlMs: DAY_MS, cacheScope: 'public', ...more });
    case 'tools/call':
      return call(id, params, more);
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return send(fail(null, -32700, 'Parse error'));
  }
  if (Array.isArray(msg)) {
    if (!msg.length) return send(fail(null, -32600, 'Invalid request: an empty batch'));
    const out = msg.map(handle).filter(Boolean);
    if (out.length) send(out);
  } else {
    const out = handle(msg);
    if (out) send(out);
  }
});
lines.on('close', () => process.exit(0));
