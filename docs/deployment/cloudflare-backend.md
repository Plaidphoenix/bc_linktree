# BC Linktree - Cloudflare backend deployment

Last verified: 2026-07-15

This document records the real deployment state. A planned URL is never treated as a successful deployment until Cloudflare returns it and the remote health check passes.

## Architecture

```text
Browser
  -> Cloudflare Pages: bc-linktree.pages.dev
  -> Cloudflare Worker API: linkgov-institutional-api
       -> D1 binding DB
       -> R2 binding ASSETS
       -> Cloudflare Access JWT for administrative routes
       -> Cloudflare Access OTP sent to approved user email addresses
```

Public files remain private in R2 and are served by the controlled Worker endpoint `/api/assets/*`.

## Preparation table

| Configuration | Current state | Required value | Source |
| --- | --- | --- | --- |
| Cloudflare Account | Correct owner account confirmed; ID intentionally not recorded | Confirmed account | Official connector |
| Worker name | Deployed in production | `linkgov-institutional-api` | Cloudflare Workers |
| D1 database name | Created; migrations `0001`-`0004` applied | `linkgov-db-production` | Cloudflare |
| D1 database ID | Configured | `d1d690dc-5272-4086-8264-70b5ced59adc` | Cloudflare |
| R2 bucket name | Confirmed and private | `linktree` | Cloudflare |
| Frontend URL | Production deployment active | `https://bc-linktree.pages.dev` | Cloudflare Pages |
| Worker URL | Deployed and remotely verified | `https://linkgov-institutional-api.rodrigogastudillo.workers.dev` | Cloudflare deploy |
| `APP_BASE_URL` | Live | `https://bc-linktree.pages.dev` | Pages project |
| `ASSET_BASE_URL` | Live | `https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/assets` | Worker deploy |
| `ACCESS_TEAM_DOMAIN` | Configured | `https://bc-linktree.cloudflareaccess.com` | Zero Trust |
| `ACCESS_AUD` | Configured | Access application audience from Cloudflare | Zero Trust |

## Validation

Validated with an isolated Node `v22.23.1` runtime because the system Node is still `v20.17.0`.

```text
npm install: passed, 0 vulnerabilities
npm run build: passed
npm run test: passed, 25 tests
npm run audit: passed, 0 vulnerabilities
Wrangler: 4.102.0
Production config validator: passed
Worker production dry-run: passed
Fresh local D1 migration rehearsal: all four migrations passed
```

The production deploy command runs `npm run cf:validate:production` first. The validator passes with the real D1, R2, and Access identifiers. The remote migration, Worker deployment, and Pages production deployment are complete.

Production deployment records:

```text
Worker deployment: 1b203549-9a18-4203-834a-86daba81f201
Worker version:    6f3a8a57-4bce-414f-b60b-6780c4da0af7
Worker created:    2026-07-15 19:32:04 UTC
Pages deployment:  e53619ad-88a3-4af8-b561-d6cf2e3315e5
Pages completed:   2026-07-15 19:41:07 UTC
```

## Migrations reviewed

### 0001_initial_schema.sql

- Creates `users`, `profiles`, `links`, `sessions`, and `events`.
- Creates profile, link, session, and event indexes.
- Seeds demo admin and gestor users, one public profile, links, and events.
- Contains a shared demo SHA-256 password hash.
- No `DROP TABLE` or unfiltered `DELETE`.

### 0002_governance_uploads_auth.sql

- Creates permissions, approvals, audit, password reset, and upload tables.
- Creates supporting indexes.
- Seeds a demo editor, a second public profile, permissions, approval, and audit records.
- Reuses the same demo password hash.
- No `DROP TABLE` or unfiltered `DELETE`.

### 0003_user_admin_status.sql

- Adds the `users.status` column.
- Updates existing users from the legacy `active` flag.
- Creates the role/status index.
- No table drop or row deletion.

### 0004_cloudflare_access_admin.sql

