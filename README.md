# Teoria Workflow

Plataforma interna da equipa da Teoria Curiosa: quadro de trabalho partilhado, com contas individuais, tópicos e projetos, pedidos de aprovação, avisos por email, chat, estado de cada pessoa, ausências, histórico mensal e modo claro/escuro.

Corre num único processo Node.js com uma base de dados SQLite (um ficheiro). No servidor, a única dependência npm é o `nodemailer`, usado só se configurares o envio de emails. A interface é uma aplicação React + TypeScript + Tailwind (pasta `web/`) que se compila para a pasta `public/`, e é essa pasta já compilada que o servidor entrega: para só usar a plataforma não precisas de compilar nada.

## O que faz

**Workflow.** Uma faixa por pessoa com quatro colunas: *Mensais*, *Semanais / diárias*, *Em progresso* e *Finalizadas*. Cada coluna tem o seu botão **Nova tarefa**. Arrasta cartões entre colunas e entre pessoas, ou usa os botões Iniciar e Concluir. Duas pessoas a editar ao mesmo tempo veem as alterações uma da outra sem recarregar.

**Tópicos e projetos.** Os tópicos são etiquetas coloridas (cada tarefa pode ter várias); os projetos agrupam tarefas (cada tarefa pertence a um, no máximo). Criam-se e apagam-se nas Definições ou diretamente no diálogo da tarefa, e filtram o quadro. Apagar um tópico ou projeto nunca apaga tarefas.

**Atualizações e estado das tarefas.** Cada tarefa tem um fio de atualizações (comentários, mudanças de estado, mudanças de responsável). Quem participa na tarefa recebe um aviso quando alguém atualiza.

**Aprovações.** Em qualquer tarefa há "Pedir aprovação": escolhes quem aprova (um administrador ou um colega) e a tarefa fica "à espera". A pessoa recebe o aviso (e um email, se ativo), aprova ou rejeita com uma nota, e tu és avisado do resultado.

**Pessoas e estado.** Cada pessoa vê quem está online e o estado de cada um (Disponível, Ocupado, Em reunião, Remoto, Em pausa), com mensagem e prazo opcionais (por exemplo, "Ocupado durante 4 horas"). Quando o prazo passa, volta a Disponível. As ausências registadas (férias, formação) aparecem no mesmo sítio.

**Contas e funções.** Cada pessoa entra com o seu email e palavra-passe. Há duas funções: *administrador* e *membro*. Só os administradores adicionam e removem pessoas, repõem palavras-passe e mudam funções. Os membros editam o resto (tarefas, tópicos, projetos, ausências), como antes. Remover uma pessoa não apaga o que ela concluiu (continua no histórico); as tarefas em aberto passam para outra pessoa ou são apagadas, à escolha do administrador.

**Notificações.** O sino do cabeçalho mostra pedidos de aprovação, respostas, atualizações e tarefas atribuídas. Por email, cada pessoa escolhe no seu perfil se quer receber os pedidos de aprovação e/ou as atualizações.

**Chat.** Um canal único para toda a equipa, em direto, com contador de mensagens por ler.

**Ausências, histórico, aspeto.** Linha temporal mensal de férias, ausências e formações (com feriados nacionais); histórico por mês com exportação CSV para Excel; tema claro, escuro ou automático (segue o sistema), escolhido no cabeçalho e guardado em cada browser.

## Como se renova cada mês

A renovação acontece uma única vez por mês, no primeiro minuto do dia 1 (ou na primeira vez que alguém abre a página, se o servidor esteve desligado):

1. Cada tarefa recorrente ativa volta como nova tarefa mensal, por fazer, com o mesmo projeto e tópicos.
2. As tarefas semanais/diárias por concluir e tudo o que estava em progresso passam para o mês novo, com uma etiqueta "de out" a indicar de onde vieram.
3. O que ficou concluído fica no arquivo do mês onde foi feito.
4. As tarefas mensais que ninguém concluiu ficam no arquivo do mês a que pertenciam. Não passam para o mês novo, porque o mês novo já tem a sua cópia.

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

Com `SEED_DEMO=1` (só em base de dados vazia) são criadas três pessoas de exemplo, `ana@exemplo.pt` (administradora), `bruno@exemplo.pt` e `carla@exemplo.pt`, todas com a palavra-passe `demo1234`. Serve só para experimentar: nunca uses `SEED_DEMO` num servidor a sério.

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

A aplicação fica em `127.0.0.1:3000`, só acessível a partir do próprio servidor; um túnel ou proxy inverso (Cloudflare Tunnel, Caddy, nginx…) publica o endereço da equipa com HTTPS. Os dados ficam no volume `teoria-workflow-data`. Para atualizar depois de mudar o código: `docker compose up -d --build`. A imagem leva a pasta `public/` tal como está, por isso, se mexeste na interface, corre antes `npm run build` dentro de `web/`.

O guia completo para instalar num Ubuntu Server em casa, com Docker e Cloudflare Tunnel, fica numa fase seguinte.

## Emails

