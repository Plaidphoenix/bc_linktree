import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(root, "local-data");
const uploadDir = join(dataDir, "uploads");
const dbPath = join(dataDir, "db.json");
const host = readArg("--host", "0.0.0.0");
const port = Number(readArg("--port", "8787"));
const passwordHash = sha256("Admin@123");

ensureData();

const server = http.createServer(async (req, res) => {
  try {
    setCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/health") {
      sendJson(res, { ok: true, service: "linkgov-local-api", timestamp: new Date().toISOString() });
      return;
    }

    if (url.pathname.startsWith("/api/assets/")) {
      serveUpload(url.pathname.replace("/api/assets/", ""), res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      await login(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const { db, user, token } = requireUser(req, res);
      if (!user) return;
      db.sessions = db.sessions.filter((session) => session.token !== token);
      saveDb(db);
      sendJson(res, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      sendJson(res, {
        ok: true,
        message: "Servidor local: fluxo recebido. Configure EMAIL_WEBHOOK_URL no Worker para envio real."
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/profiles/")) {
      publicProfile(url.pathname.split("/").pop(), res);
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/click/")) {
      trackClick(url.pathname.split("/").pop(), res);
      return;
    }

    if (url.pathname === "/api/admin/me" && req.method === "GET") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      const state = adminState(db, user, url.searchParams.get("profileId"));
      if (!state) {
        sendJson(res, { error: "Nenhuma pagina autorizada." }, 403);
        return;
      }
      sendJson(res, state);
      return;
    }

    if (url.pathname === "/api/admin/profiles" && req.method === "GET") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      sendJson(res, { profiles: authorizedProfiles(db, user) });
      return;
    }

    if (url.pathname === "/api/admin/profiles" && req.method === "POST") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await createProfile(req, res, db, user);
      return;
    }

    if (url.pathname === "/api/admin/uploads" && req.method === "POST") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await uploadAsset(req, res, db, user);
      return;
    }

    if (url.pathname === "/api/admin/profile" && req.method === "PATCH") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await updateProfile(req, res, db, user);
      return;
    }

    if (url.pathname === "/api/admin/links" && req.method === "POST") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await createLink(req, res, db, user);
      return;
    }

    if (url.pathname.startsWith("/api/admin/links/") && req.method === "PATCH") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      const id = url.pathname.split("/").pop();
      if (id === "reorder") {
        await reorderLinks(req, res, db, user);
      } else {
        await updateLink(req, res, db, user, id);
      }
      return;
    }

    if (url.pathname.startsWith("/api/admin/links/") && req.method === "DELETE") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      deleteLink(res, db, user, url.pathname.split("/").pop());
      return;
    }

    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      if (user.role !== "ADMIN") {
        sendJson(res, { error: "Acesso restrito a administradores." }, 403);
        return;
      }
      sendJson(res, { users: db.users.map(serializeUser) });
      return;
    }

    if (url.pathname === "/api/admin/users" && req.method === "POST") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await createUser(req, res, db, user);
      return;
    }

    if (url.pathname.startsWith("/api/admin/users/") && req.method === "PATCH") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      await updateUser(req, res, db, user, url.pathname.split("/").pop());
      return;
    }

    if (url.pathname.startsWith("/api/admin/users/") && req.method === "DELETE") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      deleteUser(res, db, user, url.pathname.split("/").pop());
      return;
    }

    if (url.pathname === "/api/admin/analytics" && req.method === "GET") {
      const { db, user } = requireUser(req, res);
      if (!user) return;
      const state = adminState(db, user, url.searchParams.get("profileId"));
      const links = state?.links || [];
      const clicks = links.reduce((sum, link) => sum + link.clicks, 0);
      sendJson(res, {
        totals: { views: 124800, clicks, ctr: Math.round((clicks / 124800) * 1000) / 10 },
        timeline: [
          { label: "Seg", views: 42, clicks: 16 },
          { label: "Ter", views: 60, clicks: 25 },
          { label: "Qua", views: 85, clicks: 40 },
          { label: "Qui", views: 55, clicks: 20 },
          { label: "Sex", views: 70, clicks: 30 },
          { label: "Sab", views: 65, clicks: 25 }
        ],
        topLinks: links.map(({ id, title, url, clicks }) => ({ id, title, url, clicks })).sort((a, b) => b.clicks - a.clicks)
      });
      return;
    }

    sendJson(res, { error: "Rota nao encontrada." }, 404);
  } catch (error) {
    console.error(error);
    sendJson(res, { error: "Erro interno da API local." }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`LinkGov local API listening on http://${host}:${port}`);
});

