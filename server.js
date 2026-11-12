import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb, ensureMonth } from './lib/db.js';
import { seedDemo, bootstrapAdmin } from './lib/seed.js';
import { registerRoutes, RAW } from './lib/routes.js';
import { HttpError, email as validEmail } from './lib/validate.js';
import { todayIn, monthOf, isDate } from './lib/dates.js';
import { hashPassword, verifyPassword, newToken, hashToken, checkPassword } from './lib/auth.js';
import { getMember, publicMe } from './lib/people.js';
import { createFx } from './lib/notify.js';
import { createMailer, renderMail } from './lib/mail.js';
import { pruneNotifications } from './lib/activity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

const SESSION_DAYS = 30;
// Sem estes, o login fica bloqueado quando o utilizador tem de mudar a palavra-passe.
const ALLOWED_WHEN_MUST_CHANGE = new Set(['/api/session', '/api/me/password', '/api/logout']);

export function createApp(opts = {}) {
  const env = opts.env ?? process.env;
  const tz = env.APP_TZ || 'Europe/Lisbon';
  const dbFile = opts.dbFile ?? path.join(env.DATA_DIR || path.join(__dirname, 'data'), 'teoria-workflow.db');
  const clock = opts.now ?? (() => new Date());
  const log = opts.log ?? console;
  const trustProxy = env.TRUST_PROXY === '1';
  const extraHolidays = (env.EXTRA_HOLIDAYS || '').split(',').map((s) => s.trim()).filter(isDate);
  const appUrl = (env.APP_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/+$/, '');
  const mailer = opts.mailer ?? createMailer(env);
  const graceMs = Number(env.PRESENCE_GRACE_MS ?? 6000); // recarregar a página não deve piscar "offline"

  // ---------- tempo ----------
  const today = () => todayIn(tz, clock());
  const nowIso = () => clock().toISOString();

  const db = openDb(dbFile);
  if (env.SEED_DEMO === '1') seedDemo(db, today(), nowIso());
  const boot = bootstrapAdmin(db, env, nowIso());
  const bootstrap = boot;

  let lastEnsured = null;
  const clients = new Map(); // res -> memberId
  const timers = new Set();

  // ---------- presença e sincronização em direto ----------
  const connections = new Map(); // memberId -> n.º de ligações abertas
  const grace = new Set(); // membros que acabaram de desligar
  const onlineIds = () => new Set([...[...connections].filter(([, n]) => n > 0).map(([m]) => m), ...grace]);

  function write(res, chunk) {
    try { res.write(chunk); } catch { /* ligação já fechada */ }
  }
  function emit(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients.keys()) write(res, payload);
  }
  const broadcast = (from = '') => emit('changed', { from, at: Date.now() });

  const sse = {
    add(req, res, memberId) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      const wasOnline = onlineIds().has(memberId);
      clients.set(res, memberId);
      connections.set(memberId, (connections.get(memberId) || 0) + 1);
      grace.delete(memberId);
      if (!wasOnline) broadcast('server');
      req.on('close', () => {
        if (!clients.delete(res)) return;
        const left = (connections.get(memberId) || 1) - 1;
        if (left > 0) { connections.set(memberId, left); return; }
        connections.delete(memberId);
        grace.add(memberId);
        const t = setTimeout(() => {
          timers.delete(t);
          if (connections.get(memberId)) return;
          grace.delete(memberId);
          try { db.prepare('UPDATE members SET last_seen = ? WHERE id = ?').run(nowIso(), memberId); } catch { /* base fechada */ }
          broadcast('server');
        }, graceMs);
        t.unref();
        timers.add(t);
      });
    },
  };

  /** Garante que o mês atual está aberto (renovação). Devolve o mês atual. */
  function currentMonth() {
    const month = monthOf(today());
    if (lastEnsured !== month) {
      const created = ensureMonth(db, month, nowIso());
      lastEnsured = month;
      if (created) broadcast('server');
    }
    return month;
  }

  // Cópia de segurança diária (SQLite VACUUM INTO: consistente mesmo com a app a escrever).
  const backupDir = dbFile === ':memory:' ? null : path.join(path.dirname(dbFile), 'backups');
  const keepBackups = Number(env.BACKUP_KEEP) || 30;
  function backupIfNeeded() {
    if (!backupDir) return;
    const file = path.join(backupDir, `teoria-workflow-${today()}.db`);
    if (fs.existsSync(file)) return;
    fs.mkdirSync(backupDir, { recursive: true });
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const all = fs.readdirSync(backupDir).filter((f) => /^teoria-workflow-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - keepBackups))) fs.rmSync(path.join(backupDir, f));
  }
  const maintenance = () => {
    try { currentMonth(); } catch (e) { log.error('Erro na renovação mensal:', e); }
    try { backupIfNeeded(); } catch (e) { log.error('Erro na cópia de segurança:', e); }
    try {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
      pruneNotifications(db, nowIso());
    } catch (e) { log.error('Erro na limpeza:', e); }
  };
  maintenance();
  const ticker = setInterval(maintenance, 60_000);
  ticker.unref();
  const pinger = setInterval(() => { for (const res of clients.keys()) write(res, ': ping\n\n'); }, 25_000);
  pinger.unref();

  // ---------- sessões ----------
  function cookies(req) {
    const out = {};
    for (const part of (req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  const clientIp = (req) =>
    (trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  const isSecure = (req) => env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https' || appUrl.startsWith('https://');
  const setCookie = (req, res, value, maxAge) =>
    res.setHeader('Set-Cookie', `tw_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`);

  function createSession(memberId) {
    const token = newToken();
    const now = nowIso();
    const expires = new Date(clock().getTime() + SESSION_DAYS * 24 * 3600_000).toISOString();
    db.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at, last_used) VALUES (?, ?, ?, ?, ?)')
      .run(hashToken(token), memberId, now, expires, now);
    return token;
  }

  function sessionUser(req) {
    const token = cookies(req).tw_session;
    if (!token) return null;
    const tokenHash = hashToken(token);
    const row = db.prepare('SELECT member_id, expires_at, last_used FROM sessions WHERE token_hash = ?').get(tokenHash);
    if (!row || row.expires_at <= nowIso()) return null;
    const m = getMember(db, row.member_id);
    if (!m || m.removed_at) return null;
    // A sessão renova-se com o uso (no máximo uma vez por hora).
    if (Date.parse(nowIso()) - Date.parse(row.last_used) > 3600_000) {
      const expires = new Date(clock().getTime() + SESSION_DAYS * 24 * 3600_000).toISOString();
      db.prepare('UPDATE sessions SET last_used = ?, expires_at = ? WHERE token_hash = ?').run(nowIso(), expires, tokenHash);
    }
    const { password_hash: _omit, ...user } = m;
    return { user, tokenHash };
  }

  const attempts = new Map();
  function throttle(key, limit = 10) {
    const now = Date.now();
    const a = attempts.get(key);
    if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + 10 * 60_000 }); return; }
    a.n += 1;
    if (a.n > limit) throw new HttpError(429, 'Demasiadas tentativas. Tenta novamente dentro de alguns minutos.');
  }

  // ---------- emails ----------
  const pendingMail = new Set();
  function deliver(fx) {
    if (!mailer.enabled) return;
    for (const m of fx.mails) {
      const link = m.task_id ? `${appUrl}/#task/${m.task_id}` : appUrl;
      const { text, html } = renderMail({ name: m.name, subject: m.subject, lines: m.lines, link, cta: m.cta });
      const p = mailer.send({ to: m.to, subject: `[Teoria Workflow] ${m.subject}`, text, html })
        .then((r) => { if (!r.ok) log.warn(`Email para ${m.to} falhou: ${r.error}`); })
        .finally(() => pendingMail.delete(p));
      pendingMail.add(p);
    }
  }

  // ---------- rotas ----------
  const routes = [];
  const add = (method, pattern, handler, { open = false, silent = false, status = null } = {}) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, open, silent, status });
  };

  add('GET', '/healthz', () => ({ ok: true }), { open: true });

  add('GET', '/api/session', ({ session }) => ({
    authenticated: Boolean(session),
    me: session ? publicMe(session.user, nowIso()) : null,
  }), { open: true });

  add('POST', '/api/login', async ({ req, res, body }) => {
    const mail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    throttle(`ip:${clientIp(req)}`, 20);
    if (mail) throttle(`email:${mail}`);
    const m = mail ? db.prepare('SELECT * FROM members WHERE lower(email) = ? AND removed_at IS NULL').get(mail) : undefined;
    const ok = await verifyPassword(body.password, m?.password_hash);
    if (!m || !ok) throw new HttpError(401, 'Email ou palavra-passe incorretos.');
    attempts.delete(`email:${mail}`);
    setCookie(req, res, createSession(m.id), SESSION_DAYS * 24 * 3600);
    return { ok: true, me: publicMe(m, nowIso()) };
  }, { open: true, silent: true, status: 200 });

  add('POST', '/api/logout', ({ req, res }) => {
    const token = cookies(req).tw_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    setCookie(req, res, '', 0);
    return { ok: true };
  }, { open: true, silent: true, status: 200 });

  registerRoutes(add, { db, today, nowIso, currentMonth, extraHolidays, mailer, onlineIds, emit, sse });

  // ---------- pedidos ----------
  function send(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 100_000) { reject(new HttpError(413, 'Pedido demasiado grande.')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!size) return resolve({});
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
          resolve(parsed);
        } catch { reject(new HttpError(400, 'JSON inválido.')); }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? '/index.html' : pathname;
    let file;
    try { file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(rel))); } catch { file = ''; }
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/') && pathname !== '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Método não permitido.' });
      return serveStatic(req, res, pathname);
    }

    try {
      const route = routes.find((r) => r.method === req.method && r.re.test(pathname));
      if (!route) throw new HttpError(404, 'Não encontrado.');

      const session = sessionUser(req);
      if (!route.open && !session) throw new HttpError(401, 'Sessão necessária.');
      if (session?.user.must_change_password && !route.open && !ALLOWED_WHEN_MUST_CHANGE.has(pathname)) {
        throw new HttpError(403, 'Tens de mudar a palavra-passe antes de continuar.', { must_change_password: true });
      }

      const mutating = req.method !== 'GET';
      let body = {};
      if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
        const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
        // Exigir JSON impede pedidos cruzados a partir de formulários HTML.
        if (hasBody && !String(req.headers['content-type'] || '').startsWith('application/json')) {
          throw new HttpError(415, 'Content-Type tem de ser application/json.');
        }
        body = await readBody(req);
      }

      const match = route.re.exec(pathname);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      const query = Object.fromEntries(url.searchParams);
      const clientId = String(req.headers['x-client-id'] || '').slice(0, 40);
      const fx = createFx(db, nowIso());

      const result = await route.handler({
        req, res, params, query, body, fx, session, user: session?.user, tokenHash: session?.tokenHash,
      });
      if (result === RAW) return;
      send(res, route.status ?? (mutating && req.method === 'POST' ? 201 : 200), result ?? { ok: true });
      if (mutating && !route.silent) broadcast(clientId);
      deliver(fx);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...(err.extra || {}) });
      log.error(`${req.method} ${pathname}`, err);
      send(res, 500, { error: 'Erro interno do servidor.' });
    }
  });

  let closed = false;
  function close() {
    if (closed) return Promise.resolve();
    closed = true;
    clearInterval(ticker);
    clearInterval(pinger);
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const res of clients.keys()) res.end();
    clients.clear();
    return new Promise((resolve) => {
      server.close(() => { db.close(); resolve(); });
      server.closeAllConnections?.();
    });
  }

  return {
    server, db, close, broadcast, currentMonth, maintenance, bootstrap, mailer, appUrl,
    flushMail: () => Promise.all([...pendingMail]),
  };
}

