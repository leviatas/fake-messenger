import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_BODY_LENGTH } from '@rol/shared';

interface Props {
  channelId: string;
  onSend: (body: string) => void;
  onTyping: (on: boolean) => void;
}

export default function Composer({ channelId, onSend, onTyping }: Props) {
  const [body, setBody] = useState('');
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingRef = useRef(false);
  const stopTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setBody('');
    stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 140)}px`;
  }, [body]);

  function stopTyping() {
    window.clearTimeout(stopTimer.current);
    if (typingRef.current) {
      typingRef.current = false;
      onTyping(false);
    }
  }

  function noteTyping() {
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(stopTyping, 2500);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSend(text);
    setBody('');
    stopTyping();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={areaRef}
        rows={1}
        value={body}
        maxLength={MAX_BODY_LENGTH}
        placeholder="Escribe un mensaje..."
        onChange={(e) => {
          setBody(e.target.value);
          noteTyping();
        }}
        onKeyDown={handleKeyDown}
        onBlur={stopTyping}
      />
      <button className="send" type="submit" aria-label="Enviar">
        ➤
      </button>
    </form>
  );
}