function ensureData() {
  mkdirSync(uploadDir, { recursive: true });
  if (!existsSync(dbPath)) {
    saveDb(seedDb());
  }
}

function seedDb() {
  return {
    users: [
      userSeed("usr_admin", "Carlos Eduardo", "admin@linkgov.local", "saude", "ADMIN", "Administrador do portal institucional"),
      userSeed("usr_gestor", "Ana Silva", "ana.silva@linkgov.local", "educacao", "GESTOR", "Gestora de conteudo institucional"),
      userSeed("usr_editor", "Marcos Lima", "marcos.lima@linkgov.local", "editor-saude", "EDITOR", "Editor autorizado para links especificos")
    ],
    profiles: [
      profileSeed("prf_saude", "usr_admin", "saude", "Secretaria Municipal de Saude", "Informacoes oficiais, agendamentos e servicos de saude para o cidadao."),
      profileSeed("prf_educacao", "usr_gestor", "educacao", "Secretaria Municipal de Educacao", "Servicos educacionais, calendario escolar e atendimento a comunidade.")
    ],
    links: [
      linkSeed("lnk_transparencia", "prf_saude", "Portal da Transparencia", "Dados publicos e prestacao de contas.", "https://transparencia.gov.br", "FileText", 1, false, 15200),
      linkSeed("lnk_agendamento", "prf_saude", "Agendamento de Consultas", "Marque atendimento na rede municipal.", "https://saude.gov.br/agendar", "CalendarDays", 2, true, 12100),
      linkSeed("lnk_documentos", "prf_saude", "Solicitacao de Documentos", "Emissao e acompanhamento de solicitacoes.", "https://cidadao.gov.br/documentos", "ClipboardList", 3, false, 8400),
      linkSeed("lnk_farmacia", "prf_saude", "Farmacia Municipal", "Consulta de medicamentos disponiveis.", "https://saude.gov.br/farmacia", "HeartPulse", 4, false, 7200),
      linkSeed("lnk_whatsapp", "prf_saude", "WhatsApp Oficial", "Canal rapido de atendimento ao cidadao.", "https://wa.me/5500000000000", "MessageCircle", 5, true, 6500),
      linkSeed("lnk_matricula", "prf_educacao", "Matricula Escolar", "Inscricoes e acompanhamento de vagas.", "https://educacao.gov.br/matricula", "ClipboardList", 1, true, 5300),
      linkSeed("lnk_calendario", "prf_educacao", "Calendario Letivo", "Datas oficiais da rede municipal.", "https://educacao.gov.br/calendario", "CalendarDays", 2, false, 4200)
    ],
    pagePermissions: [
      { id: "perm_gestor_educacao", userId: "usr_gestor", profileId: "prf_educacao", role: "GESTOR", status: "approved" },
      { id: "perm_editor_saude", userId: "usr_editor", profileId: "prf_saude", role: "EDITOR", status: "approved" }
    ],
    editorLinkPermissions: [
      { id: "edit_lnk_transparencia", userId: "usr_editor", profileId: "prf_saude", linkId: "lnk_transparencia" }
    ],
    sessions: []
  };
}

function userSeed(id, name, email, username, role, description) {
  return {
    id,
    name,
    email,
    username,
    role,
    status: "active",
    active: true,
    avatar: "/assets/crest.svg",
    description,
    passwordHash
  };
}

function profileSeed(id, userId, slug, title, description) {
  return {
    id,
    userId,
    slug,
    title,
    description,
    avatar: "/assets/crest.svg",
    banner: "/assets/institutional-banner.svg",
    primaryColor: id === "prf_saude" ? "#001e40" : "#123c69",
    secondaryColor: id === "prf_saude" ? "#005db6" : "#2f80ed",
    theme: "institucional",
    buttonRadius: id === "prf_saude" ? 16 : 14,
    fontFamily: "Inter",
    public: true
  };
}

function linkSeed(id, profileId, title, description, url, icon, order, featured, clicks) {
  return { id, profileId, title, description, url, icon, order, active: true, featured, clicks };
}

function readDb() {
  const db = JSON.parse(readFileSync(dbPath, "utf8").replace(/^\uFEFF/, ""));
  db.users = db.users.map((user) => ({ ...user, status: user.status || (user.active ? "active" : "inactive") }));
  return db;
}

