---
name: one-day
description: Puts tasks into One Day (day.bemorin.com), a private to-do list that keeps tasks in the user's browser, by writing a link the user opens. Use it when the user asks to add, plan or schedule tasks, to-dos or reminders in One Day, with notes, sub-tasks, days or repeats.
---

# One Day links

One Day has no server and no account: tasks reach it in a link, after the `#`, which the browser never sends anywhere. Opening the link shows the tasks in One Day, and the user adds them in one click. The link is the whole job: don't open One Day or click in it to add the tasks.

## Build the link

`https://day.bemorin.com/#add?` followed by `name=value` pairs joined by `&`. Each `task=` starts a new task; the pairs after it describe that task, until the next `task=`.

- `task=` the task as it should read, in the user's language, up to 500 characters. Words starting with `#` become tags.
- `note=` details, as plain text: `**bold**`, `*italic*`, lines starting with `- ` and links are kept.
- `sub=` one sub-task; repeat it for more (up to 100).
- `day=` `today`, `tomorrow`, a weekday (`monday` to `sunday`: the next one, today included) or `YYYY-MM-DD`. Leave it out when the user names no day: they will pick one.
- `repeat=` `daily`, `weekdays`, `weekends`, `weekly`, `monthly`, `yearly`, or an iCalendar RRULE: `FREQ=DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`, with `INTERVAL=n`, `BYDAY` (`MO,TH`; in a month `2TU` or `-1FR`), `BYMONTHDAY=15` in a monthly repeat (`-1` for the last day), `BYMONTH=3;BYMONTHDAY=14` in a yearly one (a yearly date always names its month), `UNTIL=YYYYMMDD` or `COUNT=n`. A repeat counts from the task's day: `weekly` and `monthly` follow that day's weekday or date.

## Encode the values

As in a URL query: a space is `+`; write `%2B` for `+`, `%26` for `&`, `%3D` for `=`, `%23` for `#`, `%25` for `%`, `%28` and `%29` for `(` and `)`, and `%0A` for a line break. Accented letters and emoji can stay as they are. In a repeat, `;` and `=` can stay: `repeat=FREQ=WEEKLY;BYDAY=MO,TH`.

If you can run code, let it do the encoding:

```python
from urllib.parse import urlencode
pairs = [("task", "Buy bread"), ("day", "tomorrow"), ("task", "Water the plants"), ("repeat", "FREQ=WEEKLY;BYDAY=TU,FR")]
print("https://day.bemorin.com/#add?" + urlencode(pairs))
```

## Answer

Give one link holding all the tasks, as a Markdown link such as `[Add 3 tasks to One Day](…)`, and list in a few words what it holds. A link holds up to 100 tasks; past about 8,000 characters, split them into several links.

For "buy bread tomorrow, call the bank about the loan (find the number first), and water the plants every Tuesday and Friday":

https://day.bemorin.com/#add?task=Buy+bread&day=tomorrow&task=Call+the+bank&note=About+the+loan&sub=Find+the+number&task=Water+the+plants&repeat=FREQ=WEEKLY;BYDAY=TU,FR

This sends nothing anywhere: the tasks stay inside the link until the user opens it and confirms. The full format is `docs/links.md` in github.com/bemorin/one-day.
