import { cx } from '../lib/cx';
import horizontalClaro from '../assets/brand/logo-horizontal-claro.png';
import horizontalBranco from '../assets/brand/logo-horizontal-branco.png';

/**
 * O logótipo da Teoria Curiosa (GRUPO teoriacuriosa®), nas duas versões que a marca fornece:
 * a escura, para fundos claros, e a branca, para fundos escuros.
 *
 * - on="dark"  → fundo escuro (barra lateral, painel do login): usa a versão branca.
 * - on="light" → fundo claro: usa a versão escura.
 * - on="auto"  → segue o tema claro/escuro da página (as duas imagens estão lá, só uma se vê).
 *
 * A altura define-se com a classe (por exemplo "h-9"); a largura acompanha sozinha.
 */
export function Wordmark({ on = 'auto', className }: { on?: 'auto' | 'light' | 'dark'; className?: string }) {
  const size = { width: 600, height: 98 } as const;
  const cls = cx('w-auto shrink-0 select-none', className);
  if (on === 'dark') return <img src={horizontalBranco} alt="Teoria Curiosa" {...size} className={cls} draggable={false} />;
  if (on === 'light') return <img src={horizontalClaro} alt="Teoria Curiosa" {...size} className={cls} draggable={false} />;
  return (
    <>
      <img src={horizontalClaro} alt="Teoria Curiosa" {...size} className={cx(cls, 'dark:hidden')} draggable={false} />
      <img src={horizontalBranco} alt="Teoria Curiosa" {...size} className={cx(cls, 'hidden dark:block')} draggable={false} />
    </>
  );
}
