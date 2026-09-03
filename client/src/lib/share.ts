/** Enlace de invitacion: abre la app con el codigo ya escrito. */
export function joinUrl(code: string): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = `?code=${encodeURIComponent(code)}`;
  return url.toString();
}

export type ShareResult = 'shared' | 'copied' | 'failed';

/**
 * Comparte el enlace con la hoja nativa del movil y, si no la hay o se
 * cancela, lo deja en el portapapeles.
 */
export async function shareLink(text: string, url: string): Promise<ShareResult> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Mensajeria de Rol', text, url });
      return 'shared';
    } catch (err) {
      // El usuario ha cerrado la hoja de compartir: no insistimos.
      if ((err as Error)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Lee el codigo de un enlace de invitacion y limpia la barra de direcciones. */
export function takeCodeFromUrl(): string {
  try {
    const url = new URL(window.location.href);
    const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
    if (!code) return '';
    url.searchParams.delete('code');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return code;
  } catch {
    return '';
  }
}
