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

export type Bindings = {
  DB: D1Database;
  ASSETS?: R2Bucket;
  ENVIRONMENT?: string;
  AUTH_PROVIDER?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  APP_BASE_URL?: string;
  ADMIN_BASE_URL?: string;
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

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && !isAllowedCorsOrigin(origin, c.env)) {
    return c.json({ error: "Origem nao autorizada." }, 403);
  }

  await next();
});

app.use(
  "*",
  cors({
    origin: (origin, c) => (isAllowedCorsOrigin(origin, c.env) ? origin : undefined),
    allowHeaders: ["Content-Type", "Authorization", "Cf-Access-Jwt-Assertion"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400
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

app.get("/api/auth/access/start", authRequired, (c) => {
  c.header("Cache-Control", "no-store");
  return c.redirect(`${resolveAdminBaseUrl(c.req.url, c.env)}/admin/links`, 302);
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
  if (getAuthProvider(c.env) === "access") {
    return c.json({
      ok: true,
      message: "Este ambiente usa um codigo temporario enviado por e-mail e nao possui senha local."
    });
  }

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
    const emailConfigured = Boolean(c.env.EMAIL_WEBHOOK_URL);
    if (emailConfigured) {
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
    }

    await logAudit(c.env.DB, user, "auth.password_reset.requested", "user", user.id, null, {
      emailConfigured
    });
  }

  return c.json({
    ok: true,
    message: "Se o e-mail existir, enviaremos um link seguro para cadastrar uma nova senha."
  });
});

app.post("/api/auth/reset-password", async (c) => {
  if (getAuthProvider(c.env) === "access") {
    return c.json({ error: "Redefinicao de senha local desativada pelo Cloudflare Access." }, 409);
  }

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
  await logAudit(c.env.DB, user, "profile.updated", "profile", existing.id, existing.idï½|¶‰ËkºwµçLè1¥¹­I½İmt¤ì(€½¹ÍĞÁ½±¥åUÍ•È€ôÑ½A½±¥åUÍ•È¡ÕÍ•È¤ì(€½¹ÍĞÁ½±¥åAÉ½™¥±”€ôÑ½A½±¥åAÉ½™¥±”¡ÁÉ½™¥±”¤ì(€½¹ÍĞµ…¹…•ÍAÉ½™¥±”€ô…¹5…¹…•AÉ½™¥±”¡Á½±¥åUÍ•È°Á½±¥åAÉ½™¥±”¤ì(€½¹ÍĞ•‘¥Ñ½É1¥¹­%‘Ì€ô…İ…¥Ğ•Ñ‘¥Ñ…‰±•1¥¹­%‘Ì¡‘ˆ°ÕÍ•È°ÁÉ½™¥±”¤ì((€É•ÑÕÉ¸ì(€€€É½±•=¹AÉ½™¥±”èÕÍ•È¹É½±”€ôôô€‰5%8ˆ€ü€‰5%8ˆ€èÁÉ½™¥±”¹Á•Éµ¥ÍÍ¥½¹}É½±”ñğÕÍ•È¹É½±”°(€€€…¹5…¹…•AÉ½™¥±”èµ…¹…•ÍAÉ½™¥±”°(€€€…¹É•…Ñ•1¥¹­Ìè…¹É•…Ñ•=É•±•Ñ•1¥¹­Ì¡Á½±¥åUÍ•È°Á½±¥åAÉ½™¥±”¤°(€€€…¹•±•Ñ•1¥¹­Ìè…¹É•…Ñ•=É•±•Ñ•1¥¹­Ì¡Á½±¥åUÍ•È°Á½±¥åAÉ½™¥±”¤°(€€€…¹I•½É‘•É1¥¹­Ìè…¹I•½É‘•É1¥¹­Ì¡Á½±¥åUÍ•È°Á½±¥åAÉ½™¥±”¤°(€€€…¹5…¹…•UÍ•ÉÌè…¹5…¹…•UÍ•ÉÌ¡Á½±¥åUÍ•È¤°(€€€•‘¥Ñ…‰±•1¥¹­%‘Ìèµ…¹…•ÍAÉ½™¥±”€ü±¥¹­Ì¹µ…À ¡±¥¹¬¤€ôø±¥¹¬¹¥¤€è•‘¥Ñ½É1¥¹­%‘Ì(€ôì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•Ñ‘¥Ñ…‰±•1¥¹­%‘Ì¡‘ˆèÅ…Ñ…‰…Í”°ÕÍ•ÈèUÍ•ÉI½Ü°ÁÉ½™¥±”èAÉ½™¥±••ÍÍI½Ü¤ì(€¥˜€¡…¹5…¹…•AÉ½™¥±”¡Ñ½A½±¥åUÍ•È¡ÕÍ•È¤°Ñ½A½±¥åAÉ½™¥±”¡ÁÉ½™¥±”¤¤¤ì(€€€½¹ÍĞ±¥¹­Ì€ô…İ…¥Ğ•Ñ1¥¹­Ì¡‘ˆ°ÁÉ½™¥±”¹¥¤ì(€€€É•ÑÕÉ¸±¥¹­Ì¹µ…À ¡±¥¹¬¤€ôø±¥¹¬¹¥¤ì(€ô((€½¹ÍĞÉ½İÌ€ô…İ…¥Ğ‘ˆ(€€€€¹ÁÉ•Á…É” ‰M1P±¥¹­}¥I=4•‘¥Ñ½É}±¥¹­}Á•Éµ¥ÍÍ¥½¹Ì]!IÕÍ•É}¥€ô€ü9ÁÉ½™¥±•}¥€ô€üˆ¤(€€€€¹‰¥¹¡ÕÍ•È¹¥°ÁÉ½™¥±”¹¥¤(€€€€¹…±°ñì±¥¹­}¥èÍÑÉ¥¹œôø ¤ì(€É•ÑÕÉ¸É½İÌ¹É•ÍÕ±ÑÌ¹µ…À ¡É½Ü¤€ôøÉ½Ü¹±¥¹­}¥¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•ÑAÉ½™¥±•	åM±Õœ¡‘ˆèÅ…Ñ…‰…Í”°Í±ÕœèÍÑÉ¥¹œ¤ì(€É•ÑÕÉ¸‘ˆ¹ÁÉ•Á…É” ‰M1P€¨I=4ÁÉ½™¥±•Ì]!IÍ±Õœ€ô€ü1%5%P€Äˆ¤¹‰¥¹¡Í±Õœ¤¹™¥ÉÍĞñAÉ½™¥±•I½Üø ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸Õ¹¥ÅÕ•AÉ½™¥±•M±Õœ¡‘ˆèÅ…Ñ…‰…Í”°Ù…±Õ”èÕ¹­¹½İ¸¤ì(€½¹ÍĞ‰…Í”€ô±•…¹M±Õœ¡Ù…±Õ”¤ñğ€‰Á…¥¹„µÁÕ‰±¥„ˆì(€±•ĞÍ±Õœ€ô‰…Í”ì(€±•ĞÍÕ™™¥à€ô€Èì(€İ¡¥±”€¡…İ…¥Ğ•ÑAÉ½™¥±•	åM±Õœ¡‘ˆ°Í±Õœ¤¤ì(€€€Í±Õœ€ô€‘í‰…Í•ô´‘íÍÕ™™¥áõ€ì(€€€ÍÕ™™¥à€¬ô€Äì(€ô(€É•ÑÕÉ¸Í±Õœì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•ÑAÉ½™¥±•	å%¡‘ˆèÅ…Ñ…‰…Í”°¥èÍÑÉ¥¹œ¤ì(€É•ÑÕÉ¸‘ˆ¹ÁÉ•Á…É” ‰M1P€¨I=4ÁÉ½™¥±•Ì]!I¥€ô€ü1%5%P€Äˆ¤¹‰¥¹¡¥¤¹™¥ÉÍĞñAÉ½™¥±•I½Üø ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•Ñ1¥¹­Ì¡‘ˆèÅ…Ñ…‰…Í”°ÁÉ½™¥±•%èÍÑÉ¥¹œ°½ÁÑ¥½¹Ìèì½¹±åÑ¥Ù”üè‰½½±•…¸ô€ôíô¤ì(€½¹ÍĞİ¡•É”€ô½ÁÑ¥½¹Ì¹½¹±åÑ¥Ù”€ü€‰ÁÉ½™¥±•}¥€ô€ü9…Ñ¥Ù”€ô€Äˆ€è€‰ÁÉ½™¥±•}¥€ô€üˆì(€½¹ÍĞÉ½İÌ€ô…İ…¥Ğ‘ˆ(€€€€¹ÁÉ•Á…É”¡M1P€¨I=4±¥¹­Ì]!I€‘íİ¡•É•ô=IH	dÍ½ÉÑ}½É‘•ÈM°É•…Ñ•‘}…ĞM€¤(€€€€¹‰¥¹¡ÁÉ½™¥±•%¤(€€€€¹…±°ñ1¥¹­I½Üø ¤ì(€É•ÑÕÉ¸É½İÌ¹É•ÍÕ±ÑÌì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•Ñ1¥¹­	å%¡‘ˆèÅ…Ñ…‰…Í”°±¥¹­%èÍÑÉ¥¹œ¤ì(€É•ÑÕÉ¸‘ˆ¹ÁÉ•Á…É” ‰M1P€¨I=4±¥¹­Ì]!I¥€ô€ü1%5%P€Äˆ¤¹‰¥¹¡±¥¹­%¤¹™¥ÉÍĞñ1¥¹­I½Üø ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸•ÑUÍ•É	å%¡‘ˆèÅ…Ñ…‰…Í”°ÕÍ•É%èÍÑÉ¥¹œ¤ì(€É•ÑÕÉ¸‘ˆ(€€€€¹ÁÉ•Á…É” ‰M1P¥°¹…µ”°•µ…¥°°ÕÍ•É¹…µ”°É½±”°…Ù…Ñ…È°‘•ÍÉ¥ÁÑ¥½¸°ÍÑ…ÑÕÌ°…Ñ¥Ù”I=4ÕÍ•ÉÌ]!I¥€ô€ü1%5%P€Äˆ¤(€€€€¹‰¥¹¡ÕÍ•É%¤(€€€€¹™¥ÉÍĞñUÍ•ÉI½Üø ¤ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸É…¹ÑUÍ•ÉAÉ½™¥±•A•Éµ¥ÍÍ¥½¸ (€‘ˆèÅ…Ñ…‰…Í”°(€…Ñ½ÈèUÍ•ÉI½Ü°(€Ñ…É•ÑUÍ•É%èÍÑÉ¥¹œ°(€É½±”èUÍ•ÉI½±”°(€ÁÉ½™¥±•%èÕ¹­¹½İ¸°(€±¥¹­%‘ÍY…±Õ”èÕ¹­¹½İ¸(¤ì(€½¹ÍĞ¹½Éµ…±¥é•‘AÉ½™¥±•%€ôÍ…¹¥Ñ¥é•Q•áĞ¡ÁÉ½™¥±•%ñğ€ˆˆ¤ì(€¥˜€ …¹½Éµ…±¥é•‘AÉ½™¥±•%ñğÉ½±”€ôôô€‰5%8ˆ¤ì(€€€É•ÑÕÉ¸ì(€ô((€½¹ÍĞÁ•Éµ¥ÍÍ¥½¹I½±”€ôÉ½±”€ôôô€‰MQ=Hˆ€ü€‰MQ=Hˆ€è€‰%Q=Hˆì(€…İ…¥Ğ‘ˆ(€€€€¹ÁÉ•Á…É” (€€€€€%9MIP%9Q<Á…•}Á•Éµ¥ÍÍ¥½¹Ì€¡¥°ÕÍ•É}¥°ÁÉ½™¥±•}¥°É½±”°ÍÑ…ÑÕÌ°…ÁÁÉ½Ù•‘}‰ä¤(€€€€€€Y1UL€ ü°€ü°€ü°€ü°€…ÁÁÉ½Ù•œ°€ü¤(€€€€€€=8=91%P¡ÕÍ•É}¥°ÁÉ½™¥±•}¥¤<UAQMP(€€€€€€€€É½±”€ô•á±Õ‘•¹É½±”°(€€€€€€€€ÍÑ…ÑÕÌ€ô€…ÁÁÉ½Ù•œ°(€€€€€€€€…ÁÁÉ½Ù•‘}‰ä€ô•á±Õ‘•¹…ÁÁÉ½Ù•‘}‰ä°(€€€€€€€€ÕÁ‘…Ñ•‘}…Ğ€ôUII9Q}Q%5MQ5A€(€€€€¤(€€€€¹‰¥¹¡ÉåÁÑ¼¹É…¹‘½µUU% ¤°Ñ…É•ÑUÍ•É%°¹½Éµ…±¥é•‘AÉ½™¥±•%°Á•Éµ¥ÍÍ¥½¹I½±”°…Ñ½È¹¥¤(€€€€¹ÉÕ¸ ¤ì((€¥˜€¡É½±”€„ôô€‰%Q=Hˆ¤ì(€€€É•ÑÕÉ¸ì(€ô((€½¹ÍĞ±¥¹­%‘Ì€ôÉÉ…ä¹¥ÍÉÉ…ä¡±¥¹­%‘ÍY…±Õ”¤€ü±¥¹­%‘ÍY…±Õ”¹µ…À ¡±¥¹­%èÕ¹­¹½İ¸¤€ôøÍ…¹¥Ñ¥é•Q•áĞ¡±¥¹­%¤¤€èmtì(€…İ…¥Ğ‘ˆ(€€€€¹ÁÉ•Á…É” ‰1QI=4•‘¥Ñ½É}±¥¹­}Á•Éµ¥ÍÍ¥½¹Ì]!IÕÍ•É}¥€ô€ü9ÁÉ½™¥±•}¥€ô€üˆ¤(€€€€¹‰¥¹¡Ñ…É•ÑUÍ•É%°¹½Éµ…±¥é•‘AÉ½™¥±•%¤(€€€€¹ÉÕ¸ ¤ì((€½¹ÍĞ±¥¹­Ì€ô…İ…¥Ğ•Ñ1¥¹­Ì¡‘ˆ°¹½Éµ…±¥é•‘AÉ½™¥±•%¤ì(€½¹ÍĞÙ…±¥‘%‘Ì€ô¹•ÜM•Ğ¡±¥¹­Ì¹µ…À ¡±¥¹¬¤€ôø±¥¹¬¹¥¤¤ì(€½¹ÍĞÍÑ…Ñ•µ•¹ÑÌ€ô±¥¹­%‘Ì(€€€€¹™¥±Ñ•È ¡±¥¹­%¤€ôøÙ…±¥‘%‘Ì¹¡…Ì¡±¥¹­%¤¤(€€€€¹µ…À ¡±¥¹­%¤€ôø(€€€€€‘ˆ(€€€€€€€€¹ÁÉ•Á…É” ‰%9MIP=H%9=I%9Q<•‘¥Ñ½É}±¥¹­}Á•Éµ¥ÍÍ¥½¹Ì€¡¥°ÕÍ•É}¥°ÁÉ½™¥±•}¥°±¥¹­}¥°É…¹Ñ•‘}‰ä¤Y1UL€ ü°€ü°€ü°€ü°€ü¤ˆ¤(€€€€€€€€¹‰¥¹¡ÉåÁÑ¼¹É…¹‘½µUU% ¤°Ñ…É•ÑUÍ•É%°¹½Éµ…±¥é•‘AÉ½™¥±•%°±¥¹­%°…Ñ½È¹¥¤(€€€€¤ì((€¥˜€¡ÍÑ…Ñ•µ•¹ÑÌ¹±•¹Ñ ¤ì(€€€…İ…¥Ğ‘ˆ¹‰…Ñ ¡ÍÑ…Ñ•µ•¹ÑÌ¤ì(€ô)ô()™Õ¹Ñ¥½¸Í•É¥…±¥é•UÍ•È¡É½ÜèUÍ•ÉI½Ü¤ì(€É•ÑÕÉ¸ì(€€€¥èÉ½Ü¹¥°(€€€¹…µ”èÉ½Ü¹¹…µ”°(€€€•µ…¥°èÉ½Ü¹•µ…¥°°(€€€ÕÍ•É¹…µ”èÉ½Ü¹ÕÍ•É¹…µ”°(€€€É½±”èÉ½Ü¹É½±”°(€€€…Ù…Ñ…ÈèÉ½Ü¹…Ù…Ñ…È°(€€€‘•ÍÉ¥ÁÑ¥½¸èÉ½Ü¹‘•ÍÉ¥ÁÑ¥½¸°(€€€ÍÑ…ÑÕÌè¹½Éµ…±¥é•MÑ…ÑÕÌ¡É½Ü¹ÍÑ…ÑÕÌ¤°(€€€…Ñ¥Ù”è	½½±•…¸¡É½Ü¹…Ñ¥Ù”¤(€ôì)ô()™Õ¹Ñ¥½¸Í•É¥…±¥é•AÉ½™¥±”¡É½ÜèAÉ½™¥±•I½Ü¤ì(€É•ÑÕÉ¸ì(€€€¥èÉ½Ü¹¥°(€€€ÕÍ•É%èÉ½Ü¹ÕÍ•É}¥°(€€€Í±ÕœèÉ½Ü¹Í±Õœ°(€€€Ñ¥Ñ±”èÉ½Ü¹Ñ¥Ñ±”°(€€€‘•ÍÉ¥ÁÑ¥½¸èÉ½Ü¹‘•ÍÉ¥ÁÑ¥½¸ñğ€ˆˆ°(€€€…Ù…Ñ…ÈèÉ½Ü¹…Ù…Ñ…Èñğ€ˆ½…ÍÍ•ÑÌ½É•ÍĞ¹ÍÙœˆ°(€€€‰…¹¹•ÈèÉ½Ü¹‰…¹¹•Èñğ€ˆ½…ÍÍ•ÑÌ½¥¹ÍÑ¥ÑÕÑ¥½¹…°µ‰…¹¹•È¹ÍÙœˆ°(€€€ÁÉ¥µ…Éå½±½ÈèÉ½Ü¹ÁÉ¥µ…Éå}½±½È°(€€€Í•½¹‘…Éå½±½ÈèÉ½Ü¹Í•½¹‘…Éå}½±½È°(€€€Ñ¡•µ”èÉ½Ü¹Ñ¡•µ”°(€€€‰ÕÑÑ½¹I…‘¥ÕÌèÉ½Ü¹‰ÕÑÑ½¹}É…‘¥ÕÌ°(€€€™½¹Ñ…µ¥±äèÉ½Ü¹™½¹Ñ}™…µ¥±ä°(€€€ÁÕ‰±¥Œè	½½±•…¸¡É½Ü¹ÁÕ‰±¥Œ¤(€ôì)ô()™Õ¹Ñ¥½¸Í•É¥…±¥é•1¥¹¬¡É½Üè1¥¹­I½Ü¤ì(€É•ÑÕÉ¸ì(€€€¥èÉ½Ü¹¥°(€€€ÁÉ½™¥±•%èÉ½Ü¹ÁÉ½™¥±•}¥°(€€€Ñ¥Ñ±”èÉ½Ü¹Ñ¥Ñ±”°(€€€‘•ÍÉ¥ÁÑ¥½¸èÉ½Ü¹‘•ÍÉ¥ÁÑ¥½¸ñğ€ˆˆ°(€€€ÕÉ°èÉ½Ü¹ÕÉ°°(€€€¥½¸èÉ½Ü¹¥½¸°(€€€½É‘•ÈèÉ½Ü¹Í½ÉÑ}½É‘•È°(€€€…Ñ¥Ù”è	½½±•…¸¡É½Ü¹…Ñ¥Ù”¤°(€€€™•…ÑÕÉ•è	½½±•…¸¡É½Ü¹™•…ÑÕÉ•¤°(€€€±¥­ÌèÉ½Ü¹±¥­Ì(€ôì)ô()™Õ¹Ñ¥½¸Ñ½A½±¥åUÍ•È¡ÕÍ•ÈèUÍ•ÉI½Ü¤èA½±¥åUÍ•Èì(€É•ÑÕÉ¸ì¥èÕÍ•È¹¥°É½±”èÕÍ•È¹É½±”ôì)ô()™Õ¹Ñ¥½¸Ñ½A½±¥åAÉ½™¥±”¡ÁÉ½™¥±”èAÉ½™¥±••ÍÍI½Ü¤èA½±¥åAÉ½™¥±••ÍÌì(€É•ÑÕÉ¸ì(€€€¥èÁÉ½™¥±”¹¥°(€€€ÕÍ•É%èÁÉ½™¥±”¹ÕÍ•É}¥°(€€€Á•Éµ¥ÍÍ¥½¹I½±”èÁÉ½™¥±”¹Á•Éµ¥ÍÍ¥½¹}É½±”(€ôì)ô()™Õ¹Ñ¥½¸•Ñ	•…É•ÉQ½­•¸¡¡•…‘•ÈèÍÑÉ¥¹œğÕ¹‘•™¥¹•¤ì(€½¹ÍĞmÑåÁ”°Ñ½­•¹t€ô€¡¡•…‘•Èñğ€ˆˆ¤¹ÍÁ±¥Ğ ˆ€ˆ¤ì(€É•ÑÕÉ¸ÑåÁ”ü¹Ñ½1½İ•É…Í” ¤€ôôô€‰‰•…É•Èˆ€˜˜Ñ½­•¸€üÑ½­•¸€è¹Õ±°ì)ô()™Õ¹Ñ¥½¸•Ñ•ÍÍ)İĞ¡É•ÅÕ•ÍĞèI•ÅÕ•ÍĞ¤ì(€É•ÑÕÉ¸€ (€€€É•ÅÕ•ÍĞ¹¡•…‘•ÉÌ¹•Ğ ‰˜µ•ÍÌµ)İĞµÍÍ•ÉÑ¥½¸ˆ¤ñğ(€€€É•ÅÕ•ÍĞ¹¡•…‘•ÉÌ¹•Ğ ‰µ•ÍÌµ)İĞµÍÍ•ÉÑ¥½¸ˆ¤ñğ(€€€•Ñ½½­¥”¡É•ÅÕ•ÍĞ°€‰}ÕÑ¡½É¥é…Ñ¥½¸ˆ¤(€€¤ì)ô()™Õ¹Ñ¥½¸•Ñ½½­¥”¡É•ÅÕ•ÍĞèI•ÅÕ•ÍĞ°¹…µ”èÍÑÉ¥¹œ¤ì(€½¹ÍĞ½½­¥”€ôÉ•ÅÕ•ÍĞ¹¡•…‘•ÉÌ¹•Ğ ‰½½­¥”ˆ¤ñğ€ˆˆì(€½¹ÍĞ¥Ñ•´€ô½½­¥”(€€€€¹ÍÁ±¥Ğ ˆìˆ¤(€€€€¹µ…À ¡Á…ÉĞ¤€ôøÁ…ÉĞ¹ÑÉ¥´ ¤¤(€€€€¹™¥¹ ¡Á…ÉĞ¤€ôøÁ…ÉĞ¹ÍÑ…ÉÑÍ]¥Ñ ¡€‘í¹…µ•ôõ€¤¤ì(€É•ÑÕÉ¸¥Ñ•´€ü‘•½‘•UI%½µÁ½¹•¹Ğ¡¥Ñ•´¹Í±¥”¡¹…µ”¹±•¹Ñ €¬€Ä¤¤€è¹Õ±°ì)ô()™Õ¹Ñ¥½¸•ÑÕÑ¡AÉ½Ù¥‘•È¡•¹Øè	¥¹‘¥¹Ì¤ì(€É•ÑÕÉ¸Í…¹¥Ñ¥é•Q•áĞ¡•¹Ø¹UQ!}AI=Y%Hñğ€‰±½…°ˆ¤¹Ñ½1½İ•É…Í” ¤ì)ô()•áÁ½ÉĞ™Õ¹Ñ¥½¸¥Í±±½İ•‘½ÉÍ=É¥¥¸ (€½É¥¥¸èÍÑÉ¥¹œ°(€•¹ØèA¥¬ñ	¥¹‘¥¹Ì°€‰5%9}	M}UI0ˆğ€‰AA}	M}UI0ˆğ€‰9Y%I=959Pˆø(¤ì(€½¹ÍĞ¹½Éµ…±¥é•‘=É¥¥¸€ô¹½Éµ…±¥é•½ÉÍ=É¥¥¸¡½É¥¥¸¤ì(€¥˜€ …¹½Éµ…±¥é•‘=É¥¥¸¤ì(€€€É•ÑÕÉ¸™…±Í”ì(€ô((€½¹ÍĞ•¹Ù¥É½¹µ•¹Ğ€ôÍ…¹¥Ñ¥é•Q•áĞ¡•¹Ø¹9Y%I=959Pñğ€ˆˆ¤¹Ñ½1½İ•É…Í” ¤ì(€½¹ÍĞ¥Í•Ù•±½Áµ•¹Ğ€ô•¹Ù¥É½¹µ•¹Ğ€ôôô€‰±½…°ˆñğ•¹Ù¥É½¹µ•¹Ğ€ôôô€‰‘•Ù•±½Áµ•¹Ğˆñğ•¹Ù¥É½¹µ•¹Ğ€ôôô€‰Ñ•ÍĞˆì(€¥˜€¡¥Í1½½Á‰…­=É¥¥¸¡¹½Éµ…±¥é•‘=É¥¥¸¤¤ì(€€€É•ÑÕÉ¸¥Í•Ù•±½Áµ•¹Ğì(€ô((€½¹ÍĞ…±±½İ•‘=É¥¥¹Ì€ôm•¹Ø¹AA}	M}UI0°•¹Ø¹5%9}	M}UI1t(€€€€¹µ…À ¡Ù…±Õ”¤€ôø¹½Éµ…±¥é•½ÉÍ=É¥¥¸¡Ù…±Õ”ñğ€ˆˆ¤¤(€€€€¹™¥±Ñ•È¡	½½±•…¸¤ì(€É•ÑÕÉ¸…±±½İ•‘=É¥¥¹Ì¹¥¹±Õ‘•Ì¡¹½Éµ…±¥é•‘=É¥¥¸¤ì)ô()•áÁ½ÉĞ™Õ¹Ñ¥½¸É•Í½±Ù•‘µ¥¹	…Í•UÉ° (€É•ÅÕ•ÍÑUÉ°èÍÑÉ¥¹œ°(€•¹ØèA¥¬ñ	¥¹‘¥¹Ì°€‰5%9}	M}UI0ˆğ€‰AA}	M}UI0ˆø(¤ì(€É•ÑÕÉ¸€ (€€€¹½Éµ…±¥é•½ÉÍ=É¥¥¸¡•¹Ø¹5%9}	M}UI0ñğ€ˆˆ¤ñğ(€€€¹½Éµ…±¥é•½ÉÍ=É¥¥¸¡•¹Ø¹AA}	M}UI0ñğ€ˆˆ¤ñğ(€€€¹•ÜUI0¡É•ÅÕ•ÍÑUÉ°¤¹½É¥¥¸(€€¤ì)ô()™Õ¹Ñ¥½¸¹½Éµ…±¥é•½ÉÍ=É¥¥¸¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€ÑÉäì(€€€½¹ÍĞÕÉ°€ô¹•ÜUI0¡Í…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”¤¤ì(€€€É•ÑÕÉ¸ÕÉ°¹ÁÉ½Ñ½½°€ôôô€‰¡ÑÑÀèˆñğÕÉ°¹ÁÉ½Ñ½½°€ôôô€‰¡ÑÑÁÌèˆ€üÕÉ°¹½É¥¥¸€è€ˆˆì(€ô…Ñ ì(€€€É•ÑÕÉ¸€ˆˆì(€ô)ô()™Õ¹Ñ¥½¸¥Í1½½Á‰…­=É¥¥¸¡½É¥¥¸èÍÑÉ¥¹œ¤ì(€½¹ÍĞ¡½ÍÑ¹…µ”€ô¹•ÜUI0¡½É¥¥¸¤¹¡½ÍÑ¹…µ”¹Ñ½1½İ•É…Í” ¤ì(€É•ÑÕÉ¸¡½ÍÑ¹…µ”€ôôô€‰±½…±¡½ÍĞˆñğ¡½ÍÑ¹…µ”€ôôô€ˆÄÈÜ¸À¸À¸Äˆñğ¡½ÍÑ¹…µ”€ôôô€‰lèèÅtˆì)ô()™Õ¹Ñ¥½¸¹½Éµ…±¥é•Q•…µ½µ…¥¸¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€½¹ÍĞÑ•áĞ€ôÍ…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”ñğ€ˆˆ¤ì(€¥˜€ …Ñ•áĞ¤ì(€€€É•ÑÕÉ¸€ˆˆì(€ô(€É•ÑÕÉ¸Ñ•áĞ¹ÍÑ…ÉÑÍ]¥Ñ  ‰¡ÑÑÁÌè¼¼ˆ¤€üÑ•áĞ¹É•Á±…” ½p¼¼°€ˆˆ¤€è¡ÑÑÁÌè¼¼‘íÑ•áĞ¹É•Á±…” ½p¼¼°€ˆˆ¥õ€ì)ô()™Õ¹Ñ¥½¸•ÑÁÁ	…Í•UÉ°¡Œè½¹Ñ•áĞñÁÁ¹Øø¤ì(€½¹ÍĞ½¹™¥ÕÉ•€ôÍ…¹¥Ñ¥é•Q•áĞ¡Œ¹•¹Ø¹AA}	M}UI0ñğ€ˆˆ¤ì(€¥˜€¡½¹™¥ÕÉ•¤ì(€€€É•ÑÕÉ¸½¹™¥ÕÉ•¹É•Á±…” ½p¼¼°€ˆˆ¤ì(€ô(€É•ÑÕÉ¸¹•ÜUI0¡Œ¹É•Ä¹ÕÉ°¤¹½É¥¥¸ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸Í•¹‘A…ÍÍİ½É‘I•Í•Ñµ…¥°¡•¹Øè	¥¹‘¥¹Ì°Ñ¼èÍÑÉ¥¹œ°¹…µ”èÍÑÉ¥¹œ°É•Í•ÑUÉ°èÍÑÉ¥¹œ¤ì(€¥˜€ …•¹Ø¹5%1}]	!==-}UI0¤ì(€€€É•ÑÕÉ¸™…±Í”ì(€ô((€½¹ÍĞÍÕ‰©•Ğ€ô€‰I•‘•™¥¹¥…¼‘”Í•¹¡„€´1¥¹­½Ø%¹ÍÑ¥ÑÕÑ¥½¹…°ˆì(€½¹ÍĞÑ•áĞ€ô=±„°€‘í¹…µ•ô¸•ÍÍ”•ÍÑ”±¥¹¬Á½È…Ñ”€ÌÀµ¥¹ÕÑ½ÌÁ…É„…‘…ÍÑÉ…ÈÕµ„¹½Ù„Í•¹¡„è€‘íÉ•Í•ÑUÉ±õ€ì(€½¹ÍĞ¡Ñµ°€ô€ñÀù=±„°€‘í•Í…Á•!Ñµ°¡¹…µ”¥ô¸ğ½ÀøñÀù•ÍÍ”¼±¥¹¬…‰…¥á¼Á½È…Ñ”€ÌÀµ¥¹ÕÑ½ÌÁ…É„…‘…ÍÑÉ…ÈÕµ„¹½Ù„Í•¹¡„¸ğ½ÀøñÀøñ„¡É•˜ôˆ‘íÉ•Í•ÑUÉ±ôˆù…‘…ÍÑÉ…È¹½Ù„Í•¹¡„ğ½„øğ½Àù€ì(€½¹ÍĞ¡•…‘•ÉÌèI•½ÉñÍÑÉ¥¹œ°ÍÑÉ¥¹œø€ôì€‰½¹Ñ•¹ĞµQåÁ”ˆè€‰…ÁÁ±¥…Ñ¥½¸½©Í½¸ˆôì(€¥˜€¡•¹Ø¹5%1}]	!==-}Q=-8¤ì(€€€¡•…‘•ÉÌ¹ÕÑ¡½É¥é…Ñ¥½¸€ô	•…É•È€‘í•¹Ø¹5%1}]	!==-}Q=-9õ€ì(€ô((€½¹ÍĞÉ•ÍÁ½¹Í”€ô…İ…¥Ğ™•Ñ ¡•¹Ø¹5%1}]	!==-}UI0°ì(€€€µ•Ñ¡½è€‰A=MPˆ°(€€€¡•…‘•ÉÌ°(€€€‰½‘äè)M=8¹ÍÑÉ¥¹¥™ä¡ìÑ¼°ÍÕ‰©•Ğ°Ñ•áĞ°¡Ñµ°ô¤(€ô¤ì((€¥˜€ …É•ÍÁ½¹Í”¹½¬¤ì(€€€½¹Í½±”¹İ…É¸¡A…ÍÍİ½ÉÉ•Í•Ğ•µ…¥°İ•‰¡½½¬™…¥±•İ¥Ñ €‘íÉ•ÍÁ½¹Í”¹ÍÑ…ÑÕÍõ€¤ì(€ô((€É•ÑÕÉ¸É•ÍÁ½¹Í”¹½¬ì)ô()…Íå¹Œ™Õ¹Ñ¥½¸±½Õ‘¥Ğ (€‘ˆèÅ…Ñ…‰…Í”°(€…Ñ½ÈèUÍ•ÉI½Üğ¹Õ±°°(€…Ñ¥½¸èÍÑÉ¥¹œ°(€•¹Ñ¥ÑåQåÁ”èÍÑÉ¥¹œ°(€•¹Ñ¥Ñå%èÍÑÉ¥¹œğ¹Õ±°°(€ÁÉ½™¥±•%èÍÑÉ¥¹œğ¹Õ±°°(€µ•Ñ…‘…Ñ„èÕ¹­¹½İ¸(¤ì(€ÑÉäì(€€€…İ…¥Ğ‘ˆ(€€€€€€¹ÁÉ•Á…É” (€€€€€€€%9MIP%9Q<…Õ‘¥Ñ}±½Ì€¡¥°…Ñ½É}ÕÍ•É}¥°…Ñ¥½¸°•¹Ñ¥Ñå}ÑåÁ”°•¹Ñ¥Ñå}¥°ÁÉ½™¥±•}¥°µ•Ñ…‘…Ñ„¤(€€€€€€€€Y1UL€ ü°€ü°€ü°€ü°€ü°€ü°€ü¥€(€€€€€€¤(€€€€€€¹‰¥¹ (€€€€€€€ÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€€€€€…Ñ½Èü¹¥ñğ¹Õ±°°(€€€€€€€…Ñ¥½¸°(€€€€€€€•¹Ñ¥ÑåQåÁ”°(€€€€€€€•¹Ñ¥Ñå%°(€€€€€€€ÁÉ½™¥±•%°(€€€€€€€)M=8¹ÍÑÉ¥¹¥™ä¡µ•Ñ…‘…Ñ„ñğíô¤(€€€€€€¤(€€€€€€¹ÉÕ¸ ¤ì(€ô…Ñ €¡•ÉÉ½È¤ì(€€€½¹Í½±”¹İ…É¸ ‰Õ‘¥Ğ±½œÍ­¥ÁÁ•¸ˆ°•ÉÉ½È¤ì(€ô)ô()…Íå¹Œ™Õ¹Ñ¥½¸Í¡„ÈÔØ¡Ù…±Õ”èÍÑÉ¥¹œ¤ì(€½¹ÍĞ‰åÑ•Ì€ô¹•ÜQ•áÑ¹½‘•È ¤¹•¹½‘”¡Ù…±Õ”¤ì(€½¹ÍĞ¡…Í €ô…İ…¥ĞÉåÁÑ¼¹ÍÕ‰Ñ±”¹‘¥•ÍĞ ‰M!´ÈÔØˆ°‰åÑ•Ì¤ì(€É•ÑÕÉ¸l¸¸¹¹•ÜU¥¹ĞáÉÉ…ä¡¡…Í ¥t¹µ…À ¡‰åÑ”¤€ôø‰åÑ”¹Ñ½MÑÉ¥¹œ ÄØ¤¹Á…‘MÑ…ÉĞ È°€ˆÀˆ¤¤¹©½¥¸ ˆˆ¤ì)ô()™Õ¹Ñ¥½¸É…¹‘½µQ½­•¸ ¤ì(€½¹ÍĞ‰åÑ•Ì€ô¹•ÜU¥¹ĞáÉÉ…ä ÌÈ¤ì(€ÉåÁÑ¼¹•ÑI…¹‘½µY…±Õ•Ì¡‰åÑ•Ì¤ì(€É•ÑÕÉ¸l¸¸¹‰åÑ•Ít¹µ…À ¡‰åÑ”¤€ôø‰åÑ”¹Ñ½MÑÉ¥¹œ ÄØ¤¹Á…‘MÑ…ÉĞ È°€ˆÀˆ¤¤¹©½¥¸ ˆˆ¤ì)ô()™Õ¹Ñ¥½¸Í…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”èÕ¹­¹½İ¸°µ…à€ô€ÈĞÀ¤ì(€É•ÑÕÉ¸MÑÉ¥¹œ¡Ù…±Õ”€üü€ˆˆ¤(€€€€¹É•Á±…” ½lğùt½œ°€ˆˆ¤(€€€€¹É•Á±…” ½mqÔÀÀÀÀµqÔÀÀÅ™t½œ°€ˆ€ˆ¤(€€€€¹ÑÉ¥´ ¤(€€€€¹Í±¥” À°µ…à¤ì)ô()™Õ¹Ñ¥½¸±•…¹M±Õœ¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€É•ÑÕÉ¸Í…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”¤(€€€€¹Ñ½1½İ•É…Í” ¤(€€€€¹É•Á±…” ½y ¬¼°€ˆˆ¤(€€€€¹¹½Éµ…±¥é” ‰9ˆ¤(€€€€¹É•Á±…” ½mqÔÀÌÀÀµqÔÀÌÙ™t½œ°€ˆˆ¤(€€€€¹É•Á±…” ½my„µèÀ´äµt½œ°€ˆ´ˆ¤(€€€€¹É•Á±…” ¼´¬½œ°€ˆ´ˆ¤(€€€€¹É•Á±…” ½xµğ´½œ°€ˆˆ¤(€€€€¹Í±¥” À°€àÀ¤ì)ô()™Õ¹Ñ¥½¸¹½Éµ…±¥é•UÉ°¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€ÑÉäì(€€€½¹ÍĞÕÉ°€ô¹•ÜUI0¡MÑÉ¥¹œ¡Ù…±Õ”ñğ€ˆˆ¤¹ÑÉ¥´ ¤¤ì(€€€¥˜€ …l‰¡ÑÑÀèˆ°€‰¡ÑÑÁÌè‰t¹¥¹±Õ‘•Ì¡ÕÉ°¹ÁÉ½Ñ½½°¤¤ì(€€€€€É•ÑÕÉ¸¹Õ±°ì(€€€ô(€€€É•ÑÕÉ¸ÕÉ°¹Ñ½MÑÉ¥¹œ ¤ì(€ô…Ñ ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô)ô()™Õ¹Ñ¥½¸Í…¹¥Ñ¥é•ÍÍ•ÑUÉ°¡Ù…±Õ”èÕ¹­¹½İ¸°™…±±‰…¬èÍÑÉ¥¹œ¤ì(€½¹ÍĞÑ•áĞ€ôÍ…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”¤ì(€¥˜€¡Ñ•áĞ¹ÍÑ…ÉÑÍ]¥Ñ  ˆ½…ÍÍ•ÑÌ¼ˆ¤ñğÑ•áĞ¹ÍÑ…ÉÑÍ]¥Ñ  ˆ½…Á¤½…ÍÍ•ÑÌ¼ˆ¤¤ì(€€€É•ÑÕÉ¸Ñ•áĞì(€ô(€É•ÑÕÉ¸¹½Éµ…±¥é•UÉ°¡Ñ•áĞ¤ñğ™…±±‰…¬ì)ô()™Õ¹Ñ¥½¸Í…¹¥Ñ¥é•½±½È¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€½¹ÍĞÑ•áĞ€ôÍ…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”¤ì(€É•ÑÕÉ¸€½xlÀ´å„µ™µuìÙô¼¹Ñ•ÍĞ¡Ñ•áĞ¤€üÑ•áĞ€è€ˆŒÀÀÅ”ĞÀˆì)ô()™Õ¹Ñ¥½¸Í…¹¥Ñ¥é•%½¸¡Ù…±Õ”èÕ¹­¹½İ¸¤ì(€½¹ÍĞÑ•áĞ€ôÍ…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”¤ì(€É•ÑÕÉ¸€½ymµi„µèÀ´åuìÈ°ĞÁô¼¹Ñ•ÍĞ¡Ñ•áĞ¤€üÑ•áĞ€è€‰1¥¹¬ˆì)ô()™Õ¹Ñ¥½¸¹½Éµ…±¥é•MÑ…ÑÕÌ¡Ù…±Õ”èÕ¹­¹½İ¸¤èUÍ•ÉMÑ…ÑÕÌì(€½¹ÍĞÍÑ…ÑÕÌ€ôÍ…¹¥Ñ¥é•Q•áĞ¡Ù…±Õ”ñğ€‰…Ñ¥Ù”ˆ¤¹Ñ½1½İ•É…Í” ¤ì(€É•ÑÕÉ¸ÍÑ…ÑÕÌ€ôôô€‰¥¹…Ñ¥Ù”ˆñğÍÑ…ÑÕÌ€ôôô€‰ÍÕÍÁ•¹‘•ˆ€üÍÑ…ÑÕÌ€è€‰…Ñ¥Ù”ˆì)ô()™Õ¹Ñ¥½¸±…µÁ9Õµ‰•È¡Ù…±Õ”èÕ¹­¹½İ¸°µ¥¸è¹Õµ‰•È°µ…àè¹Õµ‰•È°™…±±‰…¬è¹Õµ‰•È¤ì(€½¹ÍĞ¹Õµ‰•È€ô9Õµ‰•È¡Ù…±Õ”¤ì(€¥˜€¡9Õµ‰•È¹¥Í9…8¡¹Õµ‰•È¤¤ì(€€€É•ÑÕÉ¸™…±±‰…¬ì(€ô(€É•ÑÕÉ¸5…Ñ ¹µ…à¡µ¥¸°5…Ñ ¹µ¥¸¡µ…à°5…Ñ ¹É½Õ¹¡¹Õµ‰•È¤¤¤ì)ô()™Õ¹Ñ¥½¸É•…‘%µ…•¥µ•¹Í¥½¹Ì¡‰Õ™™•ÈèÉÉ…å	Õ™™•È°½¹Ñ•¹ÑQåÁ”èÍÑÉ¥¹œ¤ì(€¥˜€¡½¹Ñ•¹ÑQåÁ”€ôôô€‰¥µ…”½Á¹œˆ¤ì(€€€É•ÑÕÉ¸É•…‘A¹¥µ•¹Í¥½¹Ì¡‰Õ™™•È¤ì(€ô(€¥˜€¡½¹Ñ•¹ÑQåÁ”€ôôô€‰¥µ…”½©Á•œˆ¤ì(€€€É•ÑÕÉ¸É•…‘)Á•¥µ•¹Í¥½¹Ì¡‰Õ™™•È¤ì(€ô(€¥˜€¡½¹Ñ•¹ÑQåÁ”€ôôô€‰¥µ…”½İ•‰Àˆ¤ì(€€€É•ÑÕÉ¸É•…‘]•‰Á¥µ•¹Í¥½¹Ì¡‰Õ™™•È¤ì(€ô(€É•ÑÕÉ¸¹Õ±°ì)ô()™Õ¹Ñ¥½¸É•…‘A¹¥µ•¹Í¥½¹Ì¡‰Õ™™•ÈèÉÉ…å	Õ™™•È¤ì(€¥˜€¡‰Õ™™•È¹‰åÑ•1•¹Ñ €ğ€ÈĞ¤ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€½¹ÍĞ‰åÑ•Ì€ô¹•ÜU¥¹ĞáÉÉ…ä¡‰Õ™™•È¤ì(€½¹ÍĞÍ¥¹…ÑÕÉ”€ôlÄÌÜ°€àÀ°€Üà°€ÜÄ°€ÄÌ°€ÄÀ°€ÈØ°€ÄÁtì(€¥˜€ …Í¥¹…ÑÕÉ”¹•Ù•Éä ¡‰åÑ”°¥¹‘•à¤€ôø‰åÑ•Ím¥¹‘•át€ôôô‰åÑ”¤¤ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô(€½¹ÍĞÙ¥•Ü€ô¹•Ü…Ñ…Y¥•Ü¡‰Õ™™•È¤ì(€É•ÑÕÉ¸ìİ¥‘Ñ èÙ¥•Ü¹•ÑU¥¹ĞÌÈ ÄØ¤°¡•¥¡ĞèÙ¥•Ü¹•ÑU¥¹ĞÌÈ ÈÀ¤ôì)ô()™Õ¹Ñ¥½¸É•…‘)Á•¥µ•¹Í¥½¹Ì¡‰Õ™™•ÈèÉÉ…å	Õ™™•È¤ì(€½¹ÍĞ‰åÑ•Ì€ô¹•ÜU¥¹ĞáÉÉ…ä¡‰Õ™™•È¤ì(€½¹ÍĞÙ¥•Ü€ô¹•Ü…Ñ…Y¥•Ü¡‰Õ™™•È¤ì(€¥˜€¡‰åÑ•ÍlÁt€„ôô€Áá™˜ñğ‰åÑ•ÍlÅt€„ôô€Ááà¤ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô((€±•Ğ½™™Í•Ğ€ô€Èì(€İ¡¥±”€¡½™™Í•Ğ€¬€ä€ğ‰Õ™™•È¹‰åÑ•1•¹Ñ ¤ì(€€€¥˜€¡‰åÑ•Ím½™™Í•Ñt€„ôô€Áá™˜¤ì(€€€€€½™™Í•Ğ€¬ô€Äì(€€€€€½¹Ñ¥¹Õ”ì(€€€ô((€€€½¹ÍĞµ…É­•È€ô‰åÑ•Ím½™™Í•Ğ€¬€Åtì(€€€½™™Í•Ğ€¬ô€Èì(€€€¥˜€¡µ…É­•È€øô€ÁáŒÀ€˜˜µ…É­•È€ğô€Áá˜€˜˜€…lÁáŒĞ°€ÁáŒà°€Áát¹¥¹±Õ‘•Ì¡µ…É­•È¤¤ì(€€€€€É•ÑÕÉ¸ì¡•¥¡ĞèÙ¥•Ü¹•ÑU¥¹ĞÄØ¡½™™Í•Ğ€¬€Ì¤°İ¥‘Ñ èÙ¥•Ü¹•ÑU¥¹ĞÄØ¡½™™Í•Ğ€¬€Ô¤ôì(€€€ô((€€€½¹ÍĞ±•¹Ñ €ôÙ¥•Ü¹•ÑU¥¹ĞÄØ¡½™™Í•Ğ¤ì(€€€¥˜€¡±•¹Ñ €ğ€È¤ì(€€€€€É•ÑÕÉ¸¹Õ±°ì(€€€ô(€€€½™™Í•Ğ€¬ô±•¹Ñ ì(€ô((€É•ÑÕÉ¸¹Õ±°ì)ô()™Õ¹Ñ¥½¸É•…‘]•‰Á¥µ•¹Í¥½¹Ì¡‰Õ™™•ÈèÉÉ…å	Õ™™•È¤ì(€¥˜€¡‰Õ™™•È¹‰åÑ•1•¹Ñ €ğ€ÌÀ¤ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô((€½¹ÍĞ‰åÑ•Ì€ô¹•ÜU¥¹ĞáÉÉ…ä¡‰Õ™™•È¤ì(€½¹ÍĞÉ¥™˜€ôMÑÉ¥¹œ¹™É½µ¡…É½‘” ¸¸¹‰åÑ•Ì¹Í±¥” À°€Ğ¤¤ì(€½¹ÍĞİ•‰À€ôMÑÉ¥¹œ¹™É½µ¡…É½‘” ¸¸¹‰åÑ•Ì¹Í±¥” à°€ÄÈ¤¤ì(€½¹ÍĞ¡Õ¹¬€ôMÑÉ¥¹œ¹™É½µ¡…É½‘” ¸¸¹‰åÑ•Ì¹Í±¥” ÄÈ°€ÄØ¤¤ì(€¥˜€¡É¥™˜€„ôô€‰I%ˆñğİ•‰À€„ôô€‰]	@ˆ¤ì(€€€É•ÑÕÉ¸¹Õ±°ì(€ô((€¥˜€¡¡Õ¹¬€ôôô€‰Y@á`ˆ¤ì(€€€É•ÑÕÉ¸ì(€€€€€İ¥‘Ñ è€Ä€¬‰åÑ•ÍlÈÑt€¬€¡‰åÑ•ÍlÈÕt€ğğ€à¤€¬€¡‰åÑ•ÍlÈÙt€ğğ€ÄØ¤°(€€€€€¡•¥¡Ğè€Ä€¬‰åÑ•ÍlÈİt€¬€¡‰åÑ•ÍlÈát€ğğ€à¤€¬€¡‰åÑ•ÍlÈåt€ğğ€ÄØ¤(€€€ôì(€ô((€¥˜€¡¡Õ¹¬€ôôô€‰Y@á0ˆ€˜˜‰åÑ•ÍlÈÁt€ôôô€ÁàÉ˜¤ì(€€€É•ÑÕÉ¸ì(€€€€€İ¥‘Ñ è€Ä€¬€  ¡‰åÑ•ÍlÈÉt€˜€ÁàÍ˜¤€ğğ€à¤ğ‰åÑ•ÍlÈÅt¤°(€€€€€¡•¥¡Ğè€Ä€¬€  ¡‰åÑ•ÍlÈÑt€˜€ÁàÁ˜¤€ğğ€ÄÀ¤ğ€¡‰åÑ•ÍlÈÍt€ğğ€È¤ğ€ ¡‰åÑ•ÍlÈÉt€˜€ÁáŒÀ¤€øø€Ø¤¤(€€€ôì(€ô((€¥˜€¡¡Õ¹¬€ôôô€‰Y@à€ˆ€˜˜‰Õ™™•È¹‰åÑ•1•¹Ñ €øô€ÌÀ¤ì(€€€½¹ÍĞÙ¥•Ü€ô¹•Ü…Ñ…Y¥•Ü¡‰Õ™™•È¤ì(€€€É•ÑÕÉ¸ì(€€€€€İ¥‘Ñ èÙ¥•Ü¹•ÑU¥¹ĞÄØ ÈØ°ÑÉÕ”¤€˜€ÁàÍ™™˜°(€€€€€¡•¥¡ĞèÙ¥•Ü¹•ÑU¥¹ĞÄØ Èà°ÑÉÕ”¤€˜€ÁàÍ™™˜(€€€ôì(€ô((€É•ÑÕÉ¸¹Õ±°ì)ô()™Õ¹Ñ¥½¸•áÑ•¹Í¥½¹½É½¹Ñ•¹ÑQåÁ”¡½¹Ñ•¹ÑQåÁ”èÍÑÉ¥¹œ¤ì(€¥˜€¡½¹Ñ•¹ÑQåÁ”€ôôô€‰¥µ…”½Á¹œˆ¤ì(€€€É•ÑÕÉ¸€‰Á¹œˆì(€ô(€¥˜€¡½¹Ñ•¹ÑQåÁ”€ôôô€‰¥µ…”½İ•‰Àˆ¤ì(€€€É•ÑÕÉ¸€‰İ•‰Àˆì(€ô(€É•ÑÕÉ¸€‰©Áœˆì)ô()™Õ¹Ñ¥½¸…ÍÍ•ÑUÉ°¡•¹Øè	¥¹‘¥¹Ì°­•äèÍÑÉ¥¹œ¤ì(€½¹ÍĞ‰…Í”€ôÍ…¹¥Ñ¥é•Q•áĞ¡•¹Ø¹MMQ}	M}UI0ñğ€ˆˆ¤ì(€É•ÑÕÉ¸‰…Í”€ü€‘í‰…Í”¹É•Á±…” ½p¼¼°€ˆˆ¥ô¼‘í­•åõ€€è€½…Á¤½…ÍÍ•ÑÌ¼‘í­•åõ€ì)ô()™Õ¹Ñ¥½¸•Í…Á•!Ñµ°¡Ù…±Õ”èÍÑÉ¥¹œ¤ì(€É•ÑÕÉ¸Ù…±Õ”¹É•Á±…” ½l˜ˆt½œ°€¡µ…Ñ ¤€ôø€¡ì€ˆ˜ˆè€ˆ™…µÀìˆ°€œˆœè€ˆ™ÅÕ½Ğìˆ°€ˆœˆè€ˆ˜ŒÌäìˆô¥mµ…Ñ¡tñğµ…Ñ ¤ì)ô()•áÁ½ÉĞ‘•™…Õ±Ğ…ÁÀì(