// Falar com o servidor. Todas as chamadas passam por aqui, por isso há um só sítio
// onde tratamos "a sessão terminou" e "tens de mudar a palavra-passe".

import type { Attachment } from './types';

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

/**
 * Envia um ficheiro (o corpo do pedido é o próprio ficheiro). Usa XMLHttpRequest só porque o fetch não dá o progresso do envio.
 * O cabeçalho X-Filename também protege o servidor contra envios feitos a partir de outros sites.
 */
export function uploadFile(owner: string, ownerId: number, file: File, onProgress?: (fraction: number) => void): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files?owner=${encodeURIComponent(owner)}&id=${ownerId}`);
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-Client-Id', CLIENT_ID);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(xhr.responseText) as Record<string, unknown>; } catch { /* sem corpo */ }
      if (xhr.status === 401) handlers.sessionLost();
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as Attachment);
      else reject(new ApiError(typeof data.error === 'string' ? data.error : 'Não foi possível enviar o ficheiro.', xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError('Falhou a ligação ao servidor durante o envio. Tenta outra vez.', 0, {}));
    xhr.send(file);
  });
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Ocorreu um erro.');
