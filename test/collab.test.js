import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, fakeMailer, TRIO, waitForEvent } from './helpers.js';

const team = (opts = {}) => setup({ people: TRIO, ...opts });
const task = async (c, body) => (await c.call('POST', '/api/tasks', { kind: 'flex', ...body })).data;

// ---------- tópicos e projetos ----------

test('tópicos: criar, nome único (sem distinguir maiúsculas), renomear, cor inválida, apagar', async () => {
  const t = await team();
  const a = await t.admin.call('POST', '/api/topics', { name: ' Clientes ' });
  assert.equal(a.status, 201);
  assert.equal(a.data.name, 'Clientes');
  assert.match(a.data.color, /^#[0-9a-f]{6}$/);
  assert.equal((await t.users.Ana.call('POST', '/api/topics', { name: 'clientes' })).status, 409, 'um membro também cria tópicos, mas o nome é único');
  assert.equal((await t.admin.call('POST', '/api/topics', { name: '   ' })).status, 400);
  assert.equal((await t.admin.call('POST', '/api/topics', { name: 'X', color: 'vermelho' })).status, 400);
  assert.equal((await t.users.Bruno.call('PATCH', `/api/topics/${a.data.id}`, { name: 'Intruso' })).status, 403);
  const renamed = await t.admin.call('PATCH', `/api/topics/${a.data.id}`, { name: 'Clientes VIP', color: '#7c3aed' });
  assert.equal(renamed.data.name, 'Clientes VIP');
  assert.equal((await t.admin.call('GET', '/api/state')).data.topics.length, 1);
  assert.equal((await t.admin.call('DELETE', `/api/topics/${a.data.id}`)).status, 200);
  assert.equal((await t.admin.call('DELETE', `/api/topics/${a.data.id}`)).status, 404);
});

test('tarefas com projeto e vários tópicos; apagar o tópico/projeto não apaga a tarefa', async () => {
  const t = await team();
  const t1 = (await t.admin.call('POST', '/api/topics', { name: 'Urgente' })).data;
  const t2 = (await t.admin.call('POST', '/api/topics', { name: 'Financeiro' })).data;
  const p = (await t.admin.call('POST', '/api/projects', { name: 'Website' })).data;
  const created = await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Ana, title: 'Rever site', project_id: p.id, topic_ids: [t1.id, t2.id, t1.id] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.topic_ids, [t1.id, t2.id]);
  assert.equal(created.data.project_id, p.id);

  assert.equal((await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Ana, title: 'x', topic_ids: [999] })).status, 400);
  assert.equal((await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Ana, title: 'x', project_id: 999 })).status, 400);

  const upd = await t.admin.call('PATCH', `/api/tasks/${created.data.id}`, { topic_ids: [t2.id], project_id: null });
  assert.deepEqual(upd.data.topic_ids, [t2.id]);
  assert.equal(upd.data.project_id, null);
  await t.admin.call('PATCH', `/api/tasks/${created.data.id}`, { topic_ids: [t1.id, t2.id], project_id: p.id });

  await t.admin.call('DELETE', `/api/topics/${t1.id}`);
  await t.admin.call('DELETE', `/api/projects/${p.id}`);
  const after = (await t.admin.call('GET', '/api/state')).data.tasks.find((x) => x.id === created.data.id);
  assert.ok(after, 'a tarefa continua lá');
  assert.deepEqual(after.topic_ids, [t2.id]);
  assert.equal(after.project_id, null);
});

