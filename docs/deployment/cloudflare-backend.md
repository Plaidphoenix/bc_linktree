# BC Linktree - Cloudflare backend deployment

Last verified: 2026-07-16

This document records the real deployment state. A planned URL is never treated as a successful deployment until Cloudflare returns it and the remote health check passes.

## Architecture

```text
Browser
  -> Public site: Cloudflare Pages at bc-linktree.pages.dev
  -> Administrative SPA and API: Worker at linkgov-institutional-api
       -> D1 binding DB
       -> R2 binding ASSETS
       -> Cloudflare Access JWT for administrative routes
       -> Cloudflare Access OTP sent to approved user email addresses
```

The administrative SPA and protected API share the Worker origin so the `CF_Authorization` application cookie is first-party. This avoids the cross-origin cookie failure seen in Brave, private windows, VPN devices, and other browsers that block third-party cookies. Public profiles remain available on Pages. Public files remain private in R2 and are served by the controlled Worker endpoint `/api/assets/*`.

The same-origin change remains active. The current Worker version is `cf54f8fc-c691-4459-9a4e-d4e5a58e71e3`, which also includes mobile touch reordering and page switching.

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
| `ADMIN_BASE_URL` | Live | `https://linkgov-institutional-api.rodrigogastudillo.workers.dev` | Worker deploy |
| `ASSET_BASE_URL` | Live | `https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/assets` | Worker deploy |
| `ACCESS_TEAM_DOMAIN` | Configured | `https://bc-linktree.cloudflareaccess.com` | Zero Trust |
| `ACCESS_AUD` | Configured | Access application audience from Cloudflare | Zero Trust |

## Validation

Validated with an isolated Node `v22.23.1` runtime because the system Node is still `v20.17.0`.

```text
npm ci: passed, 237 packages, 0 vulnerabilities
npm run build: passed
npm run build:worker: passed in deterministic Access mode
npm run test: passed, 37 tests in 9 files
npm run audit: passed, 0 vulnerabilities
Wrangler config, dry-run, and local runtime validation: 4.111.0
Production config validator: passed
Worker production dry-run: passed
Worker static SPA: `/admin/links` returned `200` from the same local Worker origin
Fresh local D1 migration rehearsal: all four migrations passed
```

The production deploy command runs `npm run cf:validate:production` first. The validator passes with the real D1, R2, and Access identifiers. The remote migration, Worker deployment, and Pages production deployment are complete.

Production deployment records:

