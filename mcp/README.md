# One Day for Claude

A small [MCP](https://modelcontextprotocol.io) server with one tool, `make_one_day_link`. Claude gives it tasks, each with an optional note, sub-tasks, day and repeat, and gets back a link that adds them to [One Day](https://day.bemorin.com). You open the link, check the tasks, and add them.

- **Nothing leaves your computer through it.** It runs locally, reads requests on stdin and answers on stdout. It opens no network connection, writes no file and keeps nothing between calls.
- **Nothing travels through a server.** The tasks ride in the link, after the `#`, which browsers never send to a server. One Day stores them in your browser once you confirm. The link format is described in [docs/links.md](../docs/links.md).
- **No dependencies.** Two files of plain JavaScript (`server.mjs`, `link.mjs`), for Node 18 or later.

It speaks the Model Context Protocol over stdio, in its stateless 2026-07-28 version as well as the earlier ones (2024-11-05 to 2025-11-25), so current and older clients can use it.

## Install

### Claude Desktop

The One Day extension is one file, `one-day.mcpb`. It runs on the Node.js that comes with Claude Desktop, so there is nothing else to install.

1. Download [`one-day.mcpb`](https://github.com/bemorin/one-day/releases/latest/download/one-day.mcpb) from the latest release.
2. Open it with Claude Desktop (double-click it). If that does nothing, or Windows asks which app should open it, use Claude's menu instead: **Help → Troubleshooting → Enable Developer Mode…** once (Claude restarts), then **Developer → Extensions → Install Extension…**, and pick the file.
3. Check what it is and click **Install**. Leave “One Day address” as it is, unless you have [your own copy of One Day](#your-own-copy-of-one-day).

Claude Desktop does not update an extension installed from a file: for a newer version, install the new `one-day.mcpb` the same way.

### Claude Code

Get the files: clone the repository (`git clone https://github.com/bemorin/one-day`) or download the `mcp` folder. Then, with the real path on your computer:

```sh
claude mcp add --scope user one-day -- node /path/to/one-day/mcp/server.mjs
```

### Claude Desktop, without the extension

Claude Desktop can also start the server from its configuration file, with the files on your computer as for Claude Code. Settings → Developer → Edit Config opens `claude_desktop_config.json` (on Windows `%APPDATA%\Claude\claude_desktop_config.json`, on macOS `~/Library/Application Support/Claude/claude_desktop_config.json`). Add the server, then quit and reopen Claude Desktop:

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

## Building the extension

From the repository's root, `npm run mcpb` packs this folder into `dist/one-day.mcpb` with the [MCPB tool](https://github.com/modelcontextprotocol/mcpb) (`npx` fetches `@anthropic-ai/mcpb` the first time), after checking `manifest.json`. The extension is this folder as it is, with no build step: `server.mjs`, `link.mjs`, `manifest.json`, `icon.png` (the app's icon, written by `npm run icons`), `package.json`, `LICENSE` and this README. Keep the version the same in `manifest.json`, `package.json` and `server.mjs`: `npm test` checks it.

## License

MIT, like the rest of [One Day](https://github.com/bemorin/one-day).
