import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { setup, TRIO, ADMIN } from './helpers.js';
import { MIGRATIONS } from '../lib/db.js';

// Ids: 1 = administrador, 2 = Ana, 3 = Bruno.
const team = (opts = {}) => setup({ people: TRIO, ...opts });

test('estado inicial: o administrador criado no arranque e o mês atual aberto', async () => {
  const t = await setup();
  const { data } = await t.call('GET', '/api/state');
  assert.equal(data.members.length, 1);
  assert.equal(data.members[0].role, 'admin');
  assert.equal(data.me.email, ADMIN.email);
  assert.equal(data.currentMonth, '2026-10');
  assert.equal(data.month, '2026-10');
  assert.equal(data.archived, false);
});

test('criar, mover (estado, pessoa) e apagar tarefas', async () => {
  const t = await team();
  const created = await t.call('POST', '/api/tasks', { member_id: 1, title: '  Rever proposta ', kind: 'flex' });
  assert.equal(created.status, 201);
  assert.equal(created.data.title, 'Rever proposta');
  assert.equal(created.data.status, 'todo');

  const doing = await t.call('PATCH', `/api/tasks/${created.data.id}`, { status: 'doing' });
  assert.equal(doing.data.status, 'doing');
  assert.ok(doing.data.started_at);

  const done = await t.call('PATCH', `/api/tasks/${created.data.id}`, { status: 'done', member_id: 2 });
  assert.equal(done.data.member_id, 2);
  assert.ok(done.data.done_at);

  const back = await t.call('PATCH', `/api/tasks/${created.data.id}`, { status: 'todo' });
  assert.equal(back.data.done_at, null);

  assert.equal((await t.call('DELETE', `/api/tasks/${created.data.id}`)).status, 200);
  assert.equal((await t.call('DELETE', `/api/tasks/${created.data.id}`)).status, 404);
});

test('validação rejeita título vazio, tipo inválido, pessoa inexistente e datas inválidas', async () => {
  const t = await team();
  assert.equal((await t.call('POST', '/api/tasks', { member_id: 1, title: '   ' })).status, 400);
  assert.equal((await t.call('POST', '/api/tasks', { member_id: 1, title: 'x', kind: 'weekly' })).status, 400);
  assert.equal((await t.call('POST', '/api/tasks', { member_id: 99, title: 'x' })).status, 400);
  assert.equal((await t.call('POST', '/api/tasks', { member_id: 1, title: 'x', due: '2026-02-31' })).status, 400);
  assert.equal((await t.call('POST', '/api/tasks', { member_id: 1, title: 'x'.repeat(201) })).status, 400);
});

test('ordenação: soltar antes de outra tarefa coloca-a imediatamente antes', async () => {
  const t = await team();
  const mk = async (title) => (await t.call('POST', '/api/tasks', { member_id: 1, title })).data;
  const a = await mk('A'); await mk('B'); const c = await mk('C');
  await t.call('PATCH', `/api/tasks/${c.id}`, { before_id: a.id });
  const { data } = await t.call('GET', '/api/state');
  assert.deepEqual(data.tasks.filter((x) => x.member_id === 1).map((x) => x.title), ['C', 'A', 'B']);
});

test('recorrentes: nova tarefa recorrente aparece já neste mês', async () => {
  const t = await team();
  const rec = await t.call('POST', '/api/recurring', { member_id: 1, title: 'Fecho mensal' });
  assert.equal(rec.status, 201);
  const { data } = await t.call('GET', '/api/state');
  const inst = data.tasks.find((x) => x.recurring_id === rec.data.id);
  assert.ok(inst);
  assert.equal(inst.kind, 'monthly');
  assert.equal(inst.status, 'todo');
});