test('recorrentes: a cópia do mês seguinte herda projeto e tópicos; "aplicar ao modelo" atualiza-os', async () => {
  const t = await team();
  const topic = (await t.admin.call('POST', '/api/topics', { name: 'Interno' })).data;
  const topic2 = (await t.admin.call('POST', '/api/topics', { name: 'Contas' })).data;
  const proj = (await t.admin.call('POST', '/api/projects', { name: 'Operações' })).data;
  const first = await t.admin.call('POST', '/api/tasks', {
    member_id: t.ids.Ana, title: 'Fecho do mês', kind: 'monthly', repeat: true, project_id: proj.id, topic_ids: [topic.id],
  });
  assert.ok(first.data.recurring_id);

  t.setNow('2026-11-03T09:00:00Z');
  let nov = (await t.admin.call('GET', '/api/state')).data.tasks.find((x) => x.title === 'Fecho do mês');
  assert.equal(nov.month, '2026-11');
  assert.equal(nov.project_id, proj.id);
  assert.deepEqual(nov.topic_ids, [topic.id]);

  await t.admin.call('PATCH', `/api/tasks/${nov.id}`, { topic_ids: [topic.id, topic2.id], project_id: null, apply_to_recurring: true });
  t.setNow('2026-12-02T09:00:00Z');
  nov = (await t.admin.call('GET', '/api/state')).data.tasks.find((x) => x.title === 'Fecho do mês');
  assert.equal(nov.month, '2026-12');
  assert.equal(nov.project_id, null);
  assert.deepEqual(nov.topic_ids, [topic.id, topic2.id]);

  // Apagar um tópico também o tira do modelo.
  await t.admin.call('DELETE', `/api/topics/${topic2.id}`);
  const rec = (await t.admin.call('GET', '/api/state')).data.recurring.find((r) => r.title === 'Fecho do mês');
  assert.deepEqual(rec.topic_ids, [topic.id]);
});

test('o histórico e o CSV incluem projeto e tópicos', async () => {
  const t = await team();
  const tp = (await t.admin.call('POST', '/api/topics', { name: 'Clientes' })).data;
  const pj = (await t.admin.call('POST', '/api/projects', { name: 'CRM' })).data;
  await task(t.admin, { member_id: t.ids.Ana, title: 'Importar contactos', status: 'done', project_id: pj.id, topic_ids: [tp.id] });
  const csv = (await t.admin.call('GET', '/api/export/2026-10.csv')).data;
  assert.match(csv, /Mês;Pessoa;Tarefa;Tipo;Estado;Urgência;Pedida por;Projeto;Tópicos/);
  assert.match(csv, /Importar contactos;Semanal\/diária;Concluída;Normal;Administrador;CRM;Clientes/);
});

// ---------- atualizações ----------

