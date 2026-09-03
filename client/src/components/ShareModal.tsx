import { useState } from 'react';
import type { GameCodes } from '@rol/shared';
import { joinUrl, shareLink } from '../lib/share';

interface Props {
  gameName: string;
  /** Solo los codigos que quien mira puede repartir. */
  codes: Partial<Record<keyof GameCodes, string>>;
  onClose: () => void;
}

const ROWS: { key: keyof GameCodes; title: string; description: string }[] = [
  { key: 'player', title: 'Jugador', description: 'Escribe y crea chats privados' },
  { key: 'voyeur', title: 'Voyerista', description: 'Solo lectura, invisible para los jugadores' },
  { key: 'dm', title: 'DM', description: 'Dirige la partida y lo ve todo' },
];

/** Enlaces de invitacion: uno por rol, con el codigo ya puesto. */
export default function ShareModal({ gameName, codes, onClose }: Props) {
  const [done, setDone] = useState<string | null>(null);
  const rows = ROWS.flatMap((row) => {
    const code = codes[row.key];
    return code ? [{ row, code }] : [];
  });

  async function share(code: string, role: string) {
    const result = await shareLink(`Unete a "${gameName}" como ${role}.`, joinUrl(code));
    setDone(result === 'failed' ? null : code);
    window.setTimeout(() => setDone((current) => (current === code ? null : current)), 1800);
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Compartir la partida">
        <h2>Compartir "{gameName}"</h2>
        <p className="hint">
          Cada enlace abre la app con el codigo puesto. Reparte el que toque a cada persona.
        </p>

        <div className="code-list">
          {rows.map(({ row, code }) => (
            <div key={row.key} className={`code-item ${row.key}`}>
              <div className="who">
                <strong>{row.title}</strong>
                <small>{row.description}</small>
              </div>
              <code>{code}</code>
              <button type="button" className="ghost small" onClick={() => void share(code, row.title)}>
                {done === code ? 'Listo' : 'Compartir'}
              </button>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
