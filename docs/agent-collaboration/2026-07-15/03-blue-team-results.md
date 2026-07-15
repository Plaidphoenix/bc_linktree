# Blue Team Results

## Executive summary

Codex independently validated all 12 Antigravity findings in an isolated worktree based on `origin/main`. Five findings received complete remediation for the validated behavior, two received partial mitigation or defense in depth, four were deferred for senior architecture/operations decisions, and one was a false positive for the stated scenario. Red Team Critical ratings for RT-001 and RT-002 were reduced because neither demonstrated complete system compromise; RT-002 remains High and RT-001 is partially confirmed with browser-local impact.

Blue Team review also found and corrected three related issues: SQLite timestamp normalization could extend session/reset validity, the local API exposed credentialed CORS beyond loopback, and deployment scripts could build or target the wrong Cloudflare environment. No production system, remote migration, deploy, merge, secret, or private evidence was used. Build, full tests, dependency audit, local Pages/API smoke checks, local Worker+D1 smoke checks, and Wrangler dry runs succeeded with Node 22. Antigravity final verification and human senior approval remain outstanding.

## Findings addressed

### RT-2026-07-15-001

- Validation result: Partially confirmed; catch-all fallback bypassed the frontend guard but did not bypass backend authorization.
- Root cause: HTTP errors and network errors shared the same unconditional local demo fallback.
- Files changed: `src/services/api.ts`, `src/App.tsx`, `.env.example`, `vite.config.ts`.
- Fix implemented: Demo fallback now requires Vite development mode, an explicit flag, and a network-only `ApiError` with status 0. HTTP 401/403/409 failures remain failures; the admin route clears the browser session and returns to login.
- Regression test: `src/services/api.test.ts` covers disabled fallback, explicit direct-network fallback, and 401/403/409 rejection; `src/App.test.tsx` verifies that rejected admin state clears the session and redirects.
- Test result: Passed.
- Residual risk: Browser-local demo state remains intentionally available in explicit development mode.
- Senior attention required: Review whether the demo feature should live in the production source tree at all.

### RT-2026-07-15-002

- Validation result: Confirmed; severity adjusted from Critical to High.
- Root cause: The Worker reflected every request origin while also allowing credentials.
- Files changed: `worker/index.ts`, `worker/cors.test.ts`, `scripts/local-api.mjs`, `scripts/local-api-security.mjs`, `scripts/local-api-security.test.mjs`, `package.json`.
- Fix implemented: Exact `APP_BASE_URL` origin matching, loopback only in local/development/test, rejection before authentication, and a one-day preflight cache. The local API and Worker development scripts now bind to loopback, and the local API grants credentialed CORS only to exact loopback frontend origins.
- Regression test: Unexpected preflight and simple state-changing origins return 403 without credentialed CORS; configured/loopback origins receive the expected exact headers.
- Test result: Passed in Vitest and local Wrangler smoke test.
- Residual risk: Requests without an `Origin` header are allowed for non-browser clients; browser consumers outside the configured frontend are intentionally blocked.
- Senior attention required: Synchronize Cloudflare Access CORS/OPTIONS configuration with the same origin.

### RT-2026-07-15-004

- Validation result: Partially confirmed; the frontend check was incomplete, but both Worker and local API already rejected non-HTTP schemes.
- Root cause: The editor used URL parsing without a protocol allowlist; only explicit offline demo state could retain such a URL.
- Files changed: `src/services/api.ts`, `src/App.tsx`, `src/services/api.test.ts`.
- Fix implemented: Shared frontend HTTP/HTTPS allowlist before saving.
- Regression test: HTTP(S) succeeds and synthetic non-HTTP schemes fail; the public UI disables an unsafe persisted target and opens a safe target even if click analytics fails.
- Test result: Passed.
- Residual risk: Existing externally sourced data should still be treated as untrusted; backend validation remains authoritative.
- Senior attention required: No.

### RT-2026-07-15-005

- Validation result: Partially confirmed; production impact requires local authentication or demo seeds to be enabled.
- Root cause: Demo UI and shared default user password behavior were not separated from production code paths.
- Files changed: `src/App.tsx`, `worker/index.ts`, `scripts/local-api.mjs`, `migrations/0004_disable_legacy_seed_auth.sql`, `.env.example`, `README.md`.
- Fix implemented: No reusable demo password remains in frontend/local-API source or README. Explicit development fallback requires an operator-supplied `.env.local` password; the local API synchronizes or disables all seed hashes and invalidates their sessions when that value changes. Migration 0004 disables legacy D1 seed hashes and deletes their sessions/reset tokens. New users require an explicit password of at least 10 characters; production authentication provider selection fails closed; Access-created users receive no reusable local password.
- Regression test: Missing production provider and Access/local separation are covered in `worker/auth-provider.test.ts`; `src/login-security.test.tsx` confirms production UI neither displays nor prefills demo credentials; configuration tests assert migration denial and session/reset cleanup.
- Test result: Passed.
- Residual risk: Historical migrations retain public demo identities and the application still uses fast SHA-256 for any separately provisioned local password. Cloudflare Access frontend bootstrap is not complete.
- Senior attention required: Separate future schema migrations from local demo seeding and approve a local Worker provisioning procedure before production provisioning.

