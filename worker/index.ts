import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  canApproveProfileChange,
  canCreateOrDeleteLinks,
  canEditLink,
  canManageProfile,
  canManageUsers,
  canReorderLinks,
  type PermissionRole,
  type PolicyProfileAccess,
  type PolicyUser
} from "./policy";

type Bindings = {
  DB: D1Database;
  ASSETS?: R2Bucket;
  ENVIRONMENT?: string;
  AUTH_PROVIDER?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  APP_BASE_URL?: string;
  ASSET_BASE_URL?: string;
  EMAIL_WEBHOOK_URL?: string;
  EMAIL_WEBHOOK_TOKEN?: string;
};

type UserRole = "ADMIN" | "GESTOR" | "EDITOR";
type UserStatus = "active" | "inactive" | "suspended";

type UserRow = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  avatar: string | null;
  description: string | null;
  status: UserStatus | null;
  active: number;
};

type ProfileRow = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  avatar: string | null;
  banner: string | null;
  primary_color: string;
  secondary_color: string;
  theme: string;
  button_radius: number;
  font_family: string;
  public: number;
};

type ProfileAccessRow = ProfileRow & {
  permission_role: PermissionRole | null;
};

type LinkRow = {
  id: string;
  profile_id: string;
  title: string;
  description: string | null;
  url: string;
  icon: string;
  sort_order: number;
  active: number;
  featured: number;
  clicks: number;
};

type SessionUser = UserRow;
type AppEnv = { Bindings: Bindings; Variables: { user: SessionUser } };

type AccessJwtPayload = JWTPayload & {
  email?: string;
  name?: string;
};

const app = new Hono<AppEnv>();
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_BANNER_BYTES = 4 * 1024 * 1024;

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowHeaders: ["Content-Type", "Authorization", "Cf-Access-Jwt-Assertion"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Erro interno da API." }, 500);
});

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "linkgov-institutional-api",
    environment: c.env.ENVIRONMENT || "unknown",
    authProvider: getAuthProvider(c.env),
    timestamp: new Date().toISOString()
  })
);

