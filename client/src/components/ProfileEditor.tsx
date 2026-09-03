import { useState, type FormEvent } from 'react';
import { AVATAR_PRESETS, MAX_AVATAR_LENGTH, MAX_NAME_LENGTH } from '@rol/shared';

interface Props {
  currentName: string;
  currentAvatar: string | null;
  onCancel: () => void;
  onSave: (input: { name: string; avatar: string }) => void;
}

/** Editar como te ven los demas: tu nombre y tu avatar. */
export default function ProfileEditor({ currentName, currentAvatar, onCancel, onSave }: Props) {
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar ?? '');
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Ponte un nombre.');
    onSave({ name: name.trim(), avatar: avatar.trim() });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>Tu perfil</h2>
        <p className="hint">El avatar se vera pequeno junto a tu nombre y en los mensajes que envies.</p>

        <form onSubmit={submit}>
          <label>
            Nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Tu nombre"
            />
          </label>
          <p className="hint">Debe ser unico en la partida: nadie mas puede tenerlo a la vez.</p>

          <ul className="avatar-grid">
            {AVATAR_PRESETS.map((emoji) => (
              <li key={emoji}>
                <button
                  type="button"
                  className={`avatar-option ${avatar === emoji ? 'selected' : ''}`}
                  onClick={() => setAvatar(emoji)}
                >
                  {emoji}
                </button>
              </li>
            ))}
          </ul>

          <label>
            O escribe tu propio avatar
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              maxLength={MAX_AVATAR_LENGTH}
              placeholder="🙂"
            />
          </label>

          <p className="form-error">{error}</p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="primary">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
