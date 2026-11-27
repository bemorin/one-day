#!/usr/bin/env node
// Writes public/llms-full.txt: the whole guide as Markdown, for AI assistants, exactly as the guide's own
// "Copy page as Markdown" makes it, with its links and pictures made absolute (the file sits at the site's root).
//   node scripts/llms-full.mjs   (npm run llms)
// Its test fails as soon as the guide says something else: run this again then.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GUIDE = 'https://getone.day/guide/';

// Links and pictures that point inside the guide (#basics, shots/day.webp, ../), made absolute
export function absolute(md, base = GUIDE) {
  return md.replace(/(\]\()([^)\s]+)/g, (m, open, url) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? m : open + new URL(url, base).href));
}

// The guide's own Markdown, from its Copy button, kept in the page instead of the computer's clipboard
export async function guideMarkdown(page, origin) {
  await page.addInitScript(() => {
    window.__copied = [];
    navigator.clipboard.writeText = t => (window.__copied.push(t), Promise.resolve());
  });
  await page.goto(origin + '/guide/');
  await page.getByRole('button', { name: 'Copy page as Markdown' }).click();
  await page.waitForFunction(() => window.__copied.length > 0);
  return page.evaluate(() => window.__copied.at(-1));
}

// as the file holds it: Unix line ends, one at the end
export const asFile = md => absolute(md).replace(/\r\n/g, '\n').trimEnd() + '\n';

async function main() {
  const port = 47341,
    origin = `http://localhost:${port}`;
  const srv = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  const b = await chromium.launch();
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(origin + '/')).ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    const page = await b.newPage();
    await writeFile(join(root, 'public', 'llms-full.txt'), asFile(await guideMarkdown(page, origin)));
    console.log('Wrote public/llms-full.txt');
  } finally {
    await b.close();
    srv.kill();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
