PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS page_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('GESTOR', 'EDITOR')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, profile_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS editor_link_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, link_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reviewed_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  summary TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  profile_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('avatar', 'banner')),
  r2_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_page_permissions_user ON page_permissions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_page_permissions_profile ON page_permissions(profile_id, role, status);
CREATE INDEX IF NOT EXISTS idx_editor_link_permissions_user ON editor_link_permissions(user_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_profile ON approval_requests(profile_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_profile_created ON audit_logs(profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_uploads_profile_kind ON uploads(profile_id, kind);

INSERT OR IGNORE INTO users (
  id,
  name,
  email,
  password_hash,
  username,
  role,
  avatar,
  description,
  active
) VALUES (
  'usr_editor',
  'Marcos Lima',
  'marcos.lima@linkgov.local',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  'editor-saude',
  'EDITOR',
  '/assets/crest.svg',
  'Editor autorizado para links especificos',
  1
);

INSERT OR IGNORE INTO profiles (
  id,
  user_id,
  slug,
  title,
  description,
  avatar,
  banner,
  primary_color,
  secondary_color,
  theme,
  button_radius,
  font_family,
  public
) VALUES (
  'prf_educacao',
  'usr_gestor',
  'educacao',
  'Secretaria Municipal de Educacao',
  'Servicos educacionais, calendario escolar e atendimento a comunidade.',
  '/assets/crest.svg',
  '/assets/institutional-banner.svg',
  '#123c69',
  '#2f80ed',
  'institucional',
  14,
  'Inter',
  1
);

INSERT OR IGNORE INTO links (
  id,
  profile_id,
  title,
  description,
  url,
  icon,
  sort_order,
  active,
  featured,
  clicks
) VALUES
  ('lnk_matricula', 'prf_educacao', 'Matricula Escolar', 'Inscricoes e acompanhamento de vagas.', 'https://educacao.gov.br/matricula', 'ClipboardList', 1, 1, 1, 5300),
  ('lnk_calendario', 'prf_educacao', 'Calendario Letivo', 'Datas oficiais da rede municipal.', 'https://educacao.gov.br/calendario', 'CalendarDays', 2, 1, 0, 4200),
  ('lnk_transporte', 'prf_educacao', 'Transporte Escolar', 'Rotas, cadastro e informacoes de atendimento.', 'https://educacao.gov.br/transporte', 'Building2', 3, 1, 0, 2100);

INSERT OR IGNORE INTO page_permissions (
  id,
  user_id,
  profile_id,
  role,
  status,
  approved_by
) VALUES
  ('perm_gestor_educacao', 'usr_gestor', 'prf_educacao', 'GESTOR', 'approved', 'usr_admin'),
  ('perm_editor_saude', 'usr_editor', 'prf_saude', 'EDITOR', 'approved', 'usr_admin');

INSERT OR IGNORE INTO editor_link_permissions (
  id,
  user_id,
  profile_id,
  link_id,
  granted_by
) VALUES
  ('edit_lnk_transparencia', 'usr_editor', 'prf_saude', 'lnk_transparencia', 'usr_admin');

INSERT OR IGNORE INTO approval_requests (
  id,
  profile_id,
  requested_by,
  reviewed_by,
  status,
  summary,
  metadata,
  reviewed_at
) VALUES (
  'apr_seed_editor_policy',
  'prf_saude',
  'usr_editor',
  'usr_admin',
  'approved',
  'Editor autorizado a atualizar o link Portal da Transparencia na pagina Saude.',
  '{"linkIds":["lnk_transparencia"]}',
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO audit_logs (
  id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  profile_id,
  metadata
) VALUES (
  'aud_seed_governance',
  'usr_admin',
  'governance.seeded',
  'profile',
  'prf_saude',
  'prf_saude',
  '{"policy":"admin-all-pages gestor-one-page editor-approved-links"}'
);
