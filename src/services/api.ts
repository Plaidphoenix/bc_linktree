import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  seedAnalytics,
  seedLinks,
  seedProfiles,
  seedState,
  seedUsers
} from "../data/seed";
import type { AdminPermissions, AdminState, Analytics, LinkItem, PublicProfile, User, UserStatus } from "../types";
import { createId } from "../utils/id";

const API_BASE = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
  : null;
const TOKEN_KEY = "linkgov.session";
const STATE_KEY = "linkgov.demo-state";

type LoginResult = {
  token: string;
  expiresAt: string;
  user: User;
};

type StoredLocalState = {
  user: User;
  users: User[];
  profiles: PublicProfile[];
  links: LinkItem[];
  selectedProfileId: string;
};

export class ApiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export const sessionStore = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  }
};

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const result = await request<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    sessionStore.setToken(result.token);
    return result;
  } catch (error) {
    const localUser = seedUsers.find((user) => user.email.toLowerCase() === email.toLowerCase());
    if (!localUser || password !== DEMO_PASSWORD) {
      throw error instanceof ApiError ? error : new ApiError("Credenciais invalidas.", 401);
    }

    const token = createId("demo");
    sessionStore.setToken(token);
    const stored = readStoredLocalState();
    writeStoredLocalState({ ...stored, user: localUser, selectedProfileId: defaultProfileForUser(localUser).id });
    return {
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
      user: localUser
    };
  }
}

export async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    // Local fallback intentionally ignores network errors.
  } finally {
    sessionStore.clear();
  }
}

export async function requestPasswordReset(email: string) {
  try {
    return await request<{ ok: boolean; message?: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  } catch {
    return {
      ok: true,
      message: "Se o e-mail existir, enviaremos um link seguro para cadastrar uma nova senha."
    };
  }
}

export async function resetPassword(token: string, password: string) {
  return request<{ ok: boolean }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}

export async function getPublicProfile(slug: string) {
  try {
    return await request<{ profile: PublicProfile; links: LinkItem[] }>(`/api/profiles/${cleanSlug(slug)}`);
  } catch {
    const stored = readStoredLocalState();
    const profile = stored.profiles.find((item) => item.slug === cleanSlug(slug));
    if (!profile) {
      throw new ApiError("Perfil publico nao encontrado.", 404);
    }
    return {
      profile,
      links: stored.links.filter((link) => link.profileId === profile.id && link.active).sort((a, b) => a.order - b.order)
    };
  }
}

export async function getAdminState(profileId?: string): Promise<AdminState> {
  const selectedProfileId = profileId || readSelectedProfileId();
  try {
    const query = selectedProfileId ? `?profileId=${encodeURIComponent(selectedProfileId)}` : "";
    const state = await request<AdminState>(`/api/admin/me${query}`);
    persistSelectedProfile(state.profile.id);
    return state;
  } catch (error) {
    if (!profileId && selectedProfileId && error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      const state = await request<AdminState>("/api/admin/me");
      persistSelectedProfile(state.profile.id);
      return state;
    }
    return buildLocalAdminState(profileId);
  }
}

export async function updateProfile(profile: PublicProfile) {
  try {
    const response = await request<{ profile: PublicProfile }>("/api/admin/profile", {
      method: "PATCH",
      body: JSON.stringify({ ...profile, profileId: profile.id })
    });
    replaceLocalProfile(response.profile);
    return response.profile;
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0) {
      throw error;
    }
    replaceLocalProfile(profile);
    return profile;
  }
}

export async function uploadProfileAsset(kind: "avatar" | "banner", file: File, profileId: string) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("profileId", profileId);
  form.set("file", file);

  try {
    const response = await request<{ url: string; profile: PublicProfile }>("/api/admin/uploads", {
      method: "POST",
      body: form
    });
    replaceLocalProfile(response.profile);
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      throw error;
    }
    throw error;
  }
}

