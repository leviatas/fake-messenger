import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AVATAR_PRESETS, MAX_AVATAR_LENGTH, MAX_NAME_LENGTH, isImageAvatar } from '@rol/shared';
import { api } from '../lib/api';
import { resizeAvatarImage } from '../lib/imageResize';
import Avatar from './Avatar';

interface Props {
  currentName: string;
  currentAvatar: string | null;
  token: string;
  onCancel: () => void;
  onSave: (input: { name: string; avatar?: string }) => void;
}

/** Editar como te ven los demas: tu nombre y tu avatar. */
export default function ProfileEditor({ currentName, currentAvatar, token, onCancel, onSave }: Props) {
  const [name, setName] = useState(currentName);
  const [avatarText, setAvatarText] = useState(isImageAvatar(currentAvatar) ? '' : (currentAvatar ?? ''));
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [uploadedAvatar, setUploadedAvatar] = useState(isImageAvatar(currentAvatar) ? currentAvatar : null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewAvatar = uploadedAvatar || avatarText || null;

  function pickEmoji(emoji: string) {
    setAvatarText(emoji);
    setAvatarTouched(true);
    setUploadedAvatar(null);
  }

  function changeAvatarText(value: string) {
    setAvatarText(value);
    setAvatarTouched(true);
    setUploadedAvatar(null);
  }

  function removeAvatar() {
    setAvatarText('');
    setAvatarTouched(true);
    setUploadedAvatar(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Elige un archivo de imagen.');

    setError('');
    setUploading(true);
    try {
      const image = await resizeAvatarImage(file);
      const { avatar } = await api.uploadAvatar(token, image);
      setUploadedAvatar(avatar);
      setAvatarText('');
      setAvatarTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Ponte un nombre.');
    onSave({ name: name.trim(), avatar: avatarTouched ? avatarText.trim() : undefined });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>Tu perfil</h2>
        <p className="hint">El avatar se vera pequeno junto a tu nombre y en los mensajes que envies.</p>

        <div className="profile-avatar-row">
          <span className="me-avatar big">
            <Avatar name={name || currentName} avatar={previewAvatar} />
          </span>
          <div className="profile-avatar-actions">
            <button
              type="button"
              className="ghost small"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Subiendo...' : 'Subir imagen'}
            </button>
            {previewAvatar && (
              <button type="button" className="ghost small" onClick={removeAvatar} disabled={uploading}>
                Quitar
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => void handleFile(e)}
            />
          </div>
        </div>

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
                  className={`avatar-option ${!uploadedAvatar && avatarText === emoji ? 'selected' : ''}`}
                  onClick={() => pickEmoji(emoji)}
                >
                  {emoji}
                </button>
              </li>
            ))}
          </ul>

          <label>
            O escribe tu propio avatar
            <input
              value={avatarText}
              onChange={(e) => changeAvatarText(e.target.value)}
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
