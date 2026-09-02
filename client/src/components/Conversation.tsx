import { ROLE_LABEL, type GameState, type PublicChannel, type PublicMessage } from '@rol/shared';
import Composer from './Composer';
import MessageList from './MessageList';

interface Props {
  game: GameState;
  channel: PublicChannel | null;
  typingNames: string[];
  onBack: () => void;
  onSend: (body: string) => void;
  onDelete: (message: PublicMessage) => void;
  onTyping: (on: boolean) => void;
}

function subtitleOf(game: GameState, channel: PublicChannel): string {
  if (channel.type === 'general') return 'Toda la mesa';
  const names = channel.memberIds
    .map((id) => game.members.find((m) => m.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.join(', ');
}

export default function Conversation({
  game,
  channel,
  typingNames,
  onBack,
  onSend,
  onDelete,
  onTyping,
}: Props) {
  if (!channel) {
    return (
      <section className="conversation">
        <div className="messages">
          <p className="empty">Selecciona un chat en la lista.</p>
        </div>
      </section>
    );
  }

  const messages = game.messages[channel.id] ?? [];

  return (
    <section className="conversation">
      <header className="conv-head">
        <button type="button" className="icon-btn only-mobile" onClick={onBack} aria-label="Volver">
          ←
        </button>
        <div className="conv-title">
          <h2>{channel.title}</h2>
          <p className="conv-sub">
            {subtitleOf(game, channel)}
            {channel.watching && <span className="watch-tag">👁 Observando</span>}
          </p>
        </div>
      </header>

      <MessageList channelId={channel.id} messages={messages} me={game.me} onDelete={onDelete} />

      <p className="typing">
        {typingNames.length === 1 && `${typingNames[0]} esta escribiendo...`}
        {typingNames.length > 1 && `${typingNames.join(', ')} estan escribiendo...`}
      </p>

      {channel.canPost ? (
        <Composer channelId={channel.id} onSend={onSend} onTyping={onTyping} />
      ) : (
        <p className="composer-locked">
          {game.me.role === 'voyeur'
            ? `Modo ${ROLE_LABEL.voyeur.toLowerCase()}: solo lectura.`
            : 'No participas en este chat: solo puedes leerlo.'}
        </p>
      )}
    </section>
  );
}
