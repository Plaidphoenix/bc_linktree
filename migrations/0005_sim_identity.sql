PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN external_subject TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_subject
  ON users(external_subject);

ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE sessions ADD COLUMN provider_token TEXT;
CREATE INDEX IF NOT EXISTS idx_sessions_provider_expires
  ON sessions(provider, expires_at);
