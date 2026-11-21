# Security

One Day runs entirely in the browser and stores tasks only on the user's device, so the main risks are cross-site scripting through task text, notes or imported backups, and anything that would let data leave the page.

## Reporting a vulnerability

Please report it privately through GitHub's **Report a vulnerability** button on this repository (Security tab), rather than in a public issue. Include steps to reproduce and the browser you used. You should get a reply within a week.

## What is in place

- Allow-list sanitizer for notes; everything else is inserted as text.
- Imported backups go through the same validation and sanitizer as stored data.
- Content Security Policy in `index.html` (and in `_headers` where supported): no inline or remote scripts, no outgoing connections.
- No runtime dependencies.
