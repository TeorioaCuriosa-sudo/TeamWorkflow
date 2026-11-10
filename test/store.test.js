import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY } from '../js/store.js';

// Armazenamento em memória com a mesma interface do localStorage + relógio controlável.
function setup(startIso = '2026-10-15T10:00:00Z', existing) {
  const mem = existing ?? new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let current = new Date(startIso);
  const store = createStore({ storage, now: () => current, config: { timezone: 'Europe/Lisbon' } });
  return {
    mem, storage, store,
    setNow: (iso) => { current = new Date(iso); },
    call: (m, p, b) => store.handle(m, p, b),
    fail: async (m, p, b) => { try { await store.handle(m, p, b); } catch (e) { return e; } assert.fail('devia ter falhado'); },
  };
}

test('estado inicial: 3 pessoas de exemplo e mês atual aberto', async () => {
  const t = setup();
  const d = await t.call('GET', '/api/state');
  assert.equal(d.members.length, 3);
  assert.equal(d.currentMonth, '2026-10');
  assert.equal(d.archived, false);
  assert.ok(t.mem.get(STORAGE_KEY), 'o mês aberto foi gravado');
});

test('criar, mover e apagar tarefas; timestamps', async () => {
  const t = setup();
  const created = await t.call('POST', '/api/tasks', { member_id: 1, title: '  Rever proposta ', kind: 'flex' });
  assert.equal(created.title, 'Rever proposta');
  assert.equal(created.status, 'todo');
  const doing = await t.call('PATCH', `/api/tasks/${created.id}`, { status: 'doing' });
  assert.ok(doing.started_at);
  const done = await t.call('PATCH', `/api/tasks/${created.id}`, { status: 'done', member_id: 2 });
  assert.equal(done.member_id, 2);
  assert.ok(done.done_at);
  const back = await t.call('PATCH', `/api/tasks/${created.id}`, { status: 'todo' });
  assert.equal(back.done_at, null);
  await t.call('DELETE', `/api/tasks/${created.id}`);
  assert.equal((await t.fail('DELETE', `/api/tasks/${created.id}`)).status, 404);
});

test('validação', async () => {
  const t = setup();
  assert.equal((await t.fail('POST', '/api/tasks', { member_id: 1, title: '   ' })).status, 400);
  assert.equal((await t.fail('POST', '/api/tasks', { member_id: 1, title: 'x', kind: 'weekly' })).status, 400);
  assert.equal((await t.fail('POST', '/api/tasks', { member_id: 99, title: 'x' })).status, 400);
  assert.equal((await t.fail('POST', '/api/tasks', { member_id: 1, title: 'x', due: '2026-02-31' })).status, 400);
  assert.equal((await t.fail('POST', '/api/tasks', { member_id: 1, title: 'x'.repeat(201) })).status, 400);
  assert.equal((await t.fail('GET', '/api/nada')).status, 404);
});

test('ordenação: soltar antes de outra tarefa e soltar no fim', async () => {
  const t = setup();
  const mk = (title) => t.call('POST', '/api/tasks', { member_id: 1, title });
  const a = await mk('A'); await mk('B'); const c = await mk('C');
  await t.call('PATCH', `/api/tasks/${c.id}`, { before_id: a.id });
  let d = await t.call('GET', '/api/state');
  assert.deepEqual(d.tasks.filter((x) => x.member_id === 1).map((x) => x.title), ['C', 'A', 'B']);
  await t.call('PATCH', `/api/tasks/${c.id}`, { to_end: true });
  d = await t.call('GET', '/api/state');
  assert.deepEqual(d.tasks.filter((x) => x.member_id === 1).map((x) => x.title), ['A', 'B', 'C']);
});

test('as devoluções são cópias: alterar o resultado não mexe nos dados guardados', async () => {
  const t = setup();
  const d = await t.call('GET', '/api/state');
  d.members[0].name = 'HACK';
  assert.notEqual((await t.call('GET', '/api/state')).members[0].name, 'HACK');
});