- Converts `usr_admin` to the real initial administrator `rodrigogastudillo@gmail.com`.
- Replaces the shared password hash with a value that cannot authenticate locally.
- Transfers profiles owned by demo users to the real administrator.
- Deletes only the scoped demo gestor and editor rows; their permissions are removed by foreign keys.
- Clears any local session or password reset belonging to the initial administrator.
- Records the Access bootstrap in `audit_logs`.
- Contains scoped `DELETE` statements and no table drop or unfiltered deletion.

### Migration risk

Migrations `0001` and `0002` temporarily insert demo users, and `0004` removes the demo gestor/editor while converting the demo admin row to the real Access administrator. Public seed profiles and links remain. The scoped deletions in `0004` are intentional; explicit human confirmation was received immediately before the first remote migration.

### Remote migration result

Applied successfully on 2026-07-15:

```text
0001_initial_schema.sql          2026-07-15 19:20:51 UTC
0002_governance_uploads_auth.sql 2026-07-15 19:21:08 UTC
0003_user_admin_status.sql       2026-07-15 19:21:26 UTC
0004_cloudflare_access_admin.sql 2026-07-15 19:21:41 UTC
```

Verification: 12 application tables, one active real administrator, zero demo users, two public profiles, eight links, and one Access bootstrap audit record. The pre-migration Time Travel bookmark is `00000002-00000000-000050a9-c3f69a4bd30311c488113cc05e4193ef`; the post-migration bookmark is `00000002-0000000a-000050a9-b59d261a728e91fa9fce338b411ec366`.

## Bindings

| Binding | Type | Production resource | State |
| --- | --- | --- | --- |
| `DB` | D1 | `linkgov-db-production` | Created; real ID configured; migrations applied |
| `ASSETS` | R2 | `linktree` | Confirmed and configured |

The Worker reads and writes through native bindings. It does not call the Cloudflare REST API at runtime.
The S3 API endpoint is not stored in the application and the project source is not uploaded to R2. Only avatar and banner objects are written by the Worker: avatars are limited to 2 MB and 1024x1024 pixels; banners are limited to 4 MB and 2400x900 pixels.

## Public variables

```text
ENVIRONMENT=production
APP_BASE_URL=https://bc-linktree.pages.dev
ASSET_BASE_URL=https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/assets
AUTH_PROVIDER=access
ACCESS_TEAM_DOMAIN=https://bc-linktree.cloudflareaccess.com
ACCESS_AUD=5ee63db43bb47a7da20bc32d3d2902c704125cfed4b6505e1c24d9c15ce54025
```

