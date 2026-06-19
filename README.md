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

Credenciais demo:

```txt
admin@linkgov.local
Admin@123
```

Se a API nao estiver rodando, a aplicacao usa `localStorage` para manter a demo editavel.


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


## Testes

```bash
npm run tes
npm run dev
```


