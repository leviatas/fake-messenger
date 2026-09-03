import { useEffect } from 'react';

/** Por debajo de esto el hueco es la barra del navegador, no el teclado. */
const KEYBOARD_THRESHOLD = 90;

/**
 * Publica en --keyboard el alto que tapa el teclado virtual.
 *
 * El alto de la ventana lo resuelve el CSS con 100dvh, que ya sigue a la barra
 * de direcciones sin saltos. Lo que 100dvh no ve es el teclado: al abrirse, la
 * caja de escribir queda debajo. visualViewport si lo refleja.
 *
 * Solo miramos huecos grandes: al desplazarse por el chat la barra del navegador
 * se retrae y encoge el viewport unos pocos pixeles, y reaccionar a eso haria
 * que la pantalla diera saltos mientras se lee.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let last = -1;

    const apply = (): void => {
      const hidden = window.innerHeight - (viewport.height + viewport.offsetTop);
      const keyboard = hidden > KEYBOARD_THRESHOLD ? Math.round(hidden) : 0;
      if (keyboard === last) return;
      last = keyboard;
      root.style.setProperty('--keyboard', `${keyboard}px`);
    };

    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      root.style.removeProperty('--keyboard');
    };
  }, []);
}
