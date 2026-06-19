PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'GESTOR', 'EDITOR')),
  avatar TEXT,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  banner TEXT,
  primary_color TEXT NOT NULL DEFAULT '#001e40',
  secondary_color TEXT NOT NULL DEFAULT '#005db6',
  theme TEXT NOT NULL DEFAULT 'institucional',
  button_radius INTEGER NOT NULL DEFAULT 16,
  font_family TEXT NOT NULL DEFAULT 'Inter',
  public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Link',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  link_id TEXT,
  type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_slug ON profiles(slug);
CREATE INDEX IF NOT EXISTS idx_links_profile_order ON links(profile_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_events_profile_type ON events(profile_id, type);

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
  'usr_admin',
  'Carlos Eduardo',
  'admin@linkgov.local',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  'saude',
  'ADMIN',
  '/assets/crest.svg',
  'Administrador do portal institucional',
  1
);

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
  'usr_gestor',
  'Ana Silva',
  'ana.silva@linkgov.local',
  'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7',
  'educacao',
  'GESTOR',
  '/assets/crest.svg',
  'Gestora de conteúdo institucional',
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
  'prf_saude',
  'usr_admin',
  'saude',
  'Secretaria Municipal de Saúde',
  'Informações oficiais, agendamentos e serviços de saúde para o cidadão.',
  '/assets/crest.svg',
  '/assets/institutional-banner.svg',
  '#001e40',
  '#005db6',
  'institucional',
  16,
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
  ('lnk_transparencia', 'prf_saude', 'Portal da Transparência', 'Dados públicos e prestação de contas.', 'https://transparencia.gov.br', 'FileText', 1, 1, 0, 15200),
  ('lnk_agendamento', 'prf_saude', 'Agendamento de Consultas', 'Marque atendimento na rede municipal.', 'https://saude.gov.br/agendar', 'CalendarDays', 2, 1, 1, 12100),
  ('lnk_documentos', 'prf_saude', 'Solicitação de Documentos', 'Emissão e acompanhamento de solicitações.', 'https://cidadao.gov.br/documentos', 'ClipboardList', 3, 1, 0, 8400),
  ('lnk_farmacia', 'prf_saude', 'Farmácia Municipal', 'Consulta de medicamentos disponíveis.', 'https://saude.gov.br/farmacia', 'HeartPulse', 4, 1, 0, 7200),
  ('lnk_whatsapp', 'prf_saude', 'WhatsApp Oficial', 'Canal rápido de atendimento ao cidadão.', 'https://wa.me/5500000000000', 'MessageCircle', 5, 1, 1, 6500);

INSERT OR IGNORE INTO events (id, profile_id, link_id, type, metadata, created_at) VALUES
  ('evt_001', 'prf_saude', 'lnk_transparencia', 'click', '{"source":"seed"}', datetime('now', '-2 days')),
  ('evt_002', 'prf_saude', 'lnk_agendamento', 'click', '{"source":"seed"}', datetime('now', '-1 days')),
  ('evt_003', 'prf_saude', NULL, 'view', '{"source":"seed"}', datetime('now', '-1 days'));
