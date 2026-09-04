/** Reduce una imagen a un cuadrado pequeño antes de subirla como avatar. */
export async function resizeAvatarImage(file: File, maxSize = 160, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(maxSize, Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');

    // Recorte centrado a cuadrado, para que el avatar no salga deformado.
    const cropSize = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - cropSize) / 2;
    const sy = (bitmap.height - cropSize) / 2;
    ctx.drawImage(bitmap, sx, sy, cropSize, cropSize, 0, 0, side, side);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('No se pudo procesar la imagen.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Reduce una foto de chat sin recortarla, para no mandarla a tamano completo. */
export async function resizeChatImage(file: File, maxDimension = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('No se pudo procesar la imagen.');
    return blob;
  } finally {
    bitmap.close();
  }
}
