import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, rateLimit, validateAlias, validateUrl, CODE_RE } from '../src/security.js';
import { createRouter } from '../src/router.js';

test('validateUrl accepts only http(s)', () => {
  assert.equal(validateUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(validateUrl('  http://example.com '), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com', 'not a url', '', 42, null, 'https://x.com/' + 'a'.repeat(2048)]) {
    assert.equal(validateUrl(bad), null, String(bad).slice(0, 40));
  }
});

test('validateAlias enforces charset, length and reserved words', () => {
  assert.ok(validateAlias('my-resume'));
  assert.ok(!validateAlias('ab'));
  assert.ok(!validateAlias('a'.repeat(31)));
  assert.ok(!validateAlias('has space'));
  assert.ok(!validateAlias('../etc'));
  assert.ok(!validateAlias('API'));
  assert.ok(!validateAlias(123));
});

test('generateCode is 8 url-safe chars and varies', () => {
  const codes = new Set(Array.from({ length: 1000 }, generateCode));
  assert.equal(codes.size, 1000);
  for (const c of codes) assert.match(c, /^[A-Za-z0-9_-]{8}$/);
  for (const c of codes) assert.ok(CODE_RE.test(c));
});

test('rateLimit allows 10 per window then blocks until it resets', () => {
  const t = 1_000_000;
  for (let i = 0; i < 10; i++) assert.ok(rateLimit('1.2.3.4', 10, 60_000, t));
  assert.ok(!rateLimit('1.2.3.4', 10, 60_000, t + 1));
  assert.ok(rateLimit('5.6.7.8', 10, 60_000, t + 1), 'other IPs unaffected');
  assert.ok(rateLimit('1.2.3.4', 10, 60_000, t + 60_000), 'resets after window');
});

test('router matches methods and params', () => {
  const r = createRouter();
  const h = () => {};
  r.get('/api/links/:code/stats', h);
  r.get('/:code', h);
  assert.deepEqual(r.match('GET', '/api/links/abc/stats').params, { code: 'abc' });
  assert.deepEqual(r.match('GET', '/xyz').params, { code: 'xyz' });
  assert.equal(r.match('POST', '/xyz'), null);
  assert.equal(r.match('GET', '/%E0%A4%A'), null, 'malformed encoding is a miss, not a crash');
});
