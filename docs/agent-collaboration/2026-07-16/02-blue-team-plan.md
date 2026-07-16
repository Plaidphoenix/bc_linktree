# Blue Team Remediation Plan

## Findings accepted for validation

- RT-001 through RT-012 will be validated independently against both open draft branches because the Red Team baseline and the prior security baseline diverged from `main`.

## Initial independent classification

| ID | Classification | Planned action |
|---|---|---|
| RT-001 | Confirmed fixed on both draft branches; not fixed on `main` | Preserve fail-closed fallback and regression tests. |
| RT-002 | Confirmed fixed on both draft branches; not fixed on `main` | Preserve exact CORS allowlisting and tests. |
| RT-003 | Confirmed for local auth; production configs select Access | Defer KDF/work-factor/migration decision; do not add an unbenchmarked KDF without rate-limit and provider decisions. |
| RT-004 | Confirmed on PR #1; fixed with tests on PR #2 | Preserve the shared HTTP(S)-only frontend check during reconciliation. |
| RT-005 | Partially confirmed as historical source; active default login not reproduced after all migrations | Preserve the later seed-disable migration; do not rewrite an applied base migration. Verify migration ledger before any remote action. |
| RT-006 | Code fix confirmed on PR #1 only; real Access environment not tested | Preserve the Access-aware route/login/logout flow and its tests; retain staging/senior gate. |
| RT-007 | Confirmed for local auth; not an Access bearer condition | Defer HttpOnly-cookie/local-auth architecture and CSRF design. |
| RT-008 | Confirmed on PR #1; fixed with tests on PR #2 | Preserve one-way session-token storage and invalidation behavior. |
| RT-009 | False positive for the reported self-deletion scenario | Add/retain route-level proof only; do not duplicate an existing role guard. |
| RT-010 | Confirmed on PR #1; fixed with tests on PR #2 | Preserve CSP/HSTS and built-artifact assertions. |
| RT-011 | Confirmed absence in source; external Cloudflare controls unknown | Defer thresholds/identifier/cost/ownership to senior and operations review. |
| RT-012 | Confirmed on PR #1; fixed with tests on PR #2 | Preserve disabled production source maps and artifact checks. |

## Suspected false positives or stale branch conclusions

- RT-004, RT-008, RT-010, and RT-012 ignored the open security branch where fixes and regressions already exist.
- RT-005 did not evaluate the full migration chain.
- RT-009 does not reproduce through the actual endpoint because only an `ADMIN` can manage users and every `ADMIN` target is rejected.

## Fix order

1. Reconcile the Access/UI branch with the existing security branch in `agents/security-2026-07-16`.
2. Preserve backend session hashing, exact CORS, timestamp normalization, seed invalidation, CSP/HSTS, safe links, and source-map controls.
3. Preserve the Access-aware frontend flow and its regression tests without publishing personal bootstrap data.
4. Add only narrowly scoped regression coverage missing after the reconciliation.

## Regression tests to create or preserve

- Non-demo network and HTTP failures do not enter demo state.
- Unexpected CORS origins are rejected without credentialed headers.
- Access mode loads admin state without a local bearer and fails closed on 401/403.
- Non-HTTP(S) link targets are rejected in frontend and backend paths.
- Issued session bearer values are never bound to D1 or audit records.
- Complete migrations leave no reusable legacy seed authentication.
- The real deletion route rejects an actor targeting the same administrator record.
- Built output contains CSP/HSTS and no production `.map` files.

## Files expected to change

- Conflict-prone: `src/App.tsx`, `src/services/api.ts`, `worker/index.ts`, `vite.config.ts`, `package.json`, related tests, and Wrangler configuration.
- Additive: Access session/runtime files and the 2026-07-16 collaboration records.
- `src/styles.css` is owned by the active deployment/UI work and should change only to retain its existing connection banner.

## Changes requiring senior decision

- Password KDF and migration strategy for any continued local authentication.
- Access-only production versus a separate Secure/HttpOnly cookie session architecture.
- Cloudflare rate-limit/WAF thresholds and ownership.
- Private Access administrator provisioning and real environment identifiers.
- Whether the two older draft PRs should be closed after review of the reconciled branch.

## Deferred changes

- No remote migration, deploy, production test, dependency upgrade, broad refactor, or unrelated cleanup.

## Safety and rollback considerations

- Keep both pre-existing draft branches unchanged until senior reviewers accept the reconciliation.
- Reverting the reconciliation commit restores each independent branch, but must not re-enable legacy seed passwords or raw session-token storage.
- Any Access failure remains fail-closed; do not restore client-only authorization or demo fallback in production.

