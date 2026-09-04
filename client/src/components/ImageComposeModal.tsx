import { useEffect, useRef, useState } from 'react';
import { MAX_BODY_LENGTH } from '@rol/shared';
import { api } from '../lib/api';
import { resizeChatImage } from '../lib/imageResize';

interface Props {
  file: File;
  token: string;
  onCancel: () => void;
  onSend: (input: { body: string; image: string }) => void;
}

/** Se muestra al soltar una imagen sobre el chat: preview, pie de foto y envio. */
export default function ImageComposeModal({ file, token, onCancel, onSend }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(true);
  const [error, setError] = useState('');
  const startedRef = useRef(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const image = await resizeChatImage(file);
        const { image: url } = await api.uploadChatImage(token, image);
        if (!cancelled) setUploadedImage(url);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
      } finally {
        if (!cancelled) setUploading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, token]);

  function submit() {
    if (!uploadedImage) return;
    onSend({ body: caption.trim(), image: uploadedImage });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal">
        <h2>Enviar imagen</h2>

        <div className="image-preview">{previewUrl && <img src={previewUrl} alt="" />}</div>

        <label>
          Pie de foto (opcional)
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={MAX_BODY_LENGTH}
            placeholder="Escribe algo sobre la imagen..."
            rows={2}
            autoFocus
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={submit} disabled={uploading || !uploadedImage}>
            {uploading ? 'Subiendo...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
