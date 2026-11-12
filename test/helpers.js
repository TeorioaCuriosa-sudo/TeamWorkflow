// Utilitários dos testes: arranca a aplicação em memória, com relógio controlável e um "email" falso.
import { after } from 'node:test';
import { createApp } from '../server.js';

const apps = [];
after(() => Promise.all(apps.map((a) => a.close())));

export const silent = { log() {}, warn() {}, error() {} };
export const ADMIN = { email: 'admin@teoria.pt', password: 'admin-pass-1' };

export function fakeMailer({ enabled = true } = {}) {
  return {
    enabled,
    from: 'Teoria Workflow <no-reply@teoria.pt>',
    host: 'smtp.teste',
    sent: [],
    async send(msg) {
      this.sent.push(msg);
      return { ok: true };
    },
  };
}

/** Cliente HTTP com um cookie de sessão. */
function client(base, cookie = '') {
  const self = {
    cookie,
    async call(method, path, body, headers = {}) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(self.cookie ? { Cookie: self.cookie } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : await res.text();
      return { status: res.status, data, headers: res.headers };
    },
    async login(email, password) {
      const r = await self.call('POST', '/api/login', { email, password });
      if (r.status === 200) self.cookie = r.headers.get('set-cookie').split(';')[0];
      return r;
    },
  };
  return self;
}

/**
 * Arranca uma instância. `admin` já tem sessão iniciada. `people` cria pessoas adicionais (já com a palavra-passe definida
 * por elas) e devolve um cliente para cada uma em `t.users[nome]`.
 */
export async function setup({ env = {}, people = [], mailer = fakeMailer(), start = '2026-10-15T10:00:00Z', dbFile = ':memory:', loginAdmin = true } = {}) {
  let current = new Date(start);
  const app = createApp({
    dbFile,
    now: () => current,
    mailer,
    log: silent,
    env: { APP_TZ: 'Europe/Lisbon', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, APP_URL: 'https://workflow.teoria.pt', PRESENCE_GRACE_MS: '40', ...env },
  });
  apps.push(app);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const admin = client(base);
  if (loginAdmin) {
    const r = await admin.login(ADMIN.email, ADMIN.password);
    if (r.status !== 200) throw new Error(`Login do administrador falhou: ${r.status} ${JSON.stringify(r.data)}`);
  }

  const t = {
    app, base, admin, mailer, users: {}, ids: { admin: 1 },
    anon: () => client(base),
    call: (...args) => admin.call(...args),
    setNow: (iso) => { current = new Date(iso); },
  };

  for (const p of people) {
    const created = await admin.call('POST', '/api/members', { name: p.name, email: p.email, role: p.role ?? 'member', password: 'palavra-temp-1' });
    if (created.status !== 201) throw new Error(`Criar ${p.name} falhou: ${JSON.stringify(created.data)}`);
    const c = client(base);
    await c.login(p.email, 'palavra-temp-1');
    const changed = await c.call('POST', '/api/me/password', { current: 'palavra-temp-1', next: p.password ?? 'palavra-final-1' });
    if (changed.status !== 200) throw new Error(`Mudar palavra-passe de ${p.name} falhou: ${JSON.stringify(changed.data)}`);
    t.users[p.name] = c;
    t.ids[p.name] = created.data.member.id;
  }
  return t;
}

export const TRIO = [
  { name: 'Ana', email: 'ana@teoria.pt' },
  { name: 'Bruno', email: 'bruno@teoria.pt' },
];

/** Lê eventos SSE até aparecer um com o nome pedido (ou esgotar o tempo). */
export async function waitForEvent(res, name, ms = 2000) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + ms;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r({ timeout: true }), Math.max(1, deadline - Date.now()))),
      ]);
      if (done || !value) break;
      buffer += decoder.decode(value);
      const match = new RegExp(`event: ${name}\\ndata: (.*)\\n`).exec(buffer);
      if (match) return JSON.parse(match[1]);
    }
    return null;
  } finally {
    reader.cancel().catch(() => {});
  }
}
