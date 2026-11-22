# Adding tasks with a link

One Day has no server, so nothing can push tasks into it. A link can carry them instead. Everything after the `#` in an address stays in the browser that opens it: it is never sent to a server, not even to day.bemorin.com. Opening the link shows the tasks in One Day, which adds them only once you say so.

That is how an assistant such as Claude or ChatGPT can add tasks: it writes the link, you open it. This page describes the link, so that any assistant (or script) can build one, and how to set up [Claude](#claude-desktop-and-claude-code) and [ChatGPT](#chatgpt-claudeai-and-other-assistants).

## The link

```
https://day.bemorin.com/#add?task=Buy+bread&day=tomorrow
```

After `#add?` come `name=value` pairs joined by `&`, as in a query string. Each `task=` starts a new task, and the pairs that follow it describe that task, until the next `task=`.

| Name     | Value                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task`   | The task, as it should read in the list, up to 500 characters. Words starting with `#` become tags (`#work`). Required: it starts a task.                                                                                         |
| `note`   | A note: plain text, with the Markdown the note editor understands: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, lines starting with `- ` or `1. ` for lists, and links (`[text](https://…)` or a bare address). Up to 10,000 characters. Several `note=` are joined by line breaks. |
| `sub`    | A sub-task, up to 300 characters. Repeat it for more (up to 100). One that starts with `[x] ` comes in done; a leading `- `, `* ` or `[ ] ` is left out, so a sub-task that should start with one of these goes behind `[ ] `. |
| `day`    | `today`, `tomorrow`, a weekday (`monday` to `sunday`, or their first letters, at least three: the next one, today included), or a date as `YYYY-MM-DD`. A date already gone becomes today, unless the task repeats.            |
| `repeat` | How the task repeats: see [Repeats](#repeats).                                                                                                                                                                                     |

A `day=` before the first `task=` is the day for every task that names none.

One link holds up to 100 tasks. Keep it under about 8,000 characters, so it survives being sent and pasted around.

### Writing the values

Values are written as in a query string:

- a space is `+` (or `%20`);
- `+` is `%2B`, `&` is `%26`, `=` is `%3D`, `#` is `%23`, `%` is `%25`, a line break is `%0A`;
- `(` and `)` are `%28` and `%29` when the link goes inside a Markdown link;
- letters with accents, and any other character, can stay as they are (`Café`) or be percent-encoded as UTF-8 (`Caf%C3%A9`).

In a repeat, `;` and `=` can stay as they are: `repeat=FREQ=WEEKLY;BYDAY=MO,TH`.

### Repeats

A word:

| Word       | Repeats                                         |
| ---------- | ----------------------------------------------- |
| `daily`    | every day                                       |
| `weekdays` | Monday to Friday                                |
| `weekends` | Saturday and Sunday                             |
| `weekly`   | every week, on the weekday of the task's day    |
| `monthly`  | every month, on the date of the task's day      |
| `yearly`   | every year, on the date of the task's day       |

Or an iCalendar rule ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10) `RRULE`, with or without the `RRULE:` in front), made of the parts One Day can follow:

- `FREQ=DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`, required;
- `INTERVAL=n`, up to 99 (8 for `YEARLY`);
- `BYDAY`: weekdays for `DAILY` or `WEEKLY` (`MO,TU,WE,TH,FR,SA,SU`); for `MONTHLY`, one weekday with its rank, `1MO` to `4MO` or `-1MO` for the last (`BYSETPOS=n` can give the rank instead); for `YEARLY`, the same with `BYMONTH`;
- `BYMONTHDAY=n`, 1 to 31, for `MONTHLY` (or `-1`, the last day of the month), or for `YEARLY` with `BYMONTH`. In a month too short for the date, the task comes on the month's last day;
- `BYMONTH=n`, 1 to 12, for `YEARLY`;
- `UNTIL=YYYYMMDD` (the last day) or `COUNT=n` (how many times).

Times of day (`BYHOUR`, `BYMINUTE`, `BYSECOND`) and `WKST` are ignored. Anything else, such as several `BYMONTHDAY`, `BYYEARDAY`, `BYWEEKNO`, a fifth weekday or `HOURLY`, is not followed: the task comes in without its repeat, and the dialog says “Repeat not understood”.

A repeat counts from the task's day, its `day=` or the day picked in the dialog: the task first comes on the first day from there that fits.

| To repeat                     | `repeat=`                          |
| ----------------------------- | ---------------------------------- |
| Every Monday and Thursday     | `FREQ=WEEKLY;BYDAY=MO,TH`          |
| Every other week              | `FREQ=WEEKLY;INTERVAL=2`           |
| On the last Friday of a month | `FREQ=MONTHLY;BYDAY=-1FR`          |
| On the 15th of each month     | `FREQ=MONTHLY;BYMONTHDAY=15`       |
| Every 14 March                | `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14` |
| On the last day of each month | `FREQ=MONTHLY;BYMONTHDAY=-1`       |
| Every day for a week          | `FREQ=DAILY;COUNT=7`               |

