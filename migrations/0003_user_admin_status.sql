PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

UPDATE users
SET status = CASE WHEN active = 1 THEN 'active' ELSE 'inactive' END
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

