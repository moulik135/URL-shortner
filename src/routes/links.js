import * as db from '../db.js';
import { HttpError, readJSON, sendJSON } from '../utils.js';
import { CODE_RE, clientIp, generateCode, isSafeUrl, rateLimit, validateAlias, validateUrl } from '../security.js';

const UNIQUE_VIOLATION = '23505';

export async function createLink(req, res) {
  if (!rateLimit(clientIp(req))) throw new HttpError(429, 'Too many links created, try again in a minute');

  const body = await readJSON(req);
  const url = validateUrl(body.url);
  if (!url) throw new HttpError(400, 'Enter a valid http:// or https:// URL');

  const alias = body.alias || null;
  if (alias && !validateAlias(alias)) {
    throw new HttpError(400, 'Alias must be 3–30 letters, numbers or dashes, and not a reserved word');
  }

  let expiresAt = null;
  if (body.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      throw new HttpError(400, 'Expiry must be a valid date in the future');
    }
  }

  if (!(await isSafeUrl(url))) throw new HttpError(400, 'This URL is flagged as unsafe by Google Safe Browsing');

  // Random codes retry on the rare UNIQUE collision; a taken alias is the user's to change.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const link = await db.insertLink(alias ?? generateCode(), url, expiresAt);
      return sendJSON(res, 201, toJSON(link));
    } catch (err) {
      if (err.code !== UNIQUE_VIOLATION) throw err;
      if (alias) throw new HttpError(409, 'That alias is already taken');
    }
  }
  throw new Error('Could not generate a unique code after 5 attempts');
}

export async function listLinks(req, res) {
  const links = await db.listLinks();
  sendJSON(res, 200, links.map((l) => ({ ...toJSON(l), clicks: l.clicks })));
}

export async function stats(req, res, { code }) {
  const s = CODE_RE.test(code) && (await db.linkStats(code));
  if (!s) throw new HttpError(404, 'Link not found');
  sendJSON(res, 200, { code, ...s });
}

export async function removeLink(req, res, { code }) {
  if (!CODE_RE.test(code) || !(await db.deleteLink(code))) throw new HttpError(404, 'Link not found');
  sendJSON(res, 204);
}

const toJSON = (l) => ({ code: l.code, originalUrl: l.original_url, createdAt: l.created_at, expiresAt: l.expires_at });
