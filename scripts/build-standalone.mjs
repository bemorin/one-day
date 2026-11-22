#!/usr/bin/env node
// Builds a single, self-contained HTML file from public/ (index.html, app.css, app.js and the fonts).
//   node scripts/build-standalone.mjs            -> dist/one-day.html (open it straight from disk)
//   node scripts/build-standalone.mjs --artifact -> dist/one-day.artifact.html (for hosts that set their own CSP)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const artifact = process.argv.includes('--artifact');
const read = file => readFile(join(pub, file), 'utf8');

let html = await read('index.html');
let css = await read('app.css');
const js = await read('app.js');

for (const font of ['archivo-latin', 'archivo-latin-ext']) {
  const data = (await readFile(join(pub, 'fonts', `${font}.woff2`))).toString('base64');
  css = css.replace(`url(fonts/${font}.woff2)`, `url(data:font/woff2;base64,${data})`);
}
const icon = (await readFile(join(pub, 'icons', 'icon.svg'))).toString('base64');

const csp = artifact
  ? ''
  : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">`;

html = html
  .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, csp)
  .replace(/\s*<link rel="(manifest|icon|apple-touch-icon|preload)"[^>]*>/g, '')
  .replace('</title>', () => `</title>\n    <link rel="icon" href="data:image/svg+xml;base64,${icon}" />`)
  .replace(/<link rel="stylesheet" href="app\.css"\s*\/?>/, () => `<style>\n${css}</style>`)
  .replace(/<script src="app\.js"><\/script>/, () => `<script>\n${js}</script>`)
  // the guide is a page of its own: a single file links to the one online
  .replace('href="guide/"', 'href="https://day.bemorin.com/guide/"');

await mkdir(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', artifact ? 'one-day.artifact.html' : 'one-day.html');
await writeFile(out, html);
console.log(`Built ${out} (${Math.round(html.length / 1024)} KB)`);
