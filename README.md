# One Day

A calm, minimalist task list that shows **one day at a time**, floats above your other windows, and keeps your data on your device.

**[Open One Day →](https://day.bemorin.com)**

![One Day in motion: bringing yesterday's leftovers to today, adding a task, pasting a list, undo, opening a task, sending a task to tomorrow, the mouse wheel through the days, making a task repeat, sending it as a link, search, the timer, light and dark, then the same app on a phone](docs/demo.webp)

[Watch the demo in HD (MP4, 1080p)](https://github.com/bemorin/one-day/releases/download/v1.2.0/one-day-demo.mp4)

One Day is a single-page web app with no framework, no runtime dependencies, no account and no tracking. Open it, write down what today is for, tick things off, and move on to tomorrow.

## Features

- **One day on screen.** Move between days with the arrows, a swipe, the mouse wheel (up for the day before, down for the day after), a trackpad gesture or the month picker. The date rolls like a counter, and the thick rule at the top fills up as you finish the day.
- **A sheet that fits its content.** On a large screen the day is a card on the page, resting in a thin frame of glass. It grows and shrinks on a spring as tasks come and go. On a phone it fills the screen.
- **Add to any day.** The composer adds to the day on screen. Its day chip sends a task to another day (Today, Tomorrow, Next week or any date) without leaving the one you are on.
- **Paste a list.** Paste several lines into the composer, or into a card's sub-task field, and each line becomes a task (or a sub-task). Bullets, numbers and checkboxes are left out, and `- [x]` items come in done. One undo takes them all back.
- **Repeat.** A task can come back every few days, weeks or months: on chosen weekdays, or on a date or a weekday of the month. Each occurrence appears when its day comes; ticking or deleting one leaves the others alone, and missed ones don't pile up as leftovers.
- **Send a task, or the whole day.** Share a task as a link from its card, or all of the day's open tasks at once (to someone else, or to yourself on another device). The task travels inside the link, after the `#`, which browsers never send to a server; whoever opens it can add it to their own One Day, on the day they choose.
- **Tasks that feel physical.** Tick, drag to reorder, send to tomorrow, delete. Every action can be undone, and every motion is driven by springs.
- **Notes and sub-tasks.** Click a task to open it: a rich-text note (bold, italic, strikethrough, code, lists, links) and a checklist. The task's circle fills as the checklist gets done. Click the title of an open task, or double-click any task, to rename it.
- **Tags.** Type `#anything` in a task or a sub-task. Tags autocomplete, and clicking one searches for it.
- **Search.** Instant, accent-insensitive search across every day, every note and every sub-task.
- **Timer.** A countdown in two moods: _Calm_ (minutes, with a line that fills each minute) or _Live_ (rolling minutes and seconds).
- **Keep on top.** Pop the app into a small window that stays above everything else (Chrome and Edge on desktop).
- **Leftovers.** Unfinished tasks from earlier days can be brought to today in one click.
- **Tags.** Type `#something` in a task. The filter at the right of the date shows only the tasks with one tag, and the dot beside a tag gives it a colour, worn wherever it shows.
- **A lock, if you want one.** Search → _Protect with a passphrase_ (More on a phone) encrypts your tasks in the browser. One Day then asks for the passphrase when it opens, after five minutes away, or as soon as you press <kbd>L</kbd>. Where the device has it, fingerprint, face or the device PIN unlocks it too (setting it up asks for the passphrase).
- **On a phone**, a bottom bar puts search, the timer, a big add button, sending the day and the rest under your thumb. The add button opens the composer as a sheet above the keyboard, and search opens as a drawer over the day.
- **Light and dark**, following your system, or switched in one click (the sun and moon at the top right). **Works offline** once installed, and installs as an app.

![One Day in light mode with an open task card, and in dark mode with the timer running](docs/hero.png)

## Keyboard

| Action                            | Keys                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Previous or next day              | <kbd>←</kbd> <kbd>→</kbd> (or <kbd>Alt</kbd> + arrows while typing)                                        |
| Back to today                     | <kbd>D</kbd> or <kbd>Home</kbd>                                                                            |
| Timer                             | <kbd>T</kbd>                                                                                               |
| New task                          | <kbd>N</kbd>, then <kbd>Tab</kbd> to the day chip to pick another day                                      |
| Search                            | <kbd>/</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>K</kbd>                                                  |
| Keep on top                       | <kbd>P</kbd>                                                                                               |
| Lock now (with the lock on)       | <kbd>L</kbd>                                                                                               |
| Undo, redo                        | <kbd>Ctrl</kbd>/<kbd>⌘</kbd> <kbd>Z</kbd>, <kbd>Ctrl</kbd> <kbd>Y</kbd> or <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>Z</kbd> |
| Move between tasks                | <kbd>↑</kbd> <kbd>↓</kbd>                                                                                  |
| Reorder a task                    | <kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd>                                                                   |
| Rename a task                     | <kbd>Enter</kbd> on its circle                                                                             |
| Open its note while renaming      | <kbd>Tab</kbd>                                                                                             |
| Delete a task                     | <kbd>Delete</kbd> or <kbd>Backspace</kbd> on its circle                                                    |
| Format a note                     | <kbd>⌘</kbd> <kbd>B</kbd> / <kbd>I</kbd> / <kbd>E</kbd> / <kbd>K</kbd>, or Markdown: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `- list` |

On a phone: tap a task to open it, hold then drag to reorder, swipe sideways to change day.

## Privacy

- **Your tasks never leave your device.** They are stored in your browser's `localStorage` for this site. There is no server, database or account behind the app, so whoever hosts it cannot see them.
- **What the browser keeps for One Day**, all in its `localStorage`: your tasks (`oneday.v1`, or `oneday.vault` when the lock is on), the timer's settings (`oneday.timer`), your light or dark choice (`oneday.theme`) and, if you put off the offer to install it, that you did (`oneday.install`). The service worker's cache (`one-day-v…`) holds the app's own files only.
- **No cookies, no analytics, no third-party requests.** The font is bundled with the app, and the Content Security Policy only lets the app's own files load. The footer links are plain links: nothing is contacted until you click one. The dogood.day link tells that site you came from One Day, in its address (`utm_source=day.bemorin.com`) and as the referrer (the site's address only, no page and no identifier); the others send nothing.
- **The service worker caches the app's files only**, so it opens instantly and works offline. It never reads your tasks.
- **Sent tasks travel in the link itself**, after the `#`, never through a server. Anyone who has the link can read the task, as with any message.
- **Works offline, even from a cold start**, once you have opened it online one time. Install it (or add it to your Home Screen) so the browser keeps its storage: Safari can clear the data of sites you have not opened for a week.
- **Backups are yours.** Search → _Export backup_ downloads a JSON file (encrypted when the lock is on). _Import backup_ merges one back without overwriting existing tasks.
- **The lock is optional, and only yours.** With a passphrase, your tasks are kept encrypted in the browser and backups are encrypted too. Nobody can open them without it, not even the maker of One Day, so a forgotten passphrase cannot be recovered: the only way out is to erase the tasks and start again. Changing the passphrase changes the key that encrypts them, so an old copy and the old passphrase open nothing written since. If your browser saves the passphrase, it can fill it in for anyone using that browser. Tasks saved before you turned the lock on can stay in the browser’s own files for a while, until it clears them.
- **Erasing everything:** clear this site's data in your browser settings.

The hosting provider sees ordinary request logs (IP address, browser), as for any website. If you publish your own copy, link your legal notice and privacy policy from the footer in `public/index.html`.

## Security

- Rich text is cleaned through an allow-list (`b`, `i`, `u`, `s`, `code`, `a`, lists, line breaks). Every other tag and every attribute is dropped. Links are limited to `https`, `http` and `mailto`, and open with `rel="noopener noreferrer"`.
- Everything else is inserted as text, never as HTML. Ids from storage or backups are checked before they reach a selector.
- A strict Content Security Policy blocks inline scripts, remote code and outgoing connections. On Cloudflare Pages, [`public/_headers`](public/_headers) adds HSTS, `frame-ancestors 'none'`, `nosniff`, a no-referrer policy and a locked-down Permissions-Policy.
- The lock uses the browser's Web Crypto API and nothing else. A random 256-bit key encrypts the tasks with AES-GCM. That key is sealed with a key derived from the passphrase (PBKDF2-SHA-256, 600,000 iterations, random salt) and, if you choose, with one derived from a passkey through the WebAuthn PRF extension (HKDF-SHA-256). While locked, the app holds no decrypted task, and it locks itself after five minutes in the background.
- No runtime dependencies, so there is no supply chain to compromise. The dev dependencies (Playwright, axe-core) are only used for tests and icons.

Found a problem? See [SECURITY.md](SECURITY.md).

## Accessibility

One Day targets **WCAG 2.2 AA**: everything works with a keyboard (including a keyboard alternative to dragging), controls have accessible names, focus is visible and returns where it came from, text meets 4.5:1 contrast, and all motion is turned off when _Reduce motion_ is on.

The test suite runs [axe-core](https://github.com/dequelabs/axe-core) on the main view, an open card, search, the timer and the day picker, in light and dark. Automated checks cover a subset of WCAG, so testing with VoiceOver or NVDA is still worthwhile.

## Install it as an app

Until it is installed, One Day offers it: in the middle of the time's line on a large screen (its cross puts the offer off for good, into a small button beside the sun), behind the ⋮ button in a narrower window, and first in More on a phone. In Chrome and Edge it opens the browser's own install prompt; in Safari it says where to look. You can also:

- **Chrome or Edge:** click the install icon in the address bar.
- **Safari on macOS:** _File → Add to Dock_.
- **iPhone and iPad:** _Share → Add to Home Screen_.

In Chrome and Edge on desktop, press <kbd>P</kbd> to keep the app on top of other windows. That uses the [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture), which Safari and Firefox don't support yet.

## Deploy

The site is the `public/` folder, served as is: there is no build step.

### Cloudflare Pages

1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and pick this repository (private repositories work too).
2. Framework preset **None**, build command empty, build output directory **`public`**. ([`wrangler.jsonc`](wrangler.jsonc) says the same.)
3. **Custom domains → Set up a custom domain**, for example `day.example.com`. If the domain's DNS is on Cloudflare, the record is created for you; otherwise add a `CNAME` to `<project>.pages.dev`.
4. Leave **Web Analytics** off and make sure **Rocket Loader** is off for the domain: both inject scripts that the Content Security Policy blocks.

Every push to `main` deploys; every other branch gets a preview URL.

## Develop

```sh
npm install        # dev tools only: Playwright and axe-core
npm start          # http://localhost:8000, with the same headers as production
npm test           # end-to-end and accessibility tests (Chromium)
```

```
public/                 the site
  index.html            markup
  app.css               styles, light and dark
  app.js                the whole app
  sw.js                 offline cache for the app's own files
  manifest.webmanifest  install metadata
  _headers              security headers (Cloudflare Pages)
  fonts/                Archivo, self-hosted (SIL Open Font License)
  icons/, favicon.ico   generated by scripts/icons.mjs
scripts/
  serve.mjs             local server that applies _headers
  icons.mjs             draws the icon and writes every size
  build-standalone.mjs  one self-contained HTML file (dist/one-day.html)
  demo-video.mjs        the demo video, 1080p60 and 720p (npm run video, needs ffmpeg)
tests/                  Playwright tests
```

After changing any file the service worker caches, bump `CACHE` in `public/sw.js` so installed copies update.

## Browser support

Current Chrome, Edge, Safari and Firefox. Keep-on-top needs Chrome or Edge 116 or later on desktop. Spring easing uses CSS `linear()` and falls back to standard curves in older browsers; continuous card corners use `corner-shape` where it exists.

## Made by

[Ben Morin](https://bemorin.com) · [@benmorinbm on X](https://x.com/benmorinbm). If you also keep a journal, try [dogood.day](https://dogood.day).

If One Day helps your days, you can [buy me a croissant](https://ko-fi.com/bemorin) 🥐 or [sponsor it on GitHub](https://github.com/sponsors/bemorin).

## License

The code is under the [MIT License](LICENSE). The One Day name and icon are not covered by it: if you publish a fork, give it your own. The Archivo typeface is © The Archivo Project Authors, under the [SIL Open Font License 1.1](public/fonts/OFL.txt).
