/**
 * Product pictures chosen on the Add products page: the model number read
 * from each file's name, and the picture made small before it is uploaded,
 * so sellers' phones load it quickly.
 */

/** Names cameras and chat apps give a photo, which say nothing about the model. */
const CAMERA_NAME = /^(img|dsc|dcim|pxl|photo|image|whatsapp image|screenshot|screen shot|wa\d|signal|telegram)[\s_-]?/i;

/**
 * "V-400.jpg" → "V-400", "v400 (2).png" → "V400", "VAF810D_copy.jpeg" →
 * "VAF810D". A camera's own name (IMG_1234) gives '' so the owner writes it.
 */
export function modelFromFileName(fileName: string): string {
  let base = fileName.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  base = base
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[\s_-]*(copy|final|new)$/i, '')
    .trim();
  if (!base || CAMERA_NAME.test(base)) return '';
  return base.toUpperCase();
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);
}

/** The picture at most `max` pixels on its longest side, as a JPEG on white. */
export async function shrinkImage(file: Blob, max = 900, quality = 0.84): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare pictures.');
  // Transparent PNGs keep a white background, as product photos have.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the picture.'))), 'image/jpeg', quality),
  );
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to an <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('This picture could not be opened. Use a JPG or PNG.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Every picture inside what was dropped — files, and folders with their
 * sub-folders — for browsers that let a folder be dropped.
 */
export async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  const entries = [...items]
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [];
  const files: File[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      files.push(file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // A folder is read in batches until an empty one comes back.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child);
    }
  }
  for (const entry of entries) await walk(entry);
  return files;
}