### An example

```
https://day.bemorin.com/#add?task=Prepare+the+talk+%23work&note=Slides+and+**demo**%0A-+Intro%0A-+Questions&sub=Write+the+outline&sub=Book+the+room&day=friday&task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU,FR&task=Call+the+bank&day=tomorrow
```

Three tasks: a talk to prepare on Friday, with a note and two sub-tasks; plants to water every Tuesday and Friday, from the day picked in the dialog; the bank to call tomorrow.

### When the link opens

- One Day takes the tasks out of the address at once, so a reload or the Back button does not offer them again. Your browser's history may still list the link, as it lists any address you open.
- A dialog lists the tasks, each with its note, sub-tasks, day and repeat, and the last day of a repeat that ends. When they all go to the same day, the day chip shows it and can change it for all of them. When the link spreads them over several days, each keeps its own, and the chip holds the day for those that name none.
- Each task has a box, ticked: untick one to leave it out. **Add all** (or **Add 12**, once some are unticked) puts the ticked ones in, with one undo. **Ignore** drops them all. Nothing is stored before that.

### The compact form

**Send** in One Day makes links in a compact form: `#add=z` followed by the tasks as JSON, compressed with deflate-raw and encoded in base64url (`#add=j` is the same without compression). The JSON is `{"v":1,"t":"the task","n":"the note, in HTML","s":[["a sub-task"],["a done sub-task",1]]}` for one task, or `{"v":1,"d":[task, task, …]}` for several. A task in it can also have `"day"` and `"repeat"`, with the values above. Assistants should write the readable form.

## Assistants

### Claude Desktop and Claude Code

[`mcp/`](../mcp) holds a small MCP server with one tool, `make_one_day_link`. It runs on your computer, opens no network connection and keeps nothing: Claude passes it the tasks, it returns the link. See [its README](../mcp/README.md) to install it.

### ChatGPT, claude.ai and other assistants

They need no server. Where the assistant takes skills, add [`skills/one-day`](../skills/one-day/SKILL.md): the same instructions as a skill, with no length limit, that the assistant uses when you mention One Day (in ChatGPT, Plugins → Skills → Create, then paste it in the editor or upload the folder; type `@` to pick it by name; in claude.ai, upload the folder as a zip under Settings → Capabilities). Otherwise, paste these instructions where the assistant keeps them (in ChatGPT, the custom instructions in Settings → Personalization, a project's instructions or a custom GPT's; in claude.ai, a project's instructions or your profile preferences). Then ask, in any language: “Add to One Day: buy bread tomorrow, and water the plants every Tuesday and Friday.”

```text
When I ask to add tasks to One Day, answer with one link holding them all, shown as a Markdown link "Add to One Day". Build it as https://day.bemorin.com/#add? followed by name=value pairs joined by &:
task= the task (#word makes a tag). Each task= starts a new task; the pairs after it describe that task.
note= details (plain text; **bold**, - lists and links work)
sub= one sub-task; repeat it for more
day= today, tomorrow, monday…sunday (the next one) or YYYY-MM-DD. Leave it out and I choose.
repeat= daily, weekdays, weekends, weekly, monthly, yearly, or an RRULE such as FREQ=WEEKLY;BYDAY=MO,TH or FREQ=MONTHLY;BYDAY=-1FR. It counts from the task's day.
Encode values as in a URL query: a space is +, and write %2B for +, %26 for &, %23 for #, %25 for %, %28 and %29 for ( ), %0A for a new line. Accented letters can stay as they are.
Example: https://day.bemorin.com/#add?task=Buy+bread&day=tomorrow&task=Call+the+bank&note=About+the+loan&sub=Find+the+number&task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU,FR
Nothing is sent anywhere: the tasks stay in the link until I open it and confirm.
```

If the assistant shows the link as plain text, copy it into the address bar. For your own copy of One Day, put its address in place of `https://day.bemorin.com/`.

## Privacy, plainly

- **One Day sees nothing.** The part after `#` is never sent to day.bemorin.com, nor to Cloudflare, which hosts it. The host only sees that the page was opened, as for any visit.
- **The link holds the tasks in plain text.** Anyone who has it can read them, as with any message, and your browser's history can keep it, as it keeps any address you open.
- **Your assistant's provider** (Anthropic, OpenAI…) sees what you ask it and the link it writes, as with anything you tell it, and keeps them in your chat history as it keeps the rest of the conversation.
- **The MCP server** runs on your computer, opens no network connection, writes no file and keeps nothing between calls.
- **There is no remote MCP server, on purpose.** ChatGPT and claude.ai connectors can only reach servers on the internet. One would receive every task in clear on its way: the words, notes, days and repeats, and the address of the assistant's servers calling it, even if it stored and logged nothing. The instructions above do the same job without it.
