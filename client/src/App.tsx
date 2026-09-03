import { useEffect, useState } from 'react';
import type { CreateGameResponse, JoinResponse } from '@rol/shared';
import { api } from './lib/api';
import { clearSession, loadSession, saveSession } from './lib/session';
import { takeCodeFromUrl } from './lib/share';
import { useGame } from './lib/useGame';
import { useViewportHeight } from './lib/useViewportHeight';
import CodesScreen from './components/CodesScreen';
import GameView from './components/GameView';
import MainMenu from './components/MainMenu';
import { KickedScreen, Splash } from './components/Screens';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateGameResponse | null>(null);
  // Un enlace de invitacion trae el codigo en la URL; lo guardamos y la limpiamos.
  const [prefillCode, setPrefillCode] = useState(takeCodeFromUrl);

  const { state, send, selectChannel, goBack, setError } = useGame(token);

  // El alto real de la ventana, teclado virtual incluido.
  useViewportHeight();

  // Al abrir la app intentamos recuperar la sesion guardada.
  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      setBooting(false);
      return;
    }
    api
      .session(stored.token)
      .then(() => setToken(stored.token))
      .catch(() => clearSession())
      .finally(() => setBooting(false));
  }, []);

  function handleJoined(response: JoinResponse) {
    saveSession({ token: response.token, gameName: response.game.name });
    setCreated(null);
    setPrefillCode('');
    setToken(response.token);
  }

  function backToMenu() {
    clearSession();
    setToken(null);
    setCreated(null);
    window.location.reload();
  }

  function leave() {
    send({ type: 'leave' });
    backToMenu();
  }

  if (booting) return <Splash text="Recuperando tu sesion..." />;
  if (state.kicked) return <KickedScreen onBack={backToMenu} />;

  if (token) {
    if (!state.game) {
      return <Splash text={state.connection === 'offline' ? 'Reconectando...' : 'Entrando en la partida...'} />;
    }
    return (
      <GameView
        state={state}
        send={send}
        onSelectChannel={selectChannel}
        onBack={goBack}
        onDismissError={() => setError(null)}
        onLeave={leave}
      />
    );
  }

  if (created) {
    return (
      <CodesScreen
        created={created}
        onUseCode={(code) => {
          setPrefillCode(code);
          setCreated(null);
        }}
        onBack={() => setCreated(null)}
      />
    );
  }

  return <MainMenu prefillCode={prefillCode} onCreated={setCreated} onJoined={handleJoined} />;
}