test('a linha do tempo regista criação, estado, atribuição e atualizações', async () => {
  const t = await team();
  const tk = await task(t.users.Ana, { member_id: t.ids.Ana, title: 'Proposta' });
  await t.users.Ana.call('PATCH', `/api/tasks/${tk.id}`, { status: 'doing' });
  assert.equal((await t.users.Ana.call('PATCH', `/api/tasks/${tk.id}`, { member_id: t.ids.Bruno })).status, 403, 'só o administrador passa tarefas a outra pessoa');
  await t.admin.call('PATCH', `/api/tasks/${tk.id}`, { member_id: t.ids.Bruno });
  const upd = await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/events`, { text: ' Falta só o preço. ', status: 'done' });
  assert.equal(upd.status, 201);
  const types = upd.data.events.map((e) => e.type);
  assert.deepEqual(types, ['created', 'status', 'assigned', 'status', 'comment']);
  assert.equal(upd.data.events.at(-1).text, 'Falta só o preço.');
  assert.equal(upd.data.task.status, 'done');
  assert.equal(upd.data.task.comments, 1);
  assert.equal(upd.data.task.last_comment.text, 'Falta só o preço.');

  assert.equal((await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/events`, { text: '   ' })).status, 400);
  assert.equal((await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/events`, { text: 'x', status: 'feito' })).status, 400);
  assert.equal((await t.users.Bruno.call('POST', '/api/tasks/9999/events', { text: 'x' })).status, 404);
});

test('notificações: avisam o responsável e quem participou, nunca quem fez a ação', async () => {
  const t = await team();
  const tk = await task(t.users.Ana, { member_id: t.ids.Bruno, title: 'Relatório' });
  // A Ana (membro) pediu a tarefa ao Bruno: ele é avisado, ela não.
  let bruno = (await t.users.Bruno.call('GET', '/api/notifications')).data;
  assert.equal(bruno.unread, 1);
  assert.match(bruno.items[0].text, /Ana pediu-te/);
  assert.equal((await t.users.Ana.call('GET', '/api/notifications')).data.unread, 0);

  await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/events`, { text: 'Comecei hoje.' });
  await t.admin.call('POST', `/api/tasks/${tk.id}/events`, { text: 'Preciso disto até sexta.' });
  bruno = (await t.users.Bruno.call('GET', '/api/notifications')).data;
  assert.equal(bruno.items[0].task_id, tk.id);
  assert.match(bruno.items[0].text, /Preciso disto até sexta/);
  // O Bruno não recebe o seu próprio comentário.
  assert.ok(!bruno.items.some((n) => /Comecei hoje/.test(n.text)));
  // Quem já escreveu na tarefa passa a ser avisado das atualizações seguintes.
  assert.equal((await t.admin.call('GET', '/api/notifications')).data.unread, 0, 'o administrador ainda não participava');
  await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/events`, { text: 'Enviado.' });
  const adminNotes = (await t.admin.call('GET', '/api/notifications')).data;
  assert.ok(adminNotes.items.some((n) => /Enviado\./.test(n.text)), 'quem participou na conversa é avisado');

  // Estado visível no /api/state e pode ser marcado como lido.
  assert.equal((await t.users.Bruno.call('GET', '/api/state')).data.unread, bruno.unread);
  await t.users.Bruno.call('POST', '/api/notifications/read', { ids: [bruno.items[0].id] });
  assert.equal((await t.users.Bruno.call('GET', '/api/notifications')).data.unread, bruno.unread - 1);
  await t.users.Bruno.call('POST', '/api/notifications/read', { all: true });
  assert.equal((await t.users.Bruno.call('GET', '/api/notifications')).data.unread, 0);
  // Uma pessoa não consegue marcar as notificações de outra.
  await t.users.Ana.call('POST', '/api/notifications/read', { ids: adminNotes.items.map((n) => n.id) });
  assert.equal((await t.admin.call('GET', '/api/notifications')).data.unread, adminNotes.unread);
});

test('emails de atualizações só seguem para quem os pediu', async () => {
  const mailer = fakeMailer();
  const t = await team({ mailer });
  const tk = await task(t.users.Ana, { member_id: t.ids.Bruno, title: 'Relatório' });
  await t.app.flushMail();
  assert.equal(mailer.sent.length, 0, 'por omissão só há emails de aprovações');

  assert.equal((await t.users.Bruno.call('PATCH', '/api/me', { mail_updates: true })).status, 200);
  await t.users.Ana.call('POST', `/api/tasks/${tk.id}/events`, { text: 'Podes enviar hoje?' });
  await t.app.flushMail();
  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0].to, 'bruno@teoria.pt');
  assert.match(mailer.sent[0].subject, /^\[Teoria Workflow\] Atualização: Relatório/);
  assert.match(mailer.sent[0].text, new RegExp(`https://workflow.teoria.pt/#task/${tk.id}`));
});

// ---------- aprovações ----------

