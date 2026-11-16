// Funções (administrador, comandante, marketing, informática), pedidos de tarefa e urgência.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setup } from './helpers.js';
import { openDb, MIGRATIONS } from '../lib/db.js';

const CREW = [
  { name: 'Bruno', email: 'bruno@teoria.pt', role: 'comandante' },
  { name: 'Carla', email: 'carla@teoria.pt', role: 'marketing' },
  { name: 'Diogo', email: 'diogo@teoria.pt', role: 'informatica' },
  { name: 'Eva', email: 'eva@teoria.pt', role: 'member' },
];
const team = (opts = {}) => setup({ people: CREW, ...opts });
const mk = (c, body) => c.call('POST', '/api/tasks', { kind: 'flex', ...body });
const notes = async (c) => (await c.call('GET', '/api/notifications')).data.items;

test('funções: aparecem no estado e nas capacidades de cada pessoa', async () => {
  const t = await team();
  const state = (await t.admin.call('GET', '/api/state')).data;
  const roleOf = (n) => state.members.find((m) => m.id === t.ids[n]).role;
  assert.equal(state.members[0].role, 'admin');
  assert.deepEqual(['Bruno', 'Carla', 'Diogo', 'Eva'].map(roleOf), ['comandante', 'marketing', 'informatica', 'member']);

  const me = (n) => t.users[n].call('GET', '/api/state').then((r) => r.data.me);
  assert.deepEqual((await me('Bruno')).can, { create_tags: true, manage_tags: true, manage_files: true, add_people: true, manage_people: false, move_others: false, backup: false });
  assert.equal((await me('Carla')).can.manage_tags, false, 'marketing tem acesso de membro');
  assert.equal((await me('Diogo')).can.add_people, false, 'informática tem acesso de membro');
  assert.equal((await t.admin.call('GET', '/api/state')).data.me.can.backup, true);

  assert.equal((await t.admin.call('POST', '/api/members', { name: 'X', email: 'x@teoria.pt', role: 'chefe' })).status, 400);
  const edit = await t.admin.call('PATCH', `/api/members/${t.ids.Eva}`, { role: 'comandante' });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.role, 'comandante');
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.Eva}`, { role: 'admin' })).data.role, 'admin');
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.Eva}`, { role: 'member' })).data.role, 'member');
});

test('tem de sobrar sempre um administrador', async () => {
  const t = await team();
  assert.equal((await t.admin.call('PATCH', '/api/members/1', { role: 'comandante' })).status, 400);
  await t.admin.call('PATCH', `/api/members/${t.ids.Eva}`, { role: 'admin' });
  assert.equal((await t.admin.call('PATCH', '/api/members/1', { role: 'comandante' })).status, 200);
});