Sem `SMTP_HOST` a plataforma funciona na mesma; os avisos ficam só dentro dela. Para ligar o envio, define no `.env` o servidor SMTP do teu fornecedor (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, e `SMTP_SECURE=1` se usar a porta 465) e o remetente (`MAIL_FROM`). Define também `APP_URL`: é o endereço que aparece nas ligações "Abrir na plataforma" dos emails.

Depois de arrancar, entra como administrador, vai a **Definições → Email e dados** e usa **Enviar email de teste para mim**. Se falhar, a mensagem de erro do servidor de email aparece ali.

Os emails são enviados em segundo plano: se o servidor de email falhar, a plataforma continua a funcionar e o aviso fica disponível no sino.

## Segurança

As palavras-passe ficam guardadas com *scrypt* (nunca em claro). A sessão fica num cookie `HttpOnly` (`Secure` quando o endereço é https) durante 30 dias; as tentativas de login erradas são limitadas por email e por IP. Mudar a palavra-passe termina as outras sessões da pessoa; remover uma pessoa termina todas as dela. Quem recebe uma palavra-passe temporária é obrigado a escolher outra no primeiro acesso, e até lá não consegue usar mais nada.

Põe sempre HTTPS à frente (o túnel ou o proxy trata disso) e define `TRUST_PROXY=1` quando houver um proxy, para o limite de tentativas usar o IP real.

## Dados e cópias de segurança

Tudo está em `data/teoria-workflow.db` (SQLite). A aplicação guarda uma cópia completa por dia em `data/backups/` e mantém as últimas 30 (`BACKUP_KEEP`). Para restaurar, pára a aplicação e substitui `teoria-workflow.db` por uma dessas cópias. Convém copiar de vez em quando a pasta `backups/` para fora do servidor. Como as cópias são ficheiros SQLite completos, incluem as palavras-passe (já cifradas): trata-as com o mesmo cuidado que a base de dados.

Em Docker os dados vivem no volume. Para tirar a pasta de lá:

```bash
docker compose cp teoria-workflow:/data ./copia-dados
```

Em **Definições → Email e dados** (só administradores) há também um botão que descarrega tudo em JSON, sem palavras-passe nem sessões, e cada mês pode ser exportado em CSV a partir do Histórico.

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
| `TRUST_PROXY` | vazia | `1` atrás de proxy ou túnel, para limitar logins por IP real. |
| `COOKIE_SECURE` | vazia | `1` força o cookie `Secure` mesmo sem `APP_URL` https. |
| `PRESENCE_GRACE_MS` | `6000` | Tempo antes de alguém aparecer offline depois de fechar ou recarregar a página. |
| `SEED_DEMO` | vazia | `1` carrega dados de exemplo numa base de dados vazia (só para testar). |

## Estrutura

```
server.js          servidor HTTP, sessões, sincronização em direto (SSE), manutenção diária, --set-password
lib/db.js          esquema SQLite e migrações, renovação mensal
lib/people.js      contas, funções, estado, palavras-passe, remoção de pessoas
lib/repo.js        tarefas, recorrentes, ausências, histórico, exportações
lib/tags.js        tópicos e projetos
lib/activity.js    atualizações, aprovações, notificações
lib/chat.js        chat da equipa
lib/notify.js      avisos dentro da plataforma e fila de emails
lib/mail.js        envio por SMTP e modelo dos emails
lib/state.js       o estado que a interface recebe, à medida de quem está a ver
lib/routes.js      rotas da API
lib/seed.js        primeiro administrador e dados de exemplo
public/            a interface já compilada (gerada por `npm run build` em web/; não se edita à mão)
web/               código da interface (React + TypeScript + Tailwind)
  src/pages/         as páginas: Workflow, Ausências, Histórico, Chat, Definições, Login
  src/features/      o quadro, a tarefa, o perfil, as ausências, as definições
  src/ui/            peças reutilizáveis: botões, campos, janelas, avisos, etiquetas
  src/layout/        barra lateral, cabeçalho, navegação no telemóvel, sino
  src/state/         sessão, dados em direto, chat, janelas, tema, rotas
  src/api/           pedidos ao servidor e os tipos dos dados
  src/index.css      cores (claro/escuro) e estilos base
test/              testes automáticos (node --test)
```

## Testes

```bash
npm test                         # servidor (na raiz)
cd web && npm run typecheck      # verifica os tipos da interface
```

Cobrem contas e sessões, funções e permissões, a renovação mensal (incluindo meses saltados), o quadro, tópicos e projetos, atualizações, aprovações, notificações, emails, chat, presença e estado, a sincronização em direto, as cópias diárias e a persistência entre reinícios.

## Limites conhecidos

O arquivo de meses anteriores é só de leitura. As ausências não têm meios-dias. Os feriados nacionais estão calculados para qualquer ano, mas os municipais têm de ser indicados em `EXTRA_HOLIDAYS`. O chat é um canal único (sem mensagens privadas nem anexos). O limite é de 12 pessoas por instalação.
