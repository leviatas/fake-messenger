import { Fragment, useEffect, useRef } from 'react';
import type { PublicMessage, Viewer } from '@rol/shared';
import { formatDay, formatTime } from '../lib/format';

interface Props {
  channelId: string;
  messages: PublicMessage[];
  me: Viewer;
  onDelete: (message: PublicMessage) => void;
}

export default function MessageList({ channelId, messages, me, onDelete }: Props) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stuckToBottom = useRef(true);

  useEffect(() => {
    stuckToBottom.current = true;
    bottomRef.current?.scrollIntoView();
  }, [channelId]);

  useEffect(() => {
    if (stuckToBottom.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleScroll() {
    const box = boxRef.current;
    if (!box) return;
    stuckToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }

  if (messages.length === 0) {
    return (
      <div className="messages" ref={boxRef}>
        <p className="empty">Aqui no hay nada escrito todavia.</p>
        <div ref={bottomRef} />
      </div>
    );
  }

  let lastDay = '';
  let previousAuthor: string | null = null;

  return (
    <div className="messages" ref={boxRef} onScroll={handleScroll}>
      {messages.map((message) => {
        const day = formatDay(message.ts);
        const dayChanged = day !== lastDay;
        lastDay = day;

        if (message.system) {
          previousAuthor = null;
          return (
            <Fragment key={message.id}>
              {dayChanged && <div className="sysmsg">{day}</div>}
              <div className="sysmsg">{message.body}</div>
            </Fragment>
          );
        }

        const own = message.authorId === me.id;
        const grouped = previousAuthor === message.authorId && !dayChanged;
        previousAuthor = message.authorId;
        const canDelete = !message.deleted && (own || me.role === 'dm');

        return (
          <Fragment key={message.id}>
            {dayChanged && <div className="sysmsg">{day}</div>}
            <div
              className={[
                'msg',
                own ? 'own' : '',
                grouped ? 'grouped' : '',
                message.deleted ? 'deleted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="bubble">
                {!own && !grouped && (
                  <span className={`author ${message.authorRole ?? ''}`}>{message.authorName}</span>
                )}
                {message.deleted
                  ? message.deletedBy === 'dm'
                    ? 'Mensaje eliminado por el DM'
                    : 'Mensaje eliminado'
                  : message.body}
              </div>
              <div className="meta">
                <span>{formatTime(message.ts)}</span>
                {canDelete && (
                  <button type="button" className="del" onClick={() => onDelete(message)}>
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
