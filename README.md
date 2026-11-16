# Teoria Workflow

Plataforma interna da equipa da Teoria Curiosa: quadro de trabalho partilhado, com contas individuais, projetos e tópicos com ficheiros anexados, modelos de tarefas mensais e semanais, pedidos de aprovação, avisos por email, chat, estado de cada pessoa, mensagens privadas, calendário com reuniões e ausências, histórico mensal e modo claro/escuro.

Corre num único processo Node.js com uma base de dados SQLite (um ficheiro). No servidor, a única dependência npm é o `nodemailer`, usado só se configurares o envio de emails. A interface é uma aplicação React + TypeScript + Tailwind (pasta `web/`) que se compila para a pasta `public/`, e é essa pasta já compilada que o servidor entrega: para só usar a plataforma não precisas de compilar nada.

## O que faz

**Workflow.** Uma faixa por pessoa com três colunas: *Pendentes*, *Em progresso* e *Finalizadas*. Em *Pendentes* caem as tarefas por começar, as mensais que voltam todos os meses e os **pedidos** que os colegas fazem a essa pessoa (o cartão mostra "Pedido por …"). Na tua faixa, cada coluna tem o botão **Nova tarefa** (com atalho para projeto, tópicos e urgência); na faixa dos outros, o botão é **Pedir tarefa** e só existe em Pendentes. Arrasta cartões entre colunas da tua faixa, ou usa os botões Iniciar e Concluir. Duas pessoas a editar ao mesmo tempo veem as alterações uma da outra sem recarregar.

**Pedidos de tarefa.** Qualquer pessoa pode pedir uma tarefa a qualquer outra (colegas, comandantes ou administradores). O pedido fica em Pendentes de quem o recebe, que fica a saber quem pediu e decide o que fazer: começar, concluir ou recusar (apagar, e quem pediu é avisado). Enquanto o destinatário não lhe pega, quem pediu pode corrigir o pedido (título, notas, prazo, urgência, projeto, tópicos, e até a pessoa, se se enganou) ou retirá-lo. Depois disso só pode comentar. Quem pediu é avisado quando o pedido avança.

**Urgência.** Cada tarefa tem um grau: *Normal*, *Urgente*, *Prioritário* ou *Business critical*. Aparece num selo no cartão e filtra-se no quadro.

**Tópicos e projetos.** Os tópicos são etiquetas coloridas (cada tarefa pode ter várias); os projetos agrupam tarefas (cada tarefa pertence a um, no máximo). Toda a gente os pode criar (na página Projetos, nas Definições ou no diálogo da tarefa) e escolher nas suas tarefas; só os comandantes e os administradores mudam o nome ou a cor e os apagam. Apagar um tópico ou projeto nunca apaga tarefas.

**Projetos e ficheiros.** A página **Projetos** (no menu) mostra todos os projetos e tópicos em cartões, com as tarefas concluídas deste mês e o número de ficheiros. Abrir um cartão mostra os **ficheiros** (documentos, imagens, vídeos, áudio, PDF, o que for preciso), as tarefas do mês que o usam (clicar abre a tarefa) e, para comandantes e administradores, o nome, a cor e o botão de apagar. Também as **tarefas** e os **modelos** têm a sua secção de ficheiros. Qualquer pessoa anexa: com o botão *Anexar ficheiros* ou arrastando-os para a caixa, vários de uma vez, com barra de progresso. As imagens aparecem em miniatura, os vídeos e o áudio abrem num leitor, os PDF e os textos abrem num separador novo e tudo o resto descarrega. Apaga um ficheiro quem o enviou, e os comandantes e administradores apagam qualquer um; numa tarefa, quem a tem também remove qualquer ficheiro dela, mesmo o que outra pessoa anexou (o caixote ao lado do ícone de descarregar). Cada ficheiro pode ter até `MAX_UPLOAD_MB` (50 MB à partida); a tarefa regista no fio de atualizações quem anexou o quê, e o cartão mostra um clipe com o número de ficheiros. Por segurança, o servidor decide o tipo de cada ficheiro pela extensão (nunca pelo que o browser diz), só abre no próprio browser imagens, vídeos, áudio, PDF e texto simples, e faz descarregar o resto (incluindo HTML e SVG), sempre isolado de qualquer script.