test('comandante adiciona pessoas (sem dar funções de chefia); membros, marketing e informática não', async () => {
  const t = await team();
  const ok = await t.users.Bruno.call('POST', '/api/members', { name: 'Filipa', email: 'filipa@teoria.pt', role: 'marketing' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.member.role, 'marketing');
  assert.ok(ok.data.temp_password);
  assert.equal((await t.users.Bruno.call('POST', '/api/members', { name: 'G', email: 'g@teoria.pt', role: 'admin' })).status, 403);
  assert.equal((await t.users.Bruno.call('POST', '/api/members', { name: 'G', email: 'g@teoria.pt', role: 'comandante' })).status, 403);
  for (const who of ['Carla', 'Diogo', 'Eva']) {
    assert.equal((await t.users[who].call('POST', '/api/members', { name: 'H', email: 'h@teoria.pt' })).status, 403, who);
  }
  // O resto da gestão de pessoas continua só com os administradores.
  assert.equal((await t.users.Bruno.call('PATCH', `/api/members/${t.ids.Eva}`, { role: 'comandante' })).status, 403);
  assert.equal((await t.users.Bruno.call('POST', `/api/members/${t.ids.Eva}/reset-password`)).status, 403);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/members/${t.ids.Eva}`, { discard_open: true })).status, 403);
});

test('projetos e tópicos: toda a gente cria; só comandantes e administradores alteram e apagam', async () => {
  const t = await team();
  const topic = await t.users.Bruno.call('POST', '/api/topics', { name: 'Clientes' });
  assert.equal(topic.status, 201);
  const project = await t.users.Bruno.call('POST', '/api/projects', { name: 'Website' });
  assert.equal(project.status, 201);
  for (const who of ['Carla', 'Diogo', 'Eva']) {
    assert.equal((await t.users[who].call('POST', '/api/topics', { name: `T-${who}` })).status, 201, who);
    assert.equal((await t.users[who].call('POST', '/api/projects', { name: `P-${who}` })).status, 201, who);
    assert.equal((await t.users[who].call('PATCH', `/api/topics/${topic.data.id}`, { name: 'X' })).status, 403, who);
    assert.equal((await t.users[who].call('DELETE', `/api/projects/${project.data.id}`)).status, 403, who);
  }
  // Qualquer um escolhe projeto e tópico nas suas tarefas.
  const own = await mk(t.users.Carla, { member_id: t.ids.Carla, title: 'Post', project_id: project.data.id, topic_ids: [topic.data.id] });
  assert.equal(own.status, 201);
  assert.equal(own.data.project_id, project.data.id);
  assert.equal((await t.users.Bruno.call('PATCH', `/api/topics/${topic.data.id}`, { name: 'Clientes VIP' })).status, 200);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/topics/${topic.data.id}`)).status, 200);
});

test('pedir uma tarefa a outra pessoa: fica em Pendentes dela, com quem pediu e aviso', async () => {
  const t = await team();
  // Mesmo que tente forçar o estado, o tipo ou a repetição, um pedido é sempre uma tarefa por fazer.
  const r = await mk(t.users.Eva, { member_id: t.ids.Carla, title: 'Banner do evento', status: 'done', kind: 'monthly', repeat: true, urgency: 'urgent' });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, 'todo');
  assert.equal(r.data.kind, 'flex');
  assert.equal(r.data.recurring_id, null);
  assert.equal(r.data.requested_by, t.ids.Eva);
  assert.equal(r.data.member_id, t.ids.Carla);
  assert.equal(r.data.urgency, 'urgent');

  const [n] = await notes(t.users.Carla);
  assert.equal(n.type, 'request');
  assert.match(n.text, /Eva pediu-te a tarefa “Banner do evento”/);
  assert.equal((await notes(t.users.Eva)).length, 0, 'quem pede não é avisado');

  const detail = (await t.users.Carla.call('GET', `/api/tasks/${r.data.id}`)).data;
  assert.match(detail.events[0].text, /Pedida por Eva a Carla/);

  // Todos pedem a todos: também a um comandante e ao administrador.
  assert.equal((await mk(t.users.Diogo, { member_id: t.ids.Bruno, title: 'Rever o orçamento' })).data.requested_by, t.ids.Diogo);
  assert.equal((await mk(t.users.Bruno, { member_id: t.ids.Carla, title: 'Folheto' })).data.status, 'todo');
  assert.equal((await mk(t.users.Carla, { member_id: 1, title: 'Aprovar campanha' })).data.requested_by, t.ids.Carla);
  // Na própria coluna é uma tarefa normal.
  const mine = (await mk(t.users.Eva, { member_id: t.ids.Eva, title: 'Minha', status: 'doing' })).data;
  assert.equal(mine.status, 'doing');
  assert.equal(mine.requested_by, null);
  // O administrador atribui diretamente, com o estado que escolher.
  const given = (await mk(t.admin, { member_id: t.ids.Carla, title: 'Atribuída', status: 'doing' })).data;
  assert.equal(given.status, 'doing');
  assert.match((await notes(t.users.Carla))[0].text, /atribuiu-te/);
});

