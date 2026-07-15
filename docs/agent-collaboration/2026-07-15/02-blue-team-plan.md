# Blue Team Remediation Plan

## Findings accepted for validation

Red Team severities remain recorded in `01-red-team-report.md`. The risk assessment below is the independent Blue Team assessment.

| ID | Independent classification | Blue risk assessment | Planned action |
|---|---|---|---|
| RT-2026-07-15-001 | Partially confirmed; behavior is real, but no backend authorization bypass was demonstrated | Medium, limited to explicit development fallback | Fail closed outside explicit offline development and add route-guard plus 401/403/409 tests |
| RT-2026-07-15-002 | Confirmed | High; reduced from Red Team Critical | Exact origin allowlist for Worker and local API, simple-request rejection, and preflight tests |
| RT-2026-07-15-003 | Confirmed | High | Defer KDF migration pending senior choice and Worker performance/rate-limit validation |
| RT-2026-07-15-004 | Partially confirmed; Worker and local API already reject non-HTTP schemes | Low defense-in-depth gap | Validate both the editor and public navigation sink and add regression tests |
| RT-2026-07-15-005 | Partially confirmed; exploitable only if local auth/demo seeds reach production | High when local auth or demo seeds are deployed | Remove the reusable source password, require local operator configuration, hide demo UI, remove automatic new-user password, isolate providers, and invalidate legacy seed authentication |
| RT-2026-07-15-006 | Confirmed workflow defect | High availability/deployment blocker | Defer coordinated Access bootstrap/logout design and block merge/deploy until reviewed |
| RT-2026-07-15-007 | Confirmed | Medium | Defer cookie/Access session redesign |
| RT-2026-07-15-008 | Confirmed | Medium | Store only SHA-256-prefixed session digests and redact audit data |
| RT-2026-07-15-009 | False positive for the reported administrator self-deletion path | Informational; separate lifecycle concern remains | Exercise the DELETE route and preserve the existing ADMIN-target denial |
| RT-2026-07-15-010 | Confirmed | Medium | Add CSP/HSTS and tests |
| RT-2026-07-15-011 | Confirmed absence; active abuse not tested | Low in the submitted evidence; operational impact may be higher | Defer Cloudflare limits and thresholds to senior/operations decision |
| RT-2026-07-15-012 | Confirmed | Low | Disable production source maps and verify build artifacts |

## Findings not reproduced

None. RT-2026-07-15-009 was exercised at the route boundary and classified as a false positive for the stated scenario.

## Suspected false positives

- RT-2026-07-15-009 is classified as a false positive for the stated scenario. The route test confirms that an authenticated administrator cannot delete an `ADMIN` target. Separate lifecycle risk remains when deleting a non-admin who owns a profile, but that was not the reported authorization bypass and requires its own product decision.

## Fix order

1. RT-2026-07-15-001 demo fallback boundary.
2. RT-2026-07-15-002 CORS/CSRF origin enforcement.
3. Authentication-provider isolation and fail-closed production configuration supporting RT-2026-07-15-005 and RT-2026-07-15-006 risk reduction.
4. RT-2026-07-15-008 session-token hashing and audit redaction.
5. RT-2026-07-15-004 frontend URL defense in depth.
6. RT-2026-07-15-010 and RT-2026-07-15-012 deployment hardening.
7. Documentation, residual risk, and senior decisions for RT-2026-07-15-003, RT-2026-07-15-005, RT-2026-07-15-006, RT-2026-07-15-007, and RT-2026-07-15-011.

## Regression tests to create

- `src/App.test.tsx` and `src/login-security.test.tsx`: rejected admin state clears the session; unsafe public links do not open; analytics failure does not block safe links; production UI has no demo prefill.
- `src/services/api.test.ts`: HTTP auth failures never activate demo; explicit direct-network fallback remains; link schemes are constrained.
- `worker/cors.test.ts` and `scripts/local-api-security.test.mjs`: unexpected preflight/simple origins are rejected; credentialed CORS is limited to the configured frontend or exact loopback origins.
- `worker/auth-provider.test.ts`: Access rejects local bearer sessions; missing production provider fails closed; reset routes do not create local tokens in Access; D1 sees only session hashes; SQLite compares normalized expiry values.
- `docs/agent-collaboration/2026-07-15/evidence/policy-bypass.test.ts`: the reported administrator deletion path is rejected by the real route.
- `src/security-config.test.ts`: CSP, HSTS, disabled source maps, distinct Worker names, and fail-closed Pages build scripts.
- Existing frontend and policy suites must continue to pass.

## Files expected to change

- `.env.example`, `README.md`, `package.json`
- `src/App.tsx`, `src/services/api.ts`, `vite.config.ts`, `public/_headers`
- `worker/index.ts`, `scripts/local-api.mjs`, `scripts/local-api-security.mjs`, `scripts/build-pages.mjs`
- `wrangler.worker.jsonc`, `wrangler.jsonc`
- `migrations/0004_disable_legacy_seed_auth.sql`
- Regression tests under `src/` and `worker/`
- Public-safe collaboration documents under this directory

## Changes requiring senior decision

- RT-2026-07-15-003: KDF and work factor, rate limiting, legacy-hash migration, and whether local auth exists outside development.
- RT-2026-07-15-005: separating future schema migrations from demo seed identities and deciding how local Worker users are provisioned.
- RT-2026-07-15-006: end-to-end Cloudflare Access bootstrap and logout UX.
- RT-2026-07-15-007: HttpOnly cookie session versus Access-only authentication.
- RT-2026-07-15-011: rate-limit binding/WAF ownership and thresholds.
- Whether editor users may read all audit records for an authorized profile.

## Deferred changes

- No password-hash migration without Worker runtime/load validation.
- No cookie/session architecture change in this daily patch.
- No rate-limit binding or WAF change without deployed-environment identifiers and operational approval.
- No changes to production Cloudflare settings, secrets, D1, R2, migrations, or routes.

## Safety and rollback considerations

- The branch is isolated from a dirty user worktree and based on `origin/main`.
- New local sessions are represented by one-way digests; existing raw local sessions become invalid and users must sign in again.
- Seed identities lose local-password access and their sessions/reset tokens are deleted by migration 0004; rollback must never restore the historically public seed hash.
- CORS fails closed when `APP_BASE_URL` or production `AUTH_PROVIDER` is missing; rollback is a code revert, not a production data migration.
- CSP may reveal an omitted legitimate external resource during review; adjust only with a narrowly scoped directive.
- Disabling source maps affects debugging only; re-enable deliberately if protected storage is introduced.
- Pages deployment builds now require explicit HTTPS API and Access variables; this intentionally fails before deploy when environment configuration is absent.
- The root/local Worker name no longer collides with the production Worker name.