function saveDb(db) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function login(req, res) {
  const body = await readJson(req);
  const db = readDb();
  const user = db.users.find((item) => item.email.toLowerCase() === String(body.email || "").toLowerCase());
  if (!user || user.status !== "active" || user.passwordHash !== sha256(String(body.password || ""))) {
    sendJson(res, { error: "Credenciais invalidas." }, 401);
    return;
  }

  const token = randomUUID();
  db.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  saveDb(db);
  sendJson(res, { token, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), user: serializeUser(user) });
}

function publicProfile(slug, res) {
  const db = readDb();
  const profile = db.profiles.find((item) => item.slug === cleanSlug(slug) && item.public);
  if (!profile) {
    sendJson(res, { error: "Perfil publico nao encontrado." }, 404);
    return;
  }
  sendJson(res, {
    profile,
    links: db.links.filter((link) => link.profileId === profile.id && link.active).sort((a, b) => a.order - b.order)
  });
}

function trackClick(id, res) {
  const db = readDb();
  const link = db.links.find((item) => item.id === id);
  if (!link) {
    sendJson(res, { error: "Link nao encontrado." }, 404);
    return;
  }
  link.clicks += 1;
  saveDb(db);
  sendJson(res, { ok: true, url: link.url });
}

async function createProfile(req, res, db, actor) {
  if (actor.role !== "ADMIN") {
    sendJson(res, { error: "Acesso restrito a administradores." }, 403);
    return;
  }

  const body = await readJson(req);
  const title = sanitize(body.title || "Nova pagina publica");
  const slug = uniqueProfileSlug(db, body.slug || title);
  const manager = db.users.find(
    (user) => user.id === sanitize(body.managerUserId || "") && (user.role === "ADMIN" || user.role === "GESTOR")
  );
  const owner = manager || actor;
  const profile = {
    id: randomUUID(),
    userId: owner.id,
    slug,
    title,
    description: sanitize(body.description || "Pagina institucional publicada pelo painel administrativo."),
    avatar: "/assets/crest.svg",
    banner: "/assets/institutional-banner.svg",
    primaryColor: "#001e40",
    secondaryColor: "#005db6",
    theme: "institucional",
    buttonRadius: 16,
    fontFamily: "Inter",
    public: true
  };

  db.profiles.push(profile);
  if (owner.role === "GESTOR") {
    db.pagePermissions = db.pagePermissions.filter((item) => !(item.userId === owner.id && item.profileId === profile.id));
    db.pagePermissions.push({
      id: randomUUID(),
      userId: owner.id,
      profileId: profile.id,
      role: "GESTOR",
      status: "approved",
      approvedBy: actor.id
    });
  }
  saveDb(db);
  sendJson(res, { profile }, 201);
}

async function createLink(req, res, db, user) {
  const body = await readJson(req);
  const profile = resolveProfile(db, user, body.profileId);
  if (!profile || !canManageProfile(user, profile, db)) {
    sendJson(res, { error: "Sem permissao para criar links." }, 403);
    return;
  }

  const link = {
    id: randomUUID(),
    profileId: profile.id,
    title: sanitize(body.title || "Novo link"),
    description: sanitize(body.description || ""),
    url: normalizeUrl(body.url || "https://example.gov.br"),
    icon: sanitize(body.icon || "Link"),
    order: db.links.filter((item) => item.profileId === profile.id).length + 1,
    active: body.active !== false,
    featured: Boolean(body.featured),
    clicks: 0
  };
  db.links.push(link);
  saveDb(db);
  sendJson(res, { link }, 201);
}

async function updateLink(req, res, db, user, id) {
  const body = await readJson(req);
  const link = db.links.find((item) => item.id === id);
  if (!link) {
    sendJson(res, { error: "Link nao encontrado." }, 404);
    return;
  }
  const profile = resolveProfile(db, user, link.profileId);
  if (!profile || !canEditLink(user, profile, link.id, db)) {
    sendJson(res, { error: "Sem permissao para editar este link." }, 403);
    return;
  }

  const manages = canManageProfile(user, profile, db);
  link.title = sanitize(body.title ?? link.title);
  link.description = sanitize(body.description ?? link.description);
  link.url = normalizeUrl(body.url ?? link.url);
  link.icon = sanitize(body.icon ?? link.icon);
  if (manages && body.active !== undefined) link.active = Boolean(body.active);
  if (manages && body.featured !== undefined) link.featured = Boolean(body.featured);
  saveDb(db);
  sendJson(res, { link });
}

