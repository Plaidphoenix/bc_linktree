# Host temporario na maquina Windows

## Escopo

Este modo executa frontend, API e PostgreSQL na maquina atual, sem Cloudflare,
Firebase, Docker Desktop, cadastro externo ou pagamento. Ele serve para
homologacao municipal enquanto o servidor Linux definitivo nao esta disponivel.

```text
Dispositivo na rede 10.170.0.0/22
              |
              v
Nginx HTTP 80 -> HTTPS 443
       |              |
       |              `-- / e arquivos estaticos -> React em dist/
       `-- /api/* -> Node/Hono HTTPS 127.0.0.1:9443
              |
              v
PostgreSQL local 127.0.0.1:5432
```

Somente as portas `80` e `443` devem ser liberadas para a sub-rede local. Node
`9443` fica restrito ao loopback e a porta do PostgreSQL nunca deve ser
publicada para celulares ou outros computadores.
Nesta maquina, `8443` ja pertence a um processo Apache e nao deve ser encerrada
ou reutilizada pelo LinkGov.

## Certificado de homologacao

O projeto pode gerar um certificado autoassinado de 30 dias sem instalar nada
no repositório de confianca do Windows:

```powershell
npm run windows-host:certificate
```

Arquivos privados ficam em `local-data/certificates`, ignorados pelo Git e com
ACL restrita ao usuario atual e `SYSTEM`. O arquivo publico e:

```text
local-data/certificates/linkgov-lan.cer
```

O certificado autoassinado cifra a conexao, mas o navegador nao confia nele por
padrao. Nao digitar credenciais reais do SIM enquanto o navegador exibir aviso
de certificado. A instalacao desse certificado nos dispositivos, ou a emissao
de um certificado pela autoridade certificadora municipal, exige aprovacao da
equipe responsavel.

O service worker que permite abrir uma pagina ja visitada com o host fora do ar
so e habilitado quando o certificado esta realmente confiado pelo sistema. Apenas
clicar em "avancar" no aviso do navegador nao habilita esse recurso.

Para usar um PFX emitido pela prefeitura, informe os dois arquivos sem colocar a
senha na linha de comando:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-windows-host.ps1 start `
  -PfxFile "C:\caminho-protegido\linkgov.pfx" `
  -PfxPassphraseFile "C:\caminho-protegido\linkgov.password"
```

## Iniciar e verificar

Na raiz do projeto:

```powershell
npm run windows-stack:start
npm run windows-stack:status
```

Este e o comando cotidiano depois de ligar ou reiniciar a maquina. Ele preserva
o build existente, inicia Node e Nginx em processos ocultos e valida o estado.
Estado e logs ficam em `local-data`, fora do Git.

Depois de atualizar o codigo, gere o build antes de reiniciar a pilha:

```powershell
npm run build:selfhosted
npm run windows-stack:stop
npm run windows-stack:start
```

URL atual esperada:

```text
https://10.170.1.27
```

Para parar frontend e API sem apagar nem parar o PostgreSQL:

```powershell
npm run windows-stack:stop
```

## Firewall com confirmacao humana

Primeiro visualize a regra, sem alterar o Windows:

```powershell
npm run windows-proxy:http-firewall:preview
npm run windows-proxy:firewall:preview
```

As regras propostas permitem apenas `TCP 80` e `TCP 443` da sub-rede
`10.170.0.0/22`, nos perfis `Domain` e `Private`. Elas nao liberam `5432` nem
`9443`.

Depois da revisao, abra PowerShell como administrador e aplique explicitamente:

```powershell
cd "C:\Users\<usuario-windows>\Documents\linktree - bc 2026"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-windows-lan-firewall.ps1 -Port 80 -Apply
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-windows-lan-firewall.ps1 -Port 443 -Apply
```

O script nao solicita elevacao, nao substitui regra existente e nao altera
roteador, DNS ou firewall externo.

## Teste em outro dispositivo

1. Conectar o dispositivo a rede municipal correspondente.
2. Confirmar que o endereco recebido pertence ao alcance autorizado.
3. Abrir `https://10.170.1.27`.
4. Validar primeiro uma pagina publica, sem credenciais.
5. Usar login somente quando o certificado estiver confiavel e sem aviso.

