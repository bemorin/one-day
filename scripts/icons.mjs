#!/usr/bin/env node
// Draws the One Day icon and writes every size the app needs, and the Claude Desktop extension's (mcp/icon.png).
//   node scripts/icons.mjs           (needs the dev dependencies: npm install)
//   node scripts/icons.mjs --apple   the iPhone, iPad and Mac app's icons only (apple/Shared/Assets.xcassets)
//
// The mark: a signal-red tile, the day's progress rule half filled, and the date numeral "1"
// in Archivo ExtraBold Expanded, the face of the app's big date.
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  pub = join(root, 'public');

// Archivo "1" at wght 800, wdth 112 (units per em 1000, y up, baseline 0).
const ONE =
  'M87.63 0V137.38H278.82V490.11H87.4V589.36Q135.68 592.58 189.18 606.42Q242.68 620.26 294.27 641.83Q345.87 663.4 387.39 688.29H452.93V137.38H630.88V0Z';
const ONE_LEFT = 87.4,
  ONE_RIGHT = 630.88,
  ONE_TOP = 688.29;

// A superellipse: the continuous-corner tile of app icons.
function squircle(size, n = 5) {
  const a = size / 2,
    pts = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2,
      c = Math.cos(t),
      s = Math.sin(t);
    pts.push(
      `${(a + a * Math.sign(c) * Math.abs(c) ** (2 / n)).toFixed(1)} ${(a + a * Math.sign(s) * Math.abs(s) ** (2 / n)).toFixed(1)}`,
    );
  }
  return 'M' + pts.join('L') + 'Z';
}

// The mark on a 512 grid. `k` shrinks it around the centre (maskable icons keep a safe zone).
function mark(k = 1) {
  const h = 248,
    s = h / ONE_TOP,
    w = (ONE_RIGHT - ONE_LEFT) * s,
    x = 256 - w / 2 - ONE_LEFT * s;
  return `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">
  <rect x="112" y="96" width="288" height="34" rx="17" fill="#fff" fill-opacity=".32"/>
  <rect x="112" y="96" width="124" height="34" rx="17" fill="#fff"/>
  <path fill="#fff" transform="translate(${x.toFixed(2)} 424) scale(${s.toFixed(5)} ${(-s).toFixed(5)})" d="${ONE}"/>
</g>`;
}
const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f01c40"/><stop offset="1" stop-color="#d9002a"/></linearGradient>`;

const svg = ({ tile = true, k = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${GRAD}</defs>${
    tile ? `<path fill="url(#g)" d="${squircle(512)}"/>` : `<rect width="512" height="512" fill="url(#g)"/>`
  }${mark(k)}</svg>`;

// PNG-in-ICO container, readable by every browser that still asks for /favicon.ico.
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.data)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

if (process.argv.includes('--apple')) {
  await appleIcons();
  await browser.close();
  console.log('App icons written to apple/Shared/Assets.xcassets/AppIcon.appiconset');
  process.exit(0);
}

await writeFile(join(pub, 'icons', 'icon.svg'), svg() + '\n');
await writeFile(join(pub, 'icons', 'icon-192.png'), await png(svg(), 192));
const icon512 = await png(svg(), 512);
await writeFile(join(pub, 'icons', 'icon-512.png'), icon512);
await writeFile(join(root, 'mcp', 'icon.png'), icon512);
await writeFile(join(pub, 'icons', 'icon-maskable-512.png'), await png(svg({ tile: false, k: 0.8 }), 512));
await writeFile(join(pub, 'icons', 'apple-touch-icon.png'), await png(svg({ tile: false, k: 0.92 }), 180));
await writeFile(
  join(pub, 'favicon.ico'),
  ico([
    { size: 16, data: await png(svg(), 16) },
    { size: 32, data: await png(svg(), 32) },
    { size: 48, data: await png(svg(), 48) },
  ]),
);
await browser.close();
console.log('Icons written to public/icons, public/favicon.ico and mcp/icon.png');

// The iPhone and iPad icon: the full square (iOS rounds its corners), with no alpha channel, which the App Store
// refuses. The Mac's: the tile on Apple's grid (824 of 1024, centred), a soft shadow under it.
async function appleIcons() {
  const dir = join(root, 'apple', 'Shared', 'Assets.xcassets', 'AppIcon.appiconset'),
    pad = (512 / (824 / 1024) - 512) / 2,
    mac = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${512 + 2 * pad} ${512 + 2 * pad}"><defs>${GRAD}<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".28"/></filter></defs><path fill="url(#g)" filter="url(#sh)" d="${squircle(512)}"/>${mark()}</svg>`,
    images = [{ filename: 'icon-ios-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }];
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, images[0].filename), opaquePng(await pixels(svg({ tile: false, k: 0.92 }), 1024), 1024));
  for (const pt of [16, 32, 128, 256, 512])
    for (const scale of [1, 2]) {
      const filename = `icon-mac-${pt}${scale > 1 ? '@2x' : ''}.png`;
      await writeFile(join(dir, filename), await png(mac, pt * scale));
      images.push({ filename, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
    }
  await writeFile(join(dir, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
}

// An image's pixels as the page draws them (RGBA, row after row).
async function pixels(markup, size) {
  await page.setContent('<html><body style="margin:0"></body></html>');
  const b64 = await page.evaluate(
    async ({ markup, size }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, size, size);
      const d = x.getImageData(0, 0, size, size).data;
      let s = '';
      for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { markup, size },
  );
  return Buffer.from(b64, 'base64');
}

// A PNG of RGB pixels only (colour type 2): the alpha channel is dropped.
function opaquePng(rgba, size) {
  const line = size * 3 + 1,
    raw = Buffer.alloc(line * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        o = y * line + 1 + x * 3;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
    }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4),
      body = Buffer.concat([Buffer.from(type, 'ascii'), data]),
      sum = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([head, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
