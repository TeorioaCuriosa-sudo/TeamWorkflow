import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setup, ADMIN, TRIO } from './helpers.js';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('sem sessão nada se vê; /healthz e /api/session são abertos', async () => {
  const t = await setup({ loginAdmin: false });
  const anon = t.anon();
  assert.equal((await anon.call('GET', '/api/state')).status, 401);
  assert.equal((await anon.call('GET', '/api/chat')).status, 401);
  assert.equal((await anon.call('GET', '/api/events')).status, 401);
  assert.equal((await anon.call('GET', '/healthz')).status, 200);
  assert.deepEqual((await anon.call('GET', '/api/session')).data, { authenticated: false, me: null });
});

test('login: cookie HttpOnly/SameSite, erro igual para email desconhecido e palavra-passe errada', async () => {
  const t = await setup({ loginAdmin: false });
  const anon = t.anon();
  const bad1 = await anon.call('POST', '/api/login', { email: ADMIN.email, password: 'errada-errada' });
  const bad2 = await anon.call('POST', '/api/login', { email: 'ninguem@teoria.pt', password: 'errada-errada' });
  assert.equal(bad1.status, 401);
  assert.equal(bad2.status, 401);
  assert.equal(bad1.data.error, bad2.data.error);

  const ok = await anon.login(ADMIN.email.toUpperCase(), ADMIN.password); // o email não distingue maiúsculas
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/, 'APP_URL é https, por isso o cookie é Secure');
  assert.equal(ok.data.me.role, 'admin');
  assert.equal((await anon.call('GET', '/api/state')).status, 200);
  assert.equal((await t.anon().call('GET', '/api/state', undefined, { Cookie: 'tw_session=inventado' })).status, 401);
});

test('login: limita tentativas repetidas por email', async () => {
  const t = await setup({ loginAdmin: false });
  const anon = t.anon();
  let last;
  for (let i = 0; i < 12; i += 1) last = await anon.call('POST', '/api/login', { email: ADMIN.email, password: 'nope-nope-nope' });
  assert.equal(last.status, 429);
  // Mesmo com a palavra-passe certa, enquanto durar o bloqueio.
  assert.equal((await anon.call('POST', '/api/login', { email: ADMIN.email, password: ADMIN.password })).status, 429);
});

test('terminar sessão invalida o cookie', async () => {
  const t = await setup();
  assert.equal((await t.admin.call('GET', '/api/state')).status, 200);
  const old = t.admin.cookie;
  await t.admin.call('POST', '/api/logout', {});
  assert.equal((await t.anon().call('GET', '/api/state', undefined, { Cookie: old })).status, 401);
});

test('primeiro administrador sem palavra-passe: gera uma temporária e obriga a mudá-la', async () => {
  const t = await setup({ env: { ADMIN_PASSWORD: '' }, loginAdmin: false });
  assert.ok(t.app.bootstrap.generated);
  assert.ok(t.app.bootstrap.password.length >= 12);
  const r = await t.admin.login(ADMIN.email, t.app.bootstrap.password);
  assert.equal(r.status, 200);
  assert.equal(r.data.me.must_change_password, true);

  const blocked = await t.admin.call('GET', '/api/state');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.must_change_password, true);
  assert.equal((await t.admin.call('GET', '/api/session')).status, 200);

  assert.equal((await t.admin.call('POST', '/api/me/password', { current: 'errada-1234', next: 'nova-palavra-1' })).status, 400);
  assert.equal((await t.admin.call('POST', '/api/me/password', { current: t.app.bootstrap.password, next: 'curta' })).status, 400);
  assert.equal((await t.admin.call('POST', '/api/me/password', { current: t.app.bootstrap.password, next: 'nova-palavra-1' })).status, 200);
  assert.equal((await t.admin.call('GET', '/api/state')).status, 200);
});

test('mudar a palavra-passe termina as outras sessões mas mantém a atual', async () => {
  const t = await setup();
  const other = t.anon();
  await other.login(ADMIN.email, ADMIN.password);
  assert.equal((await other.call('GET', '/api/state')).status, 200);
  assert.equal((await t.admin.call('POST', '/api/me/password', { current: ADMIN.password, next: 'outra-palavra-9' })).status, 200);
  assert.equal((await other.call('GET', '/api/state')).status, 401);
  assert.equal((await t.admin.call('GET', '/api/state')).status, 200);
  assert.equal((await t.anon().login(ADMIN.email, ADMIN.password)).status, 401);
  assert.equal((await t.anon().login(ADMIN.email, 'outra-palavra-9')).status, 200);
});

