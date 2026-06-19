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

Para o frontend, o build passou neste ambiente com Node 20.17.0.

Para `wrangler dev`, migrations e deploy Cloudflare, use Node 22 ou superior. O Wrangler seguro instalado pelo audit (`wrangler@4.102.0`) exige Node 22+.

## Instalar

```bash
npm install
```

## Rodar somente o frontend

```bash
npm run dev:web
```

Abra:

```txt
http://127.0.0.1:5173/@saude
http://127.0.0.1:5173/login
```

Credenciais demo:

```txt
admin@linkgov.local
Admin@123
```

Se a API nao estiver rodando, a aplicacao usa `localStorage` para manter a demo editavel.

## Rodar como servidor local no computador

Para testar no computador e no celular na mesma rede, use:

```bash
npm run dev
```

Isso sobe:

- Frontend em `0.0.0.0:5173`
- API local em `0.0.0.0:8787`
- Banco local em `local-data/db.json`
- Uploads locais em `local-data/uploads`

Nesta maquina, o IP de rede validado nos testes foi:

```txt
http://10.170.1.10:5173/@saude
http://10.170.1.10:5173/login
```

No celular, conecte na mesma rede e abra a URL com o IP do computador. Se recusar conexao, libere as portas `5173` e `8787` no Firewall do Windows para rede privada/corporativa.

Para descobrir o IP novamente:

```powershell
ipconfig
```

Procure o `Endereco IPv4` da rede usada pelo celular.

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

O Vite faz proxy de `/api` para `http://127.0.0.1:8787`.

Como o ambiente atual esta com Node 20.17, `npm run dev` usa a API local em Node. Para usar Wrangler, instale Node 22+ e rode:

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

Atualize `VITE_API_BASE_URL` em `wrangler.pages.jsonc` para a URL real do Worker e rode:

```bash
npm run deploy:web
```

Ambientes:

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
public/
  assets/
  _headers
  _redirects
```

## Decisoes tecnicas

- D1 foi escolhido por encaixar naturalmente no deploy Cloudflare e por ser suficiente para perfis, links, sessoes, eventos, auditoria e aprovacoes.
- O frontend tem fallback local para manter a experiencia navegavel enquanto o Worker/D1 nao estao configurados.
- A senha demo nao fica em texto puro no D1: a migration usa SHA-256 para a conta seedada. Em producao, use Cloudflare Access com gov.br/SSO interno ou substitua o hash por uma estrategia forte com salt.
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