test('pedir aprovação: avisa por email, aparece como pendente e quem aprova responde', async () => {
  const mailer = fakeMailer();
  const t = await team({ mailer });
  const tk = await task(t.users.Bruno, { member_id: t.ids.Bruno, title: 'Contrato Silva', status: 'done' });

  const asked = await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana, note: 'Podes validar as cláusulas?' });
  assert.equal(asked.status, 201);
  assert.equal(asked.data.status, 'pending');
  await t.app.flushMail();
  assert.equal(mailer.sent.length, 1);
  const mail = mailer.sent[0];
  assert.equal(mail.to, 'ana@teoria.pt');
  assert.equal(mail.subject, '[Teoria Workflow] Pedido de aprovação: Contrato Silva');
  assert.match(mail.text, /Bruno pediu a tua aprovação/);
  assert.match(mail.text, /Podes validar as cláusulas\?/);
  assert.match(mail.text, new RegExp(`https://workflow.teoria.pt/#task/${tk.id}`));
  assert.match(mail.html, /Rever e responder/);

  // Estado visível a todos; quem aprova vê o pedido na sua lista.
  const state = (await t.users.Ana.call('GET', '/api/state')).data;
  assert.equal(state.tasks.find((x) => x.id === tk.id).approval.status, 'pending');
  assert.equal(state.pending_approvals.length, 1);
  assert.equal(state.pending_approvals[0].title, 'Contrato Silva');
  assert.equal((await t.users.Bruno.call('GET', '/api/state')).data.pending_approvals.length, 0);
  assert.equal((await t.users.Ana.call('GET', '/api/notifications')).data.items[0].type, 'approval_request');

  // Regras.
  assert.equal((await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Bruno })).status, 400);
  assert.equal((await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana })).status, 409);
  assert.equal((await t.users.Bruno.call('POST', `/api/approvals/${asked.data.id}/decision`, { decision: 'approved' })).status, 403);
  assert.equal((await t.users.Ana.call('POST', `/api/approvals/${asked.data.id}/decision`, { decision: 'talvez' })).status, 400);

  const decided = await t.users.Ana.call('POST', `/api/approvals/${asked.data.id}/decision`, { decision: 'rejected', note: 'Falta a cláusula 4.' });
  assert.equal(decided.status, 200);
  assert.equal(decided.data.status, 'rejected');
  await t.app.flushMail();
  assert.equal(mailer.sent.length, 2);
  assert.equal(mailer.sent[1].to, 'bruno@teoria.pt');
  assert.equal(mailer.sent[1].subject, '[Teoria Workflow] Rejeitada: Contrato Silva');
  assert.match(mailer.sent[1].text, /Falta a cláusula 4\./);
  assert.equal((await t.users.Ana.call('POST', `/api/approvals/${asked.data.id}/decision`, { decision: 'approved' })).status, 409);

  const detail = (await t.admin.call('GET', `/api/tasks/${tk.id}`)).data;
  assert.equal(detail.task.approval.status, 'rejected');
  assert.equal(detail.approvals.length, 1);
  assert.ok(detail.events.some((e) => e.type === 'approval' && /Rejeitou/.test(e.text)));
  assert.equal((await t.users.Bruno.call('GET', '/api/state')).data.pending_approvals.length, 0);

  // Depois de respondido pode pedir-se de novo (nova ronda), e um administrador também pode responder.
  const again = await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana, note: 'Corrigido.' });
  assert.equal(again.status, 201);
  assert.equal((await t.admin.call('POST', `/api/approvals/${again.data.id}/decision`, { decision: 'approved' })).status, 200);
  assert.equal((await t.admin.call('GET', `/api/tasks/${tk.id}`)).data.approvals.length, 2);
});

test('cancelar um pedido: só quem o fez (ou um administrador)', async () => {
  const t = await team();
  const tk = await task(t.users.Bruno, { member_id: t.ids.Bruno, title: 'X' });
  const a = (await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana })).data;
  assert.equal((await t.users.Ana.call('POST', `/api/approvals/${a.id}/cancel`, {})).status, 403);
  assert.equal((await t.users.Bruno.call('POST', `/api/approvals/${a.id}/cancel`, {})).data.status, 'cancelled');
  assert.equal((await t.users.Bruno.call('POST', `/api/approvals/${a.id}/cancel`, {})).status, 409);
  assert.equal((await t.users.Ana.call('GET', '/api/state')).data.pending_approvals.length, 0);
  assert.equal((await t.users.Ana.call('POST', `/api/approvals/${a.id}/decision`, { decision: 'approved' })).status, 409);
});

test('preferências de email e SMTP desligado: nada falha, a notificação interna mantém-se', async () => {
  const mailer = fakeMailer();
  const t = await team({ mailer });
  await t.users.Ana.call('PATCH', '/api/me', { mail_approvals: false });
  const tk = await task(t.users.Bruno, { member_id: t.ids.Bruno, title: 'Y' });
  await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana });
  await t.app.flushMail();
  assert.equal(mailer.sent.length, 0);
  assert.equal((await t.users.Ana.call('GET', '/api/notifications')).data.unread, 1);

  const off = await team({ mailer: fakeMailer({ enabled: false }) });
  const tk2 = await task(off.users.Bruno, { member_id: off.ids.Bruno, title: 'Z' });
  assert.equal((await off.users.Bruno.call('POST', `/api/tasks/${tk2.id}/approval`, { approver_id: off.ids.Ana })).status, 201);
  assert.equal(off.mailer.sent.length, 0);
  assert.equal((await off.admin.call('POST', '/api/admin/mail-test', {})).status, 400);
  assert.equal((await off.admin.call('GET', '/api/state')).data.mail.enabled, false);
});

