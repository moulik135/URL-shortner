CREATE TABLE IF NOT EXISTS links (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(32) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id      INT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  expires_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS clicks (
  id         SERIAL PRIMARY KEY,
  link_id    INT REFERENCES links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_time ON clicks(link_id, clicked_at);
