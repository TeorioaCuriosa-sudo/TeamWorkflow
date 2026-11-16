// Primeiro administrador e dados de demonstração.
import { tx, COLORS } from './db.js';
import { hashPasswordSync, checkPassword, randomPassword } from './auth.js';
import { email as validEmail } from './validate.js';
import { addMonths, addDays } from './dates.js';

const hasAdmin = (db) =>
  db.prepare(`SELECT COUNT(*) AS n FROM members WHERE role = 'admin' AND removed_at IS NULL AND password_hash IS NOT NULL`).get().n > 0;

/**
 * Garante que existe pelo menos um administrador que consegue entrar.
 * Usa ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD; sem palavra-passe, gera uma temporária (a mostrar nos registos).
 */
export function bootstrapAdmin(db, env, nowIso) {
  if (hasAdmin(db)) return null;
  const mail = validEmail(env.ADMIN_EMAIL || 'admin@teoria.local');
  const name = (env.ADMIN_NAME || 'Administrador').trim().slice(0, 60) || 'Administrador';
  const generated = !env.ADMIN_PASSWORD;
  const password = generated ? randomPassword(14) : checkPassword(env.ADMIN_PASSWORD, 'ADMIN_PASSWORD');
  const hash = hashPasswordSync(password);
  const existing = db.prepare('SELECT id FROM members WHERE lower(email) = ?').get(mail);
  if (existing) {
    db.prepare(`UPDATE members SET role = 'admin', password_hash = ?, must_change_password = ?, removed_at = NULL, active = 1 WHERE id = ?`)
      .run(hash, generated ? 1 : 0, existing.id);
  } else {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM members').get();
    db.prepare(
      `INSERT INTO members (name, color, role, email, password_hash, must_change_password, created_at) VALUES (?, ?, 'admin', ?, ?, ?, ?)`,
    ).run(name, COLORS[n % COLORS.length], mail, hash, generated ? 1 : 0, nowIso);
  }
  return { email: mail, password, generated };
}

export const DEMO_PASSWORD = 'demo1234';

