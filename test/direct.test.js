// Mensagens privadas: só as duas pessoas leem, contadores, leitura, apagar, entrega em direto só aos dois.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup } from './helpers.js';
import { openDb, MIGRATIONS } from '../lib/db.js';

const CREW = [
  { name: 'Bruno', email: 'bruno@teoria.pt', role: 'comandante' },
  { name: 'Carla', email: 'carla@teoria.pt', role: 'marketing' },
  { name: 'Diogo', email: 'diogo@teoria.pt', role: 'member' },
];
const team = (opts = {}) => setup({ people: CREW, ...opts });
const state = async (c) => (await c.call('GET', '/api/state')).data;
const thread = async (c, peer, q = '') => (await c.call('GET', `/api/dm/${peer}${q}`)).data;

/** Lê eventos SSE de uma ligação até acabar o tempo, devolvendo os que chegaram. */
async function listen(t, who, ms = 400) {
  const controller = new AbortController();
  const res = await fetch(`${t.base}/api/events`, { headers: { Cookie: who.cookie }, signal: controller.signal });
  const got = [];
  const done = (async () => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        for (const block of buf.split('\n\n').slice(0, -1)) {
          const ev = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (ev && ev !== 'changed') got.push({ event: ev, data: JSON.parse(data) });
        }
        buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
      }
    } catch { /* ligação terminada */ }
  })();
  return { got, stop: async () => { await new Promise((r) => setTimeout(r, ms)); controller.abort(); await done; return got; } };
}

test('enviar e receber: a conversa aparece aos dois, com contador só para quem recebe', async () => {
  const t = await team();
  const { Bruno, Carla } = t.users;
  const sent = await Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: '  Tens um minuto?  ' });
  assert.equal(sent.status, 201);
  assert.equal(sent.data.text, 'Tens um minuto?');
  assert.equal(sent.data.member_id, t.ids.Bruno, 'member_id é quem escreve (mesmo formato do chat)');
  assert.equal(sent.data.to_id, t.ids.Carla);

  const forCarla = (await state(Carla)).dm;
  assert.equal(forCarla.length, 1);
  assert.equal(forCarla[0].peer_id, t.ids.Bruno);
  assert.equal(forCarla[0].unread, 1);
  assert.equal(forCarla[0].last.text, 'Tens um minuto?');
  const forBruno = (await state(Bruno)).dm;
  assert.equal(forBruno[0].peer_id, t.ids.Carla);
  assert.equal(forBruno[0].unread, 0, 'quem escreve não tem nada por ler');

  const seen = await thread(Carla, t.ids.Bruno);
  assert.deepEqual(seen.messages.map((m) => m.text), ['Tens um minuto?']);
  assert.equal(seen.has_more, false);
  assert.deepEqual((await thread(Bruno, t.ids.Carla)).messages.map((m) => m.text), ['Tens um minuto?'], 'a mesma conversa vista do outro lado');
});

test('privacidade: terceiros e o administrador não veem a conversa nem o contador', async () => {
  const t = await team();
  await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'Segredo do Bruno e da Carla' });
  for (const [who, client] of [['Diogo', t.users.Diogo], ['admin', t.admin]]) {
    // O que o Diogo ou o administrador veem em /api/dm/:peer é sempre a sua própria conversa com essa pessoa.
    assert.equal((await thread(client, t.ids.Bruno)).messages.length, 0, who);
    assert.equal((await thread(client, t.ids.Carla)).messages.length, 0, who);
    assert.deepEqual((await state(client)).dm, [], `${who} não tem conversas`);
  }
  // Nem o texto, nem as conversas saem na cópia JSON do administrador.
  const backup = await t.admin.call('GET', '/api/backup');
  assert.equal(backup.status, 200);
  assert.equal(JSON.stringify(backup.data).includes('Segredo'), false);
  assert.equal('direct_messages' in backup.data, false);
  // Não existe nenhuma rota que liste mensagens alheias.
  for (const url of ['/api/dm', '/api/dm/all', '/api/direct']) assert.ok([404, 400].includes((await t.admin.call('GET', url)).status), url);
});

