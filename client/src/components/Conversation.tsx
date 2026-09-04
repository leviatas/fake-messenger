import { useRef, useState, type DragEvent } from 'react';
import { ROLE_LABEL, type GameState, type PublicChannel, type PublicMessage } from '@rol/shared';
import Composer from './Composer';
import ImageComposeModal from './ImageComposeModal';
import MessageList from './MessageList';

interface Props {
  game: GameState;
  channel: PublicChannel | null;
  typingNames: string[];
  token: string;
  onBack: () => void;
  onSend: (body: string, image?: string) => void;
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
  token,
  onBack,
  onSend,
  onDelete,
  onTyping,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [droppedImage, setDroppedImage] = useState<File | null>(null);
  const dragCounter = useRef(0);

  const canDrop = Boolean(channel?.canPost);

  function hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function handleDragEnter(event: DragEvent) {
    if (!canDrop || !hasFiles(event)) return;
    event.preventDefault();
    dragCounter.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent) {
    if (!canDrop || !hasFiles(event)) return;
    event.preventDefault();
  }

  function handleDragLeave() {
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragging(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    if (!canDrop) return;
    const file = Array.from(event.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) setDroppedImage(file);
  }

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
    <section
      className="conversation"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      {dragging && (
        <div className="drop-overlay">
          <p>Suelta la imagen aqui</p>
        </div>
      )}

      {droppedImage && (
        <ImageComposeModal
          file={droppedImage}
          token={token}
          onCancel={() => setDroppedImage(null)}
          onSend={({ body, image }) => {
            onSend(body, image);
            setDroppedImage(null);
          }}
        />
      )}
    </section>
  );
}