async function reorderLinks(req, res, db, user) {
  const body = await readJson(req);
  const profile = resolveProfile(db, user, body.profileId);
  if (!profile || !canManageProfile(user, profile, db)) {
    sendJson(res, { error: "Sem permissao para reordenar links." }, 403);
    return;
  }
  const ids = Array.isArray(body.ids) ? body.ids : [];
  ids.forEach((id, index) => {
    const link = db.links.find((item) => item.id === id && item.profileId === profile.id);
    if (link) link.order = index + 1;
  });
  saveDb(db);
  sendJson(res, { links: db.links.filter((link) => link.profileId === profile.id).sort((a, b) => a.order - b.order) });
}

function deleteLink(res, db, user, id) {
  const link = db.links.find((item) => item.id === id);
  if (!link) {
    sendJson(res, { ok: true });
    return;
  }
  const profile = resolveProfile(db, user, link.profileId);
  if (!profile || !canManageProfile(user, profile, db)) {
    sendJson(res, { error: "Sem permissao para excluir links." }, 403);
    return;
  }
  db.links = db.links.filter((item) => item.id !== id);
  db.editorLinkPermissions = db.editorLinkPermissions.filter((item) => item.linkId !== id);
  saveDb(db);
  sendJson(res, { ok: true });
}

async function createUser(req, res, db, actor) {
  if (actor.role !== "ADMIN") {
    sendJson(res, { error: "Acesso restrito a administradores." }, 403);
    return;
  }
  const body = await readJson(req);
  const role = sanitize(body.role || "EDITOR").toUpperCase();
  if (!["ADMIN", "GESTOR", "EDITOR"].includes(role)) {
    sendJson(res, { error: "Perfil invalido." }, 400);
    return;
  }
  const email = sanitize(body.email || "").toLowerCase();
  if (!email || db.users.some((user) => user.email.toLowerCase() === email)) {
    sendJson(res, { error: "E-mail invalido ou ja cadastrado." }, 400);
    return;
  }
  const user = {
    id: randomUUID(),
    name: sanitize(body.name || "Novo usuario"),
    email,
    username: cleanSlug(body.username || email.split("@")[0]),
    role,
    status: normalizeStatus(body.status),
    active: normalizeStatus(body.status) === "active",
    avatar: "/assets/crest.svg",
    description: sanitize(body.description || ""),
    passwordHash: sha256(String(body.password || "Admin@123"))
  };
  db.users.push(user);
  applyUserPermission(db, actor, user, body.profileId, Array.isArray(body.linkIds) ? body.linkIds : []);
  saveDb(db);
  sendJson(res, { user: serializeUser(user) }, 201);
}

async function updateUser(req, res, db, actor, id) {
  if (actor.role !== "ADMIN") {
    sendJson(res, { error: "Acesso restrito a administradores." }, 403);
    return;
  }
  const target = db.users.find((user) => user.id === id);
  if (!target) {
    sendJson(res, { error: "Usuario nao encontrado." }, 404);
    return;
  }
  const body = await readJson(req);
  if (body.status) {
    target.status = normalizeStatus(body.status);
    target.active = target.status === "active";
  }
  if (body.name) target.name = sanitize(body.name);
  if (body.description !== undefined) target.description = sanitize(body.description);
  applyUserPermission(db, actor, target, body.profileId, Array.isArray(body.linkIds) ? body.linkIds : []);
  saveDb(db);
  sendJson(res, { user: serializeUser(target) });
}

function deleteUser(res, db, actor, id) {
  if (actor.role !== "ADMIN") {
    sendJson(res, { error: "Acesso restrito a administradores." }, 403);
    return;
  }
  const target = db.users.find((user) => user.id === id);
  if (!target) {
    sendJson(res, { ok: true });
    return;
  }
  if (target.role === "ADMIN") {
    sendJson(res, { error: "Administradores nao podem ser excluidos." }, 403);
    return;
  }
  db.users = db.users.filter((user) => user.id !== id);
  db.pagePermissions = db.pagePermissions.filter((item) => item.userId !== id);
  db.editorLinkPermissions = db.editorLinkPermissions.filter((item) => item.userId !== id);
  db.sessions = db.sessions.filter((session) => session.userId !== id);
  saveDb(db);
  sendJson(res, { ok: true });
}