test('renovação mensal: transitam semanais/em progresso; mensais por fazer ficam no arquivo; recorrentes renascem', async () => {
  const t = await team();
  const rec = (await t.call('POST', '/api/recurring', { member_id: 1, title: 'Relatório mensal' })).data;
  const rec2 = (await t.call('POST', '/api/recurring', { member_id: 2, title: 'Faturação' })).data;
  const flexTodo = (await t.call('POST', '/api/tasks', { member_id: 1, title: 'Semanal por fazer', kind: 'flex' })).data;
  const flexDone = (await t.call('POST', '/api/tasks', { member_id: 1, title: 'Semanal feita', kind: 'flex', status: 'done' })).data;
  const monthlyDoing = (await t.call('POST', '/api/tasks', { member_id: 2, title: 'Mensal a meio', kind: 'monthly', status: 'doing' })).data;

  const state1 = (await t.call('GET', '/api/state')).data;
  const reportInst = state1.tasks.find((x) => x.recurring_id === rec.id);
  await t.call('PATCH', `/api/tasks/${reportInst.id}`, { status: 'done' });
  const billingInst = state1.tasks.find((x) => x.recurring_id === rec2.id);

  t.setNow('2026-11-02T09:00:00Z');
  const nov = (await t.call('GET', '/api/state')).data;
  assert.equal(nov.currentMonth, '2026-11');
  const byTitle = (title) => nov.tasks.filter((x) => x.title === title);

  assert.equal(byTitle('Semanal por fazer')[0].id, flexTodo.id);
  assert.equal(byTitle('Mensal a meio')[0].id, monthlyDoing.id);
  assert.equal(byTitle('Mensal a meio')[0].origin_month, '2026-10');
  assert.equal(byTitle('Semanal feita').length, 0);
  assert.equal(byTitle('Relatório mensal').length, 1);
  assert.equal(byTitle('Relatório mensal')[0].status, 'todo');
  assert.equal(byTitle('Relatório mensal')[0].month, '2026-11');
  assert.equal(byTitle('Faturação').length, 1);
  assert.notEqual(byTitle('Faturação')[0].id, billingInst.id);

  const oct = (await t.call('GET', '/api/state?month=2026-10')).data;
  assert.equal(oct.archived, true);
  assert.ok(oct.tasks.find((x) => x.id === flexDone.id));
  assert.ok(oct.tasks.find((x) => x.id === reportInst.id && x.status === 'done'));
  assert.ok(oct.tasks.find((x) => x.id === billingInst.id && x.status === 'todo'));
  assert.equal(oct.tasks.find((x) => x.id === flexTodo.id), undefined);

  const again = (await t.call('GET', '/api/state')).data;
  assert.equal(again.tasks.length, nov.tasks.length, 'idempotente: voltar a pedir não duplica nada');
});

test('renovação ao saltar vários meses: as tarefas em aberto vão para o mês atual', async () => {
  const t = await team();
  const flex = (await t.call('POST', '/api/tasks', { member_id: 3, title: 'Antiga', kind: 'flex' })).data;
  t.setNow('2027-01-05T09:00:00Z');
  assert.equal((await t.call('GET', '/api/state')).status, 401, 'a sessão caduca ao fim de 30 dias sem uso');
  await t.admin.login(ADMIN.email, ADMIN.password);
  const jan = (await t.call('GET', '/api/state')).data;
  assert.equal(jan.currentMonth, '2027-01');
  assert.equal(jan.tasks.find((x) => x.id === flex.id).month, '2027-01');
  assert.equal((await t.call('GET', '/api/state?month=2030-01')).data.month, '2027-01');
});

test('apagar recorrente remove só a cópia por fazer deste mês', async () => {
  const t = await team();
  const r1 = (await t.call('POST', '/api/recurring', { member_id: 1, title: 'R1' })).data;
  const r2 = (await t.call('POST', '/api/recurring', { member_id: 1, title: 'R2' })).data;
  const s = (await t.call('GET', '/api/state')).data;
  await t.call('PATCH', `/api/tasks/${s.tasks.find((x) => x.recurring_id === r2.id).id}`, { status: 'doing' });
  await t.call('DELETE', `/api/recurring/${r1.id}`);
  await t.call('DELETE', `/api/recurring/${r2.id}`);
  const after = (await t.call('GET', '/api/state')).data;
  assert.equal(after.tasks.find((x) => x.title === 'R1'), undefined);
  const kept = after.tasks.find((x) => x.title === 'R2');
  assert.ok(kept && kept.status === 'doing' && kept.recurring_id === null);
});

test('pessoa fora do quadro não gera recorrentes; tem de ficar uma pessoa visível', async () => {
  const t = await team();
  await t.call('POST', '/api/recurring', { member_id: 3, title: 'Tarefa do Bruno' });
  await t.call('PATCH', '/api/members/3', { active: false });
  t.setNow('2026-11-03T09:00:00Z');
  const nov = (await t.call('GET', '/api/state')).data;
  assert.equal(nov.tasks.filter((x) => x.title === 'Tarefa do Bruno').length, 0);
  await t.call('PATCH', '/api/members/2', { active: false });
  assert.equal((await t.call('PATCH', '/api/members/1', { active: false })).status, 400);
});

test('ausências: criar, validar intervalo, editar e apagar (qualquer pessoa)', async () => {
  const t = await team();
  const ok = await t.users.Ana.call('POST', '/api/absences', { member_id: 3, start_date: '2026-10-20', end_date: '2026-10-24', type: 'ferias' });
  assert.equal(ok.status, 201);
  assert.equal((await t.call('POST', '/api/absences', { member_id: 1, start_date: '2026-10-24', end_date: '2026-10-20' })).status, 400);
  assert.equal((await t.call('POST', '/api/absences', { member_id: 1, start_date: '2026-10-20', end_date: '2026-10-24', type: 'x' })).status, 400);
  const upd = await t.call('PATCH', `/api/absences/${ok.data.id}`, { end_date: '2026-10-30', note: 'Prolongado' });
  assert.equal(upd.data.end_date, '2026-10-30');
  assert.equal(upd.data.start_date, '2026-10-20');
  assert.equal((await t.call('GET', '/api/state')).data.absences.length, 1);
  await t.call('DELETE', `/api/absences/${ok.data.id}`);
  assert.equal((await t.call('GET', '/api/state')).data.absences.length, 0);
});

