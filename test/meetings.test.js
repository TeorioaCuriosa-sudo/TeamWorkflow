// Calendário: reuniões com link de videochamada, participantes, avisos e permissões.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setup } from './helpers.js';
import { openDb, MIGRATIONS } from '../lib/db.js';
import { linkProvider, meetingLink } from '../lib/meetings.js';

const CREW = [
  { name: 'Bruno', email: 'bruno@teoria.pt', role: 'comandante' },
  { name: 'Carla', email: 'carla@teoria.pt', role: 'marketing' },
  { name: 'Diogo', email: 'diogo@teoria.pt', role: 'member' },
];
const team = (opts = {}) => setup({ people: CREW, ...opts });
const notes = async (c) => (await c.call('GET', '/api/notifications')).data.items;
const state = async (c) => (await c.call('GET', '/api/state')).data;
const meeting = (over = {}) => ({ title: 'Ponto semanal', date: '2026-10-20', start_time: '10:00', end_time: '10:30', ...over });

test('link da reunião: aceita https (e acrescenta-o se faltar), recusa o resto, reconhece o serviço', () => {
  assert.equal(meetingLink('meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(meetingLink('  https://zoom.us/j/123?pwd=x  '), 'https://zoom.us/j/123?pwd=x');
  assert.equal(meetingLink(''), '');
  assert.equal(meetingLink(undefined), undefined);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.b/c', 'com um espaço.pt', 'localhost', 'https://']) {
    assert.throws(() => meetingLink(bad), /link/i, bad);
  }
  assert.equal(linkProvider('https://meet.google.com/x'), 'Google Meet');
  assert.equal(linkProvider('https://teams.microsoft.com/l/meetup-join/x'), 'Microsoft Teams');
  assert.equal(linkProvider('https://us02web.zoom.us/j/1'), 'Zoom');
  assert.equal(linkProvider('https://exemplo.pt/sala'), null);
});

test('qualquer pessoa marca uma reunião; todos a veem, com os participantes', async () => {
  const t = await team();
  const r = await t.users.Diogo.call('POST', '/api/meetings', meeting({ link: 'zoom.us/j/99', attendee_ids: [t.ids.Carla] }));
  assert.equal(r.status, 201);
  assert.equal(r.data.link, 'https://zoom.us/j/99');
  assert.deepEqual(r.data.attendee_ids, [t.ids.Carla, t.ids.Diogo].sort((a, b) => a - b), 'quem marca fica sempre incluído');
  assert.equal(r.data.created_by, t.ids.Diogo);
  for (const who of ['Bruno', 'Carla']) {
    const m = (await state(t.users[who])).meetings;
    assert.equal(m.length, 1, who);
    assert.equal(m[0].title, 'Ponto semanal');
  }
});

test('validação: título, data, horas e participantes', async () => {
  const t = await team();
  const post = (body) => t.users.Carla.call('POST', '/api/meetings', body);
  assert.equal((await post(meeting({ title: '  ' }))).status, 400);
  assert.equal((await post(meeting({ title: 'x'.repeat(121) }))).status, 400);
  assert.equal((await post(meeting({ date: '2026-02-30' }))).status, 400);
  assert.equal((await post(meeting({ start_time: '25:00' }))).status, 400);
  assert.equal((await post(meeting({ start_time: '11:00', end_time: '10:00' }))).status, 400, 'fim antes do início');
  assert.equal((await post(meeting({ start_time: '10:00', end_time: '10:00' }))).status, 400);
  assert.equal((await post(meeting({ link: 'javascript:alert(1)' }))).status, 400);
  assert.equal((await post(meeting({ attendee_ids: [9999] }))).status, 400);
  assert.equal((await post(meeting({ attendee_ids: 'todos' }))).status, 400);
  assert.equal((await t.users.Carla.call('POST', '/api/meetings', {})).status, 400);
  assert.equal((await state(t.admin)).meetings.length, 0, 'nada ficou gravado');
});

test('só quem marcou (ou um administrador) altera e cancela; os outros só vêem', async () => {
  const t = await team();
  const m = (await t.users.Carla.call('POST', '/api/meetings', meeting())).data;
  for (const who of ['Bruno', 'Diogo']) {
    assert.equal((await t.users[who].call('PATCH', `/api/meetings/${m.id}`, { title: 'X' })).status, 403, who);
    assert.equal((await t.users[who].call('DELETE', `/api/meetings/${m.id}`)).status, 403, who);
  }
  const own = await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { title: 'Ponto de equipa', link: 'https://meet.google.com/aaa-bbbb-ccc' });
  assert.equal(own.status, 200);
  assert.equal(own.data.title, 'Ponto de equipa');
  assert.equal(own.data.date, '2026-10-20', 'o que não foi enviado mantém-se');
  assert.equal((await t.admin.call('PATCH', `/api/meetings/${m.id}`, { end_time: '11:00' })).status, 200);
  assert.equal((await t.users.Carla.call('PATCH', '/api/meetings/999', { title: 'X' })).status, 404);
  assert.equal((await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { start_time: '12:00' })).status, 400, 'fim (11:00) antes do novo início');
  assert.equal((await t.admin.call('DELETE', `/api/meetings/${m.id}`)).status, 200);
  assert.equal((await state(t.admin)).meetings.length, 0);
});

