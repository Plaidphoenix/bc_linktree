# Handoff para servidor Linux municipal

## Limites desta implantacao

Esta arquitetura nao usa Cloudflare, Firebase, Docker Offload ou hospedagem
externa. O servidor Linux municipal executa frontend, API, PostgreSQL, uploads e
backup. Nao e necessario criar Docker ID, cadastrar cartao ou publicar imagem em
registry: a imagem do LinkGov e construida no proprio servidor.

Docker Desktop nao deve ser usado como runtime municipal sem aprovacao juridica e
licenca adequada. A documentacao da Docker informa que entidades governamentais
precisam de assinatura paga para Docker Desktop. O destino deste projeto e Docker
Engine/Moby no Linux, cujos componentes open source possuem termos separados.

Nenhum agente deve, sem aprovacao humana:

- aceitar termos em nome do usuario ou da prefeitura;
- criar conta local, Docker ID ou cadastro em provedor;
- cadastrar pagamento;
- executar comandos com `sudo`;
- alterar firewall, DNS, proxy ou certificado;
- importar, apagar ou substituir dados;
- publicar a porta do PostgreSQL;
- executar `docker compose down -v`.

## Informacoes que a infraestrutura deve confirmar

Fornecer somente dados tecnicos, nunca senha ou chave pelo chat:

1. Distribuicao e versao Linux, por exemplo Ubuntu Server 24.04 LTS.
2. Arquitetura (`amd64` ou `arm64`).
3. Hostname/FQDN e IP aprovados.
4. Conta SSH ja criada pela prefeitura e metodo de acesso autorizado.
5. Proxy reverso utilizado (Apache, Nginx ou equipamento institucional).
6. Origem do certificado HTTPS.
7. Diretorio/disco de backup e destino externo cifrado.
8. Politica de firewall e janela de mudanca.

## Etapa zero: preflight somente leitura

O comando abaixo nao instala pacotes, nao cria usuario e nao altera o servidor:

```bash
cd /opt/linkgov
sh scripts/linux-preflight.sh .env.docker
```

Ele verifica Linux, Docker Engine, Compose, utilitarios basicos, HTTPS, bind
local, arquivos de secret, permissoes, backup absoluto, espaco livre e resolucao
do Compose. Se detectar Docker Desktop ou configuracao incompleta, encerra como
`BLOQUEADO`.

## Instalacao do Docker Engine

Esta etapa e manual e requer aprovacao da equipe responsavel pelo servidor. Para
Ubuntu, usar o repositorio `apt` oficial da Docker e instalar:

```text
docker-ce
docker-ce-cli
containerd.io
docker-buildx-plugin
docker-compose-plugin
```

Nao usar o script de conveniencia `curl | sh` em producao. A propria Docker o
recomenda apenas para desenvolvimento. Depois da instalacao aprovada:

```bash
sudo systemctl status docker --no-pager
sudo docker version
sudo docker compose version
sudo docker run --rm hello-world
```

O `hello-world` correto imprime a confirmacao e termina com codigo `0`; ele nao
permanece em execucao.

Adicionar uma pessoa ao grupo `docker` concede privilegios equivalentes a root.
A equipe de infraestrutura deve decidir entre `sudo docker`, conta de servico
restrita ou modo rootless. O projeto nao toma essa decisao automaticamente.

## Preparar arquivos sem secrets no Git

O modelo de producao e `.env.docker.production.example`. A infraestrutura deve
copiar para `.env.docker`, trocar `links.example.gov.br` pelo FQDN aprovado e
manter:

```bash
cp .env.docker.production.example .env.docker
```

Depois, revisar o arquivo e manter:

```text
LINKGOV_ENVIRONMENT=production
LINKGOV_API_BIND=127.0.0.1
LINKGOV_BACKUP_PATH=/var/backups/linkgov
```

Gerar secrets somente no servidor:

```bash
sh scripts/docker-init-secrets.sh
```

Para producao, mover os tres arquivos para `/etc/linkgov/secrets`, aplicar
`chmod 600` e ajustar os caminhos em `.env.docker`. O script nunca imprime os
valores.

## Arquitetura executada

```text
Internet/rede municipal
        |
        v
Proxy HTTPS institucional
        |
        v
127.0.0.1:8787 (container LinkGov)
        |-- frontend React
        |-- API Hono
        |-- uploads em volume
        |
        v
PostgreSQL em rede interna, sem porta publicada
```

O container Node serve o frontend compilado e a API na mesma origem. O proxy
municipal encaminha todo o host para `http://127.0.0.1:8787`; ele tambem aplica o
certificado e redireciona HTTP para HTTPS.

## Validar antes de criar containers

```bash
docker compose --env-file .env.docker config --quiet
sh scripts/linux-preflight.sh .env.docker
```

Em uma estacao com Node.js 22, a validacao adicional e:

```bash
DOCKER_ENV_FILE=.env.docker npm run docker:validate
npm run test
npm run build:selfhosted
npm run audit
```

## Criar a stack

Executar somente depois da revisao do preflight e de nova aprovacao humana:

```bash
sudo docker compose --env-file .env.docker build --pull
sudo docker compose --env-file .env.docker up -d
sudo docker compose --env-file .env.docker ps
curl -fsS http://127.0.0.1:8787/api/health
```

O Compose cria banco vazio, aplica migrations, inicia API/frontend e executa o
primeiro backup. Ele nao importa automaticamente o PostgreSQL de homologacao do
Windows. Essa migracao exige plano e aprovacao de DBA.

## Criterios antes de abrir acesso

- `db`, `api` e `backup` estao `healthy`.
- `migrate` terminou com codigo `0`.
- `/api/health` retorna `ok: true` e `authProvider: sim`.
- `/` entrega o frontend e `/admin/pages` usa fallback SPA.
- PostgreSQL nao possui porta publicada.
- HTTPS, HSTS e firewall foram validados pela infraestrutura.
- Login SIM, logout, permissoes, upload e Analiticos passaram em staging.
- Backup foi copiado para outro equipamento e restaurado em ambiente isolado.

## Operacao segura

```bash
sudo docker compose --env-file .env.docker logs --tail=100 api db backup
sudo docker compose --env-file .env.docker ps
sudo docker compose --env-file .env.docker down
```

`down` preserva volumes. Nunca acrescentar `-v` sem plano de exclusao aprovado.

## Fontes oficiais

- Docker Desktop license: https://docs.docker.com/subscription/desktop-license/
- Docker Engine no Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- Docker Compose no Linux: https://docs.docker.com/compose/install/linux/
- Hono no Node.js: https://hono.dev/docs/getting-started/nodejs
