import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRouter } from './router.js';
import { securityHeaders } from './security.js';
import { sendJSON, sendText } from './utils.js';
import { createLink, listLinks, removeLink, stats } from './routes/links.js';
import { redirect } from './routes/redirect.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(import.meta.url), '../../public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const router = createRouter();
router.post('/api/links', createLink);
router.get('/api/links', listLinks);
router.get('/api/links/:code/stats', stats);
router.delete('/api/links/:code', removeLink);
router.get('/health', (req, res) => sendJSON(res, 200, { ok: true }));
router.get('/:code', redirect);

async function serveStatic(res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    return sendText(res, 404, 'Not found');
  }
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  // Blocks ../ traversal (raw or %2e%2e-encoded) and null bytes.
  if (rel.includes('\0') || !file.startsWith(PUBLIC_DIR + path.sep)) return sendText(res, 404, 'Not found');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return sendText(res, 404, 'Not found');
    throw err;
  }
}

export async function handler(req, res) {
  securityHeaders(res);
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    // Short codes never contain a dot, so anything with one (or "/") is a static file.
    if (req.method === 'GET' && (pathname === '/' || pathname.includes('.'))) return await serveStatic(res, pathname);
    const route = router.match(req.method, pathname);
    if (!route) return sendJSON(res, 404, { error: 'Not found' });
    await route.handler(req, res, route.params);
  } catch (err) {
    if (err.status) return sendJSON(res, err.status, { error: err.message });
    console.error(err); // full detail in logs, never to the user
    if (res.headersSent) return res.end();
    sendJSON(res, 500, { error: 'Something went wrong' });
  }
}

export function createServer() {
  const server = http.createServer(handler);
  server.requestTimeout = 10_000;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`Listening on http://localhost:${port}`));
}
