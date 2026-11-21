# URL Shortener

A secure URL shortener with click analytics, built on raw Node.js (`http`, `crypto`, `fs`) and PostgreSQL. No framework, one dependency (`pg`).

**Live:** https://url-shortner-rtln.onrender.com

<!-- Screenshots: add after deploying -->

## Features

- Paste a long URL, get a short link (`/ab12xY_q`)
- Short link redirects (302) to the original URL
- Click tracking: total clicks and clicks per day
- Page listing your links with their stats
- Custom aliases (`/my-resume`) and optional expiry dates (expired links return 410)
- Google Safe Browsing check before a link is saved

## Tech stack

| Part | Tool |
| --- | --- |
| Backend | Node.js core: `http`, `crypto`, `fs` |
| Database | PostgreSQL (Neon), `pg`, raw parameterized SQL |
| Frontend | Plain HTML, CSS, JavaScript |
| Hosting | Render free tier |
| Tests | `node:test` |

## Run locally

Requires Node 22.9+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL
psql "$DATABASE_URL" -f schema.sql
npm start                     # http://localhost:3000
npm test                      # API tests run when DATABASE_URL is set
```

Quick local Postgres with Docker:

```bash
docker run -d --name urlshort-pg -e POSTGRES_PASSWORD=dev -p 55432:5432 postgres:16-alpine
# DATABASE_URL=postgres://postgres:dev@localhost:55432/postgres
```

## API

| Method | Route | What it does |
| --- | --- | --- |
| POST | `/api/links` | Create a short link. Body: `url`, optional `alias`, `expiresAt` (ISO date) |
| GET | `/:code` | Redirect (302); 404 if unknown, 410 if expired |
| GET | `/api/links` | List the newest 100 links with click counts |
| GET | `/api/links/:code/stats` | Total clicks and clicks per day (UTC) |
| DELETE | `/api/links/:code` | Delete a link and its clicks |

## Security

- Only `http://` and `https://` URLs are accepted; `javascript:`, `data:` and the rest are rejected.
- URLs are checked against Google Safe Browsing before saving (set `SAFE_BROWSING_KEY`). If the check can't run, creation fails rather than letting an unchecked link through.
- Link creation is rate limited to 10 per minute per IP (in-memory `Map`).
- Request bodies are capped at 10 KB; requests time out after 10 s.
- Codes are 48 random bits from `crypto.randomBytes`, so they can't be guessed or enumerated.
- Aliases: letters, numbers, `-`, 3–30 chars; reserved words like `api` are blocked.
- Every SQL query is parameterized (`$1`), never string-built.
- The frontend writes user data with `textContent` only, never `innerHTML` (XSS).
- Headers: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- Static file serving rejects `../` (raw or `%2e%2e`-encoded) and null bytes.
- Secrets live in `.env`, which is git-ignored.
- One central error handler logs the full error and shows users only a generic message.

## Deploy (free)

1. Create a database on [Neon](https://neon.tech) and run `schema.sql` in its SQL editor.
2. Push this repo to GitHub.
3. On [Render](https://render.com), create a Web Service from the repo. Build: `npm install`. Start: `node src/server.js`.
4. Add environment variables `DATABASE_URL`, `SAFE_BROWSING_KEY`, and `TRUST_PROXY=1`.
5. Open the live URL on your phone and test every feature.

## Built in raw Node first

Everything Express would normally do is written by hand here:

| Express gives you | Here it is |
| --- | --- |
| `app.get('/:code')` routing + params | `src/router.js` (regex per route) |
| `express.json({ limit })` | `readBody` / `readJSON` in `src/utils.js` |
| `express.static` | `serveStatic` in `src/server.js` |
| `res.json()` / `res.redirect()` | `sendJSON` / `writeHead(302, { Location })` |
| Error middleware | the `try/catch` in `handler` |
| `helmet`, `express-rate-limit` | `securityHeaders`, `rateLimit` in `src/security.js` |

## How I'd scale this

- **Cache hot links** in Redis so most redirects never touch Postgres.
- **Count clicks in batches**: push clicks onto a queue and insert them in bulk, or keep counters in Redis and flush every few seconds, instead of one `INSERT` per click on the redirect path.
- **Read replicas** for redirects and stats; writes stay on the primary.
- **Short-code generation at scale**: random codes with a `UNIQUE` retry work until the space gets crowded; at scale, hand each server a block of IDs from a counter and base62-encode them, so there are no collisions to retry.
- **Rate limiting** moves from an in-memory `Map` to Redis so it holds across multiple server instances.

## Interview notes

- **Why 302, not 301?** Browsers cache 301s and stop asking the server, so later clicks wouldn't be counted.
- **Collisions:** 48 random bits; the `UNIQUE` constraint catches a clash and the insert retries with a new code (up to 5 times). A taken custom alias returns 409.
- **Phishing:** Safe Browsing check plus http(s)-only URLs.
- **SQL injection:** parameterized queries everywhere.
