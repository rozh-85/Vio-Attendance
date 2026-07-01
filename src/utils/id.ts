/** Generates a reasonably-unique id. Uses crypto.randomUUID when available. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Formats a sequential number as a zero-padded code, e.g. 1 -> "001". */
export function formatCode(sequence: number, padTo = 3): string {
  return String(sequence).padStart(padTo, '0');
}

/** Normalises a phone number for comparison (strips spaces / dashes). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}
