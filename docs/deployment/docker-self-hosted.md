# LinkGov autogerenciado com Docker Engine

## Decisao tecnica

Docker pode executar o backend e o PostgreSQL sem Cloudflare, Firebase ou outro
servico de hospedagem. Neste desenho, o equipamento municipal e o host:

```text
Internet/rede municipal
        |
        v
Proxy reverso HTTPS municipal
        |
        v
Container API Node/Hono
   |               |
   v               v
PostgreSQL      Volume de uploads
   |
   v
Volume persistente + backups em diretorio separado
```

O termo "DataKeeper" deve ser entendido como um conjunto de controles:

- volumes persistentes para banco e uploads;
- restart automatico dos containers;
- healthchecks;
- migrations antes da API;
- backup diario de PostgreSQL e uploads;
- checksum e verificacao dos arquivos de backup;
- retencao configuravel.

Docker sozinho nao e backup, alta disponibilidade ou hospedagem. Se o host for
desligado, a aplicacao fica indisponivel. Se o disco do host for perdido, um
volume no mesmo disco tambem pode ser perdido. A prefeitura deve copiar backups
para outro equipamento ou midia cifrada e testar restauracao periodicamente.

## Licenca e plataforma recomendada

O Docker Desktop exige assinatura paga para entidades governamentais. Nao aceitar
os termos nem usar Docker Desktop institucionalmente sem validacao de compras e
juridico. O Docker Engine/Moby em um servidor Linux tem termos separados e e o
destino recomendado.

Fontes oficiais:

