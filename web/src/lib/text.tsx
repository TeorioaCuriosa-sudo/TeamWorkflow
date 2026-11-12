import type { ReactNode } from 'react';

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Texto simples com os endereços http(s) transformados em ligações. Nunca interpreta HTML. */
export function linkify(value: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of value.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(value.slice(last, at));
    out.push(
      <a key={at} href={m[0]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
        {m[0]}
      </a>,
    );
    last = at + m[0].length;
  }
  if (last < value.length) out.push(value.slice(last));
  return out;
}

/** Cor de texto legível (escuro/claro) sobre um fundo hexadecimal. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#14202b' : '#ffffff';
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
