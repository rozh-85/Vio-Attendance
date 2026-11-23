import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { normalizePhone, todayKey } from './logic';
import type { RepairDraft, RepairSession, RepairTicket } from './types';

/**
 * The repair desk's own account and its repairs (عەتڵ). In Supabase it goes
 * through the functions in supabase/repairs.sql; with no Supabase configured,
 * the same rules run on this browser's storage.
 */

export type RepairErrorCode =
  | 'WRONG_LOGIN'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'TICKET_INCOMPLETE'
  | 'TICKET_INVALID'
  | 'TICKET_NOT_FOUND'
  | 'NOT_SET_UP';

const MESSAGES: Record<RepairErrorCode, string> = {
  WRONG_LOGIN: 'ئیمەیڵ یان وشەی نهێنی هەڵەیە.',
  ACCOUNT_LOCKED: 'زۆر جار وشەی نهێنی هەڵە بوو. ١٥ خولەکی تر هەوڵ بدەرەوە.',
  SESSION_EXPIRED: 'لە هەژمارەکە دەرچوویت. تکایە دووبارە بچۆ ژوورەوە.',
  TICKET_INCOMPLETE: 'ناو، ژمارەی مۆبایل و جۆری ئایتم پڕ بکەرەوە.',
  TICKET_INVALID: 'بەرواری چاکردن نابێت پێش بەرواری هێنان بێت.',
  TICKET_NOT_FOUND: 'ئەم عەتڵە نەدۆزرایەوە — لەوانەیە سڕابێتەوە.',
  NOT_SET_UP:
    'بەشی عەتڵ هێشتا لە بنکەی زانیاری دانەنراوە. فایلی supabase/repairs.sql جارێک لە Supabase SQL Editor ڕابکە.',
};

export class RepairError extends Error {
  code: RepairErrorCode;

  constructor(code: RepairErrorCode) {
    super(MESSAGES[code]);
    this.name = 'RepairError';
    this.code = code;
  }
}

export function repairErrorMessage(err: unknown): string {
  if (err instanceof RepairError) return err.message;
  if (err instanceof TypeError) return 'ئینتەرنێت نییە یان سێرڤەر وەڵام ناداتەوە. دووبارە هەوڵ بدەرەوە.';
  if (err instanceof Error && err.message) return err.message;
  return 'هەڵەیەک ڕوویدا. دووبارە هەوڵ بدەرەوە.';
}

export interface RepairStore {
  signIn(email: string, password: string): Promise<RepairSession>;
  /** The account's name while the token is valid, else null. */
  whoAmI(token: string): Promise<string | null>;
  signOut(token: string): Promise<void>;
  list(token: string): Promise<RepairTicket[]>;
  save(token: string, draft: RepairDraft): Promise<RepairTicket>;
  setDelivered(token: string, id: string, delivered: boolean): Promise<RepairTicket>;
  remove(token: string, id: string): Promise<void>;
}

let cached: RepairStore | undefined;

export function getRepairStore(): RepairStore {
  if (!cached) {
    const client = getSupabaseClient();
    cached = client ? new SupabaseRepairStore(client) : new LocalRepairStore();
  }
  return cached;
}

/** What the form holds, trimmed and with the phone in its one spelling. */
function cleanDraft(draft: RepairDraft): RepairDraft {
  return {
    ...draft,
    customerName: draft.customerName.trim(),
    phone: normalizePhone(draft.phone),
    itemType: draft.itemType.trim(),
    note: draft.note.trim(),
    repairedOn: draft.repairedOn || null,
  };
}

function toTicket(raw: RepairTicket): RepairTicket {
  return { ...raw, ticketNo: Number(raw.ticketNo), note: raw.note ?? '' };
}

// ── Supabase ─────────────────────────────────────────────────────────────────

function translate(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (message in MESSAGES) return new RepairError(message as RepairErrorCode);
  if (
    error.code === '42P01' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /does not exist|could not find the (function|table)/i.test(message)
  ) {
    return new RepairError('NOT_SET_UP');
  }
  return new Error(message || 'بنکەی زانیاری داواکارییەکەی ڕەتکردەوە.');
}

class SupabaseRepairStore implements RepairStore {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw translate(error);
    return data as T;
  }

  async signIn(email: string, password: string): Promise<RepairSession> {
    const result = await this.call<{ error?: RepairErrorCode; token?: string; displayName?: string }>(
      'repair_sign_in',
      { p_email: email.trim(), p_password: password },
    );
    if (result.error) throw new RepairError(result.error);
    return { token: result.token ?? '', displayName: result.displayName ?? '' };
  }

  async whoAmI(token: string): Promise<string | null> {
    const result = await this.call<{ displayName?: string } | null>('repair_whoami', { p_token: token });
    return result?.displayName ?? null;
  }

  async signOut(token: string): Promise<void> {
    await this.client.rpc('repair_sign_out', { p_token: token });
  }

  async list(token: string): Promise<RepairTicket[]> {
    const rows = await this.call<RepairTicket[] | null>('repair_list', { p_token: token });
    return (rows ?? []).map(toTicket);
  }

  async save(token: string, draft: RepairDraft): Promise<RepairTicket> {
    return toTicket(await this.call<RepairTicket>('repair_save', { p_token: token, p_ticket: cleanDraft(draft) }));
  }

  async setDelivered(token: string, id: string, delivered: boolean): Promise<RepairTicket> {
    return toTicket(
      await this.call<RepairTicket>('repair_set_delivered', { p_token: token, p_id: id, p_delivered: delivered }),
    );
  }

  async remove(token: string, id: string): Promise<void> {
    await this.call('repair_delete', { p_token: token, p_id: id });
  }
}

