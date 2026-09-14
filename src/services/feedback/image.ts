export const MAX_FEEDBACK_IMAGE_BYTES = 10 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 700 * 1024;
const MAX_IMAGE_EDGE = 1800;

export interface CompressedFeedbackImage {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be opened. Please choose another file.'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('This browser could not compress the image.')),
      'image/webp',
      quality,
    );
  });
}

export async function compressFeedbackImage(file: File): Promise<CompressedFeedbackImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > MAX_FEEDBACK_IMAGE_BYTES) throw new Error('The original image must be 10 MB or smaller.');

  const image = await loadImage(file);
  const sourceEdge = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = sourceEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / sourceEdge : 1;
  let quality = 0.88;
  let result: Blob | null = null;
  let width = 0;
  let height = 0;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    width = Math.max(1, Math.round(image.naturalWidth * scale));
    height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    result = await canvasBlob(canvas, quality);

    if (result.size <= TARGET_IMAGE_BYTES) break;
    if (quality > 0.78) quality -= 0.05;
    else {
      scale *= 0.88;
      quality = 0.84;
    }
  }

  if (!result) throw new Error('The image could not be compressed.');
  return {
    blob: result,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: result.size,
  };
}

export function formatImageBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