test('validação: texto, tamanho, a si próprio, pessoa inexistente, removida ou sem conta', async () => {
  const t = await team();
  const { Bruno } = t.users;
  const send = (peer, body) => Bruno.call('POST', `/api/dm/${peer}`, body);
  assert.equal((await send(t.ids.Carla, { text: '   ' })).status, 400);
  assert.equal((await send(t.ids.Carla, {})).status, 400);
  assert.equal((await send(t.ids.Carla, { text: 5 })).status, 400);
  assert.equal((await send(t.ids.Carla, { text: 'x'.repeat(2001) })).status, 400);
  assert.equal((await send(t.ids.Carla, { text: 'x'.repeat(2000) })).status, 201);
  assert.equal((await send(t.ids.Bruno, { text: 'olá' })).status, 400, 'não se escreve a si próprio');
  assert.equal((await send(9999, { text: 'olá' })).status, 404);
  assert.equal((await send('abc', { text: 'olá' })).status, 400);
  // Alguém que ainda não tem conta não pode ler.
  // (Só existe por migração de bases antigas: pela API, uma pessoa nova tem sempre conta.)
  const eva = Number(t.app.db.prepare(`INSERT INTO members (name, color, active, created_at) VALUES ('Eva', '#2f6fed', 1, '2026-10-01T00:00:00Z')`).run().lastInsertRowid);
  assert.equal((await send(eva, { text: 'olá' })).status, 400);
  // Removida a pessoa, deixa de se poder escrever-lhe.
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Diogo}`, { discard_open: true })).status, 200);
  assert.equal((await send(t.ids.Diogo, { text: 'olá' })).status, 404);
  assert.equal((await t.users.Carla.call('GET', `/api/dm/${t.ids.Diogo}`)).status, 404);
});

test('ler: marcar como lido desce o contador; responder conta como ter lido', async () => {
  const t = await team();
  const { Bruno, Carla } = t.users;
  const a = (await Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'um' })).data;
  const b = (await Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'dois' })).data;
  const c = (await Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'três' })).data;
  assert.equal((await state(Carla)).dm[0].unread, 3);

  assert.equal((await Carla.call('POST', `/api/dm/${t.ids.Bruno}/read`, { up_to: b.id })).status, 200);
  assert.equal((await state(Carla)).dm[0].unread, 1, 'só ficou por ler a última');
  // Um up_to inválido recusa; marcar a conversa de outra pessoa nunca mexe nas minhas.
  assert.equal((await Carla.call('POST', `/api/dm/${t.ids.Bruno}/read`, { up_to: 'x' })).status, 400);
  assert.equal((await t.users.Diogo.call('POST', `/api/dm/${t.ids.Bruno}/read`, { up_to: c.id })).status, 200);
  assert.equal((await state(Carla)).dm[0].unread, 1, 'o Diogo não leu as mensagens da Carla');

  await Carla.call('POST', `/api/dm/${t.ids.Bruno}`, { text: 'ok, já vi tudo' });
  assert.equal((await state(Carla)).dm[0].unread, 0, 'responder marca como lido');
  assert.equal((await state(Bruno)).dm[0].unread, 1, 'e o Bruno tem agora uma por ler');
  assert.ok(a.id < b.id);
});

test('lista de conversas: uma por pessoa, a mais recente primeiro, sem pessoas removidas', async () => {
  const t = await team();
  await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'para a Carla' });
  await t.users.Bruno.call('POST', `/api/dm/${t.ids.Diogo}`, { text: 'para o Diogo' });
  await t.users.Carla.call('POST', `/api/dm/${t.ids.Bruno}`, { text: 'resposta da Carla' });
  let dm = (await state(t.users.Bruno)).dm;
  assert.deepEqual(dm.map((c) => c.peer_id), [t.ids.Carla, t.ids.Diogo], 'a Carla respondeu por último');
  assert.equal(dm[0].last.text, 'resposta da Carla');
  assert.equal(dm[0].last.member_id, t.ids.Carla);
  // A pré-visualização é cortada.
  await t.users.Bruno.call('POST', `/api/dm/${t.ids.Diogo}`, { text: 'y'.repeat(500) });
  dm = (await state(t.users.Bruno)).dm;
  assert.equal(dm[0].last.text.length, 121);
  assert.ok(dm[0].last.text.endsWith('…'));
  // Ao remover a Carla, as conversas dela desaparecem de vez.
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Carla}`, { discard_open: true })).status, 200);
  assert.deepEqual((await state(t.users.Bruno)).dm.map((c) => c.peer_id), [t.ids.Diogo]);
  const left = t.app.db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE from_id = ? OR to_id = ?').get(t.ids.Carla, t.ids.Carla).n;
  assert.equal(left, 0, 'nada fica na base de dados');
});

