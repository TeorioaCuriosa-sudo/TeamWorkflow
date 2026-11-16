// Ficheiros anexados (projetos, tópicos, modelos e tarefas) e modelos de tarefas mensais e semanais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setup } from './helpers.js';
import { openDb, MIGRATIONS } from '../lib/db.js';
import { cleanName, kindOf, mimeFor, purgeOrphans } from '../lib/files.js';

const CREW = [
  { name: 'Bruno', email: 'bruno@teoria.pt', role: 'comandante' },
  { name: 'Carla', email: 'carla@teoria.pt', role: 'marketing' },
  { name: 'Diogo', email: 'diogo@teoria.pt', role: 'member' },
];
const team = (opts = {}) => setup({ people: CREW, ...opts });
const bytes = (n, fill = 65) => Buffer.alloc(n, fill);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** Envia um ficheiro como o browser faz: o corpo é o ficheiro e o nome vai num cabeçalho. */
async function upload(t, who, owner, ownerId, name, body, extra = {}) {
  const res = await fetch(`${t.base}/api/files?owner=${owner}&id=${ownerId}`, {
    method: 'POST',
    headers: { Cookie: who.cookie, 'X-Filename': encodeURIComponent(name), 'Content-Type': 'application/octet-stream', ...extra },
    body,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() };
}
async function download(t, who, aid, { query = '', headers = {} } = {}) {
  const res = await fetch(`${t.base}/api/files/${aid}${query}`, { headers: { Cookie: who.cookie, ...headers } });
  return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
}
const project = async (t, name = 'Website') => (await t.admin.call('POST', '/api/projects', { name })).data;
const topic = async (t, name = 'Clientes') => (await t.admin.call('POST', '/api/topics', { name })).data;
const state = async (c) => (await c.call('GET', '/api/state')).data;
const notes = async (c) => (await c.call('GET', '/api/notifications')).data.items;
const onDisk = (t) => fs.readdirSync(t.app.uploadsDir).filter((f) => !f.endsWith('.part'));

test('nomes e tipos: sem pastas nem caracteres de controlo; o tipo vem da extensão', () => {
  assert.equal(cleanName('../../etc/passwd'), 'passwd');
  assert.equal(cleanName('C:\\Users\\ana\\relatório final.PDF'), 'relatório final.PDF');
  assert.equal(cleanName(encodeURIComponent('Relatório  de   março.docx')), 'Relatório de março.docx');
  assert.equal(cleanName('a\u0000b\nc.png'), 'abc.png');
  assert.equal(cleanName('   '), 'ficheiro');
  assert.equal(cleanName('..'), 'ficheiro');
  const long = cleanName(`${'x'.repeat(300)}.pdf`);
  assert.ok(long.length <= 150 && long.endsWith('.pdf'));
  assert.equal(mimeFor('Foto.JPG'), 'image/jpeg');
  assert.equal(mimeFor('programa.exe'), 'application/octet-stream');
  assert.equal(kindOf('image/svg+xml'), 'file', 'SVG nunca é mostrado como imagem');
  assert.equal(kindOf('video/mp4'), 'video');
  assert.equal(kindOf('application/pdf'), 'pdf');
});

test('qualquer pessoa envia um ficheiro para um projeto; todos o veem e descarregam igual', async () => {
  const t = await team();
  const p = await project(t);
  const r = await upload(t, t.users.Diogo, 'project', p.id, 'logo.png', PNG, { 'Content-Type': 'text/html' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.name, 'logo.png');
  assert.equal(r.data.mime, 'image/png', 'o tipo vem da extensão, não do cabeçalho do browser');
  assert.equal(r.data.kind, 'image');
  assert.equal(r.data.size, PNG.length);
  assert.equal(r.data.uploaded_by, t.ids.Diogo);
  assert.equal(onDisk(t).length, 1);
  assert.ok(!onDisk(t)[0].includes('logo'), 'o nome no disco é aleatório');

  for (const who of [t.admin, t.users.Bruno, t.users.Carla]) {
    const list = await who.call('GET', `/api/files?owner=project&id=${p.id}`);
    assert.equal(list.data.length, 1);
    const got = await download(t, who, r.data.id);
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, PNG);
    assert.equal(got.headers.get('content-type'), 'image/png');
    assert.match(got.headers.get('content-disposition'), /^inline;/);
    assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
    assert.match(got.headers.get('content-security-policy'), /sandbox/);
  }
  const s = await state(t.users.Carla);
  assert.equal(s.files.length, 1, 'a biblioteca de ficheiros vai no estado');
  assert.equal(s.files[0].owner_type, 'project');
  assert.equal(s.limits.max_upload_mb, 50);
  assert.equal((await t.anon().call('GET', `/api/files/${r.data.id}`)).status, 401);
});

test('só se aceitam envios com o cabeçalho do nome (protege contra formulários de outros sites)', async () => {
  const t = await team();
  const p = await project(t);
  const noHeader = await fetch(`${t.base}/api/files?owner=project&id=${p.id}`, { method: 'POST', headers: { Cookie: t.admin.cookie }, body: bytes(10) });
  assert.equal(noHeader.status, 400);
  const form = await fetch(`${t.base}/api/files?owner=project&id=${p.id}`, {
    method: 'POST', headers: { Cookie: t.admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=b',
  });
  assert.equal(form.status, 400);
  assert.equal((await t.anon().call('POST', `/api/files?owner=project&id=${p.id}`, undefined, { 'X-Filename': 'a.txt' })).status, 401);
  assert.equal(onDisk(t).length, 0);
});

test('validação do envio: destino, vazio e limite de tamanho (MAX_UPLOAD_MB)', async () => {
  const t = await team({ env: { MAX_UPLOAD_MB: '0.002' } }); // ~2 KB
  const p = await project(t);
  assert.equal((await t.admin.call('GET', '/api/state')).data.limits.max_upload_mb, 0.002);
  assert.equal((await upload(t, t.admin, 'project', p.id, 'ok.txt', bytes(1500))).status, 201);

  const big = await upload(t, t.admin, 'project', p.id, 'grande.txt', bytes(5000));
  assert.equal(big.status, 413);
  assert.match(big.data.error, /maior do que o limite/);
  assert.equal((await upload(t, t.admin, 'project', p.id, 'vazio.txt', Buffer.alloc(0))).status, 400);
  assert.equal((await upload(t, t.admin, 'project', 9999, 'x.txt', bytes(10))).status, 404);
  assert.equal((await upload(t, t.admin, 'galeria', 1, 'x.txt', bytes(10))).status, 400);
  assert.equal((await upload(t, t.admin, 'project', 'abc', 'x.txt', bytes(10))).status, 400);

  assert.equal(onDisk(t).length, 1, 'só o primeiro ficou no disco');
  assert.equal(fs.readdirSync(t.app.uploadsDir).filter((f) => f.endsWith('.part')).length, 0, 'sem restos de envios falhados');
  assert.equal((await t.admin.call('GET', `/api/files?owner=project&id=${p.id}`)).data.length, 1);
});

test('descarga: só tipos seguros abrem no browser; Range para o vídeo; ?download=1 força o descarregamento', async () => {
  const t = await team();
  const p = await project(t);
  const clip = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
  const video = (await upload(t, t.admin, 'project', p.id, 'demo.mp4', clip)).data;
  const svg = (await upload(t, t.admin, 'project', p.id, 'desenho.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).data;
  const html = (await upload(t, t.admin, 'project', p.id, 'pagina.html', Buffer.from('<script>alert(1)</script>'))).data;
  const pdf = (await upload(t, t.admin, 'project', p.id, 'guia final.pdf', bytes(300))).data;

  const v = await download(t, t.admin, video.id);
  assert.equal(v.headers.get('accept-ranges'), 'bytes');
  assert.match(v.headers.get('content-disposition'), /^inline/);
  const part = await download(t, t.admin, video.id, { headers: { Range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/1000');
  assert.deepEqual(part.body, clip.subarray(100, 200));
  const tail = await download(t, t.admin, video.id, { headers: { Range: 'bytes=-50' } });
  assert.deepEqual(tail.body, clip.subarray(950));
  assert.equal((await download(t, t.admin, video.id, { headers: { Range: 'bytes=5000-' } })).status, 416);

  for (const f of [svg, html]) {
    const got = await download(t, t.admin, f.id);
    assert.match(got.headers.get('content-disposition'), /^attachment;/, f.name);
    assert.match(got.headers.get('content-security-policy'), /sandbox/);
  }
  assert.equal(html.mime, 'application/octet-stream');
  assert.equal((await download(t, t.admin, pdf.id)).headers.get('content-type'), 'application/pdf');
  const forced = await download(t, t.admin, pdf.id, { query: '?download=1' });
  assert.match(forced.headers.get('content-disposition'), /^attachment; filename="guia final.pdf"; filename\*=UTF-8''guia%20final\.pdf/);
  assert.equal((await download(t, t.admin, 9999)).status, 404);
});

test('apagar: quem enviou, comandantes e administradores; os outros não', async () => {
  const t = await team();
  const p = await project(t);
  const mine = (await upload(t, t.users.Diogo, 'project', p.id, 'meu.txt', bytes(20))).data;
  assert.equal((await t.users.Carla.call('DELETE', `/api/files/${mine.id}`)).status, 403);
  assert.equal(onDisk(t).length, 1);
  assert.equal((await t.users.Diogo.call('DELETE', `/api/files/${mine.id}`)).status, 200);
  assert.equal(onDisk(t).length, 0, 'o ficheiro sai do disco');

  const other = (await upload(t, t.users.Diogo, 'topic', (await topic(t)).id, 'outro.txt', bytes(20))).data;
  assert.equal((await t.users.Bruno.call('DELETE', `/api/files/${other.id}`)).status, 200, 'comandante');
  const again = (await upload(t, t.users.Diogo, 'project', p.id, 'terceiro.txt', bytes(20))).data;
  assert.equal((await t.admin.call('DELETE', `/api/files/${again.id}`)).status, 200, 'administrador');
  assert.equal((await t.admin.call('DELETE', `/api/files/${again.id}`)).status, 404);
});

test('ficheiros numa tarefa: ficam na linha do tempo, o responsável é avisado e o cartão mostra quantos há', async () => {
  const t = await team();
  const task = (await t.users.Carla.call('POST', '/api/tasks', { member_id: t.ids.Carla, title: 'Preparar a newsletter', kind: 'flex' })).data;
  assert.equal((await upload(t, t.users.Carla, 'task', task.id, 'minha.txt', bytes(10))).status, 201);
  assert.equal((await notes(t.users.Carla)).length, 0, 'não avisa quem anexou');

  const att = await upload(t, t.users.Bruno, 'task', task.id, 'proposta.pdf', bytes(2000));
  assert.equal(att.status, 201, 'qualquer pessoa pode anexar, como comentar');
  const n = (await notes(t.users.Carla))[0];
  assert.match(n.text, /Bruno anexou “proposta\.pdf” em “Preparar a newsletter”/);
  assert.equal(n.task_id, task.id);

  const detail = (await t.users.Carla.call('GET', `/api/tasks/${task.id}`)).data;
  assert.equal(detail.files.length, 2);
  assert.ok(detail.events.some((e) => e.text === 'Anexou “proposta.pdf”.' && e.meta.attachment_id === att.data.id));
  assert.equal((await state(t.admin)).tasks.find((x) => x.id === task.id).file_count, 2);
  // Os ficheiros de tarefas não vão no estado geral (carregam-se ao abrir a tarefa).
  assert.equal((await state(t.admin)).files.length, 0);

  // Remover um ficheiro da tarefa: quem a tem remove qualquer um (mesmo o que outra pessoa anexou); um colega sem relação não.
  assert.equal((await t.users.Diogo.call('DELETE', `/api/files/${att.data.id}`)).status, 403, 'um colega não apaga o que não é seu');
  assert.equal(onDisk(t).length, 2);
  assert.equal((await t.users.Carla.call('DELETE', `/api/files/${att.data.id}`)).status, 200, 'quem tem a tarefa');
  assert.equal((await t.users.Carla.call('GET', `/api/tasks/${task.id}`)).data.files.length, 1);
  assert.equal(onDisk(t).length, 1);
  assert.equal((await state(t.admin)).tasks.find((x) => x.id === task.id).file_count, 1);

  // Apagar a tarefa leva os ficheiros atrás.
  assert.equal((await t.users.Carla.call('DELETE', `/api/tasks/${task.id}`)).status, 200);
  assert.equal(onDisk(t).length, 0);
  assert.equal(t.app.db.prepare('SELECT COUNT(*) AS n FROM attachments').get().n, 0);
});

test('apagar um projeto, um tópico ou uma pessoa com tarefas leva os ficheiros; os restos de envios antigos também', async () => {
  const t = await team();
  const p = await project(t);
  const tp = await topic(t);
  await upload(t, t.admin, 'project', p.id, 'a.txt', bytes(10));
  await upload(t, t.admin, 'topic', tp.id, 'b.txt', bytes(10));
  const task = (await t.users.Diogo.call('POST', '/api/tasks', { member_id: t.ids.Diogo, title: 'X', kind: 'flex' })).data;
  await upload(t, t.admin, 'task', task.id, 'c.txt', bytes(10));
  assert.equal(onDisk(t).length, 3);

  await t.users.Bruno.call('DELETE', `/api/projects/${p.id}`);
  await t.users.Bruno.call('DELETE', `/api/topics/${tp.id}`);
  assert.equal(onDisk(t).length, 1);
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Diogo}`, { discard_open: true })).status, 200);
  assert.equal(onDisk(t).length, 0);

  // Um ficheiro solto no disco só é apagado depois de uma hora (pode ser um envio a meio).
  const stray = path.join(t.app.uploadsDir, `${'ab'.repeat(16)}.part`);
  fs.writeFileSync(stray, 'x');
  purgeOrphans(t.app.db, t.app.uploadsDir);
  assert.ok(fs.existsSync(stray), 'recente: fica');
  purgeOrphans(t.app.db, t.app.uploadsDir, Date.now() + 2 * 3600_000);
  assert.ok(!fs.existsSync(stray), 'antigo: apagado');
});

test('modelos: toda a gente cria; só quem criou, comandantes e administradores alteram e apagam', async () => {
  const t = await team();
  const p = await project(t);
  const tp = await topic(t);
  const r = await t.users.Diogo.call('POST', '/api/templates', {
    title: 'Relatório mensal', notes: 'Enviar até dia 5', kind: 'monthly', urgency: 'priority', project_id: p.id, topic_ids: [tp.id],
  });
  assert.equal(r.status, 201);
  assert.deepEqual({ ...r.data, id: 0, created_at: '' }, {
    id: 0, title: 'Relatório mensal', notes: 'Enviar até dia 5', kind: 'monthly', urgency: 'priority', project_id: p.id,
    topic_ids: [tp.id], created_by: t.ids.Diogo, created_at: '',
  });
  assert.equal((await state(t.users.Carla)).templates.length, 1, 'todos veem os modelos');

  assert.equal((await t.users.Carla.call('PATCH', `/api/templates/${r.data.id}`, { title: 'X' })).status, 403);
  assert.equal((await t.users.Carla.call('DELETE', `/api/templates/${r.data.id}`)).status, 403);
  const edit = await t.users.Diogo.call('PATCH', `/api/templates/${r.data.id}`, { kind: 'weekly', title: 'Relatório semanal' });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.kind, 'weekly');
  assert.equal(edit.data.notes, 'Enviar até dia 5', 'o que não foi enviado mantém-se');
  assert.equal((await t.users.Bruno.call('PATCH', `/api/templates/${r.data.id}`, { urgency: 'urgent' })).data.urgency, 'urgent', 'comandante');
  assert.equal((await t.users.Diogo.call('PATCH', `/api/templates/${r.data.id}`, { project_id: null, topic_ids: [] })).data.project_id, null);

  const post = (body) => t.users.Carla.call('POST', '/api/templates', body);
  assert.equal((await post({ title: '', kind: 'weekly' })).status, 400);
  assert.equal((await post({ title: 'X', kind: 'anual' })).status, 400);
  assert.equal((await post({ title: 'X', kind: 'weekly', urgency: 'ontem' })).status, 400);
  assert.equal((await post({ title: 'X', kind: 'weekly', project_id: 999 })).status, 400);
  assert.equal((await post({ title: 'X', kind: 'weekly', topic_ids: [999] })).status, 400);
  assert.equal((await t.users.Diogo.call('DELETE', `/api/templates/${r.data.id}`)).status, 200);
  assert.equal((await state(t.admin)).templates.length, 0);
});

test('aplicar um modelo: na tua coluna é uma tarefa, no cartão de outra pessoa é um pedido; os ficheiros vão juntos', async () => {
  const t = await team();
  const p = await project(t);
  const tp = await topic(t);
  const monthly = (await t.users.Carla.call('POST', '/api/templates', {
    title: 'Fecho do mês', notes: 'Ver o guia', kind: 'monthly', urgency: 'urgent', project_id: p.id, topic_ids: [tp.id],
  })).data;
  const weekly = (await t.users.Carla.call('POST', '/api/templates', { title: 'Revisão semanal', kind: 'weekly' })).data;
  await upload(t, t.users.Carla, 'template', monthly.id, 'guia.pdf', bytes(400));
  await upload(t, t.users.Carla, 'template', monthly.id, 'checklist.txt', bytes(50));
  assert.equal((await state(t.admin)).files.filter((f) => f.owner_type === 'template').length, 2);

  // Na própria coluna: tarefa normal, mensal, com projeto, tópicos, urgência e ficheiros.
  const own = await t.users.Carla.call('POST', `/api/templates/${monthly.id}/apply`, { member_id: t.ids.Carla });
  assert.equal(own.status, 201);
  assert.equal(own.data.title, 'Fecho do mês');
  assert.equal(own.data.kind, 'monthly');
  assert.equal(own.data.urgency, 'urgent');
  assert.equal(own.data.project_id, p.id);
  assert.deepEqual(own.data.topic_ids, [tp.id]);
  assert.equal(own.data.status, 'todo');
  assert.equal(own.data.requested_by, null);
  assert.equal(own.data.file_count, 2);
  const copied = (await t.users.Carla.call('GET', `/api/files?owner=task&id=${own.data.id}`)).data;
  assert.deepEqual(copied.map((f) => f.name), ['guia.pdf', 'checklist.txt']);
  const orig = (await download(t, t.admin, (await state(t.admin)).files.find((f) => f.name === 'guia.pdf').id)).body;
  assert.deepEqual((await download(t, t.admin, copied[0].id)).body, orig);
  assert.equal(onDisk(t).length, 4, 'os ficheiros são copiados, não partilhados');

  // Semanal: tarefa "semanal/diária" (flex).
  assert.equal((await t.users.Carla.call('POST', `/api/templates/${weekly.id}/apply`, { member_id: t.ids.Carla })).data.kind, 'flex');

  // No cartão de outra pessoa: é um pedido (sempre em Pendentes, nunca mensal) e ela é avisada.
  const asked = await t.users.Carla.call('POST', `/api/templates/${monthly.id}/apply`, { member_id: t.ids.Diogo });
  assert.equal(asked.status, 201);
  assert.equal(asked.data.member_id, t.ids.Diogo);
  assert.equal(asked.data.requested_by, t.ids.Carla);
  assert.equal(asked.data.kind, 'flex');
  assert.equal(asked.data.file_count, 2);
  assert.match((await notes(t.users.Diogo))[0].text, /Carla pediu-te a tarefa “Fecho do mês”/);

  // O administrador atribui diretamente.
  const given = await t.admin.call('POST', `/api/templates/${weekly.id}/apply`, { member_id: t.ids.Diogo });
  assert.equal(given.data.requested_by, t.ids.admin);
  assert.match((await notes(t.users.Diogo))[0].text, /atribuiu-te/);

  assert.equal((await t.users.Carla.call('POST', `/api/templates/${monthly.id}/apply`, { member_id: 9999 })).status, 400);
  assert.equal((await t.users.Carla.call('POST', '/api/templates/9999/apply', { member_id: t.ids.Carla })).status, 404);

  // Apagar o modelo (e o projeto e o tópico) não afeta as tarefas já criadas, nem os ficheiros delas.
  await t.users.Carla.call('DELETE', `/api/templates/${monthly.id}`);
  assert.equal(onDisk(t).length, 4, 'os 2 ficheiros do modelo saem; ficam os das duas tarefas (2 + 2)');
  assert.equal((await t.users.Carla.call('GET', `/api/files?owner=task&id=${own.data.id}`)).data.length, 2);
});

test('aplicar um modelo cujo projeto ou tópico foi apagado ignora-os em vez de falhar', async () => {
  const t = await team();
  const p = await project(t);
  const tp = await topic(t);
  const tpl = (await t.admin.call('POST', '/api/templates', { title: 'Antigo', kind: 'monthly', project_id: p.id, topic_ids: [tp.id] })).data;
  await t.admin.call('DELETE', `/api/projects/${p.id}`);
  await t.admin.call('DELETE', `/api/topics/${tp.id}`);
  const r = await t.admin.call('POST', `/api/templates/${tpl.id}/apply`, { member_id: t.ids.Bruno });
  assert.equal(r.status, 201);
  assert.equal(r.data.project_id, null);
  assert.deepEqual(r.data.topic_ids, []);
});

test('a cópia JSON inclui modelos e a lista de ficheiros (não os ficheiros)', async () => {
  const t = await team();
  const p = await project(t);
  await upload(t, t.admin, 'project', p.id, 'a.txt', bytes(10));
  await t.admin.call('POST', '/api/templates', { title: 'M', kind: 'weekly' });
  const backup = (await t.admin.call('GET', '/api/backup')).data;
  assert.equal(backup.templates.length, 1);
  assert.equal(backup.attachments.length, 1);
  assert.equal(backup.attachments[0].stored_name, undefined, 'sem o nome interno no disco');
});

test('migração: uma base da versão 4 passa à 5 sem perder nada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mig5-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  for (let i = 0; i < 4; i += 1) old.exec(MIGRATIONS[i]);
  old.exec('PRAGMA user_version = 4');
  old.exec(`INSERT INTO members (name, color, active, created_at) VALUES ('Ana', '#cc8f1c', 1, '2026-10-01T00:00:00Z')`);
  old.exec(`INSERT INTO meetings (title, date, start_time, end_time, created_by, created_at) VALUES ('Antiga', '2026-10-20', '10:00', '11:00', 1, 'x')`);
  old.close();

  const db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n, 1);
    db.prepare(`INSERT INTO templates (title, kind, created_by, created_at) VALUES ('T', 'monthly', 1, 'x')`).run();
    db.prepare(`INSERT INTO attachments (owner_type, owner_id, name, mime, size, stored_name, uploaded_by, created_at) VALUES ('template', 1, 'a', 'text/plain', 1, 'abc', 1, 'x')`).run();
    assert.throws(() => db.prepare(`INSERT INTO attachments (owner_type, owner_id, name, mime, size, stored_name, created_at) VALUES ('galeria', 1, 'a', 'x', 1, 'def', 'x')`).run());
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
