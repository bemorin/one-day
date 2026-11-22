# One Day for Claude

A small [MCP](https://modelcontextprotocol.io) server with one tool, `make_one_day_link`. Claude gives it tasks, each with an optional note, sub-tasks, day and repeat, and gets back a link that adds them to [One Day](https://day.bemorin.com). You open the link, check the tasks, and add them.

- **Nothing leaves your computer through it.** It runs locally, reads requests on stdin and answers on stdout. It opens no network connection, writes no file and keeps nothing between calls.
- **Nothing travels through a server.** The tasks ride in the link, after the `#`, which browsers never send to a server. One Day stores them in your browser once you confirm. The link format is described in [docs/links.md](../docs/links.md).
- **No dependencies.** Two files of plain JavaScript (`server.mjs`, `link.mjs`), for Node 18 or later.

It speaks the Model Context Protocol over stdio, in its stateless 2026-07-28 version as well as the earlier ones (2024-11-05 to 2025-11-25), so current and older clients can use it.

## Install

Get the files: clone the repository (`git clone https://github.com/bemorin/one-day`) or download the `mcp` folder. The examples below use `/path/to/one-day/mcp/server.mjs`; use the real path on your computer.

### Claude Code

```sh
claude mcp add --scope user one-day -- node /path/to/one-day/mcp/server.mjs
```

### Claude Desktop

Claude Desktop, Settings → Developer → Edit Config opens `claude_desktop_config.json` (on Windows `%APPDATA%\Claude\claude_desktop_config.json`, on macOS `~/Library/Application Support/Claude/claude_desktop_config.json`). Add the server, then quit and reopen Claude Desktop:

```json
{
  "mcpServers": {
    "one-day": {
      "command": "node",
      "args": ["/path/to/one-day/mcp/server.mjs"]
    }
  }
}
```

On Windows, write the path with double backslashes: `"C:\\Users\\you\\one-day\\mcp\\server.mjs"`. This needs [Node.js](https://nodejs.org) installed.

Claude Desktop extensions (`.mcpb` files) install with a click and bring their own Node.js. This folder carries the [`manifest.json`](manifest.json) for one, to be packed with the [MCPB tool](https://github.com/modelcontextprotocol/mcpb) (`mcpb pack`); no packed extension is published yet.

## Use it

Ask in your own words, in any language:

> Add to One Day: call the bank tomorrow, and water the plants every Tuesday and Friday.

> Plan my week in One Day: the talk on Thursday with its outline as sub-tasks, the gym on Monday, Wednesday and Friday.

Claude calls `make_one_day_link` and shows the link. Opening it shows the tasks in One Day, where **Add all** puts them in, with one undo.

## Your own copy of One Day

Links point to `https://day.bemorin.com/`. For another address (your own copy, or a preview), set `ONE_DAY_URL`:

```sh
claude mcp add -e ONE_DAY_URL=https://day.example.com/ --scope user one-day -- node /path/to/one-day/mcp/server.mjs
```

In `claude_desktop_config.json`, add `"env": { "ONE_DAY_URL": "https://day.example.com/" }` next to `"args"`. In the extension, it is the “One Day address” setting.

## What the tool takes

```json
{
  "tasks": [
    {
      "title": "Prepare the talk #work",
      "note": "Slides and **demo**\n- Intro\n- Questions",
      "subtasks": ["Write the outline", "Book the room"],
      "day": "friday"
    },
    { "title": "Water the plants", "repeat": "FREQ=WEEKLY;BYDAY=TU,FR" }
  ]
}
```

`title` is required; the rest is optional. `day` is `today`, `tomorrow`, a weekday or `YYYY-MM-DD`; `repeat` is `daily`, `weekdays`, `weekends`, `weekly`, `monthly`, `yearly` or an iCalendar `RRULE` (see [Repeats](../docs/links.md#repeats)). A day or a repeat One Day could not follow, or text too long for it, comes back as an error that says what to change, so Claude can fix it and try again.

## License

MIT, like the rest of [One Day](https://github.com/bemorin/one-day).
