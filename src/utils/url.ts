/** Builds an absolute URL (origin + path) for encoding into a QR code. */
export function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}
