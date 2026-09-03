import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABEL, type AdminGame } from '@rol/shared';
import { api } from '../lib/api';
import { formatDay, formatTime } from '../lib/format';
import { APP_VERSION } from '../version';

interface Props {
  onClose: () => void;
}

const when = (ts: number): string => `${formatDay(ts)} ${formatTime(ts)}`;

function GameCard({ game, onDelete }: { game: AdminGame; onDelete: (game: AdminGame) => void }) {
  const active = game.members.filter((m) => !m.kicked);
  const online = active.filter((m) => m.online).length;

  return (
    <li className="admin-game">
      <header>
        <div className="admin-game-id">
          <strong>{game.name}</strong>
          <small>
            Creada el {when(game.createdAt)} · {game.channelCount} chat(s) · {game.messageCount} mensaje(s)
          </small>
          <small>Ultima actividad: {when(game.lastActivity)}</small>
        </div>
        <button type="button" className="danger small" onClick={() => onDelete(game)}>
          Borrar
        </button>
      </header>

      <ul className="admin-members">
        {active.length === 0 && <li className="hint">Nadie se ha unido todavia.</li>}
        {active.map((member) => (
          <li key={member.id}>
            <span className={`dot ${member.online ? 'online' : ''}`} />
            <span className="name">{member.name}</span>
            <span className={`badge ${member.role}`}>{ROLE_LABEL[member.role]}</span>
          </li>
        ))}
      </ul>

      <p className="admin-codes">
        <span>DM {game.codes.dm}</span>
        <span>PJ {game.codes.player}</span>
        <span>VY {game.codes.voyeur}</span>
      </p>
      <p className="hint">
        {active.length} participante(s), {online} en linea.
      </p>
    </li>
  );
}

export default function AdminPanel({ onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [games, setGames] = useState<AdminGame[]>([]);
  const [serverVersion, setServerVersion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (current: string) => {
    try {
      const data = await api.adminGames(current);
      setGames(data.games);
      setServerVersion(data.version);
      setError('');
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      // Sesion caducada (o servidor reiniciado): volvemos a pedir la contrasena.
      if (/caducada/i.test(message)) {
        setToken(null);
        setGames([]);
      }
    }
  }, []);

  // Refresco periodico: el panel enseña quien esta conectado ahora mismo.
  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const timer = window.setInterval(() => void refresh(token), 5000);
    return () => window.clearInterval(timer);
  }, [token, refresh]);

  // Escape cierra el panel, como en cualquier dialogo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token: fresh } = await api.adminLogin(password);
      setPassword('');
      setToken(fresh);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(game: AdminGame) {
    if (!token) return;
    const confirmed = window.confirm(
      `Borrar la partida "${game.name}"?\n\nSe pierden sus chats y sus codigos dejan de valer. No tiene vuelta atras.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.adminDeleteGame(token, game.id);
      await refresh(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (token) void api.adminLogout(token).catch(() => undefined);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal admin" role="dialog" aria-modal="true" aria-label="Modo administrador">
        <header className="admin-head">
          <h2>Modo administrador</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
            ✕
          </button>
        </header>

        {!token ? (
          <form onSubmit={handleLogin} autoComplete="off">
            <p className="hint">Escribe la contrasena de administracion para ver las partidas.</p>
            <label>
              Contrasena
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Comprobando...' : 'Entrar'}
            </button>
            <p className="form-error">{error}</p>
          </form>
        ) : (
          <>
            <p className="hint">
              {games.length === 0
                ? 'No hay ninguna partida creada.'
                : `${games.length} partida(s) en el servidor.`}
            </p>
            {error && <p className="form-error">{error}</p>}
            <ul className="admin-list">
              {games.map((game) => (
                <GameCard key={game.id} game={game} onDelete={handleDelete} />
              ))}
            </ul>
          </>
        )}

        <footer className="admin-foot">
          <span>
            Cliente v{APP_VERSION}
            {serverVersion && serverVersion !== APP_VERSION && ` · servidor v${serverVersion}`}
          </span>
          <button type="button" className="ghost small" onClick={close}>
            {token ? 'Salir del modo administrador' : 'Cerrar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
