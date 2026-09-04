import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_BODY_LENGTH } from '@rol/shared';

interface Props {
  channelId: string;
  onSend: (body: string) => void;
  onTyping: (on: boolean) => void;
  onAttachImage: (file: File) => void;
}

export default function Composer({ channelId, onSend, onTyping, onAttachImage }: Props) {
  const [body, setBody] = useState('');
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingRef = useRef(false);
  const stopTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setBody('');
    stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    resizeArea();
  }, [body]);

  // El navegador movil a veces mide el alto antes de asentar la fuente o la
  // barra de direcciones; recalcular al redimensionar evita que se quede corto.
  useEffect(() => {
    window.addEventListener('resize', resizeArea);
    return () => window.removeEventListener('resize', resizeArea);
  }, []);

  function resizeArea() {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 140)}px`;
  }

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

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && file.type.startsWith('image/')) onAttachImage(file);
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
      <button
        type="button"
        className="attach"
        aria-label="Adjuntar imagen"
        onClick={() => fileInputRef.current?.click()}
      >
        📎
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={handleFile}
      />
      <button className="send" type="submit" aria-label="Enviar">
        ➤
      </button>
    </form>
  );
}
