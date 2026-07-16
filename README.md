# LinkGov Institutional

Plataforma institucional de agregador de links inspirada no fluxo do Linktree, com pagina publica responsiva, painel administrativo e API preparada para Cloudflare Workers + D1.

## O que foi entregue

- Frontend React + Vite + TypeScript.
- Pagina publica por slug, exemplo: `/@saude` ou `/saude`.
- Login administrativo com sessao demo.
- Autenticacao preparada para Cloudflare Access, permitindo gov.br/SSO interno via IdP oficial.
- Recuperacao de senha por link seguro enviado para e-mail real via webhook configuravel.
- Painel com Links, Aparencia, Analiticos, Usuarios e Configuracoes.
- CRUD de links com ativar/desativar, destaque, icones e drag-and-drop.
- Politicas de acesso: admin administra todas as paginas, gestor administra uma pagina, editor edita apenas links autorizados pelo admin.
- Auditoria e aprovacao para alteracoes/permissoes de perfis editoriais.
- Upload real de avatar/banner com Cloudflare R2 e limites de tipo, tamanho e dimensao.
- Testes automatizados com Vitest para politica do Worker e fluxos criticos do frontend.
- Preview mobile em tempo real.
- API Hono para Cloudflare Worker.
- API local em Node para testar HTTP, banco e upload no proprio computador.
- Schema D1 com usuarios, perfis, links, sessoes e eventos.
- Fallback local em `localStorage` quando a API nao estiver ligada.
- Arquivos de Cloudflare Pages/Worker, headers, redirects e migrations.

## Stack

- React 19
- Vite
- TypeScript
- Hono
- Cloudflare Workers
- Cloudflare D1
- dnd-kit
- lucide-react
- jose
- Vitest + Testing Library

## Requisitos locais

Use Node 22 ou superior para build, testes, Wrangler e desenvolvimento local, conforme `package.json`.

## Instalar

```bash
npm install
```

## Rodar somente o frontend

```bash
npm run dev:web
```

Se a API nao estiver rodando, a aplicacao usa `localStorage` para manter a demo editavel somente quando
`VITE_ENABLE_DEMO_FALLBACK=true` e uma senha local propria em `VITE_DEMO_PASSWORD` estiverem definidos em
`.env.local`. Nenhuma senha demo reutilizavel e mantida no repositorio. Builds sem essas opcoes falham de forma
segura e nao transformam erros da API em uma sessao demo. Em desenvolvimento, o frontend acessa
`http://127.0.0.1:8787` diretamente para diferenciar indisponibilidade de uma resposta HTTP real.

A migration de desativacao da autenticacao seedada invalida os hashes e sessoes dessas identidades no D1.
Nao restaure essas credenciais; para testar autenticacao local no Worker, provisione um usuario local proprio.

## Rodar como servidor local no computador

Para testar no computador, use:

```bash
npm run dev
```

Isso sobe:

- Frontend em `0.0.0.0:5173`
- API local restrita a `127.0.0.1:8787`
- Banco local em `local-data/db.json`
- Uploads locais em `local-data/uploads`

A API autenticada permanece deliberadamente acessivel apenas pelo computador local.

## Rodar com API Cloudflare local

Use Node 22+.

Crie um `.env` a partir do exemplo:

```bash
cp .env.example .env
```

```bash
npm run cf:migrate:local
npm run dev
```

O Vite faz proxy de `/api` para `http://127.0.0.1:8787`. Para iniciar o Worker local com Node 22+, rode:

```bash
npm run dev:worker
```

## Banco de dados

A migration principal esta em:

```txt
migrations/0001_initial_schema.sql
```

Ela cria:

- `users`
- `profiles`
- `links`
- `sessions`
- `events`

A migration `0002_governance_uploads_auth.sql` adiciona:

- `page_permissions`
- `editor_link_permissions`
- `approval_requests`
- `audit_logs`
- `password_resets`
- `uploads`

As migrations seguintes completam a configuracao de autenticacao:

- `0003_user_admin_status.sql`: adiciona o estado administrativo dos usuarios.
- `0004_cloudflare_access_admin.sql`: prepara o bootstrap administrativo pelo Cloudflare Access.
- `0005_disable_legacy_seed_auth.sql`: encerra credenciais, sessoes e resets das identidades seedadas.

Para criar um D1 remoto:

```bash
npx wrangler d1 create linkgov-db
```

Depois substitua o `database_id` em `wrangler.worker.jsonc` pelo ID retornado e rode:

```bash
npm run cf:migrate:remote
```

Para staging/producao:

```bash
npm run cf:migrate:staging
npm run cf:migrate:production
```

## Deploy

### API Worker

```bash
npm run deploy:api
```

Ambientes:

```bash
npm run deploy:api:staging
npm run deploy:api:production
```

### Frontend Pages

O manifest do Pages e `wrangler.jsonc`. Builds de staging e producao exigem uma origem HTTPS explicita em
`VITE_API_BASE_URL` e `VITE_AUTH_PROVIDER=access`; o build falha antes do deploy quando essas variaveis estao
ausentes ou invalidas.

```bash
npm run deploy:web:staging
npm run deploy:web:production
```

Tambem e possivel conectar o repositorio no dashboard do Cloudflare Pages com:

```txt
Build command: npm run build
Output directory: dist
```

## Estrutura

```txt
src/
  App.tsx
  data/seed.ts
  services/api.ts
  styles.css
  types.ts
scripts/
  local-api.mjs
worker/
  index.ts
  policy.ts
migrations/
  0001_initial_schema.sql
  0002_governance_uploads_auth.sql
  0003_user_admin_status.sql
  0004_cloudflare_access_admin.sql
  0005_disable_legacy_seed_auth.sql
public/
  assets/
  _headers
  _redirects
```

## Decisoes tecnicas

- D1 foi escolhido por encaixar naturalmente no deploy Cloudflare e por ser suficiente para perfis, links, sessoes, eventos, auditoria e aprovacoes.
- O fallback local do frontend exige habilitacao explicita e senha definida pelo operador em desenvolvimento.
- As credenciais seedadas terminam desativadas pelas migrations; producao usa Cloudflare Access e nao reutiliza senha local.
- URLs sao validadas no Worker para aceitar apenas `http` e `https`.
- Entradas textuais sao sanitizadas para impedir HTML livre.
- Uploads aceitam JPG, PNG e WEBP e sao barrados por tamanho/dimensao no frontend, no Worker e na API local.

## Cloudflare, dominio e HTTPS

Veja o passo a passo em:

```txt
docs/cloudflare-deploy.md
```

## Testes

```bash
npm run test
```

O build completo continua em:

```bash
npm run build
```
