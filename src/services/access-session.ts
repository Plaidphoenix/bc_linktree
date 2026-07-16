import type { AdminState, User } from "../types";

const ACCESS_SESSION_KEY = "linkgov.access-session";
const ADMIN_CACHE_KEY = "linkgov.admin-cache";
const LAST_ADMIN_PATH_KEY = "linkgov.last-admin-path";
const SELECTED_PROFILE_KEY = "linkgov.selected-profile";
const DEFAULT_ADMIN_PATH = "/admin/links";
const ADMIN_PATH_PATTERN = /^\/admin\/(links|appearance|analytics|pages|users|settings)$/;

type AccessSessionRecord = {
  userId: string;
  email: string;
  updatedAt: string;
};

type CachedAdminState = {
  state: AdminState;
  savedAt: string;
};

export const accessSessionStore = {
  mark(user: Pick<User, "id" | "email">) {
    const existingSession = readJson<AccessSessionRecord>(ACCESS_SESSION_KEY);
    const existingCache = readJson<CachedAdminState>(ADMIN_CACHE_KEY);
    const validSession = isAccessSessionRecord(existingSession) ? existingSession : null;
    const validCachedState = existingCache && isAdminState(existingCache.state) ? existingCache.state : null;
    const identityChanged =
      (validSession && !sameIdentity(validSession, user)) ||
      (validCachedState && !sameIdentity(validCachedState.user, user));

    if ((existingSession && !validSession) || (existingCache && !validCachedState) || identityChanged) {
      clearCachedAdminData();
    }

    const record: AccessSessionRecord = {
      userId: user.id,
      email: user.email,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify(record));
  },

  hasSession() {
    const session = readJson<AccessSessionRecord>(ACCESS_SESSION_KEY);
    return Boolean(session?.userId && session.email);
  },

  cacheAdminState(state: AdminState) {
    const session = readJson<AccessSessionRecord>(ACCESS_SESSION_KEY);
    if (!isAccessSessionRecord(session) || !sameIdentity(session, state.user)) {
      clearCachedAdminData();
      return;
    }

    const cached: CachedAdminState = {
      state,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cached));
  },

  getCachedAdminState() {
    const session = readJson<AccessSessionRecord>(ACCESS_SESSION_KEY);
    const cached = readJson<CachedAdminState>(ADMIN_CACHE_KEY);
    return isAccessSessionRecord(session) && cached && isAdminState(cached.state) && sameIdentity(session, cached.state.user)
      ? cached.state
      : null;
  },

  rememberAdminPath(path: string) {
    if (ADMIN_PATH_PATTERN.test(path)) {
      localStorage.setItem(LAST_ADMIN_PATH_KEY, path);
    }
  },

  getLastAdminPath() {
    const path = localStorage.getItem(LAST_ADMIN_PATH_KEY) || "";
    return ADMIN_PATH_PATTERN.test(path) ? path : DEFAULT_ADMIN_PATH;
  },

  clear() {
    localStorage.removeItem(ACCESS_SESSION_KEY);
    clearCachedAdminData();
  }
};

function sameIdentity(
  left: Pick<AccessSessionRecord, "userId" | "email"> | Pick<User, "id" | "email">,
  right: Pick<AccessSessionRecord, "userId" | "email"> | Pick<User, "id" | "email">
) {
  const leftId = "userId" in left ? left.userId : left.id;
  const rightId = "userId" in right ? right.userId : right.id;
  return leftId === rightId && left.email.toLowerCase() === right.email.toLowerCase();
}

function clearCachedAdminData() {
  localStorage.removeItem(ADMIN_CACHE_KEY);
  localStorage.removeItem(LAST_ADMIN_PATH_KEY);
  localStorage.removeItem(SELECTED_PROFILE_KEY);
}

function isAccessSessionRecord(value: unknown): value is AccessSessionRecord {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AccessSessionRecord>;
  return typeof session.userId === "string" && Boolean(session.userId) && typeof session.email === "string" && Boolean(session.email);
}

export function asReadOnlyAdminState(state: AdminState): AdminState {
  return {
    ...state,
    permissions: {
      ...state.permissions,
      canManageProfile: false,
      canCreateLinks: false,
      canDeleteLinks: false,
      canReorderLinks: false,
      canManageUsers: false,
      editableLinkIds: []
    }
  };
}

function readJson<T>(key: string): T | null {
  const value = localStorage.getItem(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function isAdminState(value: unknown): value is AdminState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AdminState>;
  return Boolean(
    typeof state.user?.id === "string" &&
      state.user.id &&
      typeof state.user.email === "string" &&
      state.user.email &&
      state.profile?.id &&
      Array.isArray(state.profiles) &&
      Array.isArray(state.links) &&
      state.permissions &&
      Array.isArray(state.permissions.editableLinkIds)
  );
}
