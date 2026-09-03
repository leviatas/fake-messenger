import { useState } from 'react';
import { ROLE_LABEL, type GameCodes, type GameState, type PublicChannel, type PublicMember } from '@rol/shared';
import type { Connection } from '../lib/useGame';
import { avatarOf, channelIcon } from '../lib/format';
import CodeList from './CodeList';
import ProfileEditor from './ProfileEditor';
import ShareModal from './ShareModal';
import VersionFooter from './VersionFooter';

type Tab = 'chats' | 'people' | 'codes';

interface Props {
  game: GameState;
  connection: Connection;
  activeChannelId: string | null;
  unread: Record<string, number>;
  onSelectChannel: (channelId: string) => void;
  onNewChat: (kind: 'direct' | 'group') => void;
  onKick: (member: PublicMember) => void;
  onLeave: () => void;
  onSaveProfile: (input: { name: string; avatar: string }) => void;
}

function previewOf(game: GameState, channel: PublicChannel): string {
  const list = game.messages[channel.id] ?? [];
  const last = list[list.length - 1];
  if (!last) return 'Sin mensajes todavia';
  if (last.deleted) return 'Mensaje eliminado';
  if (last.system) return last.body;
  return `${last.authorName}: ${last.body}`;
}

export default function Sidebar({
  game,
  connection,
  activeChannelId,
  unread,
  onSelectChannel,
  onNewChat,
  onKick,
  onLeave,
  onSaveProfile,
}: Props) {
  const [tab, setTab] = useState<Tab>('chats');
  const [sharing, setSharing] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const isDm = game.me.role === 'dm';

  // El DM reparte los tres roles; un jugador solo puede invitar a jugadores.
  const shareCodes: Partial<Record<keyof GameCodes, string>> =
    game.game.codes ?? (game.game.inviteCode ? { player: game.game.inviteCode } : {});
  const canShare = Object.keys(shareCodes).length > 0;

  const players = game.members.filter((m) => m.role === 'player');
  const dm = game.members.filter((m) => m.role === 'dm');
  const voyeurs = game.members.filter((m) => m.role === 'voyeur');

  const renderPerson = (member: PublicMember) => (
    <li key={member.id} className="person">
      <span className={`dot ${member.online ? 'online' : ''}`} title={member.online ? 'En linea' : 'Desconectado'} />
      <span className="person-avatar">{avatarOf(member.name, member.avatar)}</span>
      <span className="name">
        {member.name}
        {member.id === game.me.id && ' (tu)'}
      </span>
      <span className={`badge ${member.role}`}>{ROLE_LABEL[member.role]}</span>
      {game.me.canKick && member.id !== game.me.id && (
        <button type="button" className="kick" onClick={() => onKick(member)}>
          Expulsar
        </button>
      )}
    </li>
  );

  return (
    <aside className="sidebar">
      <header className="sidebar-head">
        <div className="sidebar-id">
          <h1 className="game-name">{game.game.name}</h1>
          <p className="me-line">
            <button
              type="button"
              className="me-avatar"
              onClick={() => setEditingProfile(true)}
              title="Editar tu nombre y tu avatar"
            >
              {avatarOf(game.me.name, game.me.avatar)}
            </button>
            <button
              type="button"
              className="me-name"
              onClick={() => setEditingProfile(true)}
              title="Editar tu nombre y tu avatar"
            >
              {game.me.name}
            </button>
            <span className={`badge ${game.me.role}`}>{ROLE_LABEL[game.me.role]}</span>
            {canShare && (
              <button type="button" className="share-link" onClick={() => setSharing(true)}>
                🔗 Compartir
              </button>
            )}
          </p>
        </div>
        <span
          className={`conn ${connection === 'online' ? 'online' : ''}`}
          title={connection === 'online' ? 'Conectado' : 'Reconectando...'}
        />
      </header>

      <nav className="tabs">
        <button type="button" className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}>
          Chats
        </button>
        <button type="button" className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          Participantes
        </button>
        {isDm && (
          <button type="button" className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>
            Codigos
          </button>
        )}
      </nav>

      {tab === 'chats' && (
        <div className="tab-panel">
          {game.me.canCreateChannels && (
            <div className="panel-actions">
              <button type="button" className="ghost small" onClick={() => onNewChat('direct')}>
                + Chat privado
              </button>
              <button type="button" className="ghost small" onClick={() => onNewChat('group')}>
                + Grupo
              </button>
            </div>
          )}
          <ul className="list">
            {game.channels.map((channel) => {
              const pending = unread[channel.id] ?? 0;
              return (
                <li key={channel.id}>
                  <button
                    type="button"
                    className={`chat-item ${channel.id === activeChannelId ? 'active' : ''}`}
                    onClick={() => onSelectChannel(channel.id)}
                  >
                    <span className="avatar">{channelIcon(channel)}</span>
                    <span className="body">
                      <span className="title">
                        <span>{channel.title}</span>
                        {channel.watching && <span className="eye" title="Chat ajeno que puedes leer">👁</span>}
                      </span>
                      <span className="preview">{previewOf(game, channel)}</span>
                    </span>
                    {pending > 0 && <span className="unread">{pending > 99 ? '99+' : pending}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'people' && (
        <div className="tab-panel">
          <ul className="list people">
            {dm.length > 0 && <li className="group-title">Direccion</li>}
            {dm.map(renderPerson)}
            <li className="group-title">Jugadores ({players.length})</li>
            {players.length === 0 && <li className="hint">Todavia no hay jugadores.</li>}
            {players.map(renderPerson)}
            {voyeurs.length > 0 && (
              <>
                <li className="group-title">Voyeristas ({voyeurs.length})</li>
                {voyeurs.map(renderPerson)}
              </>
            )}
          </ul>
        </div>
      )}

      {tab === 'codes' && game.game.codes && (
        <div className="tab-panel">
          <p className="hint">Codigos de acceso de esta partida.</p>
          <CodeList codes={game.game.codes} compact />
        </div>
      )}

      <footer className="sidebar-foot">
        <button type="button" className="ghost small" onClick={onLeave}>
          Salir de la partida
        </button>
        <VersionFooter />
      </footer>

      {sharing && (
        <ShareModal gameName={game.game.name} codes={shareCodes} onClose={() => setSharing(false)} />
      )}

      {editingProfile && (
        <ProfileEditor
          currentName={game.me.name}
          currentAvatar={game.me.avatar}
          onCancel={() => setEditingProfile(false)}
          onSave={(input) => {
            onSaveProfile(input);
            setEditingProfile(false);
          }}
        />
      )}
    </aside>
  );
}
