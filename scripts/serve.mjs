#!/usr/bin/env node
// A tiny static server for public/ that answers as Cloudflare Pages does, headers from public/_headers included
// (see pages.mjs).
//   node scripts/serve.mjs [port]   (default 8000)
import { createServer } from 'node:http';
import { answer } from './pages.mjs';

const port = Number(process.argv[2] || process.env.PORT || 8000);

createServer(async (req, res) => {
  const a = await answer(new URL(req.url, 'http://' + (req.headers.host || 'localhost')), { local: true });
  res.writeHead(a.status, a.headers);
  res.end(a.body);
}).listen(port, () => console.log(`One Day on http://localhost:${port}`));
