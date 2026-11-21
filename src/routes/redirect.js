import * as db from '../db.js';
import { sendText } from '../utils.js';
import { CODE_RE } from '../security.js';

// 302 (not 301) so browsers don't cache the redirect and every click reaches us to be counted.
export async function redirect(req, res, { code }) {
  const link = CODE_RE.test(code) && (await db.findLink(code));
  if (!link) return sendText(res, 404, 'Link not found');
  if (link.expires_at && link.expires_at <= new Date()) return sendText(res, 410, 'This link has expired');
  await db.recordClick(link.id);
  res.writeHead(302, { Location: link.original_url, 'Cache-Control': 'no-store' });
  res.end();
}
