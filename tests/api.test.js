// End-to-end against a real Postgres. Needs DATABASE_URL with schema.sql applied; skipped otherwise.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../src/server.js';
import { pool } from '../src/db.js';

const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';
let server, base;

before(async () => {
  server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await pool.end();
});

const post = (body) => fetch(`${base}/api/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Raw request so the client doesn't normalize ../ away.
const rawGet = (path) => new Promise((resolve, reject) => {
  http.get({ host: 'localhost', port: server.address().port, path }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
});

test('static files, headers and path traversal', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal(await rawGet('/../package.json'), 404);
  assert.equal(await rawGet('/%2e%2e/package.json'), 404);
  assert.equal(await rawGet('/..%2f..%2fetc%2fpasswd.x'), 404);
  assert.equal(await rawGet('/%00.html'), 404);
});

test('rejects bad input', { skip }, async () => {
  assert.equal((await post({ url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post({ url: 'https://x.com', alias: 'api' })).status, 400);
  assert.equal((await post({ url: 'https://x.com', expiresAt: '2000-01-01' })).status, 400);
  const big = await fetch(`${base}/api/links`, { method: 'POST', body: 'x'.repeat(20_000) });
  assert.equal(big.status, 413);
  const notJson = await fetch(`${base}/api/links`, { method: 'POST', body: '{nope' });
  assert.equal(notJson.status, 400);
  assert.deepEqual(Object.keys(await notJson.json()), ['error'], 'no stack traces leak');
});

test('create → redirect → stats → delete', { skip }, async () => {
  const alias = `t-${Date.now()}`;
  const created = await post({ url: 'https://example.com/page', alias });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).code, alias);
  assert.equal((await post({ url: 'https://example.com', alias })).status, 409, 'duplicate alias');

  const random = await (await post({ url: 'https://example.com/other' })).json();
  assert.match(random.code, /^[A-Za-z0-9_-]{8}$/);

  for (let i = 0; i < 2; i++) {
    const r = await fetch(`${base}/${alias}`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://example.com/page');
  }

  const stats = await (await fetch(`${base}/api/links/${alias}/stats`)).json();
  assert.equal(stats.total, 2);
  assert.equal(stats.perDay.length, 1);
  assert.equal(stats.perDay[0].clicks, 2);

  const list = await (await fetch(`${base}/api/links`)).json();
  assert.equal(list.find((l) => l.code === alias).clicks, 2);

  assert.equal((await fetch(`${base}/api/links/${alias}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${base}/${alias}`, { redirect: 'manual' })).status, 404);
  await fetch(`${base}/api/links/${random.code}`, { method: 'DELETE' });
});

test('expired links return 410', { skip }, async () => {
  const alias = `exp-${Date.now()}`;
  assert.equal((await post({ url: 'https://example.com', alias, expiresAt: new Date(Date.now() + 1500).toISOString() })).status, 201);
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal((await fetch(`${base}/${alias}`, { redirect: 'manual' })).status, 410);
  await fetch(`${base}/api/links/${alias}`, { method: 'DELETE' });
});
