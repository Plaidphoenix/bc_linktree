# Red Team Security Report — RT-2026-07-15

> Public-safe copy of the Antigravity handoff received on 2026-07-15. Reusable credentials, hashes, session material, and executable payload details were removed. The ratings below are Red Team claims; Blue Team validation appears in `02-blue-team-plan.md` and `03-blue-team-results.md`.

## RT-2026-07-15-001 — Client-side authentication bypass through catch-all demo fallback

- Severity: Critical
- Confidence: Confirmed
- Status: New
- Component: Frontend session and state management
- Files involved: `src/services/api.ts`, `src/App.tsx`
- Endpoint involved: `GET /api/admin/me`
- CWE / OWASP: CWE-287 / A01:2021 Broken Access Control
- Preconditions: Access to the public frontend and a synthetic browser storage value.
- Sanitized reproduction: `PRIVATE-EVIDENCE-01` shows a rejected API session being replaced with local demo admin state.
- Expected behavior: Authentication failures clear local state and return to login.
- Observed behavior: API errors could activate local demo state.
- Security impact claimed: Unauthorized admin-interface access and exposure or modification of browser-local cached data.
- Recommended remediation: Permit demo fallback only in explicit development mode and never after an HTTP authorization response.
- Suggested regression test: A 401/403 response must reject and must not create a session.
- Public disclosure risk: High
- Requires senior decision: No

## RT-2026-07-15-002 — Arbitrary CORS origin reflection with credentials

- Severity: Critical
- Confidence: Confirmed
- Status: New
- Component: Worker CORS middleware
- Files involved: `worker/index.ts`
- Endpoint involved: Global middleware
- CWE / OWASP: CWE-942 / A05:2021 Security Misconfiguration
- Preconditions: Browser request carrying an authenticated credential.
- Sanitized reproduction: An unexpected synthetic origin received matching allow-origin and allow-credentials headers.
- Expected behavior: Only the configured frontend origin is accepted.
- Observed behavior: Any supplied origin was reflected.
- Security impact claimed: Cross-origin reads and state-changing browser requests.
- Recommended remediation: Exact origin allowlist and rejection before authentication.
- Suggested regression test: Unexpected preflight and simple POST requests return 403 without CORS headers.
- Public disclosure risk: High
- Requires senior decision: No

## RT-2026-07-15-003 — Unsalted fast password hashing

- Severity: High
- Confidence: Confirmed
- Status: New
- Component: Local authentication
- Files involved: `worker/index.ts`, `scripts/local-api.mjs`, `migrations/0001_initial_schema.sql`
- Endpoint involved: Login, reset password, and user creation
- CWE / OWASP: CWE-916 / A02:2021 Cryptographic Failures
- Preconditions: Read access to password hashes.
- Sanitized reproduction: Multiple seeded users share the same fast unsalted digest; exact credential material is omitted.
- Expected behavior: Unique salt and an adaptive password KDF.
- Observed behavior: Raw SHA-256 is used.
- Security impact claimed: Efficient offline password guessing after database disclosure.
- Recommended remediation: Versioned Argon2id/scrypt/PBKDF2 hashes with migration and performance validation.
- Suggested regression test: Equal passwords produce different stored hashes and legacy hashes upgrade safely.
- Public disclosure risk: High
- Requires senior decision: Yes — KDF, rate limiting, migration, and Access-only strategy must be selected together.

## RT-2026-07-15-004 — Non-HTTP link scheme accepted by frontend validation