test('avisos: convite, alteração, retirada e cancelamento chegam aos participantes (não a quem agiu)', async () => {
  const t = await team();
  const m = (await t.users.Carla.call('POST', '/api/meetings', meeting({ title: 'Revisão', link: 'meet.google.com/x-y-z', attendee_ids: [t.ids.Bruno, t.ids.Diogo] }))).data;

  const invite = (await notes(t.users.Bruno))[0];
  assert.equal(invite.type, 'meeting');
  assert.equal(invite.meeting_id, m.id);
  assert.match(invite.text, /Carla convidou-te para “Revisão”.*às 10:00/);
  assert.equal((await notes(t.users.Carla)).length, 0, 'quem marca não é avisado');
  assert.equal((await notes(t.users.Diogo)).length, 1);

  // Mudar a hora avisa todos; mudar só as notas não avisa ninguém.
  await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { notes: 'Trazer o relatório' });
  assert.equal((await notes(t.users.Bruno)).length, 1);
  await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { start_time: '14:00', end_time: '15:00' });
  const changed = (await notes(t.users.Bruno))[0];
  assert.match(changed.text, /alterou a reunião “Revisão”.*14:00–15:00/);
  assert.equal((await notes(t.users.Diogo)).length, 2);

  // Tirar o Diogo avisa-o; juntar a Eva (administrador) convida-a.
  await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { attendee_ids: [t.ids.Bruno, t.ids.admin] });
  assert.match((await notes(t.users.Diogo))[0].text, /retirou-te da reunião “Revisão”/);
  assert.match((await notes(t.admin))[0].text, /convidou-te para “Revisão”/);
  assert.equal((await t.admin.call('GET', '/api/state')).data.meetings[0].attendee_ids.includes(t.ids.Diogo), false);

  // Cancelar avisa quem ficou; o aviso sobrevive à reunião (sem ligação).
  assert.equal((await t.users.Carla.call('DELETE', `/api/meetings/${m.id}`)).status, 200);
  const cancel = (await notes(t.users.Bruno))[0];
  assert.match(cancel.text, /cancelou a reunião “Revisão”/);
  assert.equal(cancel.meeting_id, null);
});

test('emails: só vão para quem os pediu, com a data, a hora e o link', async () => {
  const t = await team();
  await t.users.Bruno.call('PATCH', '/api/me', { mail_updates: true });
  await t.users.Carla.call('POST', '/api/meetings', meeting({ title: 'Cliente', link: 'https://teams.microsoft.com/l/meetup-join/abc', attendee_ids: [t.ids.Bruno, t.ids.Diogo] }));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(t.mailer.sent.length, 1, 'o Diogo não pediu emails de atualizações');
  const mail = t.mailer.sent[0];
  assert.equal(mail.to, 'bruno@teoria.pt');
  assert.match(mail.subject, /Reunião: Cliente/);
  assert.match(mail.text, /terça-feira, 20 de outubro/);
  assert.match(mail.text, /das 10:00 às 10:30/);
  assert.match(mail.text, /Microsoft Teams: https:\/\/teams\.microsoft\.com\/l\/meetup-join\/abc/);
  assert.match(mail.text, /Abrir no calendário: https:\/\/workflow\.teoria\.pt\/#meeting\/\d+/);
});

test('uma pessoa removida sai das reuniões; a reunião fica', async () => {
  const t = await team();
  const m = (await t.users.Carla.call('POST', '/api/meetings', meeting({ attendee_ids: [t.ids.Diogo] }))).data;
  assert.equal((await t.admin.call('DELETE', `/api/members/${t.ids.Diogo}`, { discard_open: true })).status, 200);
  const after = (await state(t.admin)).meetings;
  assert.equal(after.length, 1);
  assert.deepEqual(after[0].attendee_ids, [t.ids.Carla]);
  assert.equal(after[0].id, m.id);
  // Já não se convida alguém que saiu da equipa.
  assert.equal((await t.users.Carla.call('PATCH', `/api/meetings/${m.id}`, { attendee_ids: [t.ids.Diogo] })).status, 400);
});

test('a cópia de segurança inclui as reuniões', async () => {
  const t = await team();
  await t.users.Carla.call('POST', '/api/meetings', meeting({ attendee_ids: [t.ids.Bruno] }));
  const backup = (await t.admin.call('GET', '/api/backup')).data;
  assert.equal(backup.meetings.length, 1);
  assert.equal(backup.meeting_attendees.length, 2);
});

test('migração: uma base da versão 3 passa à 4 sem perder nada e fica pronta para reuniões', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mig4-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  for (let i = 0; i < 3; i += 1) old.exec(MIGRATIONS[i]);
  old.exec('PRAGMA user_version = 3');
  old.exec(`INSERT INTO members (name, color, active, created_at) VALUES ('Ana', '#cc8f1c', 1, '2026-10-01T00:00:00Z')`);
  old.exec(`INSERT INTO notifications (member_id, type, text, created_at) VALUES (1, 'assigned', 'antigo', '2026-10-01T00:00:00Z')`);
  old.close();

  const db = openDb(file);
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 1);
    assert.equal(db.prepare('SELECT meeting_id FROM notifications').get().meeting_id, null);
    db.prepare(`INSERT INTO meetings (title, date, start_time, end_time, created_by, created_at) VALUES ('Teste', '2026-10-20', '10:00', '11:00', 1, 'x')`).run();
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meetings').get().n, 1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
