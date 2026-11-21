import pg from 'pg';

// sslmode=require in DATABASE_URL (Neon gives you this) turns on TLS.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function insertLink(code, originalUrl, expiresAt) {
  const { rows } = await pool.query(
    'INSERT INTO links (code, original_url, expires_at) VALUES ($1, $2, $3) RETURNING code, original_url, created_at, expires_at',
    [code, originalUrl, expiresAt]
  );
  return rows[0];
}

export async function findLink(code) {
  const { rows } = await pool.query('SELECT id, original_url, expires_at FROM links WHERE code = $1', [code]);
  return rows[0];
}

export async function recordClick(linkId) {
  await pool.query('INSERT INTO clicks (link_id) VALUES ($1)', [linkId]);
}

export async function listLinks() {
  // shortcut: newest 100 only, add pagination when one user has more.
  const { rows } = await pool.query(`
    SELECT l.code, l.original_url, l.created_at, l.expires_at, count(c.id)::int AS clicks
    FROM links l LEFT JOIN clicks c ON c.link_id = l.id
    GROUP BY l.id ORDER BY l.created_at DESC LIMIT 100`);
  return rows;
}

export async function linkStats(code) {
  const link = await findLink(code);
  if (!link) return null;
  const { rows } = await pool.query(
    `SELECT to_char((clicked_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, count(*)::int AS clicks
     FROM clicks WHERE link_id = $1 GROUP BY 1 ORDER BY 1`,
    [link.id]
  );
  return { originalUrl: link.original_url, total: rows.reduce((n, r) => n + r.clicks, 0), perDay: rows };
}

export async function deleteLink(code) {
  const { rowCount } = await pool.query('DELETE FROM links WHERE code = $1', [code]);
  return rowCount > 0;
}