// ── This browser (no Supabase) ───────────────────────────────────────────────

const KEYS = { tickets: 'vio.repairTickets', sessions: 'vio.repairSessions' } as const;

/**
 * The same account as supabase/repairs.sql, for the local sandbox only. The
 * password is kept as its SHA-256, never in the clear.
 */
const LOCAL_ACCOUNT = {
  email: 'shalaw@vio.com',
  displayName: 'Shalaw',
  passwordSha256: '7cf6fc2a5297acf37f89c541f6943b2808f2277d911f70923709c7c985dd57ca',
};

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class LocalRepairStore implements RepairStore {
  private async check(token: string): Promise<void> {
    if (!read<string>(KEYS.sessions).includes(await sha256(token))) throw new RepairError('SESSION_EXPIRED');
  }

  async signIn(email: string, password: string): Promise<RepairSession> {
    if (
      email.trim().toLowerCase() !== LOCAL_ACCOUNT.email ||
      (await sha256(password)) !== LOCAL_ACCOUNT.passwordSha256
    ) {
      throw new RepairError('WRONG_LOGIN');
    }
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
    write(KEYS.sessions, [...read<string>(KEYS.sessions), await sha256(token)]);
    return { token, displayName: LOCAL_ACCOUNT.displayName };
  }

  async whoAmI(token: string): Promise<string | null> {
    return read<string>(KEYS.sessions).includes(await sha256(token)) ? LOCAL_ACCOUNT.displayName : null;
  }

  async signOut(token: string): Promise<void> {
    const hash = await sha256(token);
    write(KEYS.sessions, read<string>(KEYS.sessions).filter((h) => h !== hash));
  }

  async list(token: string): Promise<RepairTicket[]> {
    await this.check(token);
    return read<RepairTicket>(KEYS.tickets);
  }

  async save(token: string, input: RepairDraft): Promise<RepairTicket> {
    await this.check(token);
    const draft = cleanDraft(input);
    if (!draft.customerName || draft.phone.length < 7 || !draft.itemType) throw new RepairError('TICKET_INCOMPLETE');
    if (draft.repairedOn && draft.repairedOn < draft.broughtOn) throw new RepairError('TICKET_INVALID');
    const tickets = read<RepairTicket>(KEYS.tickets);
    const now = new Date().toISOString();
    const fields = {
      customerName: draft.customerName,
      phone: draft.phone,
      itemType: draft.itemType,
      broughtOn: draft.broughtOn,
      repairedOn: draft.repairedOn,
      note: draft.note,
    };
    if (draft.id) {
      const existing = tickets.find((t) => t.id === draft.id);
      if (!existing) throw new RepairError('TICKET_NOT_FOUND');
      const next = { ...existing, ...fields, updatedAt: now };
      write(KEYS.tickets, tickets.map((t) => (t.id === next.id ? next : t)));
      return next;
    }
    const ticket: RepairTicket = {
      id: crypto.randomUUID(),
      ticketNo: tickets.reduce((max, t) => Math.max(max, t.ticketNo), 0) + 1,
      ...fields,
      deliveredAt: null,
      createdAt: now,
      updatedAt: now,
    };
    write(KEYS.tickets, [...tickets, ticket]);
    return ticket;
  }

  async setDelivered(token: string, id: string, delivered: boolean): Promise<RepairTicket> {
    await this.check(token);
    const tickets = read<RepairTicket>(KEYS.tickets);
    const existing = tickets.find((t) => t.id === id);
    if (!existing) throw new RepairError('TICKET_NOT_FOUND');
    const today = todayKey();
    const next: RepairTicket = {
      ...existing,
      deliveredAt: delivered ? new Date().toISOString() : null,
      repairedOn: delivered ? (existing.repairedOn ?? (today < existing.broughtOn ? existing.broughtOn : today)) : existing.repairedOn,
      updatedAt: new Date().toISOString(),
    };
    write(KEYS.tickets, tickets.map((t) => (t.id === id ? next : t)));
    return next;
  }

  async remove(token: string, id: string): Promise<void> {
    await this.check(token);
    write(KEYS.tickets, read<RepairTicket>(KEYS.tickets).filter((t) => t.id !== id));
  }
}

// ── This browser's sign-in ───────────────────────────────────────────────────

const SESSION_KEY = 'vio.repairSession';

export function loadRepairSession(): RepairSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as RepairSession | null;
    return value?.token ? value : null;
  } catch {
    return null;
  }
}

export function saveRepairSession(session: RepairSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the sign-in lasts until the page is closed.
  }
}