**Modelos de tarefas.** Para as tarefas que se repetem todos os meses ou todas as semanas, em vez de escrever sempre o mesmo: cria-se um **modelo** (título, notas, projeto, tópicos, urgência e ficheiros) e aplica-se com um clique no cartão de quem vai fazer. Há dois botões, *Mensais* e *Semanais*, na linha de filtros do Workflow, logo a seguir a *Equipa* e às pessoas (no telemóvel ficam por baixo delas), que abrem a página de modelos, onde se criam, alteram e aplicam ("Aplicar a…" e a pessoa). Em *Pendentes* de cada cartão há ainda o atalho **Modelo**, que lista os modelos e cria a tarefa logo ali. As regras são as de qualquer tarefa nova: no teu cartão (ou sendo administrador) cria-se a tarefa; no cartão de outra pessoa o que vai é um **pedido**. Um modelo mensal cria uma tarefa mensal, um semanal cria uma tarefa semanal ou diária, e os ficheiros do modelo seguem **copiados** para a tarefa (apagar o modelo depois não os tira das tarefas já criadas). Quem criou o modelo, os comandantes e os administradores alteram-no e apagam-no; os outros veem-no e aplicam-no. As tarefas recorrentes que voltam sozinhas todos os meses continuam nas Definições e funcionam como antes.

**Atualizações e estado das tarefas.** Cada tarefa tem um fio de atualizações (comentários, mudanças de estado, mudanças de responsável). Quem participa na tarefa recebe um aviso quando alguém atualiza.

**Aprovações.** Em qualquer tarefa tua há "Pedir aprovação": escolhes quem aprova (um comandante, um administrador ou um colega) e a tarefa fica "à espera". A pessoa recebe o aviso (e um email, se ativo), aprova ou rejeita com uma nota, e tu és avisado do resultado.

**Pessoas e estado.** Cada pessoa vê quem está online e o estado de cada um (Disponível, Ocupado, Em reunião, Remoto, Em pausa), com mensagem e prazo opcionais (por exemplo, "Ocupado durante 4 horas"). Quando o prazo passa, volta a Disponível. As ausências registadas (férias, formação) aparecem no mesmo sítio.

**Contas e funções.** Cada pessoa entra com o seu email e palavra-passe. Há cinco funções:

- *Administrador*: pode tudo, incluindo mexer nas tarefas de qualquer pessoa, passá-las de uma pessoa para outra, remover pessoas, repor palavras-passe, mudar funções e descarregar a cópia JSON.
- *Comandante*: altera e apaga projetos e tópicos (criar, toda a gente pode), adiciona pessoas (como membro, marketing ou informática), pede tarefas a toda a gente e dá aprovações. Não mexe nas tarefas dos outros.
- *Marketing* e *Informática*: acesso igual ao de um membro (a função serve para a equipa se situar).
- *Membro*: mexe nas suas tarefas, pede tarefas aos outros, comenta em qualquer tarefa e cria e escolhe projetos e tópicos.

Fora os administradores, ninguém mexe nas tarefas de outra pessoa: só pode comentar e pedir-lhe tarefas novas. Remover uma pessoa não apaga o que ela concluiu (continua no histórico); as tarefas em aberto passam para outra pessoa ou são apagadas, à escolha do administrador.

**Notificações.** O sino do cabeçalho mostra pedidos de aprovação, respostas, atualizações e tarefas atribuídas. Por email, cada pessoa escolhe no seu perfil se quer receber os pedidos de aprovação e/ou as atualizações.