test('recorrentes: aparece já neste mês; apagar remove só a cópia por fazer', async () => {
  const t = setup();
  const r1 = await t.call('POST', '/api/recurring', { member_id: 1, title: 'R1' });
  const r2 = await t.call('POST', '/api/recurring', { member_id: 1, title: 'R2' });
  let d = await t.call('GET', '/api/state');
  const inst1 = d.tasks.find((x) => x.recurring_id === r1.id);
  assert.equal(inst1.kind, 'monthly');
  await t.call('PATCH', `/api/tasks/${d.tasks.find((x) => x.recurring_id === r2.id).id}`, { status: 'doing' });
  await t.call('DELETE', `/api/recurring/${r1.id}`);
  await t.call('DELETE', `/api/recurring/${r2.id}`);
  d = await t.call('GET', '/api/state');
  assert.equal(d.tasks.find((x) => x.title === 'R1'), undefined);
  const kept = d.tasks.find((x) => x.title === 'R2');
  assert.ok(kept && kept.status === 'doing' && kept.recurring_id === null);
});

test('nova tarefa mensal com "repetir" cria o modelo recorrente', async () => {
  const t = setup();
  const task = await t.call('POST', '/api/tasks', { member_id: 2, title: 'Fecho', kind: 'monthly', repeat: true });
  const d = await t.call('GET', '/api/state');
  assert.ok(task.recurring_id);
  assert.ok(d.recurring.some((r) => r.id === task.recurring_id && r.title === 'Fecho'));
});

test('renovação mensal: transitam semanais/em progresso; mensais por fazer ficam no arquivo; recorrentes renascem uma vez', async () => {
  const t = setup();
  const rec = await t.call('POST', '/api/recurring', { member_id: 1, title: 'Relatório mensal' });
  const rec2 = await t.call('POST', '/api/recurring', { member_id: 2, title: 'Faturação' });
  const flexTodo = await t.call('POST', '/api/tasks', { member_id: 1, title: 'Semanal por fazer', kind: 'flex' });
  const flexDone = await t.call('POST', '/api/tasks', { member_id: 1, title: 'Semanal feita', kind: 'flex', status: 'done' });
  const monthlyDoing = await t.call('POST', '/api/tasks', { member_id: 2, title: 'Mensal a meio', kind: 'monthly', status: 'doing' });
  const s1 = await t.call('GET', '/api/state');
  const reportInst = s1.tasks.find((x) => x.recurring_id === rec.id);
  await t.call('PATCH', `/api/tasks/${reportInst.id}`, { status: 'done' });
  const billingInst = s1.tasks.find((x) => x.recurring_id === rec2.id);

  t.setNow('2026-11-02T09:00:00Z');
  const nov = await t.call('GET', '/api/state');
  assert.equal(nov.currentMonth, '2026-11');
  const by = (title) => nov.tasks.filter((x) => x.title === title);
  assert.equal(by('Semanal por fazer')[0].id, flexTodo.id);
  assert.equal(by('Mensal a meio')[0].id, monthlyDoing.id);
  assert.equal(by('Mensal a meio')[0].origin_month, '2026-10');
  assert.equal(by('Semanal feita').length, 0);
  assert.equal(by('Relatório mensal').length, 1);
  assert.equal(by('Relatório mensal')[0].status, 'todo');
  assert.equal(by('Faturação').length, 1);
  assert.notEqual(by('Faturação')[0].id, billingInst.id);

  const oct = await t.call('GET', '/api/state?month=2026-10');
  assert.equal(oct.archived, true);
  assert.ok(oct.tasks.find((x) => x.id === flexDone.id));
  assert.ok(oct.tasks.find((x) => x.id === reportInst.id && x.status === 'done'));
  assert.ok(oct.tasks.find((x) => x.id === billingInst.id && x.status === 'todo'));
  assert.equal(oct.tasks.find((x) => x.id === flexTodo.id), undefined);

  assert.equal((await t.call('GET', '/api/state')).tasks.length, nov.tasks.length, 'idempotente');
});

