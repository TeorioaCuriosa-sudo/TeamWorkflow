// Erros HTTP e validação de entradas. Todas as mensagens são para mostrar ao utilizador.
import { isDate } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, extra = null) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Não encontrado.') => new HttpError(404, msg);
export const forbidden = (msg = 'Não tens permissão para fazer isto.') => new HttpError(403, msg);
export const conflict = (msg, extra = null) => new HttpError(409, msg, extra);

export function text(value, label, { max, required = false } = {}) {
  if (value === undefined) {
    if (required) throw bad(`${label} é obrigatório.`);
    return undefined;
  }
  if (typeof value !== 'string') throw bad(`${label} é inválido.`);
  const s = value.trim();
  if (required && !s) throw bad(`${label} é obrigatório.`);
  if (s.length > max) throw bad(`${label} é demasiado longo (máximo ${max} caracteres).`);
  return s;
}

export function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw bad(`${label} inválido.`);
  return value;
}

export function optionalDate(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!isDate(value)) throw bad(`${label} inválida.`);
  return value;
}

export function id(value, label = 'Identificador') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw bad(`${label} inválido.`);
  return n;
}

/** Lista de identificadores únicos. `undefined` mantém-se `undefined` (campo não enviado). */
export function idList(value, label, max = 12) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > max) throw bad(`${label} inválido.`);
  return [...new Set(value.map((v) => id(v, label)))];
}

export function color(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw bad('Cor inválida.');
  return value.toLowerCase();
}

export function email(value, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw bad('O email é obrigatório.');
    return undefined;
  }
  if (typeof value !== 'string') throw bad('O email é inválido.');
  const s = value.trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(s)) throw bad('O email é inválido.');
  return s;
}

export const bool = (v) => (v ? 1 : 0);