test('um email que falha não estraga o pedido', async () => {
  const mailer = { ...fakeMailer(), async send() { return { ok: false, error: 'ligação recusada' }; } };
  const t = await team({ mailer });
  const tk = await task(t.users.Bruno, { member_id: t.ids.Bruno, title: 'Y' });
  const r = await t.users.Bruno.call('POST', `/api/tasks/${tk.id}/approval`, { approver_id: t.ids.Ana });
  assert.equal(r.status, 201);
  await t.app.flushMail();
});

test('email de teste do administrador', async () => {
  const mailer = fakeMailer();
  const t = await team({ mailer });
  const r = await t.admin.call('POST', '/api/admin/mail-test', {});
  assert.equal(r.status, 200);
  assert.equal(mailer.sent[0].to, 'admin@teoria.pt');
});

// ---------- chat ----------

test('chat: enviar, listar por páginas, não lidas, apagar', async () => {
  const t = await team();
  assert.equal((await t.users.Ana.call('POST', '/api/chat', { text: '   ' })).status, 400);
  assert.equal((await t.users.Ana.call('POST', '/api/chat', { text: 'x'.repeat(2001) })).status, 400);
  for (let i = 1; i <= 7; i += 1) await t.users[i % 2 ? 'Ana' : 'Bruno'].call('POST', '/api/chat', { text: `Mensagem ${i}` });

  const page1 = (await t.admin.call('GET', '/api/chat?limit=5')).data;
  assert.deepEqual(page1.messages.map((m) => m.text), ['Mensagem 3', 'Mensagem 4', 'Mensagem 5', 'Mensagem 6', 'Mensagem 7']);
  assert.equal(page1.has_more, true);
  const page2 = (await t.admin.call('GET', `/api/chat?limit=5&before=${page1.messages[0].id}`)).data;
  assert.deepEqual(page2.messages.map((m) => m.text), ['Mensagem 1', 'Mensagem 2']);
  assert.equal(page2.has_more, false);

  // Não lidas: as minhas não contam; ler até à última zera.
  assert.equal((await t.admin.call('GET', '/api/state')).data.chat_unread, 7);
  // Enviar uma mensagem conta como ter lido tudo até aí: a Ana (última mensagem: 7) não tem nada por ler;
  // o Bruno (última: 6) só tem a 7, que é da Ana.
  assert.equal((await t.users.Ana.call('GET', '/api/state')).data.chat_unread, 0);
  assert.equal((await t.users.Bruno.call('GET', '/api/state')).data.chat_unread, 1);
  await t.admin.call('POST', '/api/chat/read', { up_to: page1.messages.at(-1).id });
  assert.equal((await t.admin.call('GET', '/api/state')).data.chat_unread, 0);
  await t.users.Bruno.call('POST', '/api/chat', { text: 'Nova' });
  assert.equal((await t.admin.call('GET', '/api/state')).data.chat_unread, 1);

  // Apagar: as próprias, ou qualquer uma se for administrador.
  const last = (await t.admin.call('GET', '/api/chat?limit=1')).data.messages[0];
  assert.equal((await t.users.Ana.call('DELETE', `/api/chat/${last.id}`)).status, 403);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/chat/${last.id}`)).status, 200);
  const other = (await t.admin.call('GET', '/api/chat?limit=1')).data.messages[0];
  assert.equal((await t.admin.call('DELETE', `/api/chat/${other.id}`)).status, 200);
  assert.equal((await t.admin.call('DELETE', `/api/chat/${other.id}`)).status, 404);
});

test('chat: as mensagens chegam em direto a quem está ligado', async () => {
  const t = await team();
  const sse = await fetch(`${t.base}/api/events`, { headers: { Cookie: t.users.Ana.cookie } });
  assert.equal(sse.status, 200);
  const waiting = waitForEvent(sse, 'chat');
  await new Promise((r) => setTimeout(r, 50));
  await t.users.Bruno.call('POST', '/api/chat', { text: 'Olá equipa' });
  const msg = await waiting;
  assert.equal(msg.text, 'Olá equipa');
  assert.equal(msg.member_id, t.ids.Bruno);
});

// ---------- estado das pessoas ----------

test('estado: definir, mostrar aos outros, expirar sozinho e validar', async () => {
  const t = await team();
  const until = '2026-10-15T14:00:00.000Z'; // o relógio de teste está nas 10:00Z
  const set = await t.users.Bruno.call('PATCH', '/api/me', { status: 'meeting', status_text: 'Reunião com cliente', status_until: until });
  assert.equal(set.status, 200);
  let bruno = (await t.users.Ana.call('GET', '/api/state')).data.members.find((m) => m.id === t.ids.Bruno);
  assert.equal(bruno.status, 'meeting');
  assert.equal(bruno.status_text, 'Reunião com cliente');
  assert.equal(bruno.status_until, until);

  assert.equal((await t.users.Bruno.call('PATCH', '/api/me', { status: 'dormir' })).status, 400);
  assert.equal((await t.users.Bruno.call('PATCH', '/api/me', { status: 'busy', status_until: '2020-01-01T00:00:00Z' })).status, 400);
  assert.equal((await t.users.Bruno.call('PATCH', '/api/me', { status: 'busy', status_until: '2030-01-01T00:00:00Z' })).status, 400);
  assert.equal((await t.users.Bruno.call('PATCH', '/api/me', { status: 'busy', status_text: 'x'.repeat(81) })).status, 400);

  t.setNow('2026-10-15T14:30:00Z');
  bruno = (await t.users.Ana.call('GET', '/api/state')).data.members.find((m) => m.id === t.ids.Bruno);
  assert.equal(bruno.status, 'available', 'o prazo passou');
  assert.equal(bruno.status_text, '');

  await t.users.Bruno.call('PATCH', '/api/me', { status: 'remote', status_text: 'Em casa' });
  await t.users.Bruno.call('PATCH', '/api/me', { status: 'available' });
  bruno = (await t.users.Ana.call('GET', '/api/state')).data.members.find((m) => m.id === t.ids.Bruno);
  assert.equal(bruno.status, 'available');
  assert.equal(bruno.status_text, '', 'voltar a "disponível" limpa a mensagem');
});

test('presença: aparece online enquanto há uma ligação em direto', async () => {
  const t = await team();
  const stateOf = async (name) => (await t.admin.call('GET', '/api/state')).data.members.find((m) => m.id === t.ids[name]);
  assert.equal((await stateOf('Ana')).online, false);
  const controller = new AbortController();
  const sse = await fetch(`${t.base}/api/events`, { headers: { Cookie: t.users.Ana.cookie }, signal: controller.signal });
  await sse.body.getReader().read();
  assert.equal((await stateOf('Ana')).online, true);
  controller.abort();
  await new Promise((r) => setTimeout(r, 150)); // PRESENCE_GRACE_MS=40 nos testes
  const ana = await stateOf('Ana');
  assert.equal(ana.online, false);
  assert.ok(ana.last_seen);
});

test('SSE: os restantes clientes são avisados e o autor identifica-se', async () => {
  const t = await team();
  const sse = await fetch(`${t.base}/api/events`, { headers: { Cookie: t.users.Ana.cookie } });
  const waiting = waitForEvent(sse, 'changed');
  await new Promise((r) => setTimeout(r, 50));
  await t.users.Bruno.call('POST', '/api/tasks', { member_id: t.ids.Bruno, title: 'Ping' }, { 'X-Client-Id': 'abc123' });
  const evt = await waiting;
  assert.ok(evt);
});