test('renovação ao saltar vários meses; mês futuro devolve o atual', async () => {
  const t = setup();
  const flex = await t.call('POST', '/api/tasks', { member_id: 3, title: 'Antiga', kind: 'flex' });
  t.setNow('2027-01-05T09:00:00Z');
  const jan = await t.call('GET', '/api/state');
  assert.equal(jan.currentMonth, '2027-01');
  assert.equal(jan.tasks.find((x) => x.id === flex.id).month, '2027-01');
  assert.equal((await t.call('GET', '/api/state?month=2030-01')).month, '2027-01');
});

test('a renovação usa a data de Lisboa, não a de UTC', async () => {
  const verao = setup('2026-06-30T23:30:00Z'); // verão: Lisboa = UTC+1, já é 1 de julho às 00:30
  assert.equal((await verao.call('GET', '/api/state')).currentMonth, '2026-07');
  const inverno = setup('2026-12-31T23:30:00Z'); // inverno: Lisboa = UTC, ainda é 31 de dezembro
  assert.equal((await inverno.call('GET', '/api/state')).currentMonth, '2026-12');
});

test('pessoa em pausa não gera recorrentes; não se desativa a última', async () => {
  const t = setup();
  await t.call('POST', '/api/recurring', { member_id: 3, title: 'Da pessoa 3' });
  await t.call('PATCH', '/api/members/3', { active: false });
  t.setNow('2026-11-03T09:00:00Z');
  const nov = await t.call('GET', '/api/state');
  assert.equal(nov.tasks.filter((x) => x.title === 'Da pessoa 3').length, 0);
  await t.call('PATCH', '/api/members/2', { active: false });
  assert.equal((await t.fail('PATCH', '/api/members/1', { active: false })).status, 400);
});

test('ausências: criar, validar, editar, apagar', async () => {
  const t = setup();
  const a = await t.call('POST', '/api/absences', { member_id: 1, start_date: '2026-10-20', end_date: '2026-10-24', type: 'ferias' });
  assert.equal((await t.fail('POST', '/api/absences', { member_id: 1, start_date: '2026-10-24', end_date: '2026-10-20' })).status, 400);
  assert.equal((await t.fail('POST', '/api/absences', { member_id: 1, start_date: '2026-10-20', end_date: '2026-10-24', type: 'x' })).status, 400);
  const upd = await t.call('PATCH', `/api/absences/${a.id}`, { end_date: '2026-10-30', note: 'Prolongado' });
  assert.equal(upd.end_date, '2026-10-30');
  assert.equal(upd.start_date, '2026-10-20');
  assert.equal((await t.call('GET', '/api/state')).absences.length, 1);
  await t.call('DELETE', `/api/absences/${a.id}`);
  assert.equal((await t.call('GET', '/api/state')).absences.length, 0);
});

test('histórico e CSV (com BOM e proteção contra fórmulas)', async () => {
  const t = setup();
  await t.call('POST', '/api/tasks', { member_id: 1, title: '=cmd|x', kind: 'flex', status: 'done' });
  await t.call('POST', '/api/tasks', { member_id: 2, title: 'Com; ponto e vírgula', kind: 'flex' });
  const hist = await t.call('GET', '/api/history');
  assert.equal(hist[0].month, '2026-10');
  assert.equal(hist[0].total, 2);
  assert.equal(hist[0].done, 1);
  const csv = await t.call('GET', '/api/export/2026-10.csv');
  assert.equal(csv.filename, 'tarefas-2026-10.csv');
  assert.ok(csv.text.startsWith('﻿Mês;Pessoa;Tarefa'));
  assert.ok(csv.text.includes("'=cmd|x"));
  assert.ok(csv.text.includes('"Com; ponto e vírgula"'));
  assert.equal((await t.fail('GET', '/api/export/abc')).status, 400);
});

