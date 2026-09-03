import { useState } from 'react';
import { APP_VERSION } from '../version';
import AdminPanel from './AdminPanel';

/**
 * Pie con la version de la app. Al pulsarlo pide la contrasena de
 * administracion y abre el panel de partidas.
 */
export default function VersionFooter() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="app-footer">
        <button
          type="button"
          className="version"
          onClick={() => setOpen(true)}
          title="Modo administrador"
        >
          v{APP_VERSION}
        </button>
      </p>
      {open && <AdminPanel onClose={() => setOpen(false)} />}
    </>
  );
}