export async function createProfile(payload: {
  title: string;
  slug: string;
  description?: string;
  managerUserId?: string;
}) {
  try {
    const response = await request<{ profile: PublicProfile }>("/api/admin/profiles", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    addLocalProfile(response.profile);
    return response.profile;
  } catch {
    const stored = readStoredLocalState();
    const title = payload.title.trim() || "Nova pagina publica";
    const profile: PublicProfile = {
      id: createId("prf"),
      userId: payload.managerUserId || stored.user.id,
      slug: uniqueLocalSlug(payload.slug || title, stored.profiles),
      title,
      description: payload.description?.trim() || "Pagina institucional publicada pelo painel administrativo.",
      avatar: "/assets/crest.svg",
      banner: "/assets/institutional-banner.svg",
      primaryColor: "#001e40",
      secondaryColor: "#005db6",
      theme: "institucional",
      buttonRadius: 16,
      fontFamily: "Inter",
      public: true
    };
    addLocalProfile(profile);
    return profile;
  }
}

export async function createLink(link: Omit<LinkItem, "id" | "order" | "clicks">) {
  try {
    const response = await request<{ link: LinkItem }>("/api/admin/links", {
      method: "POST",
      body: JSON.stringify(link)
    });
    addLocalLink(response.link);
    return response.link;
  } catch {
    const stored = readStoredLocalState();
    const next: LinkItem = {
      ...link,
      id: createId("lnk"),
      order: stored.links.filter((item) => item.profileId === link.profileId).length + 1,
      clicks: 0
    };
    addLocalLink(next);
    return next;
  }
}

export async function updateLink(link: LinkItem) {
  try {
    const response = await request<{ link: LinkItem }>(`/api/admin/links/${link.id}`, {
      method: "PATCH",
      body: JSON.stringify(link)
    });
    replaceLocalLink(response.link);
    return response.link;
  } catch {
    replaceLocalLink(link);
    return link;
  }
}

export async function deleteLink(id: string) {
  try {
    await request(`/api/admin/links/${id}`, { method: "DELETE" });
  } catch {
    // Continue with local state.
  }
  const stored = readStoredLocalState();
  writeStoredLocalState({ ...stored, links: stored.links.filter((link) => link.id !== id) });
}

export async function reorderLinks(links: LinkItem[], profileId: string) {
  const ordered = links.map((link, index) => ({ ...link, order: index + 1 }));
  try {
    const response = await request<{ links: LinkItem[] }>("/api/admin/links/reorder", {
      method: "PATCH",
      body: JSON.stringify({ profileId, ids: ordered.map((link) => link.id) })
    });
    replaceLocalProfileLinks(profileId, response.links);
    return response.links;
  } catch {
    replaceLocalProfileLinks(profileId, ordered);
    return ordered;
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const response = await request<{ users: User[] }>("/api/admin/users");
    return response.users;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw error;
    }
    return readStoredLocalState().users;
  }
}

export async function createUser(payload: {
  name: string;
  email: string;
  username: string;
  role: User["role"];
  status: UserStatus;
  password?: string;
  description?: string;
  profileId?: string;
  linkIds?: string[];
}): Promise<User> {
  try {
    const response = await request<{ user: User }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    upsertLocalUser(response.user);
    return response.user;
  } catch {
    const stored = readStoredLocalState();
    const next: User = {
      id: createId("usr"),
      name: payload.name,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      avatar: "/assets/crest.svg",
      description: payload.description || "",
      status: payload.status,
      active: payload.status === "active"
    };
    writeStoredLocalState({ ...stored, users: [...stored.users, next] });
    return next;
  }
}

export async function updateUserStatus(id: string, status: UserStatus): Promise<User> {
  try {
    const response = await request<{ user: User }>(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    upsertLocalUser(response.user);
    return response.user;
  } catch {
    const stored = readStoredLocalState();
    const users = stored.users.map((user) => (user.id === id ? { ...user, status, active: status === "active" } : user));
    const updated = users.find((user) => user.id === id);
    writeStoredLocalState({ ...stored, users });
    return updated || stored.users[0];
  }
}

export async function deleteUser(id: string) {
  try {
    await request(`/api/admin/users/${id}`, { method: "DELETE" });
  } catch {
    // Continue with local state.
  }
  const stored = readStoredLocalState();
  writeStoredLocalState({ ...stored, users: stored.users.filter((user) => user.id !== id || user.role === "ADMIN") });
}

export async function getAnalytics(profileId?: string): Promise<Analytics> {
  try {
    const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
    return await request<Analytics>(`/api/admin/analytics${query}`);
  } catch {
    const state = buildLocalAdminState(profileId);
    const clicks = state.links.reduce((sum, link) => sum + link.clicks, 0);
    return {
      ...seedAnalytics,
      totals: {
        views: seedAnalytics.totals.views,
        clicks,
        ctr: Math.round((clicks / seedAnalytics.totals.views) * 1000) / 10
      },
      topLinks: state.links
        .map(({ id, title, url, clicks }) => ({ id, title, url, clicks }))
        .sort((a, b) => b.clicks - a.clicks)
    };
  }
}

export async function trackClick(link: LinkItem) {
  try {
    await request(`/api/click/${link.id}`, { method: "POST" });
  } catch {
    replaceLocalLink({ ...link, clicks: link.clicks + 1 });
  }
}

async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStore.getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE ?? ""}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
  } catch {
    throw new ApiError("API local nao esta acessivel. Rode npm run dev ou npm run dev:api:local.", 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error || "Falha na comunicacao com a API.", response.status);
  }

  return response.json() as Promise<T>;
}

function readStoredLocalState(): StoredLocalState {
  const stored = localStorage.getItem(STATE_KEY);
  if (!stored) {
    const initial: StoredLocalState = {
      user: seedState.user,
      users: seedUsers,
      profiles: seedProfiles,
      links: seedLinks,
      selectedProfileId: seedState.profile.id
    };
    writeStoredLocalState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredLocalState> & Partial<AdminState>;
    const users = Array.isArray(parsed.users) && parsed.users.length ? parsed.users : seedUsers;
    const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length ? parsed.profiles : seedProfiles;
    const links = mergeLinks(seedLinks, Array.isArray(parsed.links) ? parsed.links : []);
    const selectedProfileId = parsed.selectedProfileId || parsed.profile?.id || profiles[0]?.id || seedState.profile.id;
    return {
      user: parsed.user || seedState.user,
      users,
      profiles,
      links,
      selectedProfileId
    };
  } catch {
    const initial: StoredLocalState = {
      user: seedState.user,
      users: seedUsers,
      profiles: seedProfiles,
      links: seedLinks,
      selectedProfileId: seedState.profile.id
    };
    writeStoredLocalState(initial);
    return initial;
  }
}

