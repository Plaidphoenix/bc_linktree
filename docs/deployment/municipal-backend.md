# Backend municipal do LinkGov

## Estado desta preparacao

O projeto esta preparado para executar fora da Cloudflare com:

- Node.js 22.
- Hono no servidor municipal.
- PostgreSQL para usuarios, paginas, links, sessoes, auditoria e analytics.
- Armazenamento de avatar e banner no disco do servidor.
- Apache como proxy reverso e terminacao HTTPS.
- SIM apenas como provedor de identidade.
- Sessao propria do LinkGov em cookie `HttpOnly`, `Secure` e `SameSite=Lax`.
- JWT do SIM cifrado no banco e nunca devolvido ao navegador.
- Cache administrativo offline somente leitura com validade maxima de oito horas.

Nenhum dado real foi lido, importado ou modificado durante esta preparacao. O deploy
nao foi executado porque faltam acesso ao servidor municipal, banco PostgreSQL,
hostname definitivo e confirmacao do contrato privado do SIM.

## Sobre o JWT

Um JWT recebido depois do login e uma credencial Bearer, nao e a chave secreta do
servidor. Quem possuir um JWT ainda valido pode tentar usa-lo como a sessao do
usuario.

No caso de `HS256`, a chave de assinatura fica somente no servidor que emite e
valida o token. Ela nunca deve ser enviada ao frontend, colocada no Git ou
compartilhada em conversa.

O cabecalho e o payload de um JWT assinado normalmente sao apenas codificados em
base64url, nao cifrados. Por isso, dados pessoais nao devem ser colocados no token
quando nao forem estritamente necessarios.

Como um JWT e uma senha reais apareceram em capturas e na conversa:

1. Encerre todas as sessoes do SIM para o usuario afetado.
2. Troque a senha institucional.
3. Nao reutilize o JWT publicado.
4. Nao envie o novo JWT, senha ou chave de assinatura para o Codex.
5. Remova as quatro capturas locais da pasta temporaria.

Os logins locais do GitHub CLI e do Wrangler ja foram removidos. A varredura do
repositorio e dos 21 commits nao encontrou PAT, JWT, Bearer token ou chave privada.

## Arquitetura recomendada