**Chat e mensagens privadas.** A secção Chat tem à esquerda a lista de conversas: o chat da **Equipa** (um canal para toda a gente) e uma conversa privada com cada pessoa que tenha conta. Tudo chega em direto, sem recarregar. Para abrir uma conversa privada basta clicar na **foto** da pessoa, na barra lateral, no cabeçalho da faixa dela no Workflow, na faixa de presença do telemóvel ou na lista de Definições (a tua própria foto não faz nada). No telemóvel, as conversas aparecem numa faixa por cima da mensagem. As mensagens por ler aparecem num contador por cima da foto da pessoa e no menu Chat (que soma as da equipa e as privadas), e também no título do separador; não há sino nem email para mensagens. **Só os dois da conversa a leem**: nem os administradores a veem, e as mensagens privadas não entram na exportação JSON (só as cópias diárias da base de dados, que ficam no servidor, as contêm). Cada pessoa só apaga as suas próprias mensagens, e a mensagem desaparece para os dois. Quando uma pessoa é removida, as conversas privadas dela são apagadas.

**Calendário e reuniões.** A secção Calendário (antes "Ausências") junta, num só sítio, as reuniões e as férias, ausências e formações da equipa, com os feriados nacionais. Vê-se o mês em grelha (clicar num dia mostra o que há nesse dia e deixa marcar uma reunião nele) ou a linha do tempo por pessoa. Qualquer pessoa marca uma reunião: título, dia, hora de início e de fim, participantes (por defeito a equipa toda), notas e o **link da videochamada**. Cola-se o link do Google Meet, Teams ou Zoom (se faltar o `https://`, é acrescentado; só se aceitam endereços http e https) e todos os participantes passam a ver o botão **Entrar na reunião**, que abre a chamada num separador novo. A plataforma não faz videochamadas por si: usa o serviço que a equipa já tem. Quem foi convidado recebe um aviso no sino (e email, se tiver ligado os emails de atualizações), com ligação direta para a reunião; mudar o dia, a hora ou o link avisa de novo, e cancelar também. Só quem marcou a reunião e os administradores a alteram ou cancelam; os outros veem-na e entram. O endereço antigo `#ausencias` continua a funcionar.

**Histórico, aspeto.**  histórico por mês com exportação CSV para Excel; tema claro, escuro ou automático (segue o sistema), escolhido no cabeçalho e guardado em cada browser.

## Como se renova cada mês

A renovação acontece uma única vez por mês, no primeiro minuto do dia 1 (ou na primeira vez que alguém abre a página, se o servidor esteve desligado):

1. Tudo o que ficou por concluir (mensais, semanais, pedidos e o que estava em progresso) passa para o mês novo, com uma etiqueta "de out" a indicar de onde veio. O Histórico regista quantas tarefas de cada mês transitaram.
2. Cada tarefa recorrente ativa volta como nova tarefa mensal em Pendentes, com o mesmo projeto e tópicos, a não ser que a do mês anterior tenha ficado por concluir: nesse caso é essa que continua (não nasce uma repetida).
3. O que ficou concluído fica no arquivo do mês onde foi feito.

## Arrancar em local

Precisa de Node.js 22.13 ou superior.

```bash
npm install                      # instala o nodemailer
SEED_DEMO=1 npm start            # com dados de exemplo
npm start                        # arranque limpo
```

No Windows, o mais simples é dar duplo clique em `iniciar-demo.bat` (na pasta do projeto): arranca a plataforma com dados de exemplo e abre o browser. É preciso ter o Node.js instalado. Importante: a interface já não abre com duplo clique no `index.html`, porque precisa do servidor por trás (login, base de dados, chat em direto); tem de se abrir sempre pelo endereço do servidor.

Se preferires a linha de comandos no PowerShell, a variável define-se assim: `$env:SEED_DEMO=1; npm start`.

Abre http://localhost:3000. No primeiro arranque é criado o administrador definido em `ADMIN_EMAIL` / `ADMIN_NAME`. Se não definires `ADMIN_PASSWORD`, é gerada uma palavra-passe temporária e escrita no terminal (só nessa vez); a plataforma pede que a mudes no primeiro acesso.

