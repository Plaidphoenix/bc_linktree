UPDATE profiles
SET avatar = regexp_replace(avatar, '^https?://[^/]+(/api/assets/.*)$', E'\\1', 'i')
WHERE avatar ~* '^https?://[^/]+/api/assets/';

UPDATE profiles
SET banner = regexp_replace(banner, '^https?://[^/]+(/api/assets/.*)$', E'\\1', 'i')
WHERE banner ~* '^https?://[^/]+/api/assets/';

UPDATE users
SET avatar = regexp_replace(avatar, '^https?://[^/]+(/api/assets/.*)$', E'\\1', 'i')
WHERE avatar ~* '^https?://[^/]+/api/assets/';

UPDATE uploads
SET url = regexp_replace(url, '^https?://[^/]+(/api/assets/.*)$', E'\\1', 'i')
WHERE url ~* '^https?://[^/]+/api/assets/';
