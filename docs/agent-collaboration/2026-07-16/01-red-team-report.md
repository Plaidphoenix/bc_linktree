# Red Team Report — RT-2026-07-16

> Public-safe copy. The original local handoff was read in full. A known demo credential/hash and executable proof payload were removed from this public artifact and are represented by `PRIVATE-EVIDENCE-01`.

| ID | Severity | Red Team status | Reported condition |
|---|---|---|---|
| RT-2026-07-16-001 | Critical | Fixed | Non-demo network failure previously fell through to a client-side administrative demo session. |
| RT-2026-07-16-002 | Critical | Fixed | Credentialed CORS previously reflected arbitrary origins. |
| RT-2026-07-16-003 | High | Active | Local passwords use deterministic, unsalted SHA-256. |
| RT-2026-07-16-004 | High | Partially active | The assessed frontend branch accepts non-HTTP(S) link targets in demo/offline state. |
| RT-2026-07-16-005 | High | Partially active | Historical base migrations contain reusable seed authentication data. |
| RT-2026-07-16-006 | High | Fixed | The assessed Access frontend no longer requires a local bearer before querying the backend. |
| RT-2026-07-16-007 | Medium | Active | Local-auth bearer tokens are JavaScript-readable in `localStorage`. |
| RT-2026-07-16-008 | Medium | Active | The assessed deployment branch stores raw local session bearer values in D1. |
| RT-2026-07-16-009 | Medium | Active | The report claims administrators can delete their own account. |
| RT-2026-07-16-010 | Medium | Active | The assessed deployment branch omits CSP and HSTS from Pages headers. |
| RT-2026-07-16-011 | Low | Active | Source-controlled authentication endpoints have no rate limiter. |
| RT-2026-07-16-012 | Low | Active | The assessed deployment branch emits production source maps. |

## Red Team reassessment notes

- RT-001 and RT-002 were reported resolved on `deployment/cloudflare-backend` through fail-closed demo gating and exact CORS origins.
- RT-006 was reported resolved on that branch through an Access-aware frontend route guard and backend Access assertion verification.
- RT-003, RT-007, and RT-011 were carried forward as architecture/operations work.
- RT-004, RT-008, RT-010, and RT-012 were reported against the deployment branch without reconciling the already-open security branch.
- RT-005 was inferred from the historical base migration rather than the complete ordered migration chain.
- RT-009 evidence exercised only the broad `canManageUsers` predicate and did not execute the route's target-role guard.

## Suggested validation from the handoff

- Exercise production-mode network failures and unexpected origins without enabling demo behavior.
- Validate HTTP(S)-only links in frontend and backend paths.
- Inspect the complete fresh D1 migration result rather than a single historical migration.
- Confirm issued local bearer values differ from stored session identifiers.
- Exercise the real user-deletion route with actor and target identity equal.
- Build the actual production modes and inspect headers and source-map artifacts.
- Treat Access, cookie, KDF, and rate-limit changes as requiring staging and senior review.