test('histórico e exportação CSV', async () => {
  const t = await team();
  await t.call('POST', '/api/tasks', { member_id: 1, title: '=cmd|x', kind: 'flex', status: 'done' });
  await t.call('POST', '/api/tasks', { member_id: 2, title: 'Com; ponto e vírgula', kind: 'flex' });
  const hist = (await t.call('GET', '/api/history')).data;
  assert.equal(hist[0].month, '2026-10');
  assert.equal(hist[0].total, 2);
  assert.equal(hist[0].done, 1);
  const csv = await t.call('GET', '/api/export/2026-10.csv');
  assert.equal(csv.status, 200);
  const raw = new Uint8Array(await (await fetch(`${t.base}/api/export/2026-10.csv`, { headers: { Cookie: t.admin.cookie } })).arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xef, 0xbb, 0xbf], 'o CSV começa com BOM UTF-8 para o Excel');
  assert.ok(csv.data.startsWith('Mês;Pessoa;Tarefa'));
  assert.ok(csv.data.includes("'=cmd|x"), 'protege contra injeção de fórmulas');
  assert.ok(csv.data.includes('"Com; ponto e vírgula"'));
  assert.equal((await t.call('GET', '/api/export/abc')).status, 400);
  assert.equal((await t.anon().call('GET', '/api/export/2026-10.csv')).status, 401);
});

test('exige JSON nos pedidos que escrevem', async () => {
  const t = await team();
  const res = await fetch(`${t.base}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: t.admin.cookie }, body: 'x=1' });
  assert.equal(res.status, 415);
});

test('ficheiros estáticos: a página abre e não se sai da pasta public', async () => {
  const t = await setup({ loginAdmin: false });
  const index = await fetch(`${t.base}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Teoria Workflow/);
  assert.match(index.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(`${t.base}/..%2Fserver.js`)).status, 404);
  assert.equal((await fetch(`${t.base}/%2e%2e/server.js`)).status, 404);
  const raw = await new Promise((resolve) => {
    const s = net.connect(t.app.server.address().port, '127.0.0.1', () => s.write('GET /../server.js HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('close', () => resolve(out));
  });
  assert.match(raw.split('\r\n')[0], /404/);
  assert.equal((await fetch(`${t.base}/x`, { method: 'POST' })).status, 405);
});

test('cópia de segurança diária: um ficheiro por dia, limitado, e com os dados', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
  const t = await team({ dbFile: path.join(dir, 'tw.db'), start: '2026-10-01T10:00:00Z', env: { BACKUP_KEEP: '2' } });
  const names = () => fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.deepEqual(names(), ['teoria-workflow-2026-10-01.db']);
  for (const day of ['02', '03']) {
    t.setNow(`2026-10-${day}T10:00:00Z`);
    t.app.currentMonth();
    t.app.maintenance();
  }
  assert.deepEqual(names(), ['teoria-workflow-2026-10-02.db', 'teoria-workflow-2026-10-03.db']);
  const copy = new DatabaseSync(path.join(dir, 'backups', 'teoria-workflow-2026-10-03.db'));
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM members').get().n, 3);
  copy.close();
  await t.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('os dados sobrevivem a reiniciar o servidor (e o administrador não se duplica)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
  const file = path.join(dir, 'tw.db');
  const first = await setup({ dbFile: file });
  await first.call('POST', '/api/tasks', { member_id: 1, title: 'Persistente' });
  await first.call('POST', '/api/chat', { text: 'Olá' });
  await first.app.close();

  const second = await setup({ dbFile: file });
  const state = (await second.call('GET', '/api/state')).data;
  assert.ok(state.tasks.some((t) => t.title === 'Persistente'));
  assert.equal(state.members.length, 1);
  assert.equal((await second.call('GET', '/api/chat')).data.messages.length, 1);
  await second.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('migração: uma base de dados da versão 1 (sem contas) passa a funcionar e conserva os dados', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
  const file = path.join(dir, 'tw.db');
  const old = new DatabaseSync(file);
  old.exec(MIGRATIONS[0]);
  old.exec('PRAGMA user_version = 1');
  old.exec(`INSERT INTO members (name, color) VALUES ('Pessoa 1', '#2f6fed'), ('Pessoa 2', '#e0662b')`);
  old.exec(`INSERT INTO tasks (member_id, title, kind, status, month, origin_month, position, created_at)
            VALUES (2, 'Tarefa antiga', 'flex', 'todo', '2026-10', '2026-10', 1, '2026-10-02T10:00:00.000Z')`);
  old.close();

  const t = await setup({ dbFile: file });
  const state = (await t.call('GET', '/api/state')).data;
  assert.equal(state.tasks[0].title, 'Tarefa antiga');
  assert.equal(state.members.length, 3, 'as pessoas antigas ficam (sem conta) e o administrador é criado');
  assert.equal(state.members.filter((m) => m.has_account).length, 1);
  assert.equal(state.members.find((m) => m.name === 'Pessoa 1').has_account, false);
  await t.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