Com `SEED_DEMO=1` (só em base de dados vazia) são criadas três pessoas de exemplo, `ana@exemplo.pt` (administradora), `bruno@exemplo.pt` (comandante) e `carla@exemplo.pt` (marketing), todas com a palavra-passe `demo1234`. Serve só para experimentar: nunca uses `SEED_DEMO` num servidor a sério.

Se alguém perder o acesso e não houver outro administrador, define uma nova palavra-passe a partir do servidor:

```bash
node server.js --set-password pessoa@exemplo.pt nova-palavra-passe
# em Docker:
docker compose exec teoria-workflow node server.js --set-password pessoa@exemplo.pt nova-palavra-passe
```

A pessoa terá de a mudar no acesso seguinte.

## Mexer na interface

O código da interface está na pasta `web/`. Só precisas disto se quiseres alterar o aspeto ou o comportamento; para usar a plataforma, a pasta `public/` já está compilada.

```bash
cd web
npm install                      # instala React, Tailwind, Vite… (só uma vez)
npm run dev                      # abre http://localhost:5173 com recarga instantânea
npm run build                    # verifica os tipos e compila para ../public
```

Os logos da Teoria Curiosa estão em `web/src/assets/brand` (versão escura para fundos claros, branca para fundos escuros) e o ícone do separador do browser em `web/public`. As cores da marca (dourado `#CC8F1C` e carvão `#2F2F32`) estão todas no início de `web/src/index.css`, no modo claro e no escuro: mudar uma cor ali muda-a em toda a plataforma. O verde ficou reservado para "em direto", "online" e ações positivas como aprovar.

Com `npm run dev` o servidor da plataforma tem de estar a correr noutro terminal (`SEED_DEMO=1 npm start`, porta 3000): a interface em desenvolvimento fala com ele. Depois de compilar com `npm run build`, a pasta `public/` fica atualizada e é isso que se publica.

## Servidor com Docker

```bash
cp .env.example .env             # e edita: APP_URL, ADMIN_EMAIL, ADMIN_NAME, SMTP_*
docker compose up -d --build
docker compose logs teoria-workflow   # mostra a palavra-passe temporária do administrador
```

A aplicação fica em `127.0.0.1:3000`, só acessível a partir do próprio servidor; um túnel ou proxy inverso (Cloudflare Tunnel, Caddy, nginx…) publica o endereço da equipa com HTTPS. Os dados (base de dados, cópias e ficheiros anexados) ficam no volume `teoria-workflow-data`. Se o túnel ou o proxy limitar o tamanho de cada pedido, o limite de ficheiros tem de ficar abaixo dele: os planos gratuitos do Cloudflare aceitam 100 MB por pedido, por isso o predefinido de 50 MB (`MAX_UPLOAD_MB`) cabe. Com nginx, acrescenta `client_max_body_size` ao valor que escolheres. Para atualizar depois de mudar o código: `docker compose up -d --build`. A imagem leva a pasta `public/` tal como está, por isso, se mexeste na interface, corre antes `npm run build` dentro de `web/`.

O guia completo para instalar num Ubuntu Server em casa, com Docker e Cloudflare Tunnel, fica numa fase seguinte.

## Emails

Sem `SMTP_HOST` a plataforma funciona na mesma; os avisos ficam só dentro dela. Para ligar o envio, define no `.env` o servidor SMTP do teu fornecedor (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, e `SMTP_SECURE=1` se usar a porta 465) e o remetente (`MAIL_FROM`). Define também `APP_URL`: é o endereço que aparece nas ligações "Abrir na plataforma" dos emails.

Depois de arrancar, entra como administrador, vai a **Definições → Email e dados** e usa **Enviar email de teste para mim**. Se falhar, a mensagem de erro do servidor de email aparece ali.

Os emails são enviados em segundo plano: se o servidor de email falhar, a plataforma continua a funcionar e o aviso fica disponível no sino.

## Segurança

