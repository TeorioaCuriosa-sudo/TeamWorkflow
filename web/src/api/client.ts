// Falar com o servidor. Todas as chamadas passam por aqui, por isso há um só sítio
// onde tratamos "a sessão terminou" e "tens de mudar a palavra-passe".

/** Identifica este separador: o servidor devolve-o nos avisos em direto para não nos reenviar as nossas próprias alterações. */
export const CLIENT_ID = Math.random().toString(36).slice(2, 10);

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

interface Handlers {
  sessionLost: () => void;
  mustChangePassword: () => void;
}

const handlers: Handlers = { sessionLost: () => {}, mustChangePassword: () => {} };

/** A parte da aplicação que gere a sessão regista aqui o que fazer nestes dois casos. */
export function setApiHandlers(next: Partial<Handlers>): void {
  Object.assign(handlers, next);
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Client-Id': CLIENT_ID },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401 && path !== '/api/login') {
    handlers.sessionLost();
    throw new ApiError('Sessão terminada. Entra novamente.', 401, data);
  }
  if (res.status === 403 && data.must_change_password) handlers.mustChangePassword();
  if (!res.ok) throw new ApiError(typeof data.error === 'string' ? data.error : 'Ocorreu um erro.', res.status, data);
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T = { ok: boolean }>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const patch = <T = unknown>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T = unknown>(path: string, body?: unknown) => api<T>('DELETE', path, body);

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Ocorreu um erro.');