/** Dados de demonstração (SEED_DEMO=1): equipa de exemplo com contas, tarefas, histórico, ausências, chat e um pedido de aprovação. */
export function seedDemo(db, today, nowIso) {
  if (db.prepare('SELECT COUNT(*) AS n FROM members').get().n > 0) return false;
  const month = today.slice(0, 7);
  const prev = addMonths(month, -1);
  const prev2 = addMonths(month, -2);
  const stamp = (d, h = 10) => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const hash = hashPasswordSync(DEMO_PASSWORD);

  tx(db, () => {
    const mem = db.prepare(
      `INSERT INTO members (name, color, role, func, email, password_hash, status, status_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    mem.run('Ana', COLORS[0], 'admin', 'member', 'ana@exemplo.pt', hash, 'available', 'A rever propostas', nowIso);
    mem.run('Bruno', COLORS[1], 'member', 'comandante', 'bruno@exemplo.pt', hash, 'meeting', 'Reunião com cliente', nowIso);
    mem.run('Carla', COLORS[2], 'member', 'marketing', 'carla@exemplo.pt', hash, 'remote', '', nowIso);
    const ids = db.prepare('SELECT id FROM members ORDER BY id').all().map((r) => r.id);

    const proj = db.prepare('INSERT INTO projects (name, color, created_at) VALUES (?, ?, ?)');
    const projIds = [['Website', '#1d4ed8'], ['CRM interno', '#7c3aed'], ['Operações', '#15803d']].map(([n, c]) => Number(proj.run(n, c, nowIso).lastInsertRowid));
    const top = db.prepare('INSERT INTO topics (name, color, created_at) VALUES (?, ?, ?)');
    const topIds = [['Clientes', '#0e7490'], ['Campanhas', '#be185d'], ['Interno', '#475569'], ['Financeiro', '#b45309']].map(([n, c]) => Number(top.run(n, c, nowIso).lastInsertRowid));

    const rec = db.prepare('INSERT INTO recurring (member_id, title, notes, position, project_id, topic_ids) VALUES (?, ?, ?, ?, ?, ?)');
    const recs = [
      [ids[0], 'Relatório mensal de resultados', 'Enviar à direção até dia 5.', projIds[2], [topIds[2]]],
      [ids[0], 'Atualizar o dashboard de indicadores', '', projIds[2], [topIds[2]]],
      [ids[1], 'Fecho de faturação do mês', '', projIds[2], [topIds[3]]],
      [ids[1], 'Reconciliação de pagamentos', '', projIds[2], [topIds[3]]],
      [ids[2], 'Backup e atualizações do servidor', 'Confirmar que o backup foi restaurável.', projIds[2], [topIds[2]]],
      [ids[2], 'Revisão de acessos da equipa', '', null, [topIds[2]]],
    ];
    const recIds = recs.map((r, i) => Number(rec.run(r[0], r[1], r[2], i, r[3], JSON.stringify(r[4])).lastInsertRowid));

    const task = db.prepare(
      `INSERT INTO tasks (member_id, title, notes, kind, status, month, origin_month, due, recurring_id, project_id, position, created_at, started_at, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const link = db.prepare('INSERT OR IGNORE INTO task_topics (task_id, topic_id) VALUES (?, ?)');
    const ev = db.prepare(`INSERT INTO task_events (task_id, member_id, type, text, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    const extra = db.prepare('UPDATE tasks SET urgency = ?, requested_by = ? WHERE id = ?');
    const carry = db.prepare('INSERT INTO task_carries (task_id, from_month, to_month) VALUES (?, ?, ?)');
    let pos = 0;
    const add = (args, topicIds = [], { urgency = 'normal', requestedBy = null } = {}) => {
      const tid = Number(task.run(...args).lastInsertRowid);
      for (const t of topicIds) link.run(tid, t);
      ev.run(tid, requestedBy ?? args[0], 'created', requestedBy ? `Pedida por ${names[requestedBy]} a ${names[args[0]]}.` : 'Criada.', '{}', args[11]);
      if (urgency !== 'normal' || requestedBy) extra.run(urgency, requestedBy, tid);
      return tid;
    };
    const names = Object.fromEntries(db.prepare('SELECT id, name FROM members').all().map((r) => [r.id, r.name]));
    const carried = new Map(); // modelo recorrente -> tarefa que transitou para o mês atual

    // Histórico: dois meses anteriores quase todos concluídos.
    for (const [m, ndone] of [[prev2, 6], [prev, 5]]) {
      db.prepare('INSERT OR IGNORE INTO months (month, opened_at) VALUES (?, ?)').run(m, stamp(`${m}-01`, 8));
      recs.forEach((r, i) => {
        pos += 1;
        const done = i < ndone;
        const tid = add([r[0], r[1], r[2], 'monthly', done ? 'done' : 'todo', m, m, null, recIds[i], r[3], pos,
          stamp(`${m}-01`, 8), done ? stamp(`${m}-0${2 + (i % 6)}`) : null, done ? stamp(`${m}-1${i % 8}`) : null], r[4]);
        // As mensais por concluir transitam para o mês seguinte (e o último mês chega ao atual).
        if (!done) {
          if (m === prev2) { db.prepare('UPDATE tasks SET month = ? WHERE id = ?').run(prev, tid); carry.run(tid, prev2, prev); }
          else { db.prepare('UPDATE tasks SET month = ? WHERE id = ?').run(month, tid); carry.run(tid, prev, month); carried.set(recIds[i], tid); }
        }
      });
      [
        [ids[0], 'Preparar proposta para novo cliente', projIds[0]],
        [ids[1], 'Corrigir exportação de contratos', projIds[1]],
        [ids[2], 'Migrar formulário de contacto', projIds[0]],
        [ids[1], 'Formação interna sobre RGPD', null],
      ].forEach(([mid, title, pj]) => {
        pos += 1;
        add([mid, title, '', 'flex', 'done', m, m, null, null, pj, pos, stamp(`${m}-03`), stamp(`${m}-04`), stamp(`${m}-2${pos % 8}`)]);
      });
    }

    // Mês atual.
    db.prepare('INSERT OR IGNORE INTO months (month, opened_at) VALUES (?, ?)').run(month, nowIso);
    const day = (n3) => addDays(today, n3);
    recs.forEach((r, i) => {
      if (carried.has(recIds[i])) return; // a cópia que transitou conta como a deste mês
      pos += 1;
      const status = i === 0 ? 'done' : i === 2 ? 'doing' : 'todo';
      add([r[0], r[1], r[2], 'monthly', status, month, month, null, recIds[i], r[3], pos, nowIso,
        status !== 'todo' ? nowIso : null, status === 'done' ? nowIso : null], r[4]);
    });
    const flex = [
      [ids[0], 'Responder ao pedido do cliente sobre o portal', 'todo', day(2), projIds[0], [topIds[0], topIds[1]], { urgency: 'urgent' }],
      [ids[0], 'Rever copy da landing page', 'doing', day(1), projIds[0], [topIds[0]]],
      [ids[0], 'Atualizar documentação do fluxo de pedidos', 'done', null, projIds[1], [topIds[2]]],
      [ids[1], 'Corrigir validação do formulário de simulação', 'doing', day(-1), projIds[1], [topIds[1]], { urgency: 'critical' }],
      [ids[1], 'Agendar reunião de balanço trimestral', 'todo', day(5), null, [topIds[0]]],
      [ids[1], 'Enviar contratos pendentes para assinatura', 'done', null, projIds[2], [topIds[0], topIds[3]]],
      [ids[2], 'Configurar monitorização do servidor', 'doing', null, projIds[2], [topIds[2]]],
      [ids[2], 'Testar restauro da base de dados', 'todo', day(3), projIds[2], [], { urgency: 'priority' }],
      // Pedidos entre pessoas: ficam em Pendentes de quem os recebe.
      [ids[2], 'Preparar o texto de lançamento do novo portal', 'todo', day(4), projIds[0], [topIds[0]], { urgency: 'priority', requestedBy: ids[1] }],
      [ids[1], 'Aprovar o orçamento do evento de clientes', 'todo', day(2), null, [topIds[3]], { urgency: 'urgent', requestedBy: ids[2] }],
      [ids[0], 'Rever a apresentação para o cliente do portal', 'todo', day(3), projIds[0], [topIds[0]], { requestedBy: ids[2] }],
      [ids[2], 'Atualizar certificados do subdomínio', 'done', null, projIds[2], [topIds[2]]],
    ];
    const flexIds = flex.map(([mid, title, status, due, pj, tps, more]) => {
      pos += 1;
      return add([mid, title, '', 'flex', status, month, month, due, null, pj, pos, nowIso,
        status !== 'todo' ? nowIso : null, status === 'done' ? nowIso : null], tps, more);
    });
    const notif = db.prepare(`INSERT INTO notifications (member_id, actor_id, type, text, task_id, created_at) VALUES (?, ?, 'request', ?, ?, ?)`);
    flex.forEach((f, i) => {
      if (f[6]?.requestedBy) notif.run(f[0], f[6].requestedBy, `${names[f[6].requestedBy]} pediu-te a tarefa “${f[1]}”.`, flexIds[i], nowIso);
    });

    // Atividade e um pedido de aprovação pendente.
    ev.run(flexIds[1], ids[0], 'comment', 'Primeira versão do texto pronta, falta rever o título.', '{}', nowIso);
    ev.run(flexIds[3], ids[1], 'comment', 'O erro vem da data de início; já tenho a correção, falta testar.', '{}', nowIso);
    const aid = Number(db.prepare(
      `INSERT INTO approvals (task_id, requested_by, approver_id, status, request_note, created_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).run(flexIds[5], ids[1], ids[0], 'Podes confirmar antes de enviar?', nowIso).lastInsertRowid);
    ev.run(flexIds[5], ids[1], 'approval', 'Pediu aprovação a Ana. Podes confirmar antes de enviar?', JSON.stringify({ approval_id: aid, status: 'pending' }), nowIso);
    db.prepare(`INSERT INTO notifications (member_id, actor_id, type, text, task_id, created_at) VALUES (?, ?, 'approval_request', ?, ?, ?)`)
      .run(ids[0], ids[1], 'Bruno pediu a tua aprovação: “Enviar contratos pendentes para assinatura”.', flexIds[5], nowIso);

    const msg = db.prepare('INSERT INTO messages (member_id, text, created_at) VALUES (?, ?, ?)');
    msg.run(ids[0], 'Bom dia! Quem trata do cliente do portal hoje?', nowIso);
    msg.run(ids[2], 'Eu fico com isso depois do almoço.', nowIso);

    // Uma conversa privada de exemplo entre a Ana e o Bruno (a última mensagem, do Bruno, fica por ler).
    const dm = db.prepare('INSERT INTO direct_messages (from_id, to_id, text, created_at, read_at) VALUES (?, ?, ?, ?, ?)');
    dm.run(ids[0], ids[1], 'Bruno, tens cinco minutos para ver o pedido do portal?', nowIso, nowIso);
    dm.run(ids[1], ids[0], 'Já vi. Mando-te a versão final ainda hoje.', nowIso, null);

    const abs = db.prepare('INSERT INTO absences (member_id, start_date, end_date, type, note) VALUES (?, ?, ?, ?, ?)');
    abs.run(ids[2], addDays(today, 7), addDays(today, 11), 'ferias', '');
    abs.run(ids[1], addDays(today, 9), addDays(today, 20), 'ferias', 'Viagem em família');
    abs.run(ids[0], addDays(today, 14), addDays(today, 14), 'formacao', 'Formação Salesforce');

    const meet = db.prepare('INSERT INTO meetings (title, date, start_time, end_time, link, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const join = db.prepare('INSERT INTO meeting_attendees (meeting_id, member_id) VALUES (?, ?)');
    [
      ['Ponto de situação semanal', 0, '15:00', '15:30', 'https://meet.google.com/abc-defg-hij', 'Ver o que está bloqueado e o que entra esta semana.', ids[0], ids],
      ['Reunião com cliente do portal', 2, '10:00', '11:00', 'https://teams.microsoft.com/l/meetup-join/demo', '', ids[1], [ids[0], ids[1]]],
      ['Revisão da campanha', 3, '16:00', '16:45', 'https://zoom.us/j/1234567890', 'Rever textos e imagens antes de publicar.', ids[2], ids],
      ['Balanço trimestral', 8, '09:30', '11:00', '', 'Sala de reuniões do escritório.', ids[1], ids],
    ].forEach(([title, offset, from, to, link, notes, by, who]) => {
      const mid = Number(meet.run(title, addDays(today, offset), from, to, link, notes, by, nowIso).lastInsertRowid);
      for (const w of who) join.run(mid, w);
    });
  });
  return true;
}