test('quem pediu pode corrigir ou retirar o pedido enquanto ninguém lhe pegou', async () => {
  const t = await team();
  const r = (await mk(t.users.Eva, { member_id: t.ids.Carla, title: 'Banenr', urgency: 'normal' })).data;
  const fix = await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { title: 'Banner', due: '2026-10-30', urgency: 'priority', notes: 'Formato A4' });
  assert.equal(fix.status, 200);
  assert.deepEqual([fix.data.title, fix.data.due, fix.data.urgency, fix.data.notes], ['Banner', '2026-10-30', 'priority', 'Formato A4']);
  assert.match((await notes(t.users.Carla))[0].text, /Eva corrigiu o pedido “Banner”/);

  // Mas não o move nem lhe muda o estado.
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { status: 'doing' })).status, 403);
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { kind: 'monthly' })).status, 403);
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { to_end: true })).status, 403);
  // Mandar o formulário inteiro, com os valores que já lá estão, não é um problema.
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { title: 'Banner', status: 'todo', kind: 'flex' })).status, 200);

  // Enganou-se na pessoa: passa o pedido a outra (que é avisada), a primeira vê que foi retirado.
  const moved = await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { member_id: t.ids.Diogo });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.member_id, t.ids.Diogo);
  assert.match((await notes(t.users.Diogo))[0].text, /Eva pediu-te a tarefa “Banner”/);
  assert.match((await notes(t.users.Carla))[0].text, /Eva retirou o pedido “Banner”/);
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { member_id: t.ids.Eva })).status, 400, 'não pode pedir a si própria');

  // Quando o destinatário pega nela, deixa de ser editável por quem pediu e esta pessoa é avisada do avanço.
  await t.users.Diogo.call('PATCH', `/api/tasks/${r.id}`, { status: 'doing' });
  assert.match((await notes(t.users.Eva))[0].text, /Diogo marcou “Banner”, que pediste, como em progresso/);
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${r.id}`, { title: 'Outro' })).status, 403);
  assert.equal((await t.users.Eva.call('DELETE', `/api/tasks/${r.id}`)).status, 403);

  // Retirar um pedido ainda pendente apaga-o e avisa o destinatário.
  const r2 = (await mk(t.users.Eva, { member_id: t.ids.Carla, title: 'Cartaz' })).data;
  assert.equal((await t.users.Eva.call('DELETE', `/api/tasks/${r2.id}`)).status, 200);
  assert.match((await notes(t.users.Carla))[0].text, /Eva retirou o pedido “Cartaz”/);
});

test('ninguém mexe nas tarefas dos outros (comandantes incluídos); só o administrador move tudo', async () => {
  const t = await team();
  const carla = (await mk(t.users.Carla, { member_id: t.ids.Carla, title: 'Da Carla' })).data;

  for (const who of ['Bruno', 'Diogo', 'Eva']) {
    const c = t.users[who];
    assert.equal((await c.call('PATCH', `/api/tasks/${carla.id}`, { status: 'doing' })).status, 403, who);
    assert.equal((await c.call('PATCH', `/api/tasks/${carla.id}`, { title: 'Roubada' })).status, 403, who);
    assert.equal((await c.call('DELETE', `/api/tasks/${carla.id}`)).status, 403, who);
    assert.equal((await c.call('POST', `/api/tasks/${carla.id}/approval`, { approver_id: 1 })).status, 403, who);
    // Pode comentar, mas não mudar o estado através do comentário.
    assert.equal((await c.call('POST', `/api/tasks/${carla.id}/events`, { text: `Olá de ${who}` })).status, 201, who);
    assert.equal((await c.call('POST', `/api/tasks/${carla.id}/events`, { text: 'feito!', status: 'done' })).status, 403, who);
  }
  const after = (await t.users.Carla.call('GET', `/api/tasks/${carla.id}`)).data;
  assert.equal(after.task.status, 'todo');
  assert.equal(after.task.title, 'Da Carla');
  assert.equal(after.events.filter((e) => e.type === 'comment').length, 3);

  // A dona mexe à vontade, mas não a passa a outra pessoa.
  assert.equal((await t.users.Carla.call('PATCH', `/api/tasks/${carla.id}`, { status: 'doing', title: 'Da Carla (a meio)' })).status, 200);
  assert.equal((await t.users.Carla.call('PATCH', `/api/tasks/${carla.id}`, { member_id: t.ids.Eva })).status, 403);

  // O administrador faz tudo.
  const moved = await t.admin.call('PATCH', `/api/tasks/${carla.id}`, { member_id: t.ids.Eva, status: 'done' });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.member_id, t.ids.Eva);
  assert.equal((await t.admin.call('DELETE', `/api/tasks/${carla.id}`)).status, 200);
});

test('quem recebe um pedido pode recusá-lo (apagar) e quem pediu é avisado', async () => {
  const t = await team();
  const r = (await mk(t.users.Bruno, { member_id: t.ids.Carla, title: 'Entrevista' })).data;
  assert.equal((await t.users.Carla.call('DELETE', `/api/tasks/${r.id}`)).status, 200);
  assert.match((await notes(t.users.Bruno))[0].text, /Carla removeu a tarefa “Entrevista”, que pediste/);
});

test('urgência: normal, urgente, prioritário e business critical', async () => {
  const t = await team();
  const base = { member_id: t.ids.Carla, title: 'U' };
  assert.equal((await mk(t.users.Carla, base)).data.urgency, 'normal');
  for (const u of ['urgent', 'priority', 'critical']) {
    assert.equal((await mk(t.users.Carla, { ...base, urgency: u })).data.urgency, u);
  }
  assert.equal((await mk(t.users.Carla, { ...base, urgency: 'altíssima' })).status, 400);

  const tk = (await mk(t.users.Carla, base)).data;
  const up = await t.users.Carla.call('PATCH', `/api/tasks/${tk.id}`, { urgency: 'critical' });
  assert.equal(up.data.urgency, 'critical');
  assert.equal((await t.users.Carla.call('PATCH', `/api/tasks/${tk.id}`, { urgency: 'x' })).status, 400);
  const events = (await t.users.Carla.call('GET', `/api/tasks/${tk.id}`)).data.events;
  assert.ok(events.some((e) => /Urgência: Business critical/.test(e.text)));
  // Outros não mexem na urgência de quem não lhes pediu nada.
  assert.equal((await t.users.Eva.call('PATCH', `/api/tasks/${tk.id}`, { urgency: 'normal' })).status, 403);
  const csv = (await t.admin.call('GET', '/api/export/2026-10.csv')).data;
  assert.match(csv, /;Business critical;/);
});

test('cópia JSON: só o administrador', async () => {
  const t = await team();
  await mk(t.users.Eva, { member_id: t.ids.Carla, title: 'Pedido' });
  for (const who of ['Bruno', 'Carla', 'Diogo', 'Eva']) {
    assert.equal((await t.users[who].call('GET', '/api/backup')).status, 403, who);
  }
  assert.equal((await t.anon().call('GET', '/api/backup')).status, 401);
  const ok = await t.admin.call('GET', '/api/backup');
  assert.equal(ok.status, 200);
  assert.ok(ok.data.members.some((m) => m.func === 'comandante'));
  assert.ok(ok.data.tasks.some((x) => x.requested_by === t.ids.Eva));
  assert.ok(Array.isArray(ok.data.task_carries));
  assert.ok(!JSON.stringify(ok.data).includes('password'));
});

test('tarefas recorrentes: cada um gere as suas; o administrador as de todos', async () => {
  const t = await team();
  const own = await t.users.Carla.call('POST', '/api/recurring', { member_id: t.ids.Carla, title: 'Newsletter' });
  assert.equal(own.status, 201);
  assert.equal((await t.users.Carla.call('POST', '/api/recurring', { member_id: t.ids.Eva, title: 'Para outra' })).status, 403);
  assert.equal((await t.users.Bruno.call('PATCH', `/api/recurring/${own.data.id}`, { title: 'X' })).status, 403);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/recurring/${own.data.id}`)).status, 403);
  assert.equal((await t.users.Carla.call('PATCH', `/api/recurring/${own.data.id}`, { member_id: t.ids.Eva })).status, 403);
  assert.equal((await t.users.Carla.call('PATCH', `/api/recurring/${own.data.id}`, { title: 'Newsletter mensal' })).status, 200);
  assert.equal((await t.admin.call('POST', '/api/recurring', { member_id: t.ids.Eva, title: 'Do administrador' })).status, 201);
  assert.equal((await t.admin.call('DELETE', `/api/recurring/${own.data.id}`)).status, 200);
});

