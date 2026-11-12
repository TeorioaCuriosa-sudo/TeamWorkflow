// Registo de atividade das tarefas e notificações. Tudo o que escreve na base de dados acontece
// dentro do pedido; os emails ficam em fila (`fx.mails`) e só são enviados depois de o pedido ter corrido bem.

export function logEvent(db, { task_id, member_id = null, type, text = '', meta = {}, nowIso }) {
  const res = db
    .prepare('INSERT INTO task_events (task_id, member_id, type, text, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(task_id, member_id, type, text, JSON.stringify(meta), nowIso);
  return Number(res.lastInsertRowid);
}

/**
 * Efeitos de um pedido. `notify` grava a notificação dentro da app e, se a pessoa quiser,
 * põe um email em fila. Nunca notifica quem fez a ação.
 */
export function createFx(db, nowIso) {
  const mails = [];
  const recipients = new Set();
  return {
    mails,
    recipients,
    notify({ to, actor = null, type, text, task_id = null, mail = null }) {
      if (!to || to === actor) return;
      const m = db
        .prepare('SELECT id, name, email, removed_at, mail_approvals, mail_updates FROM members WHERE id = ?')
        .get(to);
      if (!m || m.removed_at) return;
      db.prepare('INSERT INTO notifications (member_id, actor_id, type, text, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(to, actor, type, text, task_id, nowIso);
      recipients.add(to);
      if (mail && m.email && (mail.kind === 'approval' ? m.mail_approvals : m.mail_updates)) {
        mails.push({ to: m.email, name: m.name, task_id, ...mail });
      }
    },
  };
}