```text
Navegador
  |
  | HTTPS, mesma origem
  v
Apache municipal
  |-- / e arquivos estaticos -> frontend React
  `-- /api/* -> Node 22/Hono em 127.0.0.1:8787
                    |-- PostgreSQL municipal
                    |-- /var/lib/linkgov/assets
                    `-- HTTPS de saida -> SIM login/validar-acesso/logout
```

O navegador nunca chama o SIM diretamente. Ele tambem nunca recebe o JWT do SIM.
Isso evita token em `localStorage`, console, URL, source map ou extensao do
navegador.

## Contrato SIM confirmado e limites

As capturas fornecidas confirmam:

- `POST /default/api/login`
- `POST /default/api/validar-acesso`
- `POST /default/api/logout`
- Operacoes genericas de CSV

A pagina de documentacao completa exige uma sessao real. Ela nao foi aberta com
credenciais pessoais.

Os endpoints de CSV nao substituem o banco do LinkGov. O frontend precisa de CRUD
de paginas, links, usuarios, permissoes, uploads, auditoria e analytics. Esse
contrato continua implementado pela API Hono e passa a usar PostgreSQL.

Antes do deploy, a equipe responsavel pelo SIM precisa confirmar:

1. Se `/api/login` recebe JSON ou `application/x-www-form-urlencoded`.
2. Se `ref_cod_usuario` e um identificador estavel, imutavel e apropriado para
   vincular contas.
3. O significado exato da resposta de `/api/validar-acesso`.
4. Se `/api/logout` revoga imediatamente o JWT.
5. Prazo de validade, rate limit e timeout oficial.
6. Se os tokens incluem e validam `exp`, `iat`, `iss`, `aud` e `jti`.
7. Procedimento de rotacao da chave de assinatura.
8. Contato operacional para indisponibilidade e incidente de seguranca.

## Arquivos adicionados

- `server/index.ts`: processo Node/Hono.
- `server/postgres-d1.ts`: adaptador PostgreSQL para o contrato existente.
- `server/filesystem-assets.ts`: armazenamento local com protecao contra path traversal.
- `server/migrate.ts`: migrations transacionais com checksum.
- `server/bootstrap-admin.ts`: cadastro interativo do primeiro admin.
- `worker/sim-auth.ts`: login, validacao, logout e cifra de token SIM.
- `migrations/postgres/0001_linkgov_schema.sql`: schema sem dados seed.
- `.env.municipal.example`: nomes das variaveis, sem valores reais.

## 1. Limpeza local das capturas

Esta operacao foi bloqueada pela politica do ambiente Codex. Execute no PowerShell
do computador, depois de fechar visualizadores que estejam usando os arquivos:

```powershell
Remove-Item -LiteralPath "$env:TEMP\codex-clipboard-ffb3c952-0dd4-4e5d-b717-bd3399175206.png" -Force
Remove-Item -LiteralPath "$env:TEMP\codex-clipboard-8681ce4d-ec8c-4009-aa31-6185f249a092.png" -Force
Remove-Item -LiteralPath "$env:TEMP\codex-clipboard-ade4668d-0233-44d8-a04b-fb00c5fa77fc.png" -Force
Remove-Item -LiteralPath "$env:TEMP\codex-clipboard-5e99e694-45c6-4f69-afe4-6fa72047c7db.png" -Force
```

Apagar as imagens nao revoga a credencial. A troca da senha e o encerramento das
sessoes continuam obrigatorios.

## 2. Informacoes que a prefeitura deve fornecer

Nao enviar os valores secretos por chat. Preencher diretamente no servidor:

| Item | Exemplo nao real | Responsavel |
| --- | --- | --- |
| Host Linux | `links.example.gov.br` | Infraestrutura |
| Usuario SSH/deploy | conta institucional | Infraestrutura |
| Banco PostgreSQL | `linkgov` | DBA |
| Usuario PostgreSQL | `linkgov` | DBA |
| Senha PostgreSQL | secret do servidor | DBA |
| Hostname publico | URL HTTPS definitiva | DNS/Infraestrutura |
| Caminho de assets | `/var/lib/linkgov/assets` | Infraestrutura |
| Identificador SIM do admin | valor interno | Gestao SIM |
| URL de recuperar senha | URL oficial | Gestao SIM |
| Formato do login | `json` ou `form` | Gestao SIM |

## 3. Preparar o servidor Debian

Executar como administrador do servidor:

```bash
sudo useradd --system --home /opt/linkgov --shell /usr/sbin/nologin linkgov
sudo install -d -o linkgov -g linkgov -m 0750 /opt/linkgov/current
sudo install -d -o linkgov -g linkgov -m 0750 /var/lib/linkgov/assets
sudo install -d -o root -g linkgov -m 0750 /etc/linkgov
```

Instalar:

- Node.js 22 LTS compativel com `package.json`.
- PostgreSQL suportado pela prefeitura.
- Apache 2.4 com `proxy`, `proxy_http`, `headers`, `rewrite` e `ssl`.

Somente as portas `80` e `443` devem ficar publicas. Node deve escutar em
`127.0.0.1:8787`; PostgreSQL deve ficar em loopback ou rede privada.

## 4. Criar o banco

O DBA deve criar banco e usuario sem enviar a senha:

```bash
sudo -u postgres createuser --pwprompt linkgov
sudo -u postgres createdb --owner=linkgov --encoding=UTF8 linkgov
```

Regras minimas:

- O usuario da aplicacao nao deve ser superuser.
- Nao conceder acesso a outros bancos.
- Exigir senha forte e conexao local/privada.
- Configurar backup diario cifrado e teste de restauracao.

## 5. Instalar e compilar

Na raiz do projeto, em uma maquina de build com Node 22:

```bash
npm ci
npm run test
npm run audit
npm run build:selfhosted
```

Transferir para `/opt/linkgov/current` somente o necessario para operar:

- `dist/`
- `dist-server/`
- `node_modules/` instalado com `npm ci --omit=dev`
- `package.json`
- `package-lock.json`

Alternativamente, fazer `npm ci --omit=dev` diretamente no servidor depois da
transferencia. Nao transferir `.env`, `.dev.vars`, dumps, tokens ou credenciais.

## 6. Configurar variaveis no servidor

Criar `/etc/linkgov/linkgov.env` com permissao `0640`, proprietario
`root:linkgov`. Usar `.env.municipal.example` apenas como lista de campos.

Gerar a chave de cifra diretamente no servidor:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Colar o resultado somente em `SIM_TOKEN_ENCRYPTION_KEY` dentro do arquivo protegido.
Nao enviar o valor para chat, Git, e-mail ou frontend.

Valores obrigatorios:

```text
ENVIRONMENT=production
AUTH_PROVIDER=sim
HOST=127.0.0.1
PORT=8787
APP_BASE_URL=https://HOST-REAL
ADMIN_BASE_URL=https://HOST-REAL
ASSET_BASE_URL=https://HOST-REAL/api/assets
ASSET_STORAGE_PATH=/var/lib/linkgov/assets
DATABASE_URL=postgresql://USUARIO:SENHA@127.0.0.1:5432/linkgov
SIM_API_BASE_URL=https://HOST-SIM-CONFIRMADO/default
SIM_LOGIN_PATH=api/login
SIM_VALIDATE_PATH=api/validar-acesso
SIM_LOGOUT_PATH=api/logout
SIM_LOGIN_CONTENT_TYPE=json
SIM_SUBJECT_CLAIM=ref_cod_usuario
SIM_TOKEN_ENCRYPTION_KEY=SEGREDO-GERADO-NO-SERVIDOR
```

Se a equipe confirmar formulario em vez de JSON:

```text
SIM_LOGIN_CONTENT_TYPE=form
```

## 7. Aplicar migration sem dados reais

Executar no servidor, a partir de `/opt/linkgov/current`:

```bash
sudo -u linkgov /usr/bin/node \
  --env-file=/etc/linkgov/linkgov.env \
  dist-server/migrate.mjs
```

Resultado esperado:

```text
Applied: 0001_linkgov_schema.sql
```

Reexecucoes mostram `Already applied`. Se o checksum de uma migration aplicada
mudar, o processo para sem executar SQL.

## 8. Cadastrar o primeiro admin

O comando e interativo. Os valores ficam no terminal do servidor e nao devem ser
enviados ao Codex:

```bash
sudo -u linkgov /usr/bin/node \
  --env-file=/etc/linkgov/linkgov.env \
  dist-server/bootstrap-admin.mjs
```

Informar:

- Nome institucional.
- E-mail institucional.
- Identificador interno estavel do SIM.
- Titulo e slug da primeira pagina.

Nao informar CPF, senha ou JWT no campo de identificador. O script recusa criar
outro bootstrap quando ja existe um admin.

## 9. Criar o servico systemd

Criar `/etc/systemd/system/linkgov.service`:

```ini
[Unit]
Description=LinkGov Institutional API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=linkgov
Group=linkgov
WorkingDirectory=/opt/linkgov/current
EnvironmentFile=/etc/linkgov/linkgov.env
ExecStart=/usr/bin/node /opt/linkgov/current/dist-server/index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/linkgov/assets
UMask=0027

[Install]
WantedBy=multi-user.target
```

Ativar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now linkgov
sudo systemctl status linkgov --no-pager
```

Logs sem secrets:

```bash
sudo journalctl -u linkgov -n 100 --no-pager
```

Nunca registrar corpo de login, cabecalho `Authorization`, cookie ou JWT.

## 10. Configurar frontend

Criar `.env.municipal-production` apenas na maquina de build:

```text
VITE_SIM_PASSWORD_RESET_URL=https://URL-OFICIAL-DE-RECUPERACAO
```

O modo `municipal-production` fixa `VITE_API_BASE_URL` vazio e
`VITE_AUTH_PROVIDER=sim`, mantendo frontend e API na mesma origem. Nenhuma
variavel `VITE_*` pode conter senha, token, chave ou `DATABASE_URL`.

Depois:

```bash
npm run build:selfhosted
```

Publicar o conteudo de `dist/` no DocumentRoot do Apache.

## 11. Configurar Apache e HTTPS

Exemplo a ser adaptado pela infraestrutura:

```apache
<VirtualHost *:443>
    ServerName HOST-REAL
    DocumentRoot /var/www/linkgov

    SSLEngine on
    SSLCertificateFile /CAMINHO/DO/CERTIFICADO.pem
    SSLCertificateKeyFile /CAMINHO/PROTEGIDO/DA/CHAVE.pem

    ProxyPreserveHost On
    ProxyPass        /api/ http://127.0.0.1:8787/api/ retry=0 timeout=30
    ProxyPassReverse /api/ http://127.0.0.1:8787/api/
    RequestHeader set X-Forwarded-Proto "https"

    <Location "/api/admin/uploads">
        LimitRequestBody 5242880
    </Location>

    <Directory "/var/www/linkgov">
        Options -Indexes
        AllowOverride None
        Require all granted
        FallbackResource /index.html
    </Directory>

    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
</VirtualHost>
```

Redirecionar HTTP para HTTPS em um VirtualHost separado. A chave privada TLS deve
ter acesso restrito ao root/Apache.

## 12. Testes de homologacao sem dados pessoais

Usar contas e paginas sinteticas aprovadas pela prefeitura:

1. `GET https://HOST-REAL/api/health` retorna `ok: true`,
   `authProvider: sim` e `identityConfigured: true`.
2. Login valido cria cookie `linkgov_session` com `HttpOnly`, `Secure` e
   `SameSite=Lax`.
3. O JSON de login nao contem `jwt` nem `token`.
4. `localStorage` nao contem Bearer token.
5. Identidade SIM sem cadastro LinkGov recebe `403`.
6. Admin cria pagina, gestor e editor sinteticos.
7. Gestor acessa apenas uma pagina.
8. Editor altera apenas links autorizados.
9. Avatar acima de 2 MB ou 1024x1024 e rejeitado.
10. Banner acima de 4 MB ou 2400x900 e rejeitado.
11. Reiniciar Node e Apache nao perde dados.
12. Desligar o computador do proprietario nao afeta a aplicacao.
13. Falha do SIM mantem o cache administrativo somente leitura, sem autorizar
    gravacoes.
14. Logs nao exibem senha, CPF, JWT, cookie ou `DATABASE_URL`.

## 13. Migrar dados existentes

Esta etapa deve ser executada por DBA/infraestrutura autorizados:

1. Congelar alteracoes no painel antigo.
2. Fazer backup verificado do D1 e dos objetos R2.
3. Copiar os backups por canal cifrado para ambiente restrito.
4. Mapear IDs, usuarios, paginas, links, permissoes, auditoria e uploads.
5. Vincular cada usuario ao identificador SIM sem usar CPF como chave.
6. Importar primeiro em staging.
7. Comparar contagens e checksums.
8. Validar URLs de assets e permissoes com dados sinteticos.
9. Fazer backup do PostgreSQL importado.
10. Agendar uma janela curta para o corte final.

Nao usar o endpoint `leitor-csv` como banco de producao sem contrato formal sobre
autorizacao, isolamento, concorrencia, backup, auditoria e retencao.

## 14. Corte e rollback

Ordem segura:

1. Homologar o servidor municipal.
2. Fazer backup final da Cloudflare.
3. Colocar o backend antigo em somente leitura.
4. Importar o delta.
5. Alterar DNS/Apache para o host municipal.
6. Testar login, CRUD, upload, permissoes e persistencia.
7. Observar logs e metricas por pelo menos um ciclo operacional.
8. Manter o backup antigo durante o prazo de retencao aprovado.

Rollback:

1. Interromper gravacoes no servidor municipal.
2. Restaurar o apontamento para a versao antiga.
3. Preservar o PostgreSQL para reconciliar o delta.
4. Registrar o incidente e a decisao.

Nao excluir Worker, D1, R2, Access ou DNS antes da homologacao e de autorizacao
humana especifica. A exclusao e irreversivel e pode remover o unico rollback.

## 15. Pendencias humanas

- Trocar a senha e revogar a sessao exposta.
- Remover as capturas temporarias.
- Confirmar o contrato privado do SIM.
- Fornecer servidor, PostgreSQL, hostname e certificado.
- Executar migration e bootstrap no servidor.
- Exportar/importar dados por equipe autorizada.
- Configurar Apache, DNS e HTTPS.
- Decidir quando desativar e depois remover a Cloudflare.
- Tornar o repositorio privado caso contenha arquitetura que nao deva ser publica.

## Validacao local concluida

```text
TypeScript: aprovado
Testes: 58 aprovados
Audit: 0 vulnerabilidades conhecidas
Build frontend: aprovado
Build backend Node: aprovado
```