test('pedir aprovação: só quem tem a tarefa (ou o administrador); quem aprova pode ser qualquer pessoa', async () => {
  const t = await team();
  const tk = (await mk(t.users.Carla, { member_id: t.ids.Carla, title: 'Campanha' })).data;
  assert.equal((await t.users.Eva.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Bruno })).status, 403);
  assert.equal((await t.users.Carla.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Eva })).status, 201, 'um colega também pode aprovar');
  const dec = await t.users.Eva.call('POST', `/api/approvals/${(await t.users.Carla.call('GET', `/api/tasks/${tk.id}`)).data.approvals[0].id}/decision`, { decision: 'approved' });
  assert.equal(dec.status, 200);
});

test('o histórico lembra o que transitou, e uma mensal por concluir não é duplicada no mês seguinte', async () => {
  const t = await team();
  const rec = (await t.users.Carla.call('POST', '/api/recurring', { member_id: t.ids.Carla, title: 'Relatório de redes' })).data;
  const pending = (await mk(t.users.Eva, { member_id: t.ids.Carla, title: 'Pedido antigo' })).data;
  t.setNow('2026-11-03T09:00:00Z');
  await t.admin.login('admin@teoria.pt', 'admin-pass-1');
  const nov = (await t.admin.call('GET', '/api/state')).data;
  const copies = nov.tasks.filter((x) => x.recurring_id === rec.id);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].origin_month, '2026-10');
  const old = nov.tasks.find((x) => x.id === pending.id);
  assert.equal(old.month, '2026-11');
  assert.equal(old.requested_by, t.ids.Eva, 'continua a saber-se quem pediu');
  const hist = (await t.admin.call('GET', '/api/history')).data;
  assert.equal(hist.find((h) => h.month === '2026-10').carried_out, 2);

  // Em dezembro, se continuar por fazer, volta a transitar (um único exemplar).
  t.setNow('2026-12-02T09:00:00Z');
  await t.admin.login('admin@teoria.pt', 'admin-pass-1');
  const dec = (await t.admin.call('GET', '/api/state')).data;
  assert.equal(dec.tasks.filter((x) => x.recurring_id === rec.id).length, 1);
  assert.equal(dec.tasks.find((x) => x.recurring_id === rec.id).origin_month, '2026-10');
  assert.equal((await t.admin.call('GET', '/api/history')).data.find((h) => h.month === '2026-11').carried_out, 2);
});