test('persistência: os dados sobrevivem a "recarregar a página" (nova loja, mesmo armazenamento)', async () => {
  const a = setup();
  await a.call('POST', '/api/tasks', { member_id: 1, title: 'Persistente' });
  const b = setup('2026-10-15T10:00:00Z', a.mem);
  const d = await b.call('GET', '/api/state');
  assert.ok(d.tasks.some((x) => x.title === 'Persistente'));
  assert.equal(d.members.length, 3);
});

test('exportar e importar: ida e volta, e rejeita ficheiros inválidos', async () => {
  const a = setup();
  const rec = await a.call('POST', '/api/recurring', { member_id: 1, title: 'Recorrente' });
  await a.call('POST', '/api/tasks', { member_id: 2, title: 'Tarefa', kind: 'flex', status: 'doing' });
  await a.call('POST', '/api/absences', { member_id: 3, start_date: '2026-10-20', end_date: '2026-10-21' });
  const backup = JSON.parse((await a.call('GET', '/api/backup')).text);

  const b = setup();
  await b.call('POST', '/api/import', { data: backup });
  const d = await b.call('GET', '/api/state');
  assert.ok(d.tasks.some((x) => x.title === 'Tarefa' && x.status === 'doing'));
  assert.ok(d.recurring.some((x) => x.id === rec.id));
  assert.equal(d.absences.length, 1);
  const novo = await b.call('POST', '/api/tasks', { member_id: 1, title: 'Depois de importar' });
  assert.ok(!d.tasks.some((x) => x.id === novo.id), 'os ids novos não colidem com os importados');

  assert.equal((await b.fail('POST', '/api/import', { data: { v: 1 } })).status, 400);
  assert.equal((await b.fail('POST', '/api/import', { data: null })).status, 400);
  assert.equal((await b.fail('POST', '/api/import', { data: { ...backup, tasks: [{ id: 1, member_id: 999, title: 'x', kind: 'flex', status: 'todo', month: '2026-10', origin_month: '2026-10', position: 1 }] } })).status, 400);
});

test('importar uma cópia de um mês antigo renova para o mês atual', async () => {
  const a = setup('2026-09-10T10:00:00Z');
  await a.call('POST', '/api/tasks', { member_id: 1, title: 'Aberta em setembro', kind: 'flex' });
  const backup = JSON.parse((await a.call('GET', '/api/backup')).text);
  const b = setup('2026-11-03T10:00:00Z');
  await b.call('POST', '/api/import', { data: backup });
  const d = await b.call('GET', '/api/state');
  assert.equal(d.currentMonth, '2026-11');
  assert.equal(d.tasks.find((x) => x.title === 'Aberta em setembro')?.month, '2026-11');
});

test('dados de exemplo e repor', async () => {
  const t = setup('2026-11-09T10:00:00Z');
  await t.call('POST', '/api/demo');
  let d = await t.call('GET', '/api/state');
  assert.deepEqual(d.members.map((m) => m.name), ['Ana', 'Bruno', 'Carla']);
  assert.ok(d.tasks.length > 10);
  const hist = await t.call('GET', '/api/history');
  assert.equal(hist.length, 3);
  await t.call('POST', '/api/reset');
  d = await t.call('GET', '/api/state');
  assert.equal(d.tasks.length, 0);
  assert.deepEqual(d.members.map((m) => m.name), ['Pessoa 1', 'Pessoa 2', 'Pessoa 3']);
});

test('dados ilegíveis: guarda uma cópia e recomeça em vez de bloquear', async () => {
  const mem = new Map([[STORAGE_KEY, '{isto não é json']]);
  const t = setup('2026-10-15T10:00:00Z', mem);
  const d = await t.call('GET', '/api/state');
  assert.equal(d.members.length, 3);
  assert.equal(mem.get(`${STORAGE_KEY}.corrompido`), '{isto não é json');
});
