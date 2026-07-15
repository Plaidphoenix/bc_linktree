import { createHash } from "node:crypto";

const localFrontendOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://[::1]:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://[::1]:4173"
]);
const seededUserIds = new Set(["usr_admin", "usr_gestor", "usr_editor"]);

export function isAllowedLocalOrigin(origin) {
  return localFrontendOrigins.has(origin);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSessionToken(token) {
  return `sha256:${sha256(token)}`;
}

export function synchronizeSeedAuthentication(db, passwordHash) {
  let changed = false;
  for (const user of db.users) {
    if (seededUserIds.has(user.id) && user.passwordHash !== passwordHash) {
      user.passwordHash = passwordHash;
      changed = true;
    }
  }

  if (changed) {
    db.sessions = db.sessions.filter((session) => !seededUserIds.has(session.userId));
  }
  return changed;
}
