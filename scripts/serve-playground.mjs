// Serves augment-it/playground/ on localhost:8080.
// Zero deps — just Node's built-in http + fs.
// File:// origin causes CORS hassles with the WS connection in some browsers;
// serving via http keeps the origin consistent.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', 'playground');
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://placeholder');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT)) {
    res.statusCode = 403;
    res.end('forbidden');
    return;
  }
  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      res.statusCode = 302;
      res.setHeader('Location', path + '/');
      res.end();
      return;
    }
    const body = await readFile(full);
    res.setHeader('Content-Type', MIME[extname(full)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('not found: ' + path);
  }
}).listen(PORT, () => {
  console.log(`playground at http://localhost:${PORT}/`);
});
