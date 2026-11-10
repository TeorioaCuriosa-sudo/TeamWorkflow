# TeamWorkflow

Quadro de trabalho para uma equipa pequena. Cada pessoa tem o seu espaço com quatro colunas (tarefas mensais, semanais/diárias, em progresso e finalizadas), o mês renova-se sozinho, o que ficou feito fica guardado num histórico e há uma linha temporal de férias e ausências.

É um site estático: HTML, CSS e JavaScript, sem servidor, sem build e sem dependências.

## Como funciona o mês

Na primeira vez que a página abre num mês novo (ou à meia-noite, se estiver aberta):

1. Cada tarefa recorrente ativa volta como nova tarefa mensal, por fazer.
2. As semanais/diárias por concluir e tudo o que estava em progresso passam para o mês novo, com a etiqueta "de nov".
3. O que ficou concluído fica no arquivo do mês onde foi feito (separador Histórico, com exportação CSV para Excel).
4. As mensais que ninguém concluiu ficam no arquivo do mês a que pertenciam.

## Pôr online com o GitHub Pages

```bash
git init -b main
git add .
git commit -m "TeamWorkflow"
git remote add origin https://github.com/<utilizador>/<repositorio>.git
git push -u origin main
```

No repositório: Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`. Fica em `https://<utilizador>.github.io/<repositorio>/`.

Para um subdomínio teu: no DNS cria um `CNAME` (por exemplo `equipa`) a apontar para `<utilizador>.github.io`, e em Settings → Pages → Custom domain escreve `equipa.teudominio.pt` e ativa *Enforce HTTPS*.

Para ver em local: `python3 -m http.server 8080` (ou `npx serve`) dentro da pasta e abre http://localhost:8080. Abrir o `index.html` com duplo clique não funciona, porque os browsers bloqueiam módulos JavaScript em ficheiros locais.

## Onde ficam os dados

Neste momento, no próprio browser (localStorage). Isto significa que cada pessoa vê os seus dados, não os dos colegas. Para já dá para:

- **Exportar** uma cópia em Definições → Dados (ficheiro JSON) e **importar** noutro browser ou computador.
- Exportar cada mês em CSV no Histórico.

Quando a equipa precisar de ver o mesmo quadro ao mesmo tempo, é preciso um sítio partilhado para guardar os dados. O ecrã está separado disso de propósito: só fala com `js/store.js`, através de `store.handle("GET", "/api/state")` e chamadas parecidas. Trocar o `localStorage` por Supabase, Firebase ou uma API própria é mexer nesse ficheiro, e o resto fica igual.

## Configuração

`js/config.js`: fuso horário (que decide quando muda o mês) e feriados locais. Os feriados nacionais, incluindo os que dependem da Páscoa, estão calculados para qualquer ano.

## Ficheiros

```
index.html       página única
style.css        aspeto (claro e escuro automático)
js/app.js        interface: quadro, ausências, histórico, definições
js/store.js      dados e regras: tarefas, renovação mensal, ausências, importar/exportar
js/dates.js      datas como texto "AAAA-MM-DD"
js/util.js       elementos, ícones, feriados nacionais
js/config.js     fuso horário e feriados locais
test/            testes (opcional): npm test
```
