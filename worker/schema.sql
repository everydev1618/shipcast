-- One row per unique (show, episode, IP, UTC day). The composite primary key
-- makes INSERT OR IGNORE the dedup mechanism: a listener counts once per episode
-- per day no matter how many range requests their app makes. Raw IPs are never
-- stored — only a salted hash. `show` is '' for single-show (un-namespaced) feeds.
CREATE TABLE IF NOT EXISTS downloads (
  show       TEXT NOT NULL DEFAULT '',
  episode_id TEXT NOT NULL,
  day        TEXT NOT NULL,
  ip_hash    TEXT NOT NULL,
  PRIMARY KEY (show, episode_id, day, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_downloads_show_episode ON downloads (show, episode_id);
