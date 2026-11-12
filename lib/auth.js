// Palavras-passe (scrypt, sem dependências) e tokens de sessão.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { bad } from './validate.js';

const scrypt = promisify(crypto.scrypt);
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export const MIN_PASSWORD = 8;

/** Rejeita palavras-passe fracas demais para uma ferramenta exposta à internet. */
export function checkPassword(pw, label = 'A palavra-passe') {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) throw bad(`${label} tem de ter pelo menos ${MIN_PASSWORD} caracteres.`);
  if (pw.length > 200) throw bad(`${label} é demasiado longa.`);
  return pw;
}

const encode = (salt, key) => `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;

export function hashPasswordSync(pw) {
  const salt = crypto.randomBytes(16);
  return encode(salt, crypto.scryptSync(pw, salt, KEYLEN, { N, r: R, p: P }));
}

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return encode(salt, await scrypt(pw, salt, KEYLEN, { N, r: R, p: P }));
}

// Usado para gastar o mesmo tempo quando o email não existe (não revela quais emails têm conta).
const DUMMY = hashPasswordSync('nao-existe-nenhuma-conta');

export async function verifyPassword(pw, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const valid = parts.length === 6 && parts[0] === 'scrypt';
  const [, n, r, p, saltB64, keyB64] = valid ? parts : DUMMY.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(pw ?? ''), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return valid && crypto.timingSafeEqual(key, expected);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem caracteres ambíguos (0/O, 1/l/I)
export function randomPassword(length = 12) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}