async function uploadAsset(req, res, db, user) {
  const form = await readMultipart(req);
  const kind = sanitize(form.fields.kind || "");
  const authorizedProfile = resolveProfile(db, user, form.fields.profileId);
  if (!authorizedProfile || !canManageProfile(user, authorizedProfile, db)) {
    sendJson(res, { error: "Sem permissao para enviar imagens." }, 403);
    return;
  }
  const profile = writableProfile(db, authorizedProfile.id);
  if (!profile) {
    sendJson(res, { error: "Perfil nao encontrado." }, 404);
    return;
  }
  if (!["avatar", "banner"].includes(kind) || !form.files.file) {
    sendJson(res, { error: "Upload invalido." }, 400);
    return;
  }
  const file = form.files.file;
  const ext = extensionForContentType(file.contentType || "");
  if (!ext) {
    sendJson(res, { error: "Use JPG, PNG ou WEBP." }, 415);
    return;
  }
  const dimensions = readImageDimensions(file.data, file.contentType);
  const limit = kind === "avatar" ? { bytes: 2 * 1024 * 1024, width: 1024, height: 1024 } : { bytes: 4 * 1024 * 1024, width: 2400, height: 900 };
  if (file.data.length > limit.bytes || !dimensions || dimensions.width > limit.width || dimensions.height > limit.height) {
    sendJson(res, { error: `${kind === "avatar" ? "Avatar" : "Banner"} fora do limite de tamanho ou dimensao.` }, 413);
    return;
  }
  const key = `${profile.id}/${kind}/${randomUUID()}.${ext}`;
  const outputPath = join(uploadDir, key);
  mkdirSync(join(uploadDir, profile.id, kind), { recursive: true });
  writeFileSync(outputPath, file.data);
  const url = `/api/assets/${key.replaceAll("\\", "/")}`;
  profile[kind] = url;
  saveDb(db);
  sendJson(res, { url, key, width: dimensions.width, height: dimensions.height, size: file.data.length, profile });
}

async function updateProfile(req, res, db, user) {
  const body = await readJson(req);
  const authorizedProfile = resolveProfile(db, user, body.profileId || body.id);
  if (!authorizedProfile || !canManageProfile(user, authorizedProfile, db)) {
    sendJson(res, { error: "Sem permissao para alterar perfil." }, 403);
    return;
  }
  const profile = writableProfile(db, authorizedProfile.id);
  if (!profile) {
    sendJson(res, { error: "Perfil nao encontrado." }, 404);
    return;
  }

  profile.slug = cleanSlug(body.slug ?? profile.slug);
  profile.title = sanitize(body.title ?? profile.title);
  profile.description = sanitize(body.description ?? profile.description);
  profile.avatar = sanitize(body.avatar ?? profile.avatar);
  profile.banner = sanitize(body.banner ?? profile.banner);
  profile.primaryColor = sanitize(body.primaryColor ?? profile.primaryColor);
  profile.secondaryColor = sanitize(body.secondaryColor ?? profile.secondaryColor);
  profile.theme = sanitize(body.theme ?? profile.theme);
  profile.buttonRadius = clampNumber(body.buttonRadius, 0, 32, profile.buttonRadius);
  profile.fontFamily = sanitize(body.fontFamily ?? profile.fontFamily);
  profile.public = body.public === undefined ? profile.public : Boolean(body.public);
  saveDb(db);
  sendJson(res, { profile });
}

function adminState(db, user, requestedProfileId) {
  const profiles = authorizedProfiles(db, user);
  const profile = profiles.find((item) => item.id === requestedProfileId) || profiles[0];
  if (!profile) return null;
  const links = db.links.filter((link) => link.profileId === profile.id).sort((a, b) => a.order - b.order);
  const manages = canManageProfile(user, profile, db);
  return {
    user: serializeUser(user),
    profile,
    profiles,
    links,
    permissions: {
      roleOnProfile: user.role === "ADMIN" ? "ADMIN" : profile.permissionRole || user.role,
      canManageProfile: manages,
      canCreateLinks: manages,
      canDeleteLinks: manages,
      canReorderLinks: manages,
      canManageUsers: user.role === "ADMIN",
      editableLinkIds: manages ? links.map((link) => link.id) : editableLinkIds(db, user, profile)
    }
  };
}

function authorizedProfiles(db, user) {
  if (user.role === "ADMIN") return db.profiles.map((profile) => ({ ...profile, permissionRole: null }));
  return db.profiles
    .map((profile) => {
      const permission = db.pagePermissions.find((item) => item.userId === user.id && item.profileId === profile.id && item.status === "approved");
      if (profile.userId === user.id && user.role === "GESTOR") return { ...profile, permissionRole: "GESTOR" };
      if (permission) return { ...profile, permissionRole: permission.role };
      return null;
    })
    .filter(Boolean);
}

