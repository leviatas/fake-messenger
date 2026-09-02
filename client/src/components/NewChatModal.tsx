import { useState, type FormEvent } from 'react';
import { ROLE_LABEL, type PublicMember } from '@rol/shared';

interface Props {
  kind: 'direct' | 'group';
  candidates: PublicMember[];
  onCancel: () => void;
  onCreate: (input: { name?: string; memberIds: string[] }) => void;
}

export default function NewChatModal({ kind, candidates, onCancel, onCreate }: Props) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');

  function toggle(id: string) {
    setSelected((current) => {
      if (kind === 'direct') return current.includes(id) ? [] : [id];
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) return setError('Elige al menos a una persona.');
    if (kind === 'group' && !name.trim()) return setError('Ponle un nombre al grupo.');
    onCreate(kind === 'group' ? { name: name.trim(), memberIds: selected } : { memberIds: selected });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>{kind === 'group' ? 'Nuevo grupo' : 'Nuevo chat privado'}</h2>
        <form onSubmit={submit}>
          {kind === 'group' && (
            <label>
              Nombre del grupo
              <input
                name="groupName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                placeholder="Los que susurran"
                autoFocus
              />
            </label>
          )}
          <p className="hint">
            {kind === 'group'
              ? 'Marca a quienes entran en el grupo.'
              : 'Elige con quien quieres hablar en privado.'}
          </p>

          {candidates.length === 0 ? (
            <p className="hint">No hay nadie mas en la partida todavia.</p>
          ) : (
            <ul className="picker">
              {candidates.map((member) => (
                <li key={member.id}>
                  <label>
                    <input
                      type={kind === 'group' ? 'checkbox' : 'radio'}
                      name="participant"
                      checked={selected.includes(member.id)}
                      onChange={() => toggle(member.id)}
                    />
                    <span>{member.name}</span>
                    <span className={`badge ${member.role}`}>{ROLE_LABEL[member.role]}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="form-error">{error}</p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button type="submit" className="primary" disabled={candidates.length === 0}>
              Crear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
