const SHELL_CACHE = "linkgov-shell-v1";
const PUBLIC_ASSET_CACHE = "linkgov-public-assets-v1";
const PUBLIC_DATA_CACHE = "linkgov-public-data-v1";
const CACHE_PREFIX = "linkgov-";
const FIXED_SHELL_ASSETS = ["/assets/crest.svg", "/assets/institutional-banner.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                key !== SHELL_CACHE &&
                key !== PUBLIC_ASSET_CACHE &&
                key !== PUBLIC_DATA_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname === "/sw.js") {
    return;
  }

  if (url.pathname.startsWith("/api/assets/")) {
    event.respondWith(cachePublicAsset(request, url.pathname));
    return;
  }

  if (url.pathname === "/api/profiles" || url.pathname.startsWith("/api/profiles/")) {
    event.respondWith(networkFirstPublicData(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (
    data?.type !== "CACHE_PUBLIC_PROFILE" ||
    typeof data.path !== "string" ||
    !/^\/api\/profiles(?:\/[a-z0-9-]+)?$/.test(data.path) ||
    data.payload?.profile?.public !== true ||
    !Array.isArray(data.payload?.links)
  ) {
    return;
  }

  event.waitUntil(storePublicData(data.path, data.payload, data.savedAt));
});

async function cacheAppShell() {
  const cache = await caches.open(SHELL_CACHE);
  const indexResponse = await fetch(new Request("/index.html", { cache: "reload" }));

  if (indexResponse.ok) {
    const html = await indexResponse.clone().text();
    const versionedAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(
      (match) => match[1]
    );
    await Promise.all([
      cache.put("/", indexResponse.clone()),
      cache.put("/index.html", indexResponse.clone()),
      Promise.allSettled(
        [...new Set([...FIXED_SHELL_ASSETS, ...versionedAssets])].map((path) =>
          cache.add(new Request(path, { cache: "reload" }))
        )
      )
    ]);
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/index.html")) || (await caches.match("/")) || offlineResponse();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await matchCachedRequest(cache, request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || offlineResponse();
}

async function cachePublicAsset(request, path) {
  const cache = await caches.open(PUBLIC_ASSET_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await matchCachedRequest(cache, request);
    if (cached) return cached;

    const fallback = path.includes("/avatar/") ? "/assets/crest.svg" : "/assets/institutional-banner.svg";
    return (await caches.match(fallback)) || offlineResponse();
  }
}

async function networkFirstPublicData(request) {
  const cache = await caches.open(PUBLIC_DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cachedHeaders = new Headers(response.headers);
      cachedHeaders.set("X-LinkGov-Cached-At", new Date().toISOString());
      const cachedResponse = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: cachedHeaders
      });
      await cache.put(request, cachedResponse);
      return response;
    }
    const cached = await matchCachedRequest(cache, request);
    return cached ? markOffline(cached) : response;
  } catch {
    const cached = await matchCachedRequest(cache, request);
    return cached ? markOffline(cached) : offlineResponse();
  }
}

function matchCachedRequest(cache, request) {
  const url = new URL(request.url);
  return cache.match(url.pathname, { ignoreSearch: true });
}

async function storePublicData(path, payload, savedAt) {
  const cache = await caches.open(PUBLIC_DATA_CACHE);
  const cachedAt = Number.isFinite(Date.parse(savedAt)) ? savedAt : new Date().toISOString();
  await cache.put(
    path,
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-LinkGov-Cached-At": cachedAt
      }
    })
  );
}

function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set("X-LinkGov-Offline", "true");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function offlineResponse() {
  return new Response("Servico temporariamente indisponivel.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
}