test('só administradores criam pessoas; email repetido é recusado; palavra-passe temporária é devolvida uma vez', async () => {
  const t = await setup({ people: [{ name: 'Ana', email: 'ana@teoria.pt' }] });
  const denied = await t.users.Ana.call('POST', '/api/members', { name: 'X', email: 'x@teoria.pt' });
  assert.equal(denied.status, 403);

  const created = await t.admin.call('POST', '/api/members', { name: 'Carla', email: 'Carla@Teoria.pt' });
  assert.equal(created.status, 201);
  assert.ok(created.data.temp_password.length >= 12);
  assert.equal(created.data.member.email, 'carla@teoria.pt');
  assert.equal((await t.admin.call('POST', '/api/members', { name: 'Outra', email: 'carla@teoria.pt' })).status, 409);
  assert.equal((await t.admin.call('POST', '/api/members', { name: 'Sem email' })).status, 400);
  assert.equal((await t.admin.call('POST', '/api/members', { name: 'Fraca', email: 'f@teoria.pt', password: 'curta' })).status, 400);

  const carla = t.anon();
  assert.equal((await carla.login('carla@teoria.pt', created.data.temp_password)).status, 200);
  assert.equal((await carla.call('GET', '/api/state')).status, 403, 'tem de mudar a palavra-passe primeiro');
});

test('permissões: cada pessoa edita o seu perfil; o resto é dos administradores', async () => {
  const t = await setup({ people: TRIO });
  const { Ana, Bruno } = t.users;
  assert.equal((await Ana.call('PATCH', `/api/members/${t.ids.Bruno}`, { name: 'Roubado' })).status, 403);
  assert.equal((await Ana.call('PATCH', `/api/members/${t.ids.Ana}`, { name: 'Ana Maria', color: '#e0662b' })).status, 200);
  assert.equal((await Ana.call('PATCH', `/api/members/${t.ids.Ana}`, { role: 'admin' })).status, 403);
  assert.equal((await Ana.call('PATCH', `/api/members/${t.ids.Ana}`, { active: false })).status, 403);
  assert.equal((await Bruno.call('POST', `/api/members/${t.ids.Ana}/reset-password`, {})).status, 403);
  assert.equal((await Bruno.call('DELETE', `/api/members/${t.ids.Ana}`)).status, 403);
  assert.equal((await Bruno.call('GET', '/api/backup')).status, 403);
  assert.equal((await Bruno.call('POST', '/api/admin/mail-test', {})).status, 403);

  // O administrador promove a Ana, que passa a poder gerir pessoas.
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.Ana}`, { role: 'admin' })).status, 200);
  assert.equal((await Ana.call('PATCH', `/api/members/${t.ids.Bruno}`, { name: 'Bruno Silva' })).status, 200);
  // Os emails só são visíveis para administradores e para o próprio.
  const seenByBruno = (await Bruno.call('GET', '/api/state')).data.members;
  assert.equal(seenByBruno.find((m) => m.id === t.ids.Bruno).email, 'bruno@teoria.pt');
  assert.equal(seenByBruno.find((m) => m.id === t.ids.Ana).email, undefined);
  const seenByAdmin = (await t.admin.call('GET', '/api/state')).data.members;
  assert.equal(seenByAdmin.find((m) => m.id === t.ids.Ana).email, 'ana@teoria.pt');
});

test('tem de existir sempre um administrador e não se pode remover a própria conta', async () => {
  const t = await setup({ people: TRIO });
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.admin}`, { role: 'member' })).status, 400);
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.admin}`)).status, 400);
  await t.admin.call('PATCH', `/api/members/${t.ids.Ana}`, { role: 'admin' });
  // Agora há dois: já se pode despromover um.
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.admin}`, { role: 'member' })).status, 200);
  // A Ana, único administrador restante, não pode ser despromovida nem removida pela outra.
  assert.equal((await t.admin.call('PATCH', `/api/members/${t.ids.Ana}`, { role: 'member' })).status, 403);
});

test('repor a palavra-passe de outra pessoa gera uma temporária e termina as sessões dela', async () => {
  const t = await setup({ people: TRIO });
  const reset = await t.admin.call('POST', `/api/members/${t.ids.Ana}/reset-password`, {});
  assert.equal(reset.status, 200);
  assert.equal((await t.users.Ana.call('GET', '/api/state')).status, 401);
  assert.equal((await t.anon().login('ana@teoria.pt', 'palavra-final-1')).status, 401);
  const again = t.anon();
  assert.equal((await again.login('ana@teoria.pt', reset.data.temp_password)).status, 200);
  assert.equal((await again.call('GET', '/api/state')).status, 403);
  assert.equal((await t.admin.call('POST', `/api/members/${t.ids.admin}/reset-password`, {})).status, 400);
});

