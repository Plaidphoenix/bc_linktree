# Deploy Cloudflare, staging, dominio e HTTPS

Este projeto ja esta preparado para Cloudflare Workers, Pages, D1, R2 e Cloudflare Access. O que ainda precisa ser feito manualmente depende da sua conta Cloudflare, do dominio real e do provedor de identidade escolhido.

## 1. Criar recursos por ambiente

Crie bancos D1 separados:

```bash
npx wrangler d1 create linkgov-db-staging
npx wrangler d1 create linkgov-db-production
```

Copie os `database_id` retornados para `wrangler.worker.jsonc` nos ambientes `staging` e `production`.

Crie buckets R2 separados:

```bash
npx wrangler r2 bucket create linkgov-assets-staging
npx wrangler r2 bucket create linkgov-assets-production
```

Os nomes ja estao configurados no `wrangler.worker.jsonc`.

## 2. Configurar autenticacao oficial

O Worker aceita Cloudflare Access como provedor oficial. Gov.br, SSO interno via SAML/OIDC ou outro IdP devem ser conectados no Cloudflare Zero Trust e usados pelo Access.

Passos:

1. Abra Cloudflare Zero Trust.
2. Va em `Access > Applications`.
3. Crie uma aplicacao `Self-hosted`.
4. Proteja os dominios do painel/API, por exemplo `links.seudominio.gov.br` e `api-links.seudominio.gov.br`.
5. Configure o provedor de identidade: gov.br via OIDC se disponivel para seu orgao, SSO interno por SAML/OIDC, ou outro IdP institucional.
6. Copie o `AUD` da aplicacao Access.
7. Atualize no `wrangler.worker.jsonc`:

```jsonc
"ACCESS_TEAM_DOMAIN": "https://sua-equipe.cloudflareaccess.com",
"ACCESS_AUD": "aud-copiado-do-access"
```

O backend valida o JWT enviado pelo Access no header `Cf-Access-Jwt-Assertion` ou no cookie `CF_Authorization`. A documentacao oficial da Cloudflare mostra o uso do JWKS em `/cdn-cgi/access/certs` e a validacao de issuer/audience.

Fonte: [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

## 3. Configurar envio real de e-mail

O endpoint `POST /api/auth/forgot-password` gera um token seguro e envia um link de redefinicao. Ele nao envia senha por e-mail.

Configure um webhook de e-mail, por exemplo SendGrid, Resend, MailChannels ou provedor interno:

```bash
npx wrangler secret put EMAIL_WEBHOOK_URL --env staging --config wrangler.worker.jsonc
npx wrangler secret put EMAIL_WEBHOOK_TOKEN --env staging --config wrangler.worker.jsonc
npx wrangler secret put EMAIL_WEBHOOK_URL --env production --config wrangler.worker.jsonc
npx wrangler secret put EMAIL_WEBHOOK_TOKEN --env production --config wrangler.worker.jsonc
```

Formato esperado pelo webhook:

```json
{
  "to": "usuario@orgao.gov.br",
  "subject": "Redefinicao de senha - LinkGov Institutional",
  "text": "...",
  "html": "..."
}
```

## 4. Rodar migrations

```bash
npm run cf:migrate:staging
npm run cf:migrate:production
```

A migration `0002_governance_uploads_auth.sql` cria:

- `page_permissions`: admin/gestor/editor por pagina.
- `editor_link_permissions`: links autorizados para editor.
- `approval_requests`: fluxo de aprovacao.
- `audit_logs`: trilha de auditoria.
- `password_resets`: tokens de redefinicao de senha.
- `uploads`: metadados de avatar/banner enviados para R2.

## 5. Deploy da API

```bash
npm run deploy:api:staging
npm run deploy:api:production
```

Os ambientes usam `routes` com `custom_domain: true`. Troque os hostnames placeholder:

```jsonc
"pattern": "api-staging.seudominio.gov.br"
"pattern": "api-links.seudominio.gov.br"
```

Fonte: [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

## 6. Deploy do frontend Pages

Atualize `wrangler.pages.jsonc`:

```jsonc
"VITE_API_BASE_URL": "https://api-staging.seudominio.gov.br"
"VITE_API_BASE_URL": "https://api-links.seudominio.gov.br"
```

Depois rode:

```bash
npm run deploy:web:staging
npm run deploy:web:production
```

No dashboard do Cloudflare Pages, adicione os dominios customizados:

1. Abra `Workers & Pages`.
2. Selecione o projeto `linkgov-institutional`.
3. Va em `Custom domains`.
4. Clique em `Set up a custom domain`.
5. Configure `staging.seudominio.gov.br` e `links.seudominio.gov.br`.

Fonte: [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## 7. HTTPS

Se o dominio estiver na Cloudflare, Pages e Workers em custom domain emitem certificado automaticamente. O protocolo `https://` passa a funcionar depois da validacao do dominio e emissao do certificado.

Checklist:

1. O dominio deve estar em uma zona Cloudflare ativa.
2. Os registros DNS dos dominios customizados devem ficar `Proxied`.
3. Aguarde a emissao do certificado na tela de custom domain.
4. Use as URLs `https://links.seudominio.gov.br` e `https://api-links.seudominio.gov.br`.
5. Se houver origem externa no futuro, use SSL/TLS `Full (strict)`.

Se a sua conta ainda nao estiver com o dominio apontado para a Cloudflare, eu nao consigo concluir o HTTPS automaticamente daqui; basta seguir os passos acima e me passar os hostnames reais para eu substituir os placeholders.

## 8. Upload R2

O Worker aceita:

- Avatar: JPG, PNG ou WEBP, ate 2 MB, no maximo 1024x1024 px.
- Banner: JPG, PNG ou WEBP, ate 4 MB, no maximo 2400x900 px.

Os arquivos sao gravados no binding R2 `ASSETS` e servidos por `/api/assets/...` ou pelo `ASSET_BASE_URL` configurado.

Fonte: [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