```text
Worker version:          cf54f8fc-c691-4459-9a4e-d4e5a58e71e3
Worker deployed:         2026-07-16 20:59:09 UTC
Previous Worker version: 6cab8ae0-ae81-43c2-a177-ab63a0775cfa
Pages deployment:  5c6e1de8-3f53-4902-830e-c761f4de8e50
Pages completed:   2026-07-15 20:33:23 UTC
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
ADMIN_BASE_URL=https://linkgov-institutional-api.rodrigogastudillo.workers.dev
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

## Security changes live

- Production CORS allows only `APP_BASE_URL` and `ADMIN_BASE_URL` and rejects other browser origins with `403`.
- Loopback origins are allowed only in local, development, or test environments.
- Preflight requests return explicit methods, headers, credentials, and cache duration.
- Requests without `Origin` remain available for legitimate server and health checks.
- Demo fallback and demo credentials are enabled only in Vite development/test mode.
- Production API failures are shown as connection errors and never mutate demo state silently.
- `AUTH_PROVIDER=access` no longer accepts legacy local bearer sessions.
- The frontend recognizes the Cloudflare Access cookie without requiring a local bearer token.
- Returning to `/login` with a known valid Access session redirects to the last administrative section.
- The last administrative state remains visible during network loss with all mutations disabled.
- Password reset tokens are not generated or logged when the email webhook is absent.
- Access uses the official One-time PIN identity provider and an eight-hour session.
- The Access policy authenticates OTP identities while D1 remains the authorization source for roles, profile access, and user status.
- CORS preflight bypass is enabled at Access while the Worker still enforces only the approved Pages and Worker origins.
- The Worker serves the production administrative SPA with `single-page-application` fallback and routes `/api/*` through Hono first.
- The Access callback returns to `ADMIN_BASE_URL`, keeping the administrative SPA and protected API on one origin.
- `build:worker` forces Access mode and same-origin API calls even when a developer has local Vite values in an ignored `.env` file.

## Deploy commands

Run from the repository root with Node 22 or newer:

```bash
npm run build
npm run build:worker
npm run test
npm run audit
npm run cf:validate:production
npm run cf:migrate:production
npm run deploy:api:production
```

The migrations and first production deployments have already been completed. Future deploys still require an authenticated Cloudflare session and must pass the same validation commands.

`npm run deploy:api:production` runs `build:worker` automatically. The normal `npm run build` and Pages deployment keep their existing Pages-specific configuration and `_redirects` file.

## Remote test results

```bash
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/profiles/saude
curl -i https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/profiles/educacao
curl -i -H "Origin: https://bc-linktree.pages.dev" https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
curl -i -H "Origin: https://external.example" https://linkgov-institutional-api.rodrigogastudillo.workers.dev/api/health
```

Verified initially on 2026-07-15 and repeated after the same-origin deployment on 2026-07-16:

- Health returned `200`, `ok: true`, `environment: production`, and `authProvider: access`.
- Both public profiles returned `200` from remote D1. The `saude` profile returned five links and `educacao` returned three.
- A read-only direct D1 query confirmed two profiles, eight links, one real administrator, and zero page permissions without changing data.
- The official Pages and Worker administrative origins received their exact CORS allow-origin headers; an external origin received `403`.
- Allowed preflights for both approved origins returned `204` with the expected methods and headers.
- Unauthenticated administrative and Access callback requests redirected to the Cloudflare Access login.
- A unique synthetic text object was written to private R2, read through `/api/assets/*` with the expected body and content type, then deleted. A final read returned `404`, confirming cleanup.
- Pages routes `/`, `/@saude`, `/@educacao`, and `/admin` returned `200` over HTTPS.
- The deployed frontend bundle contains the real Worker URL and Access provider configuration.
- The deployed bundle contains the Access session bootstrap, automatic login redirect, and offline read-only state.
- Worker routes `/login` and `/admin/links` returned the administrative SPA with `200`; its JavaScript asset also returned `200` with the correct media type.
- A real-browser check confirmed that the Pages login button targets the Worker and opens the official Cloudflare Access form with the email field and `Send login code` button.
- The owner confirmed successful OTP login on another device and through VPN, Brave, and Tor.
- Worker version `cf54f8fc-c691-4459-9a4e-d4e5a58e71e3` served the new JavaScript and CSS assets with `200` and the expected media types.
- The production mobile bundle was exercised in an iPhone 14 Pro Max browser context with synthetic intercepted API responses, so no D1 data was changed: direct touch reordered two links, the 44-pixel handle reported `touch-action: none`, and the mobile selector changed from Saude to Educacao.
- The production mobile interaction test completed with zero browser console errors or warnings.

An authenticated administrative read, upload through the browser form, and permission-denied test still require a real OTP session. Do not send the OTP or Access cookies through chat.

## Pages integration

The `bc-linktree` Pages project now has these production build variables:

```text
VITE_API_BASE_URL=https://linkgov-institutional-api.rodrigogastudillo.workers.dev
VITE_AUTH_PROVIDER=access
NODE_VERSION=22
```

`VITE_*` values are embedded during Vite build. Deployment `5c6e1de8-3f53-4902-830e-c761f4de8e50` rebuilt the frontend with these values and the Access session fix, and is active at the stable `pages.dev` URL. Never place tokens or secrets in a `VITE_*` variable.

## Logs

```bash
npx wrangler tail linkgov-institutional-api --env production --config wrangler.worker.jsonc
```

Workers Logs are enabled in Wrangler configuration. Logs must not include JWTs, password reset tokens, webhook tokens, or request authorization headers.

## Rollback

```bash
npx wrangler versions list --config wrangler.worker.jsonc --env production
npx wrangler rollback 6cab8ae0-ae81-43c2-a177-ab63a0775cfa --config wrangler.worker.jsonc --env production
```

Rollback changes Worker code only. It does not roll back D1 migrations or data. Export D1 before a future destructive migration. Pages deployment `5c6e1de8-3f53-4902-830e-c761f4de8e50` can be rolled back from `Workers & Pages > bc-linktree > Deployments` without changing D1 or R2.

## Custom domain later

The first deployment uses `pages.dev` and `workers.dev`. A custom domain and DNS change require separate human approval. After the standard URLs work:

1. Add the domain to the correct Cloudflare account.
2. Configure the frontend hostname in Pages custom domains.
3. Configure the API hostname in Worker Domains and Routes.
4. Change `APP_BASE_URL`, `ADMIN_BASE_URL`, `ASSET_BASE_URL`, CORS, Pages `VITE_API_BASE_URL`, and the Access application destination.
5. Use Cloudflare-managed HTTPS and verify SSL/TLS before switching traffic.

## Remaining manual validation

The base infrastructure, same-origin authentication, and mobile interaction deployment are complete. The following checks use the owner's authenticated production data:

1. Refresh `https://linkgov-institutional-api.rodrigogastudillo.workers.dev/admin/links` on the mobile device.
2. Drag one real link by its handle and refresh again to confirm that D1 retained the order.
3. Use `Trocar pagina` and confirm that the selected page and its links change together.
4. Toggle the browser offline and online without logging out; confirm the offline read-only banner and automatic recovery.
5. Upload one valid avatar or banner and confirm that it remains visible after refreshing the page.

Do not paste the OTP, Access cookie, or JWT into chat. Automated production UI checks use synthetic intercepted API responses and never consume a real Access session.

The first successful login after the same-origin change creates new browser storage on the Worker origin; cached data from the old Pages origin is intentionally not copied across origins. The owner confirmed the login through Brave, VPN, and Tor, although Tor remains best-effort if its exit IP changes during a future Access exchange.

Staging resources and custom domains remain intentionally pending because each requires a separate resource/DNS approval. Wrangler also reported that preview URLs are currently enabled by default; disabling them should be handled as a separate reviewed configuration change. The R2 bucket must remain private.

## Official documentation

- https://developers.cloudflare.com/d1/reference/migrations/
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
