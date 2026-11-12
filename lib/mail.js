// Envio de emails por SMTP. O nodemailer só é carregado se o SMTP estiver configurado,
// por isso a aplicação arranca e funciona sem ele (as notificações ficam só dentro da app).

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMailer(env = {}, { transportFactory } = {}) {
  const host = env.SMTP_HOST || '';
  const enabled = Boolean(host);
  const port = Number(env.SMTP_PORT) || (env.SMTP_SECURE === '1' ? 465 : 587);
  const from = env.MAIL_FROM || (env.SMTP_USER ? `Teoria Workflow <${env.SMTP_USER}>` : 'Teoria Workflow <no-reply@localhost>');
  let transport = null;

  async function getTransport() {
    if (transport) return transport;
    if (transportFactory) {
      transport = transportFactory();
    } else {
      let nodemailer;
      try {
        nodemailer = (await import('nodemailer')).default;
      } catch {
        throw new Error('O pacote "nodemailer" não está instalado. Corre "npm install".');
      }
      transport = nodemailer.createTransport({
        host,
        port,
        secure: env.SMTP_SECURE === '1',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    }
    return transport;
  }

  return {
    enabled,
    from,
    host,
    /** Nunca lança: devolve { ok, error }. Um email que falha não pode estragar a ação que o originou. */
    async send({ to, subject, text, html }) {
      if (!enabled) return { ok: false, error: 'SMTP não configurado.' };
      try {
        const t = await getTransport();
        await t.sendMail({ from, to, subject, text, html });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    },
  };
}

/** Texto e HTML simples (sem imagens remotas), com uma ligação para abrir a tarefa. */
export function renderMail({ name, subject, lines, link, cta = 'Abrir na plataforma' }) {
  const greeting = name ? `Olá ${name},` : 'Olá,';
  const text = [greeting, '', ...lines, '', link ? `${cta}: ${link}` : '', '', '— Teoria Workflow'].join('\n');
  const html = `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f5f4f2;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1d1d20">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #e6e4e1;border-top:4px solid #cc8f1c;border-radius:12px;padding:22px 22px 18px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a5c06;font-weight:700">Teoria Curiosa · Workflow</p>
<h1 style="margin:0 0 14px;font-size:18px;line-height:1.3">${esc(subject)}</h1>
<p style="margin:0 0 10px">${esc(greeting)}</p>
${lines.map((l) => `<p style="margin:0 0 10px;line-height:1.5">${esc(l)}</p>`).join('\n')}
${link ? `<p style="margin:18px 0 4px"><a href="${esc(link)}" style="display:inline-block;background:#cc8f1c;color:#1d1d20;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">${esc(cta)}</a></p>` : ''}
</div>
<p style="margin:12px 4px 0;font-size:12px;color:#6b6b72">Podes escolher que emails recebes no teu perfil, dentro da plataforma.</p>
</div></body></html>`;
  return { text, html };
}