### RT-2026-07-15-008

- Validation result: Confirmed.
- Root cause: The bearer secret itself was stored and queried in D1 and mirrored in the local JSON API; the Worker also used the token as an audit entity identifier.
- Files changed: `worker/index.ts`, `scripts/local-api.mjs`, `worker/auth-provider.test.ts`.
- Fix implemented: New 256-bit bearer values are returned once, while only a prefixed SHA-256 digest is stored, queried, and deleted. Audit records no longer receive the bearer secret. Existing raw local sessions are invalidated.
- Regression test: Session lookup and issuance tests assert that every captured D1 bind excludes the issued raw token; local helper tests cover the same one-way representation.
- Test result: Passed.
- Residual risk: The browser still holds the bearer secret for local authentication (RT-007).
- Senior attention required: Communicate the expected one-time re-login after rollout.

### RT-2026-07-15-010

- Validation result: Confirmed.
- Root cause: Static Pages headers omitted CSP and HSTS.
- Files changed: `public/_headers`, `src/security-config.test.ts`.
- Fix implemented: Added HSTS and a restrictive CSP with explicit allowances needed by the current SPA.
- Regression test: Static configuration assertions plus verification of `dist/_headers`.
- Test result: Passed.
- Residual risk: `connect-src https:` and `img-src https:` remain broad because deployment/API and profile asset hosts are configurable.
- Senior attention required: Confirm all legitimate external resources and narrow directives where possible.

### RT-2026-07-15-012

- Validation result: Confirmed.
- Root cause: Vite explicitly generated source maps for production.
- Files changed: `vite.config.ts`, `src/security-config.test.ts`.
- Fix implemented: Production source maps disabled.
- Regression test: Configuration assertion and post-build search for `.map` files.
- Test result: Passed; no `.map` files were present in `dist/`.
- Residual risk: None known for the requested change; debugging detail is reduced.
- Senior attention required: No.

## Independent Blue Team findings addressed

### BT-2026-07-15-001 — Session and reset expiry comparison

- Severity: High.
- Root cause: ISO timestamps containing `T`/`Z` were compared lexicographically with SQLite `CURRENT_TIMESTAMP`, which uses a space-separated representation.
- Fix implemented: D1 queries normalize stored values with SQLite `datetime()` before comparison, preserving compatibility with existing ISO records and failing closed for invalid values.
- Regression test: Worker authentication tests assert normalized session and reset expiry queries.
- Residual risk: The regression uses D1 query mocks; a real D1 integration test remains recommended.

### BT-2026-07-15-002 — Cloudflare deployment target and Pages build configuration

- Severity: High operational risk.
- Root cause: The root/local Worker shared the production Worker name, and static Pages builds relied on runtime config that Vite does not consume at build time.
- Fix implemented: The local Worker now has a distinct name. Staging/production Pages builds require an explicit HTTPS API origin and Access provider before compiling, disable demo fallback, and use the standard `wrangler.jsonc` Pages manifest.
- Regression test: Static security tests assert distinct Worker names, environment-specific build gates, and the standard Pages output configuration.
- Residual risk: Real domains, D1/R2 IDs, Access audience, Pages project settings, and CORS settings require senior/operations review before deploy.

### BT-2026-07-15-003 — Local development API exposure

- Severity: Medium, development environment only.
- Root cause: The local API reflected arbitrary origins with credentials and both local API/Worker scripts listened on all interfaces.
- Fix implemented: API and Worker scripts bind to loopback; the local API rejects unexpected browser origins before route processing and emits credentialed CORS only for exact loopback frontend origins.
- Regression test: A spawned local API test covers trusted preflight, rejected untrusted POST, header absence, origin allowlisting, session-token hashing, and seed-session invalidation on credential changes.
- Residual risk: The Vite static development server still listens on all interfaces; authenticated local services remain loopback-only.

## Findings not addressed

- Finding ID: RT-2026-07-15-003
- Classification: Confirmed; requires senior decision and deferred because a safe fix exceeds the daily scope.
- Reason: Selecting a password KDF and work factor must be combined with Worker CPU/runtime testing, rate limiting, legacy-hash migration, and the decision whether production supports local passwords at all.
- Recommended next action: Prefer Access-only production; otherwise benchmark and migrate to versioned Argon2id/scrypt/PBKDF2 hashes with unique salts and lazy upgrade/reset.

- Finding ID: RT-2026-07-15-006
- Classification: Confirmed workflow defect; requires senior decision.
- Reason: Access bootstrap/login/logout affects Pages routing, protected API redirects, cookie behavior, and UX. The backend now correctly refuses local authentication when Access is configured, while the frontend still requires a local bearer before opening the admin route.
- Recommended next action: Treat this draft as blocked from merge/deploy until one approved Access flow is implemented and integration-tested against the real staging configuration.

