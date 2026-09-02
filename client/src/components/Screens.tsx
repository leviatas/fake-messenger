interface KickedProps {
  onBack: () => void;
}

export function KickedScreen({ onBack }: KickedProps) {
  return (
    <main className="screen">
      <div className="screen-inner narrow center">
        <h1 className="brand">Te han expulsado</h1>
        <p className="brand-sub">El DM te ha sacado de la partida.</p>
        <button className="primary" type="button" onClick={onBack}>
          Volver al menu
        </button>
      </div>
    </main>
  );
}

export function Splash({ text }: { text: string }) {
  return (
    <main className="screen">
      <div className="screen-inner narrow center">
        <p className="brand-sub">{text}</p>
      </div>
    </main>
  );
}
