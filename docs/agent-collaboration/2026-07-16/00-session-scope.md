# Session Scope — RT-2026-07-16

## Session details

- Date: 2026-07-16 (`America/Sao_Paulo`)
- Red Team: Antigravity
- Blue Team: Codex
- Tested environments: local source/configuration, isolated local D1, and draft-branch builds/tests
- Repository baseline assessed by Red Team: `deployment/cloudflare-backend` at `e493de38fac343a9a40152680a7cdc6200c3e939`
- Existing security baseline: `agents/security-2026-07-15` at `59926e68868f1bcc339827c61f74d95591b533b9`

## In scope

- Worker authentication, authorization, CORS, sessions, password handling, and uploads.
- Frontend authentication, demo fallback, link targets, Access routing, and production build configuration.
- D1 migration ordering and legacy seed authentication.
- Cloudflare configuration files and local-only validation.

## Out of scope

- Production traffic, production data, remote migrations, deploys, merges, and secret changes.
- Active testing against live Cloudflare endpoints.
- Destructive or high-volume authentication testing.

## Safety restrictions

- Public artifacts omit credentials, personal data, bearer values, database contents, and operationally useful exploit payloads.
- Sensitive Red Team evidence remains private and is referenced as `PRIVATE-EVIDENCE-01`.
- The dirty `deployment/cloudflare-backend` checkout is read-only for this session.

