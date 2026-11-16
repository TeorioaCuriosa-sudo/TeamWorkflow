// Tabela de rotas da API (depois do login). Cada rota recebe { params, query, body, user, fx, res }.
import * as repo from './repo.js';
import * as activity from './activity.js';
import * as people from './people.js';
import * as chat from './chat.js';
import * as direct from './direct.js';
import * as meetings from './meetings.js';
import * as files from './files.js';
import * as templates from './templates.js';
import { topics, projects } from './tags.js';
import { getState } from './state.js';
import { isMonth } from './dates.js';
import { HttpError, bad, id as idv } from './validate.js';
import { isAdmin, requireCommander } from './perms.js';

export const RAW = Symbol('raw'); // o handler já tratou da resposta (SSE, ficheiros)

export function registerRoutes(add, d) {
  const { db, today, nowIso, currentMonth, extraHolidays, mailer, onlineIds, emit, emitTo, sse, uploadsDir, maxUploadBytes } = d;

  const id = (v) => idv(v);
  const actorOf = (user) => ({ id: user.id, name: user.name, role: user.role, func: user.func });
  const requireAdmin = (user) => {
    if (!isAdmin(user)) throw new HttpError(403, 'Só os administradores podem fazer isto.');
  };
  const pub = (mid, user) => people.listMembers(db, { viewer: user, onlineIds: onlineIds(), nowIso: nowIso() }).find((m) => m.id === mid);

  // ---------- estado ----------

  add('GET', '/api/state', ({ query, user }) => {
    const cm = currentMonth();
    let month = isMonth(query.month) ? query.month : cm;
    if (month > cm) month = cm;
    return getState(db, {
      month, today: today(), currentMonth: cm, extraHolidays, viewer: user,
      onlineIds: onlineIds(), nowIso: nowIso(), mail: mailer, limits: { max_upload_mb: maxUploadBytes / 1048576 },
    });
  });

  add('GET', '/api/history', () => repo.getHistory(db, currentMonth()));

  // ---------- o meu perfil ----------

  add('PATCH', '/api/me', ({ body, user }) => {
    people.updateProfile(db, user.id, body, { nowIso: nowIso() });
    return { ok: true };
  });

  add('POST', '/api/me/password', async ({ body, user, tokenHash }) => {
    await people.changePassword(db, user.id, body, { keepTokenHash: tokenHash });
    return { ok: true };
  }, { status: 200 });

  // ---------- tarefas ----------

  add('POST', '/api/tasks', ({ body, user, fx }) =>
    repo.createTask(db, body, { month: currentMonth(), nowIso: nowIso(), actor: actorOf(user), fx }));
  add('GET', '/api/tasks/:id', ({ params }) => repo.getTaskDetail(db, id(params.id)));
  add('PATCH', '/api/tasks/:id', ({ params, body, user, fx }) =>
    repo.updateTask(db, id(params.id), body, { nowIso: nowIso(), actor: actorOf(user), fx }));
  add('DELETE', '/api/tasks/:id', ({ params, user, fx }) => repo.deleteTask(db, id(params.id), { actor: actorOf(user), fx }));

  add('POST', '/api/tasks/:id/events', ({ params, body, user, fx }) =>
    activity.addUpdate(db, id(params.id), body, { nowIso: nowIso(), actor: actorOf(user), fx }));
  add('POST', '/api/tasks/:id/approval', ({ params, body, user, fx }) =>
    activity.requestApproval(db, id(params.id), body, { nowIso: nowIso(), actor: actorOf(user), fx }));
  add('POST', '/api/approvals/:id/decision', ({ params, body, user, fx }) =>
    activity.decideApproval(db, id(params.id), body, { nowIso: nowIso(), actor: actorOf(user), fx }), { status: 200 });
  add('POST', '/api/approvals/:id/cancel', ({ params, user, fx }) =>
    activity.cancelApproval(db, id(params.id), { nowIso: nowIso(), actor: actorOf(user), fx }), { status: 200 });

  // ---------- tarefas recorrentes ----------

  add('POST', '/api/recurring', ({ body, user }) =>
    repo.createRecurring(db, body, { month: currentMonth(), nowIso: nowIso(), actor: actorOf(user) }));
  add('PATCH', '/api/recurring/:id', ({ params, body, user }) => repo.updateRecurring(db, id(params.id), body, { actor: actorOf(user) }));
  add('DELETE', '/api/recurring/:id', ({ params, user }) => repo.deleteRecurring(db, id(params.id), { month: currentMonth(), actor: actorOf(user) }));

  // ---------- pessoas (adicionar: comandantes e administradores; o resto: administradores) ----------

  add('POST', '/api/members', async ({ body, user }) => {
    requireCommander(user, 'adicionar pessoas');
    const { id: mid, temp_password } = await people.createMember(db, body, { nowIso: nowIso(), actor: actorOf(user) });
    return { member: pub(mid, user), temp_password };
  });
  add('PATCH', '/api/members/:id', ({ params, body, user }) => {
    people.updateMember(db, id(params.id), body, { actor: user });
    return pub(id(params.id), user);
  });
  add('POST', '/api/members/:id/reset-password', async ({ params, user }) => {
    requireAdmin(user);
    return people.resetPassword(db, id(params.id), { actor: user });
  }, { status: 200 });
  add('DELETE', '/api/members/:id', ({ params, body, user, fx }) => {
    requireAdmin(user);
    people.removeMember(db, id(params.id), body, { actor: actorOf(user), nowIso: nowIso(), fx });
  });

  // ---------- ausências ----------

  add('POST', '/api/absences', ({ body }) => repo.createAbsence(db, body));
  add('PATCH', '/api/absences/:id', ({ params, body }) => repo.updateAbsence(db, id(params.id), body));
  add('DELETE', '/api/absences/:id', ({ params }) => repo.deleteAbsence(db, id(params.id)));

  // ---------- modelos de tarefas (criar e aplicar: todos; alterar e apagar: quem criou, comandantes e administradores) ----------

  add('POST', '/api/templates', ({ body, user }) => templates.createTemplate(db, body, { nowIso: nowIso(), actor: actorOf(user) }));
  add('PATCH', '/api/templates/:id', ({ params, body, user }) => templates.updateTemplate(db, id(params.id), body, { actor: actorOf(user) }));
  add('DELETE', '/api/templates/:id', ({ params, user }) => templates.deleteTemplate(db, id(params.id), { actor: actorOf(user) }));
  add('POST', '/api/templates/:id/apply', ({ params, body, user, fx }) =>
    templates.applyTemplate(db, id(params.id), body, { month: currentMonth(), nowIso: nowIso(), actor: actorOf(user), fx, uploadsDir }));

  // ---------- ficheiros (enviar: todos; apagar: quem enviou, comandantes e administradores) ----------

  add('GET', '/api/files', ({ query }) => files.listFor(db, query.owner, id(query.id)));
  // O corpo é o próprio ficheiro (não JSON). O cabeçalho X-Filename é obrigatório: um formulário de outro site não o consegue enviar.
  add('POST', '/api/files', ({ req, query, user, fx }) =>
    files.saveUpload(db, uploadsDir, req, {
      type: query.owner, ownerId: id(query.id), name: req.headers['x-filename'], maxBytes: maxUploadBytes,
      actor: actorOf(user), nowIso: nowIso(), fx,
    }), { raw: true });
  add('GET', '/api/files/:id', ({ req, res, params, query }) => {
    files.sendFile(req, res, db, uploadsDir, id(params.id), { download: query.download === '1' });
    return RAW;
  });
  add('DELETE', '/api/files/:id', ({ params, user }) => files.removeFile(db, uploadsDir, id(params.id), { actor: actorOf(user) }));

  // ---------- reuniões (marcar: todos; alterar e cancelar: quem marcou e administradores) ----------

  add('POST', '/api/meetings', ({ body, user, fx }) => meetings.createMeeting(db, body, { nowIso: nowIso(), actor: actorOf(user), fx }));
  add('PATCH', '/api/meetings/:id', ({ params, body, user, fx }) =>
    meetings.updateMeeting(db, id(params.id), body, { nowIso: nowIso(), actor: actorOf(user), fx }));
  add('DELETE', '/api/meetings/:id', ({ params, user, fx }) => meetings.deleteMeeting(db, id(params.id), { actor: actorOf(user), fx }));

  // ---------- tópicos e projetos (criar: todos; alterar e apagar: comandantes e administradores) ----------

  for (const [path, store] of [['topics', topics], ['projects', projects]]) {
    add('POST', `/api/${path}`, ({ body }) => store.create(db, body, { nowIso: nowIso() }));
    add('PATCH', `/api/${path}/:id`, ({ params, body, user }) => {
      requireCommander(user, 'alterar projetos e tópicos');
      return store.update(db, id(params.id), body);
    });
    add('DELETE', `/api/${path}/:id`, ({ params, user }) => {
      requireCommander(user, 'apagar projetos e tópicos');
      return store.remove(db, id(params.id));
    });
  }

  // ---------- notificações ----------

  add('GET', '/api/notifications', ({ user }) => activity.listNotifications(db, user.id));
  add('POST', '/api/notifications/read', ({ body, user }) => {
    activity.markRead(db, user.id, body, nowIso());
    return { ok: true };
  }, { status: 200, silent: true });

  // ---------- chat ----------

  add('GET', '/api/chat', ({ query }) => chat.listMessages(db, { before: query.before, limit: query.limit }));
  add('POST', '/api/chat', ({ body, user }) => {
    const message = chat.postMessage(db, user, body, { nowIso: nowIso() });
    emit('chat', message);
    return message;
  }, { silent: true });
  add('DELETE', '/api/chat/:id', ({ params, user }) => {
    chat.deleteMessage(db, id(params.id), user);
    emit('chat-deleted', { id: id(params.id) });
  }, { silent: true });
  add('POST', '/api/chat/read', ({ body, user }) => {
    chat.markChatRead(db, user, body);
    return { ok: true };
  }, { status: 200, silent: true });

  // ---------- mensagens privadas ----------
  // Sem rotas de administração e sem eventos para mais ninguém: só as duas pessoas da conversa.

  add('GET', '/api/dm/:peer', ({ params, query, user }) => direct.listThread(db, user, id(params.peer), { before: query.before, limit: query.limit }));
  add('POST', '/api/dm/:peer', ({ params, body, user }) => {
    const message = direct.sendDirect(db, user, id(params.peer), body, { nowIso: nowIso() });
    emitTo([message.member_id, message.to_id], 'dm', message);
    return message;
  }, { silent: true });
  add('DELETE', '/api/dm/messages/:id', ({ params, user }) => {
    const gone = direct.deleteDirect(db, id(params.id), user);
    emitTo([gone.from_id, gone.to_id], 'dm-deleted', gone);
  }, { silent: true });
  add('POST', '/api/dm/:peer/read', ({ params, body, user }) => {
    direct.markDirectRead(db, user, id(params.peer), body, { nowIso: nowIso() });
    return { ok: true };
  }, { status: 200, silent: true });

  // ---------- exportações e administração ----------

  add('GET', '/api/export/:month', ({ params, res }) => {
    const month = params.month.replace(/\.csv$/, '');
    if (!isMonth(month)) throw bad('Mês inválido.');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tarefas-${month}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.end(repo.monthCsv(db, month));
    return RAW;
  });

  add('GET', '/api/backup', ({ res, user }) => {
    requireAdmin(user);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="teoria-workflow-backup-${today()}.json"`,
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(repo.fullBackup(db), null, 2));
    return RAW;
  });

  add('POST', '/api/admin/mail-test', async ({ user }) => {
    requireAdmin(user);
    if (!mailer.enabled) throw bad('O envio de email não está configurado (falta SMTP_HOST).');
    if (!user.email) throw bad('A tua conta não tem email.');
    const result = await mailer.send({
      to: user.email,
      subject: '[Teoria Workflow] Email de teste',
      text: 'Se estás a ler isto, o envio de emails da plataforma está a funcionar.',
      html: '<p>Se estás a ler isto, o envio de emails da plataforma está a funcionar.</p>',
    });
    if (!result.ok) throw bad(`Não foi possível enviar: ${result.error}`);
    return { ok: true, to: user.email };
  }, { status: 200, silent: true });

  // ---------- sincronização em direto ----------

  add('GET', '/api/events', ({ req, res, user }) => {
    sse.add(req, res, user.id);
    return RAW;
  });
}
