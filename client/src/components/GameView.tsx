import { useMemo, useState } from 'react';
import type { ClientCommand, PublicMember, PublicMessage } from '@rol/shared';
import type { ChatState } from '../lib/useGame';
import Conversation from './Conversation';
import NewChatModal from './NewChatModal';
import Sidebar from './Sidebar';

interface Props {
  state: ChatState;
  send: (command: ClientCommand) => boolean;
  token: string;
  onSelectChannel: (channelId: string) => void;
  onBack: () => void;
  onDismissError: () => void;
  onLeave: () => void;
}

export default function GameView({
  state,
  send,
  token,
  onSelectChannel,
  onBack,
  onDismissError,
  onLeave,
}: Props) {
  const [modal, setModal] = useState<'direct' | 'group' | null>(null);
  const game = state.game!;

  const activeChannel = useMemo(
    () => game.channels.find((c) => c.id === state.activeChannelId) ?? null,
    [game.channels, state.activeChannelId],
  );

  const typingNames = useMemo(() => {
    if (!activeChannel) return [];
    return Object.values(state.typing[activeChannel.id] ?? {}).map((entry) => entry.name);
  }, [state.typing, activeChannel]);

  // Los voyeristas no participan en chats, asi que nunca son candidatos.
  const candidates = game.members.filter((m) => m.id !== game.me.id && m.role !== 'voyeur');

  function handleKick(member: PublicMember) {
    if (!window.confirm(`Expulsar a ${member.name} de la partida?`)) return;
    send({ type: 'member:kick', memberId: member.id });
  }

  function handleDelete(message: PublicMessage) {
    if (!window.confirm('Borrar este mensaje para todos?')) return;
    send({ type: 'message:delete', messageId: message.id });
  }

  function handleLeave() {
    if (!window.confirm('Salir de la partida? Tendras que volver a entrar con tu codigo.')) return;
    onLeave();
  }

  return (
    <div className={`app ${state.mobilePane === 'chat' ? 'chat-open' : ''}`}>
      <Sidebar
        game={game}
        connection={state.connection}
        activeChannelId={state.activeChannelId}
        unread={state.unread}
        token={token}
        onSelectChannel={onSelectChannel}
        onNewChat={setModal}
        onKick={handleKick}
        onLeave={handleLeave}
        onSaveProfile={({ name, avatar }) => {
          if (name !== game.me.name) send({ type: 'member:name', name });
          if (avatar !== undefined && avatar !== (game.me.avatar ?? '')) send({ type: 'member:avatar', avatar });
        }}
      />

      <Conversation
        game={game}
        channel={activeChannel}
        typingNames={typingNames}
        onBack={onBack}
        onSend={(body) => {
          if (activeChannel) send({ type: 'message:send', channelId: activeChannel.id, body });
        }}
        onDelete={handleDelete}
        onTyping={(on) => {
          if (activeChannel) send({ type: 'typing', channelId: activeChannel.id, on });
        }}
      />

      {modal && (
        <NewChatModal
          kind={modal}
          candidates={candidates}
          onCancel={() => setModal(null)}
          onCreate={({ name, memberIds }) => {
            send({ type: 'channel:create', kind: modal, name, memberIds });
            setModal(null);
          }}
        />
      )}

      {state.error && (
        <button type="button" className="toast" onClick={onDismissError}>
          {state.error}
        </button>
      )}
    </div>
  );
}
