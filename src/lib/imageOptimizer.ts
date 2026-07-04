type OptimizeImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  outputType?: 'image/jpeg' | 'image/webp';
  filenamePrefix?: string;
};

const extensionFor = (type: string) => (type === 'image/webp' ? 'webp' : 'jpg');

export async function optimizeImageFile(file: File, options: OptimizeImageOptions): Promise<File> {
  const {
    maxWidth,
    maxHeight,
    quality = 0.78,
    outputType = 'image/webp',
    filenamePrefix,
  } = options;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });
    if (!blob) return file;

    const baseName = (filenamePrefix || file.name.replace(/\.[^.]+$/, '') || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';
    return new File([blob], `${baseName}.${extensionFor(outputType)}`, { type: outputType });
  } finally {
    bitmap.close?.();
  }
}
