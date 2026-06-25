-- One row per unique (episode, IP, UTC day). The composite primary key makes
-- INSERT OR IGNORE the dedup mechanism: a listener counts once per episode per
-- day no matter how many range requests their app makes. Raw IPs are never
-- stored — only a salted hash.
CREATE TABLE IF NOT EXISTS downloads (
  episode_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  PRIMARY KEY (episode_id, day, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_downloads_episode ON downloads (episode_id);
