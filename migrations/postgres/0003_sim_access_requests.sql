CREATE TABLE IF NOT EXISTS sim_access_requests (
  id TEXT PRIMARY KEY,
  external_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  institutional_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  attempts_count INTEGER NOT NULL DEFAULT 1 CHECK (attempts_count > 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_role TEXT CHECK (resolution_role IN ('ADMIN', 'GESTOR', 'EDITOR')),
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sim_access_requests_pending
  ON sim_access_requests(status, last_attempt_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_access_requests_reviewed_by
  ON sim_access_requests(reviewed_by, reviewed_at DESC);
