import type { CreateGameResponse } from '@rol/shared';
import CodeList from './CodeList';
import VersionFooter from './VersionFooter';

interface Props {
  created: CreateGameResponse;
  onUseCode: (code: string) => void;
  onBack: () => void;
}

export default function CodesScreen({ created, onUseCode, onBack }: Props) {
  return (
    <main className="screen">
      <div className="screen-inner narrow">
        <h1 className="brand">Partida creada</h1>
        <p className="brand-sub">{created.game.name}</p>
        <p className="hint">
          Reparte cada codigo segun el rol. Guardalos: despues solo el DM puede volver a consultarlos.
        </p>
        <CodeList codes={created.codes} onUse={onUseCode} />
        <button className="ghost" type="button" onClick={onBack}>
          Volver al menu
        </button>
        <VersionFooter />
      </div>
    </main>
  );
}