test('paginação: as mais recentes primeiro, "antes de" traz as anteriores', async () => {
  const t = await team();
  for (let i = 1; i <= 7; i += 1) await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: `m${i}` });
  const page1 = await thread(t.users.Carla, t.ids.Bruno, '?limit=3');
  assert.deepEqual(page1.messages.map((m) => m.text), ['m5', 'm6', 'm7']);
  assert.equal(page1.has_more, true);
  const page2 = await thread(t.users.Carla, t.ids.Bruno, `?limit=3&before=${page1.messages[0].id}`);
  assert.deepEqual(page2.messages.map((m) => m.text), ['m2', 'm3', 'm4']);
  const page3 = await thread(t.users.Carla, t.ids.Bruno, `?limit=3&before=${page2.messages[0].id}`);
  assert.deepEqual(page3.messages.map((m) => m.text), ['m1']);
  assert.equal(page3.has_more, false);
});

test('apagar: só quem escreveu; nem o outro, nem o administrador, nem terceiros', async () => {
  const t = await team();
  const m = (await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'apaga-me' })).data;
  assert.equal((await t.users.Carla.call('DELETE', `/api/dm/messages/${m.id}`)).status, 403, 'o destinatário não apaga');
  assert.equal((await t.admin.call('DELETE', `/api/dm/messages/${m.id}`)).status, 404, 'o administrador nem a vê');
  assert.equal((await t.users.Diogo.call('DELETE', `/api/dm/messages/${m.id}`)).status, 404);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/dm/messages/${m.id}`)).status, 200);
  assert.equal((await t.users.Bruno.call('DELETE', `/api/dm/messages/${m.id}`)).status, 404);
  assert.deepEqual((await thread(t.users.Carla, t.ids.Bruno)).messages, []);
  assert.deepEqual((await state(t.users.Carla)).dm, []);
});

test('em direto: o evento só chega aos dois da conversa', async () => {
  const t = await team();
  const carla = await listen(t, t.users.Carla);
  const bruno = await listen(t, t.users.Bruno);
  const diogo = await listen(t, t.users.Diogo);
  const admin = await listen(t, t.admin);
  await new Promise((r) => setTimeout(r, 60));
  const m = (await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'só para ti' })).data;
  await t.users.Bruno.call('DELETE', `/api/dm/messages/${m.id}`);
  const [c, b, d, a] = await Promise.all([carla.stop(), bruno.stop(), diogo.stop(), admin.stop()]);
  assert.deepEqual(c.map((e) => e.event), ['dm', 'dm-deleted'], 'a Carla recebe');
  assert.deepEqual(b.map((e) => e.event), ['dm', 'dm-deleted'], 'o Bruno também (outros separadores)');
  assert.equal(c[0].data.text, 'só para ti');
  assert.equal(c[1].data.id, m.id);
  assert.deepEqual(d, [], 'o Diogo não recebe nada');
  assert.deepEqual(a, [], 'o administrador também não');
});

test('o chat da equipa continua separado das mensagens privadas', async () => {
  const t = await team();
  await t.users.Bruno.call('POST', '/api/chat', { text: 'olá equipa' });
  await t.users.Bruno.call('POST', `/api/dm/${t.ids.Carla}`, { text: 'olá Carla' });
  const s = await state(t.users.Carla);
  assert.equal(s.chat_unread, 1);
  assert.equal(s.dm[0].unread, 1);
  assert.deepEqual((await t.users.Diogo.call('GET', '/api/chat')).data.messages.map((m) => m.text), ['olá equipa']);
});

test('migração: uma base da versão 5 passa à 6 sem perder nada e fica pronta para mensagens privadas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mig6-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  for (let i = 0; i < 5; i += 1) old.exec(MIGRATIONS[i]);
  old.exec('PRAGMA user_version = 5');
  old.exec(`INSERT INTO members (name, color, active, created_at) VALUES ('Ana', '#cc8f1c', 1, '2026-10-01T00:00:00Z'), ('Rui', '#2f6fed', 1, '2026-10-01T00:00:00Z')`);
  old.exec(`INSERT INTO messages (member_id, text, created_at) VALUES (1, 'antiga', '2026-10-01T00:00:00Z')`);
  old.close();

  const db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1);
    db.prepare(`INSERT INTO direct_messages (from_id, to_id, text, created_at) VALUES (1, 2, 'olá', 'x')`).run();
    assert.equal(db.prepare('SELECT read_at FROM direct_messages').get().read_at, null);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
