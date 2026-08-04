# Host temporario na maquina Windows

## Escopo

Este modo executa frontend, API e PostgreSQL na maquina atual, sem Cloudflare,
Firebase, Docker Desktop, cadastro externo ou pagamento. Ele serve para
homologacao municipal enquanto o servidor Linux definitivo nao esta disponivel.

```text
Dispositivo na rede 10.170.0.0/22
              |
              v
HTTPS 10.170.1.27:9443
              |
              v
Node.js (React + Hono)
              |
              v
PostgreSQL local 127.0.0.1:5432
```

Somente a porta HTTPS `9443` deve ser liberada para a sub-rede local. A porta do
PostgreSQL nunca deve ser publicada para celulares ou outros computadores.
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
npm run windows-host:start
npm run windows-host:status
```

O comando executa novo build, inicia um processo oculto e valida
`/api/health`. Estado e logs ficam em `local-data/runtime`, fora do Git.

URL atual esperada:

```text
https://10.170.1.27:9443
```

Para parar sem afetar o PostgreSQL:

```powershell
npm run windows-host:stop
```

## Firewall com confirmacao humana

Primeiro visualize a regra, sem alterar o Windows:

```powershell
npm run windows-host:firewall:preview
```

A regra proposta permite apenas `TCP 9443` da sub-rede `10.170.0.0/22`, nos
perfis `Domain` e `Private`. Ela nao libera `5432`.

Depois da revisao, abra PowerShell como administrador e aplique explicitamente:

```powershell
cd "C:\Users\52008160840\Documents\linktree - bc 2026"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure-windows-lan-firewall.ps1 -Apply
```

O script nao solicita elevacao, nao substitui regra existente e nao altera
roteador, DNS ou firewall externo.

## Teste em outro dispositivo

1. Conectar o dispositivo a rede municipal correspondente.
2. Confirmar que o endereco recebido pertence ao alcance autorizado.
3. Abrir `https://10.170.1.27:9443`.
4. Validar primeiro uma pagina publica, sem credenciais.
5. Usar login somente quando o certificado estiver confiavel e sem aviso.

Se o acesso falhar, registrar apenas horario, dispositivo, URL e mensagem. Nao
enviar senha, cookie, JWT ou conteudo do arquivo `.env.municipal`.

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
10.170.1.27:9443
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

- Se a maquina desligar, suspender ou perder rede, o sistema fica indisponivel.
- O processo Node precisa ser iniciado novamente apos reiniciar o Windows.
- O certificado de homologacao expira em 30 dias.
- O IP atual pode mudar sem reserva DHCP.
- Backup no mesmo disco nao protege contra perda fisica da maquina.
- Este modo nao substitui servidor Linux, proxy institucional e backup externo.
