// Minimal static file server for Dropzone (gzip + in-memory cache). Serves /public and three.js from node_modules.
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MOUNTS = [
  ['/lib/three/addons/', path.join(ROOT, 'node_modules/three/examples/jsm/')],
  ['/lib/three/', path.join(ROOT, 'node_modules/three/build/')],
  ['/', path.join(ROOT, 'public/')],
];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const cache = new Map();

function resolve(urlPath) {
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const full = path.normalize(path.join(dir, rel));
    if (!full.startsWith(dir)) return null; // path traversal guard
    return full;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  const file = resolve(url.pathname);
  if (!file) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    let e = cache.get(file);
    if (!e || e.mtime !== st.mtimeMs) {
      const raw = fs.readFileSync(file);
      const ext = path.extname(file);
      e = { mtime: st.mtimeMs, raw, gz: ['.js', '.css', '.html', '.json', '.svg'].includes(ext) ? zlib.gzipSync(raw) : null, type: TYPES[ext] || 'application/octet-stream' };
      cache.set(file, e);
    }
    const gz = e.gz && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': e.type, 'Cache-Control': 'no-cache', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(gz ? e.gz : e.raw);
  });
});
server.listen(PORT, () => console.log(`Dropzone running on http://localhost:${PORT}`));
