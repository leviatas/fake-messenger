import { useEffect, useState, type FormEvent } from 'react';
import type { CreateGameResponse, JoinResponse } from '@rol/shared';
import { api } from '../lib/api';

interface Props {
  prefillCode?: string;
  onCreated: (response: CreateGameResponse) => void;
  onJoined: (response: JoinResponse) => void;
}

export default function MainMenu({ prefillCode, onCreated, onJoined }: Props) {
  const [code, setCode] = useState(prefillCode ?? '');
  const [playerName, setPlayerName] = useState('');
  const [gameName, setGameName] = useState('');
  const [password, setPassword] = useState('');
  const [joinError, setJoinError] = useState('');
  const [createError, setCreateError] = useState('');
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);

  useEffect(() => {
    if (prefillCode) setCode(prefillCode);
  }, [prefillCode]);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setJoinError('');
    setBusy('join');
    try {
      onJoined(await api.join(code, playerName));
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError('');
    setBusy('create');
    try {
      onCreated(await api.createGame(gameName, password));
      setPassword('');
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="screen">
      <div className="screen-inner">
        <h1 className="brand">🎲 Mensajeria de Rol</h1>
        <p className="brand-sub">Chats en directo para tu mesa: DM, jugadores y voyeristas.</p>

        <div className="cards">
          <section className="card">
            <h2>Unirse a una partida</h2>
            <p className="hint">El codigo decide tu rol: DM, jugador o voyerista.</p>
            <form onSubmit={handleJoin} autoComplete="off">
              <label>
                Codigo de acceso
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PJ-4K7QZP"
                  maxLength={16}
                  spellCheck={false}
                  required
                />
              </label>
              <label>
                Tu nombre
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Kaelen el Errante"
                  maxLength={32}
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy !== null}>
                {busy === 'join' ? 'Entrando...' : 'Entrar'}
              </button>
              <p className="form-error">{joinError}</p>
            </form>
          </section>

          <section className="card">
            <h2>Crear una partida</h2>
            <p className="hint">Genera los tres codigos de acceso de la mesa.</p>
            <form onSubmit={handleCreate} autoComplete="off">
              <label>
                Nombre de la partida
                <input
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="La Caida de Vhalgar"
                  maxLength={32}
                  required
                />
              </label>
              <label>
                Contrasena
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contrasena de la mesa"
                  required
                />
              </label>
              <button className="primary" type="submit" disabled={busy !== null}>
                {busy === 'create' ? 'Creando...' : 'Crear partida'}
              </button>
              <p className="form-error">{createError}</p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
