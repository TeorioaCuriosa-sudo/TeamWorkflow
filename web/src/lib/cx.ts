import type { CSSProperties } from 'react';

/** Junta nomes de classes ignorando valores vazios: cx("a", condição && "b"). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Passa variáveis CSS (ex.: a cor de uma pessoa) para um elemento: style={vars({ '--c': cor })}. */
export function vars(values: Record<`--${string}`, string | number>): CSSProperties {
  return values as CSSProperties;
}
