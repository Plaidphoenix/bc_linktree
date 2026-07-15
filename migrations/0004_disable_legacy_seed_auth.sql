-- Public seed identities must not retain reusable local credentials.
-- Production is configured for Cloudflare Access; local operators may provision
-- their own non-seed users after applying all migrations.
UPDATE users
SET password_hash = 'LOCAL_AUTH_DISABLED', updated_at = CURRENT_TIMESTAMP
WHERE id IN ('usr_admin', 'usr_gestor', 'usr_editor');

DELETE FROM sessions
WHERE user_id IN ('usr_admin', 'usr_gestor', 'usr_editor');

DELETE FROM password_resets
WHERE user_id IN ('usr_admin', 'usr_gestor', 'usr_editor');