function writeStoredLocalState(state: StoredLocalState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function buildLocalAdminState(profileId?: string): AdminState {
  const stored = readStoredLocalState();
  const selectedId = profileId || stored.selectedProfileId;
  const allowedProfiles = localAllowedProfiles(stored.user, stored.profiles);
  const profile = allowedProfiles.find((item) => item.id === selectedId) || allowedProfiles[0] || stored.profiles[0];
  const links = stored.links.filter((link) => link.profileId === profile.id).sort((a, b) => a.order - b.order);
  const permissions = localPermissions(stored.user, profile, links);

  writeStoredLocalState({ ...stored, selectedProfileId: profile.id });
  return {
    user: stored.user,
    profile,
    profiles: allowedProfiles,
    links,
    permissions
  };
}

function persistSelectedProfile(profileId: string) {
  const stored = readStoredLocalState();
  writeStoredLocalState({ ...stored, selectedProfileId: profileId });
}

function readSelectedProfileId() {
  try {
    return readStoredLocalState().selectedProfileId;
  } catch {
    return "";
  }
}

function replaceLocalProfile(profile: PublicProfile | null) {
  if (!profile) return;
  const stored = readStoredLocalState();
  writeStoredLocalState({
    ...stored,
    profiles: stored.profiles.map((item) => (item.id === profile.id ? profile : item)),
    selectedProfileId: profile.id
  });
}

function addLocalProfile(profile: PublicProfile | null) {
  if (!profile) return;
  const stored = readStoredLocalState();
  const exists = stored.profiles.some((item) => item.id === profile.id);
  writeStoredLocalState({
    ...stored,
    profiles: exists ? stored.profiles.map((item) => (item.id === profile.id ? profile : item)) : [...stored.profiles, profile],
    selectedProfileId: profile.id
  });
}

function addLocalLink(link: LinkItem) {
  const stored = readStoredLocalState();
  writeStoredLocalState({ ...stored, links: [...stored.links, link] });
}

function upsertLocalUser(user: User) {
  const stored = readStoredLocalState();
  const exists = stored.users.some((item) => item.id === user.id);
  writeStoredLocalState({
    ...stored,
    users: exists ? stored.users.map((item) => (item.id === user.id ? user : item)) : [...stored.users, user]
  });
}

function replaceLocalLink(link: LinkItem) {
  const stored = readStoredLocalState();
  writeStoredLocalState({
    ...stored,
    links: stored.links.map((item) => (item.id === link.id ? link : item))
  });
}

function replaceLocalProfileLinks(profileId: string, links: LinkItem[]) {
  const stored = readStoredLocalState();
  writeStoredLocalState({
    ...stored,
    links: [...stored.links.filter((link) => link.profileId !== profileId), ...links]
  });
}

function mergeLinks(seed: LinkItem[], stored: LinkItem[]) {
  const byId = new Map(seed.map((link) => [link.id, link]));
  stored.forEach((link) => byId.set(link.id, link));
  return [...byId.values()];
}

function localAllowedProfiles(user: User, profiles: PublicProfile[]) {
  if (user.role === "ADMIN") {
    return profiles;
  }
  if (user.role === "GESTOR") {
    return profiles.filter((profile) => profile.userId === user.id || profile.id === "prf_educacao");
  }
  return profiles.filter((profile) => profile.id === "prf_saude");
}

function localPermissions(user: User, profile: PublicProfile, links: LinkItem[]): AdminPermissions {
  const canManageProfile =
    user.role === "ADMIN" || (user.role === "GESTOR" && (profile.userId === user.id || profile.id === "prf_educacao"));
  const editableLinkIds = canManageProfile
    ? links.map((link) => link.id)
    : profile.id === "prf_saude"
      ? ["lnk_transparencia"]
      : [];

  return {
    roleOnProfile: user.role === "ADMIN" ? "ADMIN" : canManageProfile ? "GESTOR" : "EDITOR",
    canManageProfile,
    canCreateLinks: canManageProfile,
    canDeleteLinks: canManageProfile,
    canReorderLinks: canManageProfile,
    canManageUsers: user.role === "ADMIN",
    editableLinkIds
  };
}

function defaultProfileForUser(user: User) {
  if (user.role === "GESTOR") {
    return seedProfiles.find((profile) => profile.id === "prf_educacao") || seedProfiles[0];
  }
  return seedProfiles[0];
}

function uniqueLocalSlug(value: string, profiles: PublicProfile[]) {
  const base = cleanSlug(value) || "pagina-publica";
  const slugs = new Set(profiles.map((profile) => profile.slug));
  let candidate = base;
  let suffix = 2;
  while (slugs.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/^@+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