- Severity: High
- Confidence: Confirmed
- Status: New
- Component: Link editor
- Files involved: `src/App.tsx`, `src/services/api.ts`, `worker/index.ts`, `scripts/local-api.mjs`
- Endpoint involved: Link create/update
- CWE / OWASP: CWE-79 / A03:2021 Injection
- Preconditions: Link editing permission and use of the explicit offline demo fallback.
- Sanitized reproduction: `PRIVATE-EVIDENCE-02` uses a non-HTTP synthetic URL scheme; no executable payload is included.
- Expected behavior: HTTP and HTTPS only at every boundary.
- Observed behavior claimed: The frontend used `new URL()` without a scheme check.
- Security impact claimed: Browser script execution if unsafe state reaches a rendered link.
- Recommended remediation: Frontend protocol allowlist while retaining backend validation.
- Suggested regression test: Non-HTTP schemes are rejected.
- Public disclosure risk: High
- Requires senior decision: No

## RT-2026-07-15-005 — Demo credentials and shared default passwords

- Severity: High
- Confidence: Confirmed
- Status: New
- Component: Seed data and local login UI
- Files involved: `src/data/seed.ts`, `src/App.tsx`, `scripts/local-api.mjs`, `migrations/`
- Endpoint involved: Local login and user creation
- CWE / OWASP: CWE-798 / A07:2021 Identification and Authentication Failures
- Preconditions: A production deployment enables local authentication with demo seeds.
- Sanitized reproduction: `PRIVATE-EVIDENCE-03`; reusable credential text is omitted.
- Expected behavior: Demo identities are development-only and new users require an explicit password.
- Observed behavior: The UI displayed demo credentials and user creation supplied a shared default.
- Security impact claimed: Account takeover when demo/local authentication is deployed.
- Recommended remediation: Hide demo UI outside explicit development, fail closed in production, remove default user passwords, and separate production provisioning from demo seeds.
- Suggested regression test: Production mode exposes no demo credential UI and rejects an omitted auth provider.
- Public disclosure risk: Medium
- Requires senior decision: Yes — migration/seed separation remains.

## RT-2026-07-15-006 — Cloudflare Access frontend workflow is incomplete

- Severity: High
- Confidence: Confirmed
- Status: New
- Component: Frontend route guard
- Files involved: `src/App.tsx`, `src/services/api.ts`, `wrangler.pages.jsonc`
- Endpoint involved: `/admin/*`
- CWE / OWASP: CWE-841 / A01:2021 Broken Access Control
- Preconditions: `VITE_AUTH_PROVIDER=access` with no local bearer token.
- Sanitized reproduction: The route guard redirects before asking the API to validate the Access cookie.
- Expected behavior: Access mode bootstraps through the protected API and does not require local storage.
- Observed behavior: A local token is required unconditionally.
- Security impact claimed: Administrators may revert to weaker local authentication to make the UI usable.
- Recommended remediation: Design and test Access bootstrap/login/logout as one flow.
- Suggested regression test: Access mode opens the admin route without a local bearer token after API validation.
- Public disclosure risk: Medium
- Requires senior decision: Yes

## RT-2026-07-15-007 — Browser session token stored in localStorage

- Severity: Medium
- Confidence: Confirmed
- Status: New
- Component: Frontend session storage
- Files involved: `src/services/api.ts`
- Endpoint involved: Administrative API requests
- CWE / OWASP: CWE-922 / A04:2021 Insecure Design
- Preconditions: Same-origin script execution or local browser access.
- Sanitized reproduction: `PRIVATE-EVIDENCE-04`; no token value is included.
- Expected behavior: HttpOnly, Secure, appropriately scoped cookie or Access-only session.
- Observed behavior: JavaScript-readable bearer token.
- Security impact claimed: Session theft after XSS.
- Recommended remediation: Coordinate cookie-based sessions or standardize on Access.
- Suggested regression test: Browser automation verifies cookie attributes and absence of JavaScript-readable credentials.
- Public disclosure risk: Medium
- Requires senior decision: Yes

## RT-2026-07-15-008 — Raw session token stored in D1

