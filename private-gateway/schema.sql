CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id TEXT,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invitations_household ON invitations(household_id);
CREATE INDEX IF NOT EXISTS idx_invitations_active ON invitations(active);