The real `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are configured from the Access application `BC Linktree - administracao`. They are identifiers, not secrets. Access protects only `/api/auth/access` and `/api/admin`; public profiles, health, click tracking, and R2 asset reads remain public.

## Secrets

Possible Worker secrets, never committed:

```text
EMAIL_WEBHOOK_URL
EMAIL_WEBHOOK_TOKEN
```

Set them interactively only after choosing an email provider:

```bash
npx wrangler secret put EMAIL_WEBHOOK_URL --config wrangler.worker.jsonc --env production
npx wrangler secret put EMAIL_WEBHOOK_TOKEN --config wrangler.worker.jsonc --env production
```

Do not paste secret values into chat or store them in `.env`, `package.json`, or Wrangler vars. The production Access flow has no local password recovery: Cloudflare sends a fresh one-time code by email for every authentication. The webhook remains optional for local-auth environments only.

## Security changes prepared

- Production CORS allows only `APP_BASE_URL` and rejects other browser origins with `403`.
- Loopback origins are allowed only in local, development, or test environments.
- Preflight requests return explicit methods, headers, credentials, and cache duration.
- Requests without `Origin` remain available for legitimate server and health checks.
- Demo fallback and demo credentials are enabled only in Vite development/test mode.
- Production API failures are shown as connection errors and never mutate demo state silently.
- `AUTH_PROVIDER=access` no longer accepts legacy local bearer sessions.
- Password reset tokens are not generated or logged when the email webhook is absent.
- Access uses the official One-time PIN identity provider and an eight-hour session.
- The Access policy authenticates OTP identities while D1 remains the authorization source for roles, profile access, and user status.
- CORS preflight bypass is enabled at Access while the Worker still enforces the official Pages origin.

## Deploy commands

Run from the repository root with Node 22 or newer:

```bash
npm run build
npm run test
npm run audit
npm run cf:validate:production
npm run cf:migrate:production
npm run deploy:api:production
```

The migrations and first production deployments have already been completed. Future deploys still require an authenticated Cloudflare session and must pass the same validation commands.

## Remote test results

```bash
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/profiles/saude
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/profiles/educacao
curl -i -H "Origin: https://bc-linktree.pages.dev" https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
curl -i -H "Origin: https://external.example" https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
```

Verified on 2026-07-15:

- Health returned `200`, `ok: true`, `environment: production`, and `authProvider: access`.
- Both public profiles returned `200` from remote D1. A single transient Worker `1042` occurred during initial propagation; immediate retries passed consistently.
- D1 recorded the public profile views and a direct query confirmed the persisted events.
- The official Pages origin received the exact CORS allow-origin header; an external origin received `403`.
- An allowed preflight returned `204` with the expected methods and headers.
- Unauthenticated administrative and Access callback requests redirected to the Cloudflare Access login.
- A 25-byte synthetic object was written to private R2, read through `/api/assets/*` with the expected ETag and content type, then deleted.
- Pages routes `/`, `/@saude`, `/@educacao`, and `/admin` returned `200` over HTTPS.
- The deployed frontend bundle contains the real Worker URL and Access provider configuration.

An authenticated administrative read, upload through the browser form, and permission-denied test still require a real OTP session. Do not send the OTP or Access cookies through chat.

## Pages integration

The `bc-linktree` Pages project now has these production build variables:

```text
VITE_API_BASE_URL=https://linkgov-institutional-api.rodrigogastudillo.workers.dev
VITE_AUTH_PROVIDER=access
NODE_VERSION=22
```

`VITE_*` values are embedded during Vite build. Deployment `e53619ad-88a3-4af8-b561-d6cf2e3315e5` rebuilt the frontend with these values and is active at the stable `pages.dev` URL. Never place tokens or secrets in a `VITE_*` variable.

## Logs

```bash
npx wrangler tail linkgov-institutional-api --env production --config wrangler.worker.jsonc
```

Workers Logs are enabled in Wrangler configuration. Logs must not include JWTs, password reset tokens, webhook tokens, or request authorization headers.

## Rollback

```bash
npx wrangler versions list --config wrangler.worker.jsonc --env production
npx wrangler rollback 6f3a8a57-4bce-414f-b60b-6780c4da0af7 --config wrangler.worker.jsonc --env production
```

Rollback changes Worker code only. It does not roll back D1 migrations or data. Export D1 before a future destructive migration. Pages deployment `e53619ad-88a3-4af8-b561-d6cf2e3315e5` can be rolled back from `Workers & Pages > bc-linktree > Deployments` without changing D1 or R2.

## Custom domain later

The first deployment uses `pages.dev` and `workers.dev`. A custom domain and DNS change require separate human approval. After the standard URLs work:

1. Add the domain to the correct Cloudflare account.
2. Configure the frontend hostname in Pages custom domains.
3. Configure the API hostname in Worker Domains and Routes.
4. Change `APP_BASE_URL`, `ASSET_BASE_URL`, CORS, Pages `VITE_API_BASE_URL`, and the Access application destination.
5. Use Cloudflare-managed HTTPS and verify SSL/TLS before switching traffic.

## Remaining manual validation

The infrastructure deployment is complete. The following checks require a human-owned OTP session:

1. Open `https://bc-linktree.pages.dev/login`.
2. Select `Entrar com codigo por e-mail`.
3. Authenticate as `rodrigogastudillo@gmail.com` with the one-time code sent by Cloudflare.
4. Confirm that the admin can switch between both public pages.
5. Upload one valid avatar or banner and confirm that it remains visible after refreshing the page.

Do not paste the OTP, Access cookie, or JWT into chat. The embedded browser connector failed to initialize during verification with `Cannot redefine property: process`; this is a connector runtime error, not an application or Cloudflare deployment failure.

Staging resources and custom domains remain intentionally pending because each requires a separate resource/DNS approval. The R2 bucket must remain private.

## Official documentation

- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
