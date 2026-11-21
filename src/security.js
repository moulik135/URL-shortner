import { randomBytes } from 'node:crypto';
import { HttpError } from './utils.js';

export const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ALIAS_RE = /^[A-Za-z0-9-]{3,30}$/;
const RESERVED = new Set(['api', 'health', 'index', 'admin', 'stats', 'login', 'logout', 'signup']);

// Returns the normalized URL, or null if it is not a plain http(s) URL.
export function validateUrl(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

export function validateAlias(alias) {
  return typeof alias === 'string' && ALIAS_RE.test(alias) && !RESERVED.has(alias.toLowerCase());
}

// 6 random bytes = 48 bits = 8 base64url chars.
export const generateCode = () => randomBytes(6).toString('base64url');

const hits = new Map();
export function rateLimit(ip, limit = 10, windowMs = 60_000, now = Date.now()) {
  const h = hits.get(ip);
  if (!h || now - h.start >= windowMs) {
    hits.set(ip, { start: now, count: 1 });
    return true;
  }
  return ++h.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (now - h.start >= 60_000) hits.delete(ip);
}, 60_000).unref();

export function clientIp(req) {
  // shortcut: trusts the first X-Forwarded-For entry, which a client can spoof unless the proxy overwrites it; use the proxy's documented client-IP header if abuse shows up.
  if (process.env.TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress;
}

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

// Google Safe Browsing v4. No key = check skipped (local dev). Fails closed if Google can't be reached.
export async function isSafeUrl(url) {
  const key = process.env.SAFE_BROWSING_KEY?.trim();
  if (!key) return true;
  let data;
  try {
    const r = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'url-shortener', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(`Safe Browsing HTTP ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error('Safe Browsing check failed:', err.message);
    throw new HttpError(503, 'Link safety check is unavailable, try again shortly');
  }
  return !data.matches?.length;
}
