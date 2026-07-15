PRAGMA foreign_keys = ON;

UPDATE users
SET name = 'Administrador BC Linktree',
    email = 'rodrigogastudillo@gmail.com',
    password_hash = 'CLOUDFLARE_ACCESS_ONLY',
    username = 'rodrigogastudillo',
    role = 'ADMIN',
    description = 'Administrador inicial autenticado pelo Cloudflare Access',
    active = 1,
    status = 'active',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'usr_admin';

UPDATE profiles
SET user_id = 'usr_admin',
    updated_at = CURRENT_TIMESTAMP
WHERE user_id IN ('usr_gestor', 'usr_editor');

DELETE FROM users
WHERE id IN ('usr_gestor', 'usr_editor');

DELETE FROM sessions
WHERE user_id = 'usr_admin';

DELETE FROM password_resets
WHERE user_id = 'usr_admin';

INSERT OR IGNORE INTO audit_logs (
  id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata
) VALUES (
  'aud_cloudflare_access_bootstrap',
  'usr_admin',
  'auth.cloudflare_access_bootstrapped',
  'user',
  'usr_admin',
  '{"provider":"access","localPasswordDisabled":true,"demoUsersRemoved":true}'
);
