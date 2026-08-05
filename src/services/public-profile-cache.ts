import type { LinkItem, PublicProfile } from "../types";

const PUBLIC_PROFILE_CACHE_KEY = "linkgov.public-profile-cache.v1";
const DEFAULT_ROUTE_KEY = "__default__";
const MAX_CACHED_PROFILES = 20;

export type PublicProfilePayload = {
  profile: PublicProfile;
  links: LinkItem[];
};

export type PublicProfileSnapshot = PublicProfilePayload & {
  savedAt: string;
};

type PublicProfileCache = {
  version: 1;
  entries: Record<string, PublicProfileSnapshot>;
};

export const publicProfileCache = {
  save(slug: string | undefined, payload: PublicProfilePayload) {
    if (!isPublicProfilePayload(payload)) return;

    const cache = readCache();
    const savedAt = new Date().toISOString();
    const snapshot = { ...payload, savedAt };
    cache.entries[cacheKey(slug)] = snapshot;
    cache.entries[cacheKey(payload.profile.slug)] = snapshot;

    const entries = Object.entries(cache.entries)
      .sort(([, left], [, right]) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
      .slice(0, MAX_CACHED_PROFILES);

    try {
      localStorage.setItem(
        PUBLIC_PROFILE_CACHE_KEY,
        JSON.stringify({ version: 1, entries: Object.fromEntries(entries) } satisfies PublicProfileCache)
      );
    } catch {
      // Offline support is best effort when browser storage is unavailable or full.
    }

    cachePublicPayloadInServiceWorker(slug, payload, savedAt);
  },

  get(slug?: string): PublicProfileSnapshot | null {
    const snapshot = readCache().entries[cacheKey(slug)];
    return isPublicProfileSnapshot(snapshot) ? snapshot : null;
  },

  clear() {
    localStorage.removeItem(PUBLIC_PROFILE_CACHE_KEY);
  }
};

function readCache(): PublicProfileCache {
  try {
    const value = localStorage.getItem(PUBLIC_PROFILE_CACHE_KEY);
    if (!value) return emptyCache();

    const parsed = JSON.parse(value) as Partial<PublicProfileCache>;
    if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
      return emptyCache();
    }
    return { version: 1, entries: parsed.entries };
  } catch {
    return emptyCache();
  }
}

function emptyCache(): PublicProfileCache {
  return { version: 1, entries: {} };
}

function cacheKey(slug?: string) {
  return slug?.trim().toLowerCase() || DEFAULT_ROUTE_KEY;
}

function cachePublicPayloadInServiceWorker(slug: string | undefined, payload: PublicProfilePayload, savedAt: string) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const paths = new Set([
    slug ? `/api/profiles/${encodeURIComponent(slug)}` : "/api/profiles",
    `/api/profiles/${encodeURIComponent(payload.profile.slug)}`
  ]);

  void navigator.serviceWorker.ready
    .then((registration) => {
      for (const path of paths) {
        registration.active?.postMessage({ type: "CACHE_PUBLIC_PROFILE", path, payload, savedAt });
      }
    })
    .catch(() => undefined);
}

function isPublicProfileSnapshot(value: unknown): value is PublicProfileSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as PublicProfileSnapshot).savedAt === "string" &&
      Number.isFinite(Date.parse((value as PublicProfileSnapshot).savedAt)) &&
      isPublicProfilePayload(value)
  );
}

function isPublicProfilePayload(value: unknown): value is PublicProfilePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PublicProfilePayload>;
  return Boolean(
    payload.profile?.id &&
      payload.profile.slug &&
      payload.profile.title &&
      payload.profile.public === true &&
      Array.isArray(payload.links) &&
      payload.links.every((link) => link?.id && link.profileId === payload.profile?.id)
  );
}
