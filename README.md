# One Day

A calm, minimalist task list that shows **one day at a time**, floats above your other windows, and keeps your data on your device.

![One Day in light mode, with an open task card, and in dark mode with the timer running](docs/hero.png)

One Day is a single-page web app with no framework, no dependencies, no account and no tracking. Open it, write down what today is for, tick things off, and move on to tomorrow.

## Features

- **One day on screen.** Move between days with the arrows, a swipe, a trackpad gesture or the month picker. The date rolls like a counter, and the thick rule at the top fills up as you finish the day.
- **Tasks that feel physical.** Tick, edit in place, drag to reorder, send to tomorrow, delete. Every action can be undone, and every motion is driven by springs.
- **Notes and sub-tasks.** Open any task into a card with a rich-text note (bold, italic, strikethrough, code, lists, links) and a checklist. The task's circle fills as the checklist gets done.
- **Tags.** Type `#anything` in a task or sub-task. Tags autocomplete, and clicking one searches for it.
- **Search.** Instant, accent-insensitive search across every day, every note and every sub-task.
- **Timer.** A countdown in two moods: *Calm* (minutes, with a line that fills each minute) or *Live* (rolling minutes and seconds).
- **Keep on top.** Pop the app into a small window that stays above everything else (Chrome and Edge).
- **Leftovers.** Unfinished tasks from earlier days can be brought to today in one click.
- **Light and dark**, following your system.
- **Works offline** once installed, and installs as an app.

## Keyboard

| Action | Keys |
| --- | --- |
| Previous or next day | <kbd>←</kbd> <kbd>→</kbd> (or <kbd>Alt</kbd> + arrows while typing) |
| Back to today | <kbd>T</kbd> |
| New task | <kbd>N</kbd> |
| Search | <kbd>/</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd> |
| Keep on top | <kbd>P</kbd> |
| Undo, redo | <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Z</kbd>, <kbd>Ctrl</kbd> <kbd>Y</kbd> or <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> |
| Move between tasks | <kbd>↑</kbd> <kbd>↓</kbd> |
| Reorder a task | <kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd> |
| Edit a task | <kbd>Enter</kbd> on its circle |
| Open its note | <kbd>Tab</kbd> while editing the title |
| Delete a task | <kbd>Delete</kbd> or <kbd>Backspace</kbd> on its circle |
| Format a note | <kbd>⌘</kbd> <kbd>B</kbd> / <kbd>I</kbd> / <kbd>E</kbd> / <kbd>K</kbd>, or Markdown: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `- list` |

## Privacy

- **Your tasks never leave your device.** They are stored in your browser's `localStorage` for this site. There is no server, database or account behind the app, so the person hosting it cannot see them.
- **No cookies, no analytics, no third-party requests.** The font is bundled with the app, and the Content Security Policy only allows the app's own files to load.
- **The service worker caches the app's files only**, so it opens instantly and works offline. It never reads your tasks.
- **Backups are yours.** Search → *Export backup* downloads a JSON file. *Import backup* merges one back, without overwriting existing tasks.
- **Erasing everything:** clear this site's data in your browser settings.

The hosting provider sees ordinary request logs (IP address, browser), like for any website. If you publish the app for other people, mention your host in your site's legal notice.

## Security

- Rich text is cleaned through an allow-list (`b`, `i`, `u`, `s`, `code`, `a`, lists, line breaks). Every other tag and every attribute is dropped. Links are limited to `https`, `http` and `mailto`, and open with `rel="noopener noreferrer"`.
- Everything else is inserted as text, never as HTML.
- A strict Content Security Policy blocks inline scripts, remote code and outgoing connections. On Cloudflare Pages or Netlify, [`_headers`](_headers) adds HSTS, `frame-ancestors 'none'`, `nosniff`, a no-referrer policy and a locked-down Permissions-Policy.
- Zero runtime dependencies, so there is no supply chain to compromise.

Found a problem? See [SECURITY.md](SECURITY.md).

## Accessibility

One Day targets **WCAG 2.2 AA**.

- Everything works with a keyboard, including a keyboard alternative to dragging.
- Controls have accessible names, and checkboxes, dialogs and live regions use proper roles.
- Focus is visible and returns where it came from.
- Text meets 4.5:1 contrast, and controls meet 3:1.
- All motion is turned off when *Reduce motion* is on.

An automated [axe-core](https://github.com/dequelabs/axe-core) audit reports no violations on the main view (light and dark), an open task card, search and the timer. Automated checks cover a subset of WCAG, so testing with VoiceOver or NVDA is still worthwhile.

## Install it as an app

Open the deployed site, then:

- **Chrome or Edge:** click the install icon in the address bar.
- **Safari on macOS:** *File → Add to Dock*.
- **iPhone and iPad:** *Share → Add to Home Screen*.

The installed app opens in its own window. In Chrome and Edge, press <kbd>P</kbd> to keep it on top of other windows. That uses the [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture), which Safari and Firefox don't support yet.

## Deploy

One Day is a static site with no build step: publish this folder as is.

### Cloudflare Pages (recommended)

It's free, it applies the security headers from `_headers`, and it serves your own subdomain.

1. Push this folder to a GitHub repository.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
3. Leave *Framework preset* on **None** and the build command empty. Set the build output directory to `/`.
4. Open **Custom domains → Set up a domain** and enter, for example, `day.example.com`.
   - If your domain's DNS is on Cloudflare, the record is created for you.
   - Otherwise, add a `CNAME` record at your DNS provider: name `day`, target `<project>.pages.dev`.

### GitHub Pages

1. Push to a **public** repository. Pages on private repositories needs a paid plan.
2. Open **Settings → Pages → Deploy from a branch**, then choose `main` and `/ (root)`.
3. Enter your custom domain, add a `CNAME` record `day` → `<username>.github.io`, then tick **Enforce HTTPS**.

GitHub Pages has a soft limit of 100 GB of bandwidth a month and a 1 GB site size. It also can't send custom HTTP headers, so only the policy in `index.html` applies there.

## Develop

```sh
python3 -m http.server 8000   # or: npx serve .
```

Then open <http://localhost:8000>. Edit `index.html`, `app.css` and `app.js`; there is nothing to compile.

To build a single self-contained file that opens straight from disk:

```sh
node scripts/build-standalone.mjs   # writes dist/one-day.html
```

```
index.html              markup
app.css                 styles, light and dark
app.js                  the whole app
sw.js                   offline cache for the app's own files
manifest.webmanifest    install metadata
_headers                security headers (Cloudflare Pages, Netlify)
fonts/                  Archivo, self-hosted (SIL Open Font License)
icons/                  app icons
scripts/                standalone build
```

After changing any file the service worker caches, bump `CACHE` in `sw.js` so installed copies update.

## Browser support

Current Chrome, Edge, Safari and Firefox. Keep-on-top needs Chrome or Edge 116 or later. Spring easing uses CSS `linear()` and falls back to standard curves in older browsers.

## License

[MIT](LICENSE). The Archivo typeface is © The Archivo Project Authors, under the [SIL Open Font License 1.1](fonts/OFL.txt).