test('remover pessoa: pede o destino das tarefas em aberto, mantém o histórico e fecha o acesso', async () => {
  const t = await setup({ people: TRIO });
  const mk = async (title, status = 'todo') => (await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Bruno, title, kind: 'flex', status })).data;
  const aberta = await mk('Em aberto');
  const feita = await mk('Já feita', 'done');
  await t.admin.call('POST', '/api/recurring', { member_id: t.ids.Bruno, title: 'Rotina do Bruno' });

  const blocked = await t.admin.call('DELETE', `/api/members/${t.ids.Bruno}`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.open_tasks, 2, 'a de Bruno em aberto + a cópia da recorrente');
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Bruno}`, { reassign_to: t.ids.Bruno })).status, 400);

  const oldCookie = t.users.Bruno.cookie;
  const removed = await t.admin.call('DELETE', `/api/members/${t.ids.Bruno}`, { reassign_to: t.ids.Ana });
  assert.equal(removed.status, 200);

  const state = (await t.admin.call('GET', '/api/state')).data;
  const bruno = state.members.find((m) => m.id === t.ids.Bruno);
  assert.equal(bruno.removed, true);
  assert.equal(bruno.active, false);
  assert.equal(state.tasks.find((x) => x.id === aberta.id).member_id, t.ids.Ana);
  assert.equal(state.tasks.find((x) => x.id === feita.id).member_id, t.ids.Bruno, 'o que ficou feito continua dele');
  assert.ok(state.recurring.every((r) => r.member_id !== t.ids.Bruno));
  const detail = (await t.admin.call('GET', `/api/tasks/${aberta.id}`)).data;
  assert.ok(detail.events.some((e) => e.type === 'assigned'));
  assert.equal((await t.users.Ana.call('GET', '/api/notifications')).data.items.some((n) => /passou-te/.test(n.text)), true);

  assert.equal((await t.anon().call('GET', '/api/state', undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await t.anon().login('bruno@teoria.pt', 'palavra-final-1')).status, 401);
  // O email fica livre e a pessoa pode voltar com uma conta nova.
  assert.equal((await t.admin.call('POST', '/api/members', { name: 'Bruno (novo)', email: 'bruno@teoria.pt' })).status, 201);
  // Não se criam tarefas para quem foi removido.
  assert.equal((await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Bruno, title: 'x' })).status, 400);
});

test('remover pessoa com a opção de descartar apaga só o que estava em aberto', async () => {
  const t = await setup({ people: TRIO });
  const aberta = (await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Bruno, title: 'A', kind: 'flex' })).data;
  const feita = (await t.admin.call('POST', '/api/tasks', { member_id: t.ids.Bruno, title: 'B', kind: 'flex', status: 'done' })).data;
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Bruno}`, { discard_open: true })).status, 200);
  const tasks = (await t.admin.call('GET', '/api/state')).data.tasks;
  assert.equal(tasks.find((x) => x.id === aberta.id), undefined);
  assert.ok(tasks.find((x) => x.id === feita.id));
  const hist = (await t.admin.call('GET', '/api/history')).data;
  assert.equal(hist[0].done, 1);
});

test('a cópia de segurança é só para administradores e não contém palavras-passe', async () => {
  const t = await setup({ people: TRIO });
  const backup = await t.admin.call('GET', '/api/backup');
  assert.equal(backup.status, 200);
  const raw = JSON.stringify(backup.data);
  assert.doesNotMatch(raw, /scrypt|password_hash|token_hash/);
  assert.equal(backup.data.members.length, 3);
});

test('recuperação: --set-password define uma nova palavra-passe e obriga a mudá-la', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-'));
  const file = path.join(dir, 'teoria-workflow.db');
  const first = await setup({ dbFile: file, loginAdmin: false });
  await first.app.close();

  const { stdout } = await run('node', [path.join(ROOT, 'server.js'), '--set-password', ADMIN.email, 'recuperada-123'], { env: { ...process.env, DATA_DIR: dir } });
  assert.match(stdout, /Palavra-passe atualizada/);
  await assert.rejects(run('node', [path.join(ROOT, 'server.js'), '--set-password', 'ninguem@teoria.pt', 'recuperada-123'], { env: { ...process.env, DATA_DIR: dir } }));

  const second = await setup({ dbFile: file, loginAdmin: false });
  assert.equal((await second.admin.login(ADMIN.email, ADMIN.password)).status, 401);
  const r = await second.admin.login(ADMIN.email, 'recuperada-123');
  assert.equal(r.status, 200);
  assert.equal(r.data.me.must_change_password, true);
  await second.app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