function resolveProfile(db, user, requestedProfileId) {
  return authorizedProfiles(db, user).find((profile) => profile.id === requestedProfileId) || null;
}

function writableProfile(db, profileId) {
  return db.profiles.find((profile) => profile.id === profileId) || null;
}

function canManageProfile(user, profile, db) {
  if (user.role === "ADMIN") return true;
  if (user.role !== "GESTOR") return false;
  return profile.userId === user.id || db.pagePermissions.some((item) => item.userId === user.id && item.profileId === profile.id && item.role === "GESTOR" && item.status === "approved");
}

function canEditLink(user, profile, linkId, db) {
  if (canManageProfile(user, profile, db)) return true;
  return db.editorLinkPermissions.some((item) => item.userId === user.id && item.profileId === profile.id && item.linkId === linkId);
}

function editableLinkIds(db, user, profile) {
  return db.editorLinkPermissions.filter((item) => item.userId === user.id && item.profileId === profile.id).map((item) => item.linkId);
}

function applyUserPermission(db, actor, user, profileId, linkIds) {
  if (!profileId || user.role === "ADMIN") return;
  db.pagePermissions = db.pagePermissions.filter((item) => !(item.userId === user.id && item.profileId === profileId));
  db.pagePermissions.push({ id: randomUUID(), userId: user.id, profileId, role: user.role === "GESTOR" ? "GESTOR" : "EDITOR", status: "approved", approvedBy: actor.id });
  db.editorLinkPermissions = db.editorLinkPermissions.filter((item) => !(item.userId === user.id && item.profileId === profileId));
  if (user.role === "EDITOR") {
    linkIds.forEach((linkId) => {
      db.editorLinkPermissions.push({ id: randomUUID(), userId: user.id, profileId, linkId, grantedBy: actor.id });
    });
  }
}

function requireUser(req, res) {
  const db = readDb();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > Date.now());
  const user = session ? db.users.find((item) => item.id === session.userId && item.status === "active") : null;
  if (!user) {
    sendJson(res, { error: "Sessao ausente, invalida ou expirada." }, 401);
    return { db, user: null, token };
  }
  return { db, user, token };
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    avatar: user.avatar,
    description: user.description,
    status: user.status || (user.active ? "active" : "inactive"),
    active: (user.status || "active") === "active"
  };
}

async function readJson(req) {
  const body = await readBody(req);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {}, files: {} };
  const body = await readBody(req);
  const parts = body.toString("latin1").split(`--${boundary}`);
  const fields = {};
  const files = {};
  for (const part of parts) {
    const index = part.indexOf("\r\n\r\n");
    if (index < 0) continue;
    const rawHeaders = part.slice(0, index);
    let value = part.slice(index + 4);
    value = value.replace(/\r\n$/, "");
    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const filename = rawHeaders.match(/filename="([^"]*)"/)?.[1];
    if (filename !== undefined) {
      files[name] = {
        filename,
        contentType: rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream",
        data: Buffer.from(value, "latin1")
      };
    } else {
      fields[name] = value;
    }
  }
  return { fields, files };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveUpload(key, res) {
  const safeKey = decodeURIComponent(key).replaceAll("..", "");
  const path = join(uploadDir, safeKey);
  if (!existsSync(path)) {
    sendJson(res, { error: "Arquivo nao encontrado." }, 404);
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentTypeForExtension(extname(path)),
    "Cache-Control": "public, max-age=31536000, immutable"
  });
  createReadStream(path).pipe(res);
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function setCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cleanSlug(value) {
  return sanitize(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniqueProfileSlug(db, value) {
  const base = cleanSlug(value) || "pagina-publica";
  const used = new Set(db.profiles.map((profile) => profile.slug));
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function sanitize(value) {
  return String(value ?? "").replace(/[<>]/g, "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 240);
}

function normalizeStatus(value) {
  const status = sanitize(value || "active").toLowerCase();
  return ["active", "inactive", "suspended"].includes(status) ? status : "active";
}

function normalizeUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL invalida.");
  return url.toString();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function extensionForContentType(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "";
}

function contentTypeForExtension(extension) {
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function readImageDimensions(buffer, contentType) {
  if (contentType === "image/png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg") return readJpegDimensions(buffer);
  if (contentType === "image/webp") return readWebpDimensions(buffer);
  return null;
}

function readJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    const length = buffer.readUInt16BE(offset);
    if (length < 2) return null;
    offset += length;
  }
  return null;
}

function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16), height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16) };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}