- [Licenca do Docker Desktop](https://docs.docker.com/subscription/desktop-license/)
- [Instalacao do Docker Engine no Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Volumes persistentes](https://docs.docker.com/engine/storage/volumes/)
- [Secrets no Compose](https://docs.docker.com/compose/how-tos/use-secrets/)
- [Ordem de inicializacao e healthchecks](https://docs.docker.com/compose/how-tos/startup-order/)
- [Backup e restore do PostgreSQL](https://www.postgresql.org/docs/current/backup.html)

No computador de desenvolvimento foi encontrado:

```text
Windows 10 Pro 19045
Docker Desktop 4.19.0
Docker CLI 23.0.5
Compose 2.17.3
WSL 2 sem distribuicao instalada
PostgreSQL nativo 18.4 ativo na porta 5432
```

Em 31 de julho de 2026, o daemon do Docker Desktop respondeu e o `hello-world`
terminou corretamente com codigo `0`. A versao Desktop 4.19.0/Engine 23.0.5 e
antiga e nao foi usada para iniciar a stack do LinkGov. Como entidades
governamentais precisam de assinatura paga para Docker Desktop, a homologacao
real dos containers permanece reservada ao Docker Engine/Moby do servidor Linux
aprovado, sem cadastro de pagamento.

## Homologacao PostgreSQL nativa no Windows

Enquanto a infraestrutura prepara Docker Engine no servidor Linux, o PostgreSQL
18.4 local pode hospedar um banco isolado chamado `linkgov_homolog`. O script:

- pede a senha administrativa em prompt mascarado;
- cria role sem privilegios administrativos;
- gera secrets locais sem imprimi-los;
- cria `.env.municipal`, ignorado pelo Git;
- aplica a migration PostgreSQL;
- recusa reutilizar recursos com proprietario inesperado.

Na raiz do projeto:

```powershell
npm run postgres:provision:local
```

Depois, para cadastrar o primeiro administrador:

```powershell
npm run municipal:bootstrap-admin
```

Para iniciar API PostgreSQL e frontend local no modo SIM, sem credenciais ou
fallback demo:

```powershell
npm run municipal:dev
```

O painel fica em `http://127.0.0.1:5173/login`. O comando `npm run dev` usa o
ambiente demonstrativo e nao deve ser usado na homologacao municipal.

Esses dados sao de homologacao e nao substituem o host municipal definitivo.

## Componentes entregues

- `Dockerfile`: build em Node 22 e runtime sem root.
- `compose.yaml`: PostgreSQL, migration, API, backup e verificacao.
- `.env.docker.example`: configuracao sem secrets.
- `scripts/docker-init-secrets.ps1`: inicializacao segura no Windows.
- `scripts/docker-init-secrets.sh`: inicializacao segura no Linux.
- `scripts/provision-local-postgres.ps1`: banco isolado de homologacao no Windows.
- `scripts/linux-preflight.sh`: inspecao somente leitura do servidor Linux.
- `scripts/validate-docker-compose.mjs`: invariantes Compose em Windows/Linux.
- `docker/backup/backup-once.sh`: backup atomico do banco e uploads.
- `docker/backup/backup-loop.sh`: agendamento diario.
- `docker/backup/verify-backup.sh`: checksum e validacao dos arquivos.

O PostgreSQL 18 usa volume em `/var/lib/postgresql`, conforme a mudanca oficial da
imagem para a versao 18. A porta `5432` fica somente na rede interna do Compose.

## Persistencia

O Compose cria:

```text
linkgov_postgres_data  -> dados PostgreSQL
linkgov_assets_data    -> avatar e banner
LINKGOV_BACKUP_PATH    -> dumps, uploads compactados e checksums
```

`docker compose down` preserva volumes. Nao usar `docker compose down -v`, pois
`-v` remove os volumes e pode apagar os dados.

## Segredos

Nunca colocar valores reais no `compose.yaml`, `.env.docker` ou Git. Os arquivos
padrao sao:

```text
local-data/secrets/postgres_admin_password
local-data/secrets/postgres_app_password
local-data/secrets/sim_token_encryption_key
```

Eles sao ignorados pelo Git e montados somente nos containers autorizados em
`/run/secrets`. A API recebe apenas `postgres_app_password`. A senha administrativa
fica restrita ao container do banco e a role da aplicacao nao possui `SUPERUSER`,
`CREATEDB` ou `CREATEROLE`.

No Windows, a partir da raiz:

```powershell
npm run docker:init
```

No Linux:

```bash
sh scripts/docker-init-secrets.sh
sudo chown -R 10001:10001 /var/backups/linkgov
sudo chmod 0700 /var/backups/linkgov
```

Em producao, alterar em `.env.docker`:

```text
LINKGOV_ENVIRONMENT=production
LINKGOV_API_BIND=127.0.0.1
LINKGOV_APP_BASE_URL=https://HOST-REAL
LINKGOV_ADMIN_BASE_URL=https://HOST-REAL
LINKGOV_ASSET_BASE_URL=https://HOST-REAL/api/assets
LINKGOV_BACKUP_PATH=/var/backups/linkgov
```

## Validar e iniciar

Validacao sem iniciar containers:

```bash
docker compose --env-file .env.docker config --quiet
npm run docker:validate
```

Inicializacao:

```bash
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
```

Fluxo automatico:

1. `db` inicializa e precisa ficar healthy.
2. `migrate` aplica migrations com checksum e termina com sucesso.
3. `api` inicia somente depois da migration.
4. `backup` gera um backup inicial e depois repete diariamente.

Teste:

```bash
curl -fsS http://127.0.0.1:8787/api/health
```

No container, a mesma porta tambem entrega o frontend compilado. Assim, `/`,
`/@slug`, `/login` e `/admin/*` ficam na mesma origem da API.

## Primeiro administrador

Depois que `api` estiver healthy:

```bash
docker compose --env-file .env.docker exec api \
  node dist-server/bootstrap-admin.mjs
```

O prompt autentica no SIM, mascara a senha, usa somente o identificador interno,
executa logout e cria o primeiro admin no PostgreSQL. Nenhum JWT e exibido.

## Backup

O servico `backup` executa imediatamente e depois usa
`BACKUP_INTERVAL_SECONDS`. Cada ciclo produz:

```text
linkgov-DATA.dump
linkgov-DATA-assets.tar.gz
linkgov-DATA.sha256
```

Backup adicional:

```bash
npm run docker:backup
```

Verificar checksum, catalogo `pg_restore` e arquivo de uploads:

```bash
npm run docker:verify-backup
```

Essa verificacao detecta corrupcao basica, mas nao substitui um teste completo de
restauracao em outro PostgreSQL. A restauracao e destrutiva e deve ser executada
por DBA em staging, com API parada e aprovacao humana.

## Operacao

Status:

```bash
docker compose --env-file .env.docker ps
```

Logs sanitizados:

```bash
docker compose --env-file .env.docker logs --tail=100 api db backup
```

Parar sem apagar:

```bash
docker compose --env-file .env.docker down
```

Atualizacao:

```bash
git pull --ff-only
docker compose --env-file .env.docker build --pull
docker compose --env-file .env.docker up -d
```

Antes de atualizar PostgreSQL entre versoes principais, realizar backup e seguir
o procedimento oficial de upgrade. Nao trocar `postgres:18.4-bookworm`
silenciosamente por outra versao principal.

## Limites para producao

Este Compose e adequado para um unico servidor municipal, homologacao e producao
de pequeno porte com backup externo. Ele nao fornece:

- failover automatico entre hosts;
- replica PostgreSQL;
- armazenamento redundante;
- monitoramento externo;
- recuperacao de desastre fora do host.

Para disponibilidade maior, a infraestrutura deve adicionar outro host,
replicacao/backup externo, monitoramento e procedimento formal de recuperacao.

## Validacao desta preparacao

```text
Testes automatizados: 70 aprovados
Build Worker: aprovado
Build municipal: aprovado
Audit npm: 0 vulnerabilidades conhecidas
Compose config: aprovado
Invariantes de seguranca do Compose: 10 aprovadas
Frontend/API no runtime Node: aprovado em teste integrado
Build/execucao real dos containers: reservado ao Docker Engine Linux aprovado
Teste de backup e persistencia em container: pendente no Docker Engine Linux
```

O handoff completo esta em `docs/deployment/linux-server-handoff.md`.