// Arranque direto: `node server.js`
const entry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** `node server.js --set-password email nova-palavra-passe`: recuperar o acesso se alguém se esquecer da palavra-passe. */
async function setPasswordCli(args) {
  const [mail, password] = args;
  if (!mail || !password) {
    console.error('Uso: node server.js --set-password <email> <nova-palavra-passe>');
    process.exit(2);
  }
  const dbFile = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'teoria-workflow.db');
  const db = openDb(dbFile);
  try {
    checkPassword(password);
    const m = db.prepare('SELECT id FROM members WHERE lower(email) = ? AND removed_at IS NULL').get(validEmail(mail));
    if (!m) throw new Error('Não existe nenhuma pessoa com esse email.');
    db.prepare('UPDATE members SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(await hashPassword(password), m.id);
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(m.id);
    console.log('Palavra-passe atualizada. A pessoa terá de a mudar no próximo acesso.');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (entry) {
  const i = process.argv.indexOf('--set-password');
  if (i !== -1) {
    await setPasswordCli(process.argv.slice(i + 1));
    process.exit(0);
  }
  const app = createApp();
  const port = Number(process.env.PORT) || 3000;
  app.server.listen(port, () => {
    console.log(`Teoria Workflow a correr em http://localhost:${port}`);
    if (app.bootstrap) {
      const b = app.bootstrap;
      console.log('────────────────────────────────────────────────────────────');
      console.log(`Conta de administrador criada: ${b.email}`);
      if (b.generated) {
        console.log(`Palavra-passe temporária:     ${b.password}`);
        console.log('(Será pedido que a mudes no primeiro acesso. Esta mensagem só aparece uma vez.)');
      } else {
        console.log('Palavra-passe: a definida em ADMIN_PASSWORD.');
      }
      console.log('────────────────────────────────────────────────────────────');
    }
    if (!app.mailer.enabled) console.log('Emails desligados (SMTP_HOST não definido): as notificações ficam só dentro da plataforma.');
    if (!process.env.APP_URL) console.warn('AVISO: APP_URL não definida; as ligações nos emails vão apontar para localhost.');
  });
  const stop = () => app.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
