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
    const cached: CachedAdminState = {
      state,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cached));
  },

  getCachedAdminState() {
    const cached = readJson<CachedAdminState>(ADMIN_CACHE_KEY);
    return cached && isAdminState(cached.state) ? cached.state : null;
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
    localStorage.removeItem(ADMIN_CACHE_KEY);
    localStorage.removeItem(LAST_ADMIN_PATH_KEY);
    localStorage.removeItem(SELECTED_PROFILE_KEY);
  }
};

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
    state.user?.id &&
      state.profile?.id &&
      Array.isArray(state.profiles) &&
      Array.isArray(state.links) &&
      state.permissions &&
      Array.isArray(state.permissions.editableLinkIds)
  );
}