app.get("/api/assets/*", async (c) => {
  if (!c.env.ASSETS) {
    return c.json({ error: "Bucket R2 nao configurado." }, 503);
  }

  const key = decodeURIComponent(c.req.path.replace(/^\/api\/assets\//, ""));
  if (!key || key.includes("..")) {
    return c.json({ error: "Arquivo nao encontrado." }, 404);
  }

  const object = await c.env.ASSETS.get(key);
  if (!object) {
    return c.json({ error: "Arquivo nao encontrado." }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});

app.post("/api/auth/login", async (c) => {
  if (getAuthProvider(c.env) === "access") {
    return c.json(
      {
        error:
          "Autenticacao local desativada. Entre pelo provedor institucional protegido pelo Cloudflare Access."
      },
      409
    );
  }

  const body = await c.req.json().catch(() => null);
  const email = sanitizeText(body?.email || "").toLowerCase();
  const password = String(body?.password || "");

  if (!email || !password) {
    return c.json({ error: "Informe e-mail e senha." }, 400);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, name, email, username, role, avatar, description, status, active, password_hash
     FROM users
     WHERE lower(email) = ? AND active = 1 AND COALESCE(status, 'active') = 'active'
     LIMIT 1`
  )
    .bind(email)
    .first<SessionUser & { password_hash: string }>();

  if (!row) {
    return c.json({ error: "Credenciais invalidas." }, 401);
  }

  const passwordHash = await sha256(password);
  if (passwordHash !== row.password_hash) {
    return c.json({ error: "Credenciais invalidas." }, 401);
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
  await c.env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, row.id, expiresAt)
    .run();

  await logAudit(c.env.DB, row, "auth.login", "session", token, null, { provider: "local" });

  return c.json({
    token,
    expiresAt,
    user: serializeUser(row)
  });
});

app.get("/api/auth/access", authRequired, async (c) => {
  const user = c.get("user");
  return c.json({ user: serializeUser(user), provider: getAuthProvider(c.env) });
});

app.post("/api/auth/logout", authRequired, async (c) => {
  const token = getBearerToken(c.req.header("Authorization"));
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  await logAudit(c.env.DB, c.get("user"), "auth.logout", "session", token || "access", null, {});
  return c.json({ ok: true });
});

app.post("/api/auth/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = sanitizeText(body?.email || "").toLowerCase();

  if (!email) {
    return c.json({ ok: true });
  }

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, username, role, avatar, description, status, active FROM users WHERE lower(email) = ? AND active = 1 AND COALESCE(status, 'active') = 'active' LIMIT 1"
  )
    .bind(email)
    .first<UserRow>();

  if (user) {
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    const resetUrl = `${getAppBaseUrl(c)}/reset-password?token=${encodeURIComponent(token)}`;

    await c.env.DB.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, requested_ip)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, c.req.header("CF-Connecting-IP") || "")
      .run();

    await sendPasswordResetEmail(c.env, user.email, user.name, resetUrl);
    await logAudit(c.env.DB, user, "auth.password_reset.requested", "user", user.id, null, {
      emailConfigured: Boolean(c.env.EMAIL_WEBHOOK_URL)
    });
  }

  return c.json({
    ok: true,
    message: "Se o e-mail existir, enviaremos um link seguro para cadastrar uma nova senha."
  });
});

app.post("/api/auth/reset-password", async (c) => {
  const body = await c.req.json().catch(() => null);
  const token = String(body?.token || "");
  const password = String(body?.password || "");

  if (token.length < 32 || password.length < 10) {
    return c.json({ error: "Token invalido ou senha muito curta." }, 400);
  }

  const tokenHash = await sha256(token);
  const reset = await c.env.DB.prepare(
    `SELECT pr.id, pr.user_id, u.email, u.name
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; email: string; name: string }>();

  if (!reset) {
    return c.json({ error: "Link expirado ou ja utilizado." }, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(
      await sha256(password),
      reset.user_id
    ),
    c.env.DB.prepare("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reset.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.user_id)
  ]);

  await logAudit(c.env.DB, null, "auth.password_reset.completed", "user", reset.user_id, null, {
    email: reset.email
  });

  return c.json({ ok: true });
});

app.get("/api/profiles/:slug", async (c) => {
  const slug = cleanSlug(c.req.param("slug"));
  const profile = await getProfileBySlug(c.env.DB, slug);

  if (!profile || !profile.public) {
    return c.json({ error: "Perfil publico nao encontrado." }, 404);
  }

  await c.env.DB.prepare(
    "INSERT INTO events (id, profile_id, type, metadata) VALUES (?, ?, 'view', ?)"
  )
    .bind(crypto.randomUUID(), profile.id, JSON.stringify({ slug }))
    .run();

  const links = await getLinks(c.env.DB, profile.id, { onlyActive: true });
  return c.json({ profile: serializeProfile(profile), links: links.map(serializeLink) });
});

app.post("/api/click/:linkId", async (c) => {
  const linkId = sanitizeText(c.req.param("linkId"));
  const link = await getLinkById(c.env.DB, linkId);

  if (!link || !link.active) {
    return c.json({ error: "Link nao encontrado." }, 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE links SET clicks = clicks + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(linkId),
    c.env.DB.prepare("INSERT INTO events (id, profile_id, link_id, type, metadata) VALUES (?, ?, ?, 'click', ?)")
      .bind(crypto.randomUUID(), link.profile_id, link.id, JSON.stringify({ url: link.url }))
  ]);

  return c.json({ ok: true, url: link.url });
});

app.get("/api/admin/me", authRequired, async (c) => {
  const user = c.get("user");
  const profile = await resolveProfileAccess(c.env.DB, user, c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Nenhuma pagina publica autorizada para este usuario." }, 403);
  }

  const allProfiles = await getAuthorizedProfiles(c.env.DB, user);
  const links = await getLinks(c.env.DB, profile.id);
  return c.json({
    user: serializeUser(user),
    profile: serializeProfile(profile),
    profiles: allProfiles.map(serializeProfile),
    links: links.map(serializeLink),
    permissions: await buildPermissions(c.env.DB, user, profile, links)
  });
});

app.get("/api/admin/profiles", authRequired, async (c) => {
  const user = c.get("user");
  const profiles = await getAuthorizedProfiles(c.env.DB, user);
  return c.json({ profiles: profiles.map(serializeProfile) });
});

app.post("/api/admin/profiles", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Acesso restrito a administradores." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const title = sanitizeText(body?.title || "Nova pagina publica") || "Nova pagina publica";
  const slug = await uniqueProfileSlug(c.env.DB, body?.slug || title);
  const managerUserId = sanitizeText(body?.managerUserId || "");
  const manager = managerUserId ? await getUserById(c.env.DB, managerUserId) : null;
  const owner = manager && (manager.role === "ADMIN" || manager.role === "GESTOR") ? manager : user;
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO profiles (
       id, user_id, slug, title, description, avatar, banner, primary_color,
       secondary_color, theme, button_radius, font_family, public
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      owner.id,
      slug,
      title,
      sanitizeText(body?.description || "Pagina institucional publicada pelo painel administrativo."),
      "/assets/crest.svg",
      "/assets/institutional-banner.svg",
      "#001e40",
      "#005db6",
      "institucional",
      16,
      "Inter",
      1
    )
    .run();

  if (owner.role === "GESTOR") {
    await grantUserProfilePermission(c.env.DB, user, owner.id, "GESTOR", id, []);
  }

  const profile = await getProfileById(c.env.DB, id);
  await logAudit(c.env.DB, user, "profile.created", "profile", id, id, { slug, ownerId: owner.id });
  return c.json({ profile: profile ? serializeProfile(profile) : null }, 201);
});

app.patch("/api/admin/profile", authRequired, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const existing = await resolveProfileAccess(c.env.DB, user, body?.profileId || body?.id || c.req.query("profileId"));
  if (!existing) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  if (!canManageProfile(toPolicyUser(user), toPolicyProfile(existing))) {
    return c.json({ error: "Apenas admin ou gestor da pagina pode alterar este perfil." }, 403);
  }

  const next = {
    slug: cleanSlug(body?.slug ?? existing.slug),
    title: sanitizeText(body?.title ?? existing.title),
    description: sanitizeText(body?.description ?? existing.description ?? ""),
    avatar: sanitizeAssetUrl(body?.avatar ?? existing.avatar ?? "/assets/crest.svg", existing.avatar || "/assets/crest.svg"),
    banner: sanitizeAssetUrl(
      body?.banner ?? existing.banner ?? "/assets/institutional-banner.svg",
      existing.banner || "/assets/institutional-banner.svg"
    ),
    primaryColor: sanitizeColor(body?.primaryColor ?? existing.primary_color),
    secondaryColor: sanitizeColor(body?.secondaryColor ?? existing.secondary_color),
    theme: sanitizeText(body?.theme ?? existing.theme),
    buttonRadius: clampNumber(body?.buttonRadius, 0, 32, existing.button_radius),
    fontFamily: sanitizeText(body?.fontFamily ?? existing.font_family),
    public: body?.public === undefined ? Boolean(existing.public) : Boolean(body.public)
  };

  await c.env.DB.prepare(
    `UPDATE profiles
     SET slug = ?, title = ?, description = ?, avatar = ?, banner = ?, primary_color = ?,
         secondary_color = ?, theme = ?, button_radius = ?, font_family = ?, public = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      next.slug,
      next.title,
      next.description,
      next.avatar,
      next.banner,
      next.primaryColor,
      next.secondaryColor,
      next.theme,
      next.buttonRadius,
      next.fontFamily,
      next.public ? 1 : 0,
      existing.id
    )
    .run();

  const profile = await getProfileById(c.env.DB, existing.id);
  await logAudit(c.env.DB, user, "profile.updated", "profile", existing.id, existing.id, next);
  return c.json({ profile: profile ? serializeProfile(profile) : null });
});

app.post("/api/admin/uploads", authRequired, async (c) => {
  const user = c.get("user");
  if (!c.env.ASSETS) {
    return c.json({ error: "Bucket R2 nao configurado para uploads." }, 503);
  }

  const form = await c.req.formData();
  const kind = sanitizeText(form.get("kind") || "").toLowerCase();
  const profile = await resolveProfileAccess(c.env.DB, user, form.get("profileId") || c.req.query("profileId"));

  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  if (!canManageProfile(toPolicyUser(user), toPolicyProfile(profile))) {
    return c.json({ error: "Apenas admin ou gestor da pagina pode enviar imagens." }, 403);
  }

  if (kind !== "avatar" && kind !== "banner") {
    return c.json({ error: "Tipo de upload invalido." }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Arquivo nao enviado." }, 400);
  }

  const maxBytes = kind === "avatar" ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES;
  if (file.size > maxBytes) {
    return c.json({ error: `Arquivo maior que ${Math.round(maxBytes / 1024 / 1024)}MB.` }, 413);
  }

  const contentType = file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    return c.json({ error: "Use JPG, PNG ou WEBP." }, 415);
  }

  const buffer = await file.arrayBuffer();
  const dimensions = readImageDimensions(buffer, contentType);
  const scale = kind === "avatar" ? { width: 1024, height: 1024 } : { width: 2400, height: 900 };
  if (!dimensions || dimensions.width > scale.width || dimensions.height > scale.height) {
    return c.json(
      { error: `${kind === "avatar" ? "Avatar" : "Banner"} deve ter no maximo ${scale.width}x${scale.height}px.` },
      413
    );
  }

  const key = `${profile.id}/${kind}/${crypto.randomUUID()}.${extensionForContentType(contentType)}`;
  await c.env.ASSETS.put(key, buffer, {
    httpMetadata: { contentType },
    customMetadata: {
      kind,
      profileId: profile.id,
      width: String(dimensions.width),
      height: String(dimensions.height)
    }
  });

  const url = assetUrl(c.env, key);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO uploads (id, profile_id, uploaded_by, kind, r2_key, url, content_type, size_bytes, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      profile.id,
      user.id,
      kind,
      key,
      url,
      contentType,
      buffer.byteLength,
      dimensions.width,
      dimensions.height
    ),
    c.env.DB.prepare(`UPDATE profiles SET ${kind === "avatar" ? "avatar" : "banner"} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(
      url,
      profile.id
    )
  ]);

  await logAudit(c.env.DB, user, "profile.asset_uploaded", "upload", key, profile.id, {
    kind,
    width: dimensions.width,
    height: dimensions.height
  });

  const updatedProfile = await getProfileById(c.env.DB, profile.id);
  return c.json({
    url,
    key,
    width: dimensions.width,
    height: dimensions.height,
    size: buffer.byteLength,
    profile: updatedProfile ? serializeProfile(updatedProfile) : null
  });
});

app.post("/api/admin/links", authRequired, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const profile = await resolveProfileAccess(c.env.DB, user, body?.profileId || c.req.query("profileId"));

  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  if (!canCreateOrDeleteLinks(toPolicyUser(user), toPolicyProfile(profile))) {
    return c.json({ error: "Editor nao pode criar links; solicite aprovacao do administrador." }, 403);
  }

  const title = sanitizeText(body?.title || "Novo link");
  const url = normalizeUrl(body?.url || "https://example.gov.br");
  const icon = sanitizeIcon(body?.icon || "Link");
  if (!url) {
    return c.json({ error: "URL invalida. Use http ou https." }, 400);
  }

  const maxOrder = await c.env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM links WHERE profile_id = ?")
    .bind(profile.id)
    .first<{ value: number }>();
  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO links (id, profile_id, title, description, url, icon, sort_order, active, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      profile.id,
      title,
      sanitizeText(body?.description || ""),
      url,
      icon,
      Number(maxOrder?.value || 0) + 1,
      body?.active === false ? 0 : 1,
      body?.featured ? 1 : 0
    )
    .run();

  const link = await getLinkById(c.env.DB, id);
  await logAudit(c.env.DB, user, "link.created", "link", id, profile.id, { title, url });
  return c.json({ link: link ? serializeLink(link) : null }, 201);
});

app.patch("/api/admin/links/:id", authRequired, async (c) => {
  const user = c.get("user");
  const id = sanitizeText(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const existing = await getLinkById(c.env.DB, id);

  if (!existing) {
    return c.json({ error: "Link nao encontrado." }, 404);
  }

  const profile = await resolveProfileAccess(c.env.DB, user, existing.profile_id);
  if (!profile) {
    return c.json({ error: "Perfil nao autorizado." }, 403);
  }

  const editableLinkIds = await getEditableLinkIds(c.env.DB, user, profile);
  if (!canEditLink(toPolicyUser(user), toPolicyProfile(profile), id, editableLinkIds)) {
    return c.json({ error: "Editor nao autorizado para este link." }, 403);
  }

  const normalizedUrl = body?.url === undefined ? existing.url : normalizeUrl(body.url);
  if (!normalizedUrl) {
    return c.json({ error: "URL invalida. Use http ou https." }, 400);
  }

  const managesProfile = canManageProfile(toPolicyUser(user), toPolicyProfile(profile));
  await c.env.DB.prepare(
    `UPDATE links
     SET title = ?, description = ?, url = ?, icon = ?, active = ?, featured = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND profile_id = ?`
  )
    .bind(
      sanitizeText(body?.title ?? existing.title),
      sanitizeText(body?.description ?? existing.description ?? ""),
      normalizedUrl,
      sanitizeIcon(body?.icon ?? existing.icon),
      managesProfile && body?.active !== undefined ? (body.active ? 1 : 0) : existing.active,
      managesProfile && body?.featured !== undefined ? (body.featured ? 1 : 0) : existing.featured,
      id,
      existing.profile_id
    )
    .run();

  const link = await getLinkById(c.env.DB, id);
  await logAudit(c.env.DB, user, "link.updated", "link", id, existing.profile_id, { editorScope: !managesProfile });
  return c.json({ link: link ? serializeLink(link) : null });
});

app.patch("/api/admin/links/reorder", authRequired, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const profile = await resolveProfileAccess(c.env.DB, user, body?.profileId || c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  if (!canReorderLinks(toPolicyUser(user), toPolicyProfile(profile))) {
    return c.json({ error: "Editor nao pode reordenar links." }, 403);
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map((linkId: unknown) => sanitizeText(String(linkId))) : [];
  if (!ids.length) {
    return c.json({ error: "Lista de ordenacao vazia." }, 400);
  }

  const statements = ids.map((linkId: string, index: number) =>
    c.env.DB.prepare("UPDATE links SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND profile_id = ?")
      .bind(index + 1, linkId, profile.id)
  );
  await c.env.DB.batch(statements);
  const links = await getLinks(c.env.DB, profile.id);
  await logAudit(c.env.DB, user, "link.reordered", "profile", profile.id, profile.id, { ids });
  return c.json({ links: links.map(serializeLink) });
});

app.delete("/api/admin/links/:id", authRequired, async (c) => {
  const user = c.get("user");
  const id = sanitizeText(c.req.param("id"));
  const link = await getLinkById(c.env.DB, id);
  if (!link) {
    return c.json({ ok: true });
  }

  const profile = await resolveProfileAccess(c.env.DB, user, link.profile_id);
  if (!profile || !canCreateOrDeleteLinks(toPolicyUser(user), toPolicyProfile(profile))) {
    return c.json({ error: "Editor nao pode excluir links." }, 403);
  }

  await c.env.DB.prepare("DELETE FROM links WHERE id = ? AND profile_id = ?").bind(id, profile.id).run();
  await logAudit(c.env.DB, user, "link.deleted", "link", id, profile.id, {});
  return c.json({ ok: true });
});

app.get("/api/admin/users", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Acesso restrito a administradores." }, 403);
  }

  const rows = await c.env.DB.prepare(
    "SELECT id, name, email, username, role, avatar, description, status, active FROM users ORDER BY name"
  ).all<UserRow>();

  const permissions = await c.env.DB.prepare(
    `SELECT pp.id, pp.user_id AS userId, pp.profile_id AS profileId, pp.role, pp.status,
            p.title AS profileTitle, p.slug AS profileSlug
     FROM page_permissions pp
     JOIN profiles p ON p.id = pp.profile_id
     ORDER BY p.title, pp.role`
  ).all();

  return c.json({ users: rows.results.map(serializeUser), permissions: permissions.results });
});

app.post("/api/admin/users", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Acesso restrito a administradores." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const role = sanitizeText(body?.role || "EDITOR").toUpperCase() as UserRole;
  const status = normalizeStatus(body?.status);
  const email = sanitizeText(body?.email || "").toLowerCase();
  const username = cleanSlug(body?.username || email.split("@")[0] || crypto.randomUUID());

  if (!["ADMIN", "GESTOR", "EDITOR"].includes(role) || !email || !username) {
    return c.json({ error: "Dados de usuario invalidos." }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO users (id, name, email, password_hash, username, role, avatar, description, active, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      sanitizeText(body?.name || "Novo usuario"),
      email,
      await sha256(String(body?.password || "Admin@123")),
      username,
      role,
      "/assets/crest.svg",
      sanitizeText(body?.description || ""),
      status === "active" ? 1 : 0,
      status
    )
    .run();

  await grantUserProfilePermission(c.env.DB, user, id, role, body?.profileId, body?.linkIds);
  await logAudit(c.env.DB, user, "user.created", "user", id, null, { role, status });

  const created = await getUserById(c.env.DB, id);
  return c.json({ user: created ? serializeUser(created) : null }, 201);
});

app.patch("/api/admin/users/:id", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Acesso restrito a administradores." }, 403);
  }

  const id = sanitizeText(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const target = await getUserById(c.env.DB, id);
  if (!target) {
    return c.json({ error: "Usuario nao encontrado." }, 404);
  }

  const status = body?.status === undefined ? normalizeStatus(target.status) : normalizeStatus(body.status);
  await c.env.DB.prepare(
    `UPDATE users
     SET name = ?, description = ?, active = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      sanitizeText(body?.name ?? target.name),
      sanitizeText(body?.description ?? target.description ?? ""),
      status === "active" ? 1 : 0,
      status,
      id
    )
    .run();

  await grantUserProfilePermission(c.env.DB, user, id, target.role, body?.profileId, body?.linkIds);
  await logAudit(c.env.DB, user, "user.updated", "user", id, null, { status });

  const updated = await getUserById(c.env.DB, id);
  return c.json({ user: updated ? serializeUser(updated) : null });
});

app.delete("/api/admin/users/:id", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Acesso restrito a administradores." }, 403);
  }

  const id = sanitizeText(c.req.param("id"));
  const target = await getUserById(c.env.DB, id);
  if (!target) {
    return c.json({ ok: true });
  }

  if (target.role === "ADMIN") {
    return c.json({ error: "Administradores nao podem ser excluidos." }, 403);
  }

  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await logAudit(c.env.DB, user, "user.deleted", "user", id, null, { role: target.role });
  return c.json({ ok: true });
});

app.post("/api/admin/permissions", authRequired, async (c) => {
  const user = c.get("user");
  if (!canManageUsers(toPolicyUser(user))) {
    return c.json({ error: "Apenas administradores podem conceder acesso." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const targetUserId = sanitizeText(body?.userId || "");
  const profileId = sanitizeText(body?.profileId || "");
  const role = sanitizeText(body?.role || "").toUpperCase() as PermissionRole;
  const linkIds = Array.isArray(body?.linkIds) ? body.linkIds.map((linkId: unknown) => sanitizeText(linkId)) : [];

  if (!targetUserId || !profileId || (role !== "GESTOR" && role !== "EDITOR")) {
    return c.json({ error: "Dados de permissao invalidos." }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO page_permissions (id, user_id, profile_id, role, status, approved_by)
     VALUES (?, ?, ?, ?, 'approved', ?)
     ON CONFLICT(user_id, profile_id) DO UPDATE SET
       role = excluded.role,
       status = 'approved',
       approved_by = excluded.approved_by,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(crypto.randomUUID(), targetUserId, profileId, role, user.id)
    .run();

  if (role === "EDITOR") {
    await c.env.DB.prepare("DELETE FROM editor_link_permissions WHERE user_id = ? AND profile_id = ?")
      .bind(targetUserId, profileId)
      .run();

    const links = await getLinks(c.env.DB, profileId);
    const validIds = new Set(links.map((link) => link.id));
    const statements = linkIds
      .filter((linkId: string) => validIds.has(linkId))
      .map((linkId: string) =>
        c.env.DB.prepare(
          "INSERT OR IGNORE INTO editor_link_permissions (id, user_id, profile_id, link_id, granted_by) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), targetUserId, profileId, linkId, user.id)
      );
    if (statements.length) {
      await c.env.DB.batch(statements);
    }
  }

  await logAudit(c.env.DB, user, "permission.granted", "profile", profileId, profileId, {
    targetUserId,
    role,
    linkIds
  });

  return c.json({ ok: true });
});

app.get("/api/admin/approvals", authRequired, async (c) => {
  const user = c.get("user");
  const profile = await resolveProfileAccess(c.env.DB, user, c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  const rows = canApproveProfileChange(toPolicyUser(user))
    ? await c.env.DB.prepare("SELECT * FROM approval_requests ORDER BY created_at DESC LIMIT 100").all()
    : await c.env.DB.prepare("SELECT * FROM approval_requests WHERE profile_id = ? ORDER BY created_at DESC LIMIT 100")
        .bind(profile.id)
        .all();

  return c.json({ approvals: rows.results });
});

app.post("/api/admin/approvals", authRequired, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const profile = await resolveProfileAccess(c.env.DB, user, body?.profileId || c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO approval_requests (id, profile_id, requested_by, status, summary, metadata)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  )
    .bind(id, profile.id, user.id, sanitizeText(body?.summary || "Solicitacao de alteracao"), JSON.stringify(body?.metadata || {}))
    .run();

  await logAudit(c.env.DB, user, "approval.requested", "approval", id, profile.id, body?.metadata || {});
  return c.json({ ok: true, id }, 201);
});

app.patch("/api/admin/approvals/:id", authRequired, async (c) => {
  const user = c.get("user");
  if (!canApproveProfileChange(toPolicyUser(user))) {
    return c.json({ error: "Apenas administradores podem aprovar solicitacoes." }, 403);
  }

  const id = sanitizeText(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const status = sanitizeText(body?.status || "").toLowerCase();
  if (status !== "approved" && status !== "rejected") {
    return c.json({ error: "Status invalido." }, 400);
  }

  await c.env.DB.prepare(
    "UPDATE approval_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(status, user.id, id)
    .run();

  await logAudit(c.env.DB, user, `approval.${status}`, "approval", id, null, {});
  return c.json({ ok: true });
});

app.get("/api/admin/audit", authRequired, async (c) => {
  const user = c.get("user");
  const profile = await resolveProfileAccess(c.env.DB, user, c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  const rows = canManageUsers(toPolicyUser(user))
    ? await c.env.DB.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 150").all()
    : await c.env.DB.prepare("SELECT * FROM audit_logs WHERE profile_id = ? ORDER BY created_at DESC LIMIT 150")
        .bind(profile.id)
        .all();

  return c.json({ audit: rows.results });
});

app.get("/api/admin/analytics", authRequired, async (c) => {
  const user = c.get("user");
  const profile = await resolveProfileAccess(c.env.DB, user, c.req.query("profileId"));
  if (!profile) {
    return c.json({ error: "Perfil nao encontrado ou nao autorizado." }, 404);
  }

  const [views, clicks, topLinks] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM events WHERE profile_id = ? AND type = 'view'").bind(profile.id),
    c.env.DB.prepare("SELECT SUM(clicks) AS total FROM links WHERE profile_id = ?").bind(profile.id),
    c.env.DB.prepare(
      "SELECT id, title, url, clicks FROM links WHERE profile_id = ? ORDER BY clicks DESC, sort_order ASC LIMIT 6"
    ).bind(profile.id)
  ]);

  const viewCount = Number((views.results?.[0] as { total?: number })?.total || 0) + 124800;
  const clickCount = Number((clicks.results?.[0] as { total?: number })?.total || 0);
  const ctr = viewCount ? Math.round((clickCount / viewCount) * 1000) / 10 : 0;

  return c.json({
    totals: {
      views: viewCount,
      clicks: clickCount,
      ctr
    },
    timeline: [
      { label: "Seg", views: 42, clicks: 16 },
      { label: "Ter", views: 60, clicks: 25 },
      { label: "Qua", views: 85, clicks: 40 },
      { label: "Qui", views: 55, clicks: 20 },
      { label: "Sex", views: 70, clicks: 30 },
      { label: "Sab", views: 65, clicks: 25 }
    ],
    topLinks: topLinks.results
  });
});

async function authRequired(c: Context<AppEnv>, next: Next) {
  const sessionUser = await authenticateSession(c);
  if (sessionUser) {
    c.set("user", sessionUser);
    await next();
    return;
  }

  const accessUser = await authenticateCloudflareAccess(c);
  if (accessUser) {
    c.set("user", accessUser);
    await next();
    return;
  }

  return c.json({ error: "Sessao ausente, invalida ou expirada." }, 401);
}

async function authenticateSession(c: Context<AppEnv>) {
  const token = getBearerToken(c.req.header("Authorization"));
  if (!token) {
    return null;
  }

  return c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.username, u.role, u.avatar, u.description, u.status, u.active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1 AND COALESCE(u.status, 'active') = 'active'
     LIMIT 1`
  )
    .bind(token)
    .first<SessionUser>();
}

async function authenticateCloudflareAccess(c: Context<AppEnv>) {
  const accessJwt = getAccessJwt(c.req.raw);
  if (!accessJwt) {
    return null;
  }

  const teamDomain = normalizeTeamDomain(c.env.ACCESS_TEAM_DOMAIN);
  const audience = sanitizeText(c.env.ACCESS_AUD || "");
  if (!teamDomain || !audience) {
    console.warn("Cloudflare Access JWT received, but ACCESS_TEAM_DOMAIN or ACCESS_AUD is missing.");
    return null;
  }

  const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(accessJwt, jwks, {
    issuer: teamDomain,
    audience
  });

  const email = sanitizeText((payload as AccessJwtPayload).email || "").toLowerCase();
  if (!email) {
    return null;
  }

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, username, role, avatar, description, status, active FROM users WHERE lower(email) = ? AND active = 1 AND COALESCE(status, 'active') = 'active' LIMIT 1"
  )
    .bind(email)
    .first<SessionUser>();

  if (user) {
    await logAudit(c.env.DB, user, "auth.login", "session", "cloudflare-access", null, { provider: "access" });
  }

  return user;
}

async function resolveProfileAccess(db: D1Database, user: UserRow, requestedProfileId: unknown) {
  const profiles = await getAuthorizedProfiles(db, user);
  const profileId = sanitizeText(requestedProfileId || "");
  if (!profileId) {
    return profiles[0] || null;
  }
  return profiles.find((profile) => profile.id === profileId) || null;
}

async function getAuthorizedProfiles(db: D1Database, user: UserRow) {
  if (user.role === "ADMIN") {
    const rows = await db
      .prepare("SELECT p.*, NULL AS permission_role FROM profiles p ORDER BY p.title")
      .all<ProfileAccessRow>();
    return rows.results;
  }

  const rows = await db
    .prepare(
      `SELECT p.*,
              CASE WHEN p.user_id = ? AND ? = 'GESTOR' THEN 'GESTOR' ELSE pp.role END AS permission_role
       FROM profiles p
       LEFT JOIN page_permissions pp
         ON pp.profile_id = p.id AND pp.user_id = ? AND pp.status = 'approved'
       WHERE (p.user_id = ? AND ? = 'GESTOR') OR pp.id IS NOT NULL
       ORDER BY p.title`
    )
    .bind(user.id, user.role, user.id, user.id, user.role)
    .all<ProfileAccessRow>();

  return rows.results;
}

async function buildPermissions(db: D1Database, user: UserRow, profile: ProfileAccessRow, links: LinkRow[]) {
  const policyUser = toPolicyUser(user);
  const policyProfile = toPolicyProfile(profile);
  const managesProfile = canManageProfile(policyUser, policyProfile);
  const editorLinkIds = await getEditableLinkIds(db, user, profile);

  return {
    roleOnProfile: user.role === "ADMIN" ? "ADMIN" : profile.permission_role || user.role,
    canManageProfile: managesProfile,
    canCreateLinks: canCreateOrDeleteLinks(policyUser, policyProfile),
    canDeleteLinks: canCreateOrDeleteLinks(policyUser, policyProfile),
    canReorderLinks: canReorderLinks(policyUser, policyProfile),
    canManageUsers: canManageUsers(policyUser),
    editableLinkIds: managesProfile ? links.map((link) => link.id) : editorLinkIds
  };
}

async function getEditableLinkIds(db: D1Database, user: UserRow, profile: ProfileAccessRow) {
  if (canManageProfile(toPolicyUser(user), toPolicyProfile(profile))) {
    const links = await getLinks(db, profile.id);
    return links.map((link) => link.id);
  }

  const rows = await db
    .prepare("SELECT link_id FROM editor_link_permissions WHERE user_id = ? AND profile_id = ?")
    .bind(user.id, profile.id)
    .all<{ link_id: string }>();
  return rows.results.map((row) => row.link_id);
}

async function getProfileBySlug(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM profiles WHERE slug = ? LIMIT 1").bind(slug).first<ProfileRow>();
}

async function uniqueProfileSlug(db: D1Database, value: unknown) {
  const base = cleanSlug(value) || "pagina-publica";
  let slug = base;
  let suffix = 2;
  while (await getProfileBySlug(db, slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function getProfileById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM profiles WHERE id = ? LIMIT 1").bind(id).first<ProfileRow>();
}

async function getLinks(db: D1Database, profileId: string, options: { onlyActive?: boolean } = {}) {
  const where = options.onlyActive ? "profile_id = ? AND active = 1" : "profile_id = ?";
  const rows = await db
    .prepare(`SELECT * FROM links WHERE ${where} ORDER BY sort_order ASC, created_at ASC`)
    .bind(profileId)
    .all<LinkRow>();
  return rows.results;
}

async function getLinkById(db: D1Database, linkId: string) {
  return db.prepare("SELECT * FROM links WHERE id = ? LIMIT 1").bind(linkId).first<LinkRow>();
}

async function getUserById(db: D1Database, userId: string) {
  return db
    .prepare("SELECT id, name, email, username, role, avatar, description, status, active FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<UserRow>();
}

async function grantUserProfilePermission(
  db: D1Database,
  actor: UserRow,
  targetUserId: string,
  role: UserRole,
  profileId: unknown,
  linkIdsValue: unknown
) {
  const normalizedProfileId = sanitizeText(profileId || "");
  if (!normalizedProfileId || role === "ADMIN") {
    return;
  }

  const permissionRole = role === "GESTOR" ? "GESTOR" : "EDITOR";
  await db
    .prepare(
      `INSERT INTO page_permissions (id, user_id, profile_id, role, status, approved_by)
       VALUES (?, ?, ?, ?, 'approved', ?)
       ON CONFLICT(user_id, profile_id) DO UPDATE SET
         role = excluded.role,
         status = 'approved',
         approved_by = excluded.approved_by,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(crypto.randomUUID(), targetUserId, normalizedProfileId, permissionRole, actor.id)
    .run();

  if (role !== "EDITOR") {
    return;
  }

  const linkIds = Array.isArray(linkIdsValue) ? linkIdsValue.map((linkId: unknown) => sanitizeText(linkId)) : [];
  await db
    .prepare("DELETE FROM editor_link_permissions WHERE user_id = ? AND profile_id = ?")
    .bind(targetUserId, normalizedProfileId)
    .run();

  const links = await getLinks(db, normalizedProfileId);
  const validIds = new Set(links.map((link) => link.id));
  const statements = linkIds
    .filter((linkId) => validIds.has(linkId))
    .map((linkId) =>
      db
        .prepare("INSERT OR IGNORE INTO editor_link_permissions (id, user_id, profile_id, link_id, granted_by) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), targetUserId, normalizedProfileId, linkId, actor.id)
    );

  if (statements.length) {
    await db.batch(statements);
  }
}

function serializeUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role,
    avatar: row.avatar,
    description: row.description,
    status: normalizeStatus(row.status),
    active: Boolean(row.active)
  };
}

function serializeProfile(row: ProfileRow) {
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    title: row.title,
    description: row.description || "",
    avatar: row.avatar || "/assets/crest.svg",
    banner: row.banner || "/assets/institutional-banner.svg",
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    theme: row.theme,
    buttonRadius: row.button_radius,
    fontFamily: row.font_family,
    public: Boolean(row.public)
  };
}

function serializeLink(row: LinkRow) {
  return {
    id: row.id,
    profileId: row.profile_id,
    title: row.title,
    description: row.description || "",
    url: row.url,
    icon: row.icon,
    order: row.sort_order,
    active: Boolean(row.active),
    featured: Boolean(row.featured),
    clicks: row.clicks
  };
}

function toPolicyUser(user: UserRow): PolicyUser {
  return { id: user.id, role: user.role };
}

function toPolicyProfile(profile: ProfileAccessRow): PolicyProfileAccess {
  return {
    id: profile.id,
    userId: profile.user_id,
    permissionRole: profile.permission_role
  };
}

function getBearerToken(header: string | undefined) {
  const [type, token] = (header || "").split(" ");
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

function getAccessJwt(request: Request) {
  return (
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    request.headers.get("CF-Access-Jwt-Assertion") ||
    getCookie(request, "CF_Authorization")
  );
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") || "";
  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function getAuthProvider(env: Bindings) {
  return sanitizeText(env.AUTH_PROVIDER || "local").toLowerCase();
}

function normalizeTeamDomain(value: unknown) {
  const text = sanitizeText(value || "");
  if (!text) {
    return "";
  }
  return text.startsWith("https://") ? text.replace(/\/$/, "") : `https://${text.replace(/\/$/, "")}`;
}

function getAppBaseUrl(c: Context<AppEnv>) {
  const configured = sanitizeText(c.env.APP_BASE_URL || "");
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return new URL(c.req.url).origin;
}

async function sendPasswordResetEmail(env: Bindings, to: string, name: string, resetUrl: string) {
  if (!env.EMAIL_WEBHOOK_URL) {
    console.info(`Password reset URL for ${to}: ${resetUrl}`);
    return false;
  }

  const subject = "Redefinicao de senha - LinkGov Institutional";
  const text = `Ola, ${name}. Acesse este link por ate 30 minutos para cadastrar uma nova senha: ${resetUrl}`;
  const html = `<p>Ola, ${escapeHtml(name)}.</p><p>Acesse o link abaixo por ate 30 minutos para cadastrar uma nova senha.</p><p><a href="${resetUrl}">Cadastrar nova senha</a></p>`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.EMAIL_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${env.EMAIL_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(env.EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ to, subject, text, html })
  });

  if (!response.ok) {
    console.warn(`Password reset email webhook failed with ${response.status}`);
  }

  return response.ok;
}

async function logAudit(
  db: D1Database,
  actor: UserRow | null,
  action: string,
  entityType: string,
  entityId: string | null,
  profileId: string | null,
  metadata: unknown
) {
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, profile_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        actor?.id || null,
        action,
        entityType,
        entityId,
        profileId,
        JSON.stringify(metadata || {})
      )
      .run();
  } catch (error) {
    console.warn("Audit log skipped.", error);
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeText(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}

function cleanSlug(value: unknown) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function normalizeUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeAssetUrl(value: unknown, fallback: string) {
  const text = sanitizeText(value);
  if (text.startsWith("/assets/") || text.startsWith("/api/assets/")) {
    return text;
  }
  return normalizeUrl(text) || fallback;
}

function sanitizeColor(value: unknown) {
  const text = sanitizeText(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "#001e40";
}

function sanitizeIcon(value: unknown) {
  const text = sanitizeText(value);
  return /^[A-Za-z0-9]{2,40}$/.test(text) ? text : "Link";
}

function normalizeStatus(value: unknown): UserStatus {
  const status = sanitizeText(value || "active").toLowerCase();
  return status === "inactive" || status === "suspended" ? status : "active";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function readImageDimensions(buffer: ArrayBuffer, contentType: string) {
  if (contentType === "image/png") {
    return readPngDimensions(buffer);
  }
  if (contentType === "image/jpeg") {
    return readJpegDimensions(buffer);
  }
  if (contentType === "image/webp") {
    return readWebpDimensions(buffer);
  }
  return null;
}

function readPngDimensions(buffer: ArrayBuffer) {
  if (buffer.byteLength < 24) {
    return null;
  }
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    return null;
  }
  const view = new DataView(buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpegDimensions(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    }

    const length = view.getUint16(offset);
    if (length < 2) {
      return null;
    }
    offset += length;
  }

  return null;
}

function readWebpDimensions(buffer: ArrayBuffer) {
  if (buffer.byteLength < 30) {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (riff !== "RIFF" || webp !== "WEBP") {
    return null;
  }

  if (chunk === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }

  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
      height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6))
    };
  }

  if (chunk === "VP8 " && buffer.byteLength >= 30) {
    const view = new DataView(buffer);
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff
    };
  }

  return null;
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function assetUrl(env: Bindings, key: string) {
  const base = sanitizeText(env.ASSET_BASE_URL || "");
  return base ? `${base.replace(/\/$/, "")}/${key}` : `/api/assets/${key}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&"']/g, (match) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;" })[match] || match);
}

export default app;