Se o acesso falhar, registrar apenas horario, dispositivo, URL e mensagem. Nao
enviar senha, cookie, JWT ou conteudo do arquivo `.env.municipal`.

## Nginx para frontend resiliente e API na porta 443

O Nginx termina HTTPS na porta `443`, redireciona `80` para HTTPS, serve o build
React diretamente e encaminha somente `/api/*` para `127.0.0.1:9443`. Se Node
ou PostgreSQL ficarem temporariamente indisponiveis, o frontend continua abrindo
e informa que esta exibindo a ultima copia publica ou administrativa disponivel.

Segundo a documentacao oficial, Nginx para Windows e uma versao beta e nao deve
ser o proxy de producao. O destino definitivo deve usar Nginx em Linux ou o
proxy reverso institucional. Os exemplos de handoff estao em `deploy/nginx`.

O ZIP deve vir de `https://nginx.org/download/`. O script localiza `nginx-*` em
Documentos e usa configuracao isolada. O certificado e a chave PEM ficam em
`local-data/certificates`, ignorados pelo Git e com ACL privada. Nenhuma senha ou
chave e impressa no terminal.

```powershell
npm run windows-proxy:start
npm run windows-proxy:status
```

Antes do primeiro teste em outro dispositivo, visualize as regras das portas 80
e 443:

```powershell
npm run windows-proxy:http-firewall:preview
npm run windows-proxy:firewall:preview
```

A aplicacao da regra exige PowerShell como administrador e aprovacao humana:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/configure-windows-lan-firewall.ps1 -Port 80 -Apply
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/configure-windows-lan-firewall.ps1 -Port 443 -Apply
```

O Nginx nao publica a maquina na internet e nao cria DNS. Para um dominio
interno dedicado, a infraestrutura deve criar um unico registro A, por exemplo
`linkgov-homolog.pmbcsc.sc.gov.br -> 10.170.1.27`, e emitir um certificado que
contenha esse nome. O hostname atual da estacao nao deve ser usado como dominio
do sistema porque resolve tambem para interfaces virtuais locais.

Para parar somente o proxy:

```powershell
npm run windows-proxy:stop
```

## Acesso fora da rede local

Nao fazer encaminhamento direto de porta no roteador para esta estacao. O caminho
recomendado e um proxy reverso HTTPS ou VPN administrado pela prefeitura:

```text
Internet
   |
   v
FQDN + certificado municipal + firewall/WAF
   |
   v
Proxy reverso institucional
   |
   v
10.170.1.27:443
```

A infraestrutura deve aprovar antes de qualquer alteracao:

- FQDN publico;
- DNS;
- certificado e cadeia de confianca;
- regra entre proxy e esta maquina;
- limite de requisicoes e logs sem dados pessoais;
- IP reservado para esta estacao;
- politica de backup e restauracao;
- manutencao, energia e reinicio automatico.

Uma alternativa de tunel externo exigiria cadastro e aceite de termos de um
provedor. Ela nao sera criada automaticamente nem usada sem nova aprovacao.

## Limites operacionais

- PostgreSQL preserva dados confirmados mesmo quando seus processos param. Ele
  nao preserva uma alteracao que nunca chegou ao banco.
- O cache do navegador e somente leitura: nunca finge que uma edicao offline foi
  salva e nunca armazena senha, JWT, usuario ou resposta administrativa da API.
- Com Nginx ativo e API parada, o frontend abre e usa a ultima copia permitida.
- Com a maquina ou o Nginx desligados, somente dispositivos que ja visitaram a
  mesma URL com certificado confiado podem abrir o app shell do service worker.
- Um dispositivo novo nao consegue baixar o site enquanto o host esta desligado.
- Node e Nginx precisam ser iniciados novamente apos reiniciar o Windows com
  `npm run windows-stack:start`. Inicializacao automatica ainda nao foi instalada.
- O certificado de homologacao expira em 30 dias.
- O IP atual pode mudar sem reserva DHCP.
- Backup no mesmo disco nao protege contra perda fisica da maquina.
- Este modo nao substitui servidor Linux, proxy institucional e backup externo.