- Finding ID: RT-2026-07-15-007
- Classification: Confirmed; requires architectural decision.
- Reason: Moving from localStorage bearer tokens to HttpOnly cookies changes backend issuance, CSRF controls, logout, and frontend requests.
- Recommended next action: Choose Access-only sessions or a backend-set Secure/HttpOnly cookie and test it in a browser.

- Finding ID: RT-2026-07-15-011
- Classification: Confirmed absence; active abuse was not tested.
- Reason: Cloudflare rate-limit binding/WAF policy requires operational thresholds, identifiers, cost review, and production authorization.
- Recommended next action: Define bounded login/reset limits and deploy through the approved Cloudflare change process.

## False positives or findings not reproduced

- RT-2026-07-15-009: False positive for the reported administrator self-deletion scenario. The endpoint requires an administrator actor and already rejects every `ADMIN` target before deletion. No change was made merely to duplicate the existing guard. A separate data-lifecycle decision is still needed for deleting non-admin profile owners.

## Maintenance improvements

No unrelated cleanup was performed. README/environment documentation, safe JWT failure handling, and local API parity are directly tied to the security fixes.

## Validation

- Build: Passed with Node 22.23.1 (`npm run build`). The guarded production-mode Pages build also passed with a synthetic build-only HTTPS API origin, embedded that origin, and excluded the demo password; no deploy followed.
- Tests: Passed, 11 files and 45 tests (`npm run test`). The initial regression run failed in the four expected vulnerable cases before fixes.
- Dependency audit: Passed; `npm audit --audit-level=low` reported 0 vulnerabilities.
- Local frontend: Vite returned 200 and served the application root.
- Local API: Local Node API health returned 200.
- Local Worker: Local D1 migrations through `0004_disable_legacy_seed_auth.sql` passed; Worker health returned 200; trusted preflight returned 204; an untrusted simple origin returned 403.
- Commands executed: `git fetch --prune origin`, `npm install`, `npm run build`, `npm run build:web:production` with a synthetic build-only origin, `npm run test`, `npm run audit`, `npm run cf:migrate:local`, safe local Vite/API/Worker starts, TypeScript checks, fail-closed Pages build-gate check, and `wrangler deploy --dry-run` against local/default and production configuration.
- Commands not executed: all deploy commands, all remote migrations, production/staging network tests, and merges.

## Files changed

- `.env.example`, `README.md`, `package.json`
- `public/_headers`, `vite.config.ts`, `wrangler.worker.jsonc`, `wrangler.jsonc`
- `src/App.tsx`, `src/services/api.ts`
- `scripts/local-api.mjs`, `scripts/local-api-security.mjs`, `scripts/build-pages.mjs`, `worker/index.ts`
- `src/App.test.tsx`, `src/login-security.test.tsx`, `src/services/api.test.ts`, `src/security-config.test.ts`
- `scripts/local-api-security.test.mjs`
- `worker/auth-provider.test.ts`, `worker/cors.test.ts`
- `migrations/0004_disable_legacy_seed_auth.sql`
- `docs/agent-collaboration/**`

## Known limitations

- Hono tests use in-process mocks rather than `@cloudflare/vitest-pool-workers` with real D1/R2 bindings.
- Cloudflare Access, production Pages headers, and real browser cookie behavior were not tested.
- This draft must not merge or deploy while RT-2026-07-15-006 remains unresolved.
- No Red Team re-test was available before this report was finalized.
- The original checkout contained unrelated uncommitted deployment work; all Blue Team work was isolated to avoid modifying it.

## Residual risks

- Legacy SHA-256 password hashes and demo seed provisioning.
- Incomplete Access frontend bootstrap/logout flow.
- JavaScript-readable local bearer token.
- Missing rate limiting.
- Public R2 assets and upload lifecycle decisions not covered by this report.
- Real Pages/Worker/Access environment values and the synchronized production CORS origin are not validated.

## Rollback guidance

- Revert code commits if needed, but do not restore the historically public seed hashes. Migration 0004 mutates only seed authentication data and intentionally deletes their sessions/reset tokens; provision reviewed replacement users instead of reversing it.
- Expect users to sign in again if session hashing is rolled out or rolled back, because raw and hashed local session identifiers are intentionally incompatible.
- If CSP blocks a legitimate resource, adjust only the relevant directive after identifying the exact trusted origin; do not remove the policy wholesale.
- If CORS blocks the legitimate frontend, correct `APP_BASE_URL` and the matching Access CORS setting rather than restoring origin reflection.
- Re-enabling source maps should require a separate reviewed decision and protected artifact destination.
- Pages build scripts intentionally fail when build-time environment values are absent; rollback only by reverting the build-gate commit after documenting an equivalent safe injection mechanism.
- The local Worker name is deliberately distinct from production; do not restore the collision.