As palavras-passe ficam guardadas com *scrypt* (nunca em claro). A sessão fica num cookie `HttpOnly` (`Secure` quando o endereço é https) durante 30 dias; as tentativas de login erradas são limitadas por email e por IP. Mudar a palavra-passe termina as outras sessões da pessoa; remover uma pessoa termina todas as dela. Quem recebe uma palavra-passe temporária é obrigado a escolher outra no primeiro acesso, e até lá não consegue usar mais nada.

Põe sempre HTTPS à frente (o túnel ou o proxy trata disso) e define `TRUST_PROXY=1` quando houver um proxy, para o limite de tentativas usar o IP real.

## Dados e cópias de segurança

Tudo está em `data/teoria-workflow.db` (SQLite). A aplicação guarda uma cópia completa por dia em `data/backups/` e mantém as últimas 30 (`BACKUP_KEEP`). Para restaurar, pára a aplicação e substitui `teoria-workflow.db` por uma dessas cópias. Os **ficheiros anexados** ficam em `data/uploads/` (no Docker, dentro do mesmo volume) e **não** entram nas cópias diárias da base de dados nem na exportação JSON, que só guardam a lista deles: para uma cópia completa, guarda a pasta `data/` inteira (ou o volume), não só `backups/`. Convém copiar de vez em quando a pasta `backups/` e a `uploads/` para fora do servidor. Como as cópias são ficheiros SQLite completos, incluem as palavras-passe (já cifradas): trata-as com o mesmo cuidado que a base de dados.

Em Docker os dados vivem no volume. Para tirar a pasta de lá:

```bash
docker compose cp teoria-workflow:/data ./copia-dados
```

Em **Definições → Email e dados** e no Histórico (só administradores) há também um botão que descarrega tudo em JSON, sem palavras-passe nem sessões; o servidor recusa o pedido a quem não for administrador. Cada mês pode ser exportado em CSV a partir do Histórico, por qualquer pessoa.

## Variáveis de ambiente

| Variável | Predefinição | Para quê |
|---|---|---|
| `APP_URL` | `http://localhost:PORT` | Endereço público; usado nos emails e para marcar o cookie como seguro. |
| `ADMIN_EMAIL` | `admin@teoria.local` | Email do primeiro administrador (só se ainda não existir nenhum). |
| `ADMIN_NAME` | `Administrador` | Nome do primeiro administrador. |
| `ADMIN_PASSWORD` | gerada | Palavra-passe inicial do primeiro administrador (mín. 8 caracteres). |
| `SMTP_HOST` | vazia | Servidor de email. Vazia = emails desligados. |
| `SMTP_PORT` | `587` (`465` com `SMTP_SECURE=1`) | Porta SMTP. |
| `SMTP_SECURE` | vazia | `1` para TLS direto (porta 465). |
| `SMTP_USER` / `SMTP_PASS` | vazias | Credenciais SMTP. |
| `MAIL_FROM` | `Teoria Workflow <SMTP_USER>` | Remetente dos emails. |
| `PORT` | `3000` | Porta HTTP. |
| `DATA_DIR` | `./data` | Onde ficam a base de dados e as cópias. |
| `APP_TZ` | `Europe/Lisbon` | Fuso horário que decide quando muda o mês. |
| `EXTRA_HOLIDAYS` | vazia | Feriados locais, `AAAA-MM-DD` separados por vírgulas. |
| `BACKUP_KEEP` | `30` | Número de cópias diárias a manter. |
| `MAX_UPLOAD_MB` | `50` | Tamanho máximo de cada ficheiro anexado, em MB. A interface avisa antes de enviar e o servidor recusa o que passar. |
| `TRUST_PROXY` | vazia | `1` atrás de proxy ou túnel, para limitar logins por IP real. |
| `COOKIE_SECURE` | vazia | `1` força o cookie `Secure` mesmo sem `APP_URL` https. |
| `PRESENCE_GRACE_MS` | `6000` | Tempo antes de alguém aparecer offline depois de fechar ou recarregar a página. |
| `SEED_DEMO` | vazia | `1` carrega dados de exemplo numa base de dados vazia (só para testar). |