- Severity: Medium
- Confidence: Confirmed
- Status: New
- Component: Backend session management
- Files involved: `worker/index.ts`, `migrations/0001_initial_schema.sql`
- Endpoint involved: Login, authenticated routes, logout
- CWE / OWASP: CWE-312 / A02:2021 Cryptographic Failures
- Preconditions: Database read access.
- Sanitized reproduction: The issued bearer value was also the session-table lookup key.
- Expected behavior: Store and query a one-way digest only.
- Observed behavior: Raw bearer token storage.
- Security impact claimed: Direct session replay after a database disclosure.
- Recommended remediation: Hash new session tokens and invalidate legacy raw sessions.
- Suggested regression test: The issued token never appears in D1 bind values or audit metadata.
- Public disclosure risk: Medium
- Requires senior decision: No

## RT-2026-07-15-009 — Incomplete authorization on user deletion

- Severity: Medium
- Confidence: Confirmed
- Status: New
- Component: User management
- Files involved: `worker/index.ts`, `worker/policy.ts`
- Endpoint involved: `DELETE /api/admin/users/:id`
- CWE / OWASP: CWE-285 / A01:2021 Broken Access Control
- Preconditions: Authenticated administrator.
- Sanitized reproduction: The Red Team asserted that self-deletion was not checked.
- Expected behavior: Administrator deletion rules are explicit and target-aware.
- Observed behavior claimed: Generic administrator permission without a dedicated self-delete policy.
- Security impact claimed: Administrative lockout.
- Recommended remediation: Target-aware deletion guard.
- Suggested regression test: An administrator cannot delete an administrator target.
- Public disclosure risk: Low
- Requires senior decision: No

## RT-2026-07-15-010 — Missing CSP and HSTS headers

- Severity: Medium
- Confidence: Confirmed
- Status: New
- Component: Cloudflare Pages headers
- Files involved: `public/_headers`
- Endpoint involved: Static pages
- CWE / OWASP: CWE-693 / A05:2021 Security Misconfiguration
- Preconditions: Standard Pages deployment.
- Sanitized reproduction: Static header configuration lacked both directives.
- Expected behavior: Restrictive CSP and HSTS suitable for the deployment.
- Observed behavior: Both headers absent.
- Security impact claimed: Reduced defense in depth against content injection and transport downgrade.
- Recommended remediation: Add reviewed CSP and HSTS directives.
- Suggested regression test: Configuration and local preview headers contain the directives.
- Public disclosure risk: Low
- Requires senior decision: No

## RT-2026-07-15-011 — Missing rate limiting on authentication endpoints

- Severity: Low
- Confidence: Confirmed
- Status: New
- Component: Worker authentication
- Files involved: `worker/index.ts`, `wrangler.worker.jsonc`
- Endpoint involved: Login and forgot password
- CWE / OWASP: CWE-307 / A07:2021 Identification and Authentication Failures
- Preconditions: Network reachability to local-auth endpoints.
- Sanitized reproduction: Static review found no application or binding-based limit; no high-volume test was run.
- Expected behavior: Edge/application throttling keyed safely by source and account.
- Observed behavior: No repository-level limit.
- Security impact claimed: Password guessing and resource consumption.
- Recommended remediation: Cloudflare rate-limiting binding/WAF rule with human-selected limits.
- Suggested regression test: Bounded synthetic requests produce 429 after the configured threshold.
- Public disclosure risk: Low
- Requires senior decision: Yes — limits and operational ownership.

## RT-2026-07-15-012 — Production source maps enabled

- Severity: Low
- Confidence: Confirmed
- Status: New
- Component: Vite build
- Files involved: `vite.config.ts`
- Endpoint involved: Static assets
- CWE / OWASP: CWE-615 / A05:2021 Security Misconfiguration
- Preconditions: Deployment of the default production build.
- Sanitized reproduction: `build.sourcemap` was enabled.
- Expected behavior: No public source maps unless deliberately protected.
- Observed behavior: Production maps were generated.
- Security impact claimed: Easier source-level reconnaissance.
- Recommended remediation: Disable maps in the production build.
- Suggested regression test: `dist/` contains no `.map` files.
- Public disclosure risk: Low
- Requires senior decision: No

