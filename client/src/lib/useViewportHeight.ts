import { useEffect } from 'react';

/**
 * Publica el alto real del viewport en --app-vh.
 *
 * En movil el teclado virtual no cambia el alto de la ventana ni el de 100dvh,
 * asi que sin esto la caja de escribir se queda debajo del teclado. visualViewport
 * si refleja el hueco que queda visible.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;

    const apply = (): void => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-vh', `${Math.round(height)}px`);
    };

    apply();
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('resize', apply);

    return () => {
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('resize', apply);
    };
  }, []);
}