## Estrutura

```
server.js          servidor HTTP, sessões, sincronização em direto (SSE), manutenção diária, --set-password
lib/db.js          esquema SQLite e migrações, renovação mensal
lib/people.js      contas, funções, estado, palavras-passe, remoção de pessoas
lib/perms.js       funções e permissões (quem mexe em quê), urgências
lib/repo.js        tarefas, recorrentes, ausências, histórico, exportações
lib/meetings.js    reuniões do calendário: validação do link, participantes, avisos
lib/files.js       ficheiros anexados: envio em streaming, tipos, descarga, limites, limpeza de órfãos
lib/templates.js   modelos de tarefas mensais e semanais e a sua aplicação num cartão
lib/tags.js        tópicos e projetos
lib/activity.js    atualizações, aprovações, notificações
lib/chat.js        chat da equipa
lib/direct.js      mensagens privadas: só os dois as leem, contadores, marcar como lidas
lib/notify.js      avisos dentro da plataforma e fila de emails
lib/mail.js        envio por SMTP e modelo dos emails
lib/state.js       o estado que a interface recebe, à medida de quem está a ver
lib/routes.js      rotas da API
lib/seed.js        primeiro administrador e dados de exemplo
public/            a interface já compilada (gerada por `npm run build` em web/; não se edita à mão)
web/               código da interface (React + TypeScript + Tailwind)
  src/pages/         as páginas: Workflow, Calendário, Projetos, Modelos, Histórico, Chat, Definições, Login
  src/features/      o quadro, a tarefa, os ficheiros, os projetos, os modelos, o perfil, o chat e as pessoas, o calendário e as ausências, as definições
  src/ui/            peças reutilizáveis: botões, campos, janelas, avisos, etiquetas
  src/layout/        barra lateral, cabeçalho, navegação no telemóvel, sino
  src/state/         sessão, dados em direto, chat da equipa, mensagens privadas, janelas, tema, rotas
  src/api/           pedidos ao servidor e os tipos dos dados
  src/index.css      cores (claro/escuro) e estilos base
test/              testes automáticos (node --test)
```

## Testes

```bash
npm test                         # servidor (na raiz)
cd web && npm run typecheck      # verifica os tipos da interface
```

Cobrem contas e sessões, funções e permissões (comandante, marketing, informática), pedidos de tarefa entre pessoas, urgência, as reuniões do calendário (link, participantes, avisos, permissões), os ficheiros anexados (envio, tipos, descarga e Range, limite de tamanho, permissões, limpeza de órfãos), os modelos de tarefas (permissões e aplicação, incluindo pedidos), a migração de bases de dados antigas, a renovação mensal (incluindo meses saltados), o quadro, tópicos e projetos, atualizações, aprovações, notificações, emails, chat da equipa e mensagens privadas (privacidade, contadores, entrega só aos dois), presença e estado, a sincronização em direto, as cópias diárias e a persistência entre reinícios.

## Limites conhecidos

O arquivo de meses anteriores é só de leitura. As ausências não têm meios-dias. As reuniões duram um único dia, não se repetem e não têm sala de vídeo própria: o link aponta para o Meet, Teams, Zoom ou outro serviço; a plataforma não envia convites de calendário (ficheiro .ics) nem lembretes antes da hora. Os feriados nacionais estão calculados para qualquer ano, mas os municipais têm de ser indicados em `EXTRA_HOLIDAYS`. O chat e as mensagens privadas são só de texto (sem anexos, sem editar mensagens, sem conversas de grupo). As cópias diárias da base de dados contêm as mensagens privadas, por isso guarda-as com cuidado, tal como a base de dados. Os ficheiros não têm versões nem pré-visualização de documentos Office (descarregam), cada projeto, tópico, tarefa ou modelo aceita até 100 ficheiros, e há no máximo 80 modelos. O limite é de 12 pessoas por instalação.
