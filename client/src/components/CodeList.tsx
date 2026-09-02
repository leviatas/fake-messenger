import { useState } from 'react';
import type { GameCodes } from '@rol/shared';

interface Props {
  codes: GameCodes;
  compact?: boolean;
  onUse?: (code: string) => void;
}

const ROWS: { key: keyof GameCodes; title: string; description: string }[] = [
  { key: 'dm', title: 'DM', description: 'Dirige la partida y lo ve todo' },
  { key: 'player', title: 'Jugador', description: 'Escribe y crea chats privados' },
  { key: 'voyeur', title: 'Voyerista', description: 'Solo lectura, invisible para los jugadores' },
];

export default function CodeList({ codes, compact = false, onUse }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* sin portapapeles: el codigo esta a la vista igualmente */
    }
    setCopied(code);
    window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 1500);
  }

  return (
    <div className={compact ? 'code-list compact' : 'code-list'}>
      {ROWS.map((row) => (
        <div key={row.key} className={`code-item ${row.key}`}>
          <div className="who">
            <strong>{row.title}</strong>
            <small>{row.description}</small>
          </div>
          <code>{codes[row.key]}</code>
          <button type="button" className="ghost small" onClick={() => void copy(codes[row.key])}>
            {copied === codes[row.key] ? 'Copiado' : 'Copiar'}
          </button>
          {onUse && (
            <button type="button" className="ghost small" onClick={() => onUse(codes[row.key])}>
              Usar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
