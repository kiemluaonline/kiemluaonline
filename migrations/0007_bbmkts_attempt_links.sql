-- Additive storage for future BBMKTS integration; not applied in this draft.
CREATE TABLE IF NOT EXISTS bbmkts_attempt_links (
  attempt_id TEXT PRIMARY KEY REFERENCES task_attempts(id),
  alias TEXT NOT NULL UNIQUE,
  short_url TEXT NOT NULL,
  views INTEGER CHECK (views IS NULL OR views >= 0),
  checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