test('migração: uma base de dados anterior às funções passa à versão atual sem perder nada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mig-'));
  const file = path.join(dir, 'antiga.db');
  const old = new DatabaseSync(file);
  old.exec(MIGRATIONS[0]);
  old.exec(MIGRATIONS[1]);
  old.exec('PRAGMA user_version = 2');
  old.exec(`INSERT INTO members (id, name, color, role, email, created_at) VALUES (1, 'Ana', '#2f6fed', 'admin', 'ana@x.pt', '2026-01-01'), (2, 'Rui', '#e0662b', 'member', 'rui@x.pt', '2026-01-01')`);
  old.exec(`INSERT INTO tasks (id, member_id, title, kind, status, month, origin_month, created_at) VALUES (1, 2, 'Antiga', 'monthly', 'todo', '2026-09', '2026-09', '2026-09-01')`);
  old.close();

  const db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.deepEqual(db.prepare('SELECT id, role, func FROM members ORDER BY id').all().map((m) => ({ ...m })), [
      { id: 1, role: 'admin', func: 'member' },
      { id: 2, role: 'member', func: 'member' },
    ]);
    const task = db.prepare('SELECT title, urgency, requested_by FROM tasks WHERE id = 1').get();
    assert.equal(task.title, 'Antiga');
    assert.equal(task.urgency, 'normal');
    assert.equal(task.requested_by, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
