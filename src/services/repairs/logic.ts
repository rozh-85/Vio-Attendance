import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { RepairStatus, RepairTicket } from './types';

/** An item still not repaired this many days after it came in turns red. */
export const OVERDUE_DAYS = 2;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Kurdish / Arabic digits (٠٧٥٠, ۰۷۵۰) as 0–9. */
export function latinDigits(value: string): string {
  return value.replace(EASTERN_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * One spelling per phone, so a customer is always found again:
 * "0750 123 4567", "+964 750 123 4567", "٠٧٥٠١٢٣٤٥٦٧" and "7501234567" are
 * all 07501234567.
 */
export function normalizePhone(value: string): string {
  let digits = latinDigits(value).replace(/\D/g, '');
  if (digits.startsWith('00964')) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith('964')) digits = `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith('7')) digits = `0${digits}`;
  return digits;
}

/** 07501234567 → 0750 123 4567, easier to read out. */
export function formatPhone(phone: string): string {
  return /^07\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

export const todayKey = () => format(new Date(), 'yyyy-MM-dd');

export function repairStatus(ticket: RepairTicket): RepairStatus {
  if (ticket.deliveredAt) return 'delivered';
  return ticket.repairedOn ? 'ready' : 'waiting';
}

/** Whole days since the item came in. */
export function daysInShop(ticket: RepairTicket, today = new Date()): number {
  return Math.max(0, differenceInCalendarDays(today, parseISO(ticket.broughtOn)));
}

/** Still not repaired two or more days after it came in. */
export function isOverdue(ticket: RepairTicket, today = new Date()): boolean {
  return repairStatus(ticket) === 'waiting' && daysInShop(ticket, today) >= OVERDUE_DAYS;
}

export const STATUS_TEXT: Record<RepairStatus, string> = {
  waiting: 'لە چاکردندایە',
  ready: 'ئامادەیە',
  delivered: 'دراوەتەوە',
};

/** The local day it was handed back, `yyyy-MM-dd`. */
export function deliveredDay(ticket: RepairTicket): string | null {
  return ticket.deliveredAt ? format(new Date(ticket.deliveredAt), 'yyyy-MM-dd') : null;
}

/** yyyy-MM-dd → 2026/11/23. */
export function showDate(day: string | null | undefined): string {
  return day ? day.replaceAll('-', '/') : '—';
}

/** "ئەمڕۆ", "دوێنێ", "٣ ڕۆژ". */
export function daysText(days: number): string {
  if (days === 0) return 'ئەمڕۆ';
  if (days === 1) return 'دوێنێ';
  return `${days} ڕۆژ`;
}

/** A customer is everyone who came with the same phone. */
export interface RepairCustomer {
  phone: string;
  /** The name on their latest repair. */
  name: string;
  tickets: RepairTicket[];
}

/** Customers, most recent first; each one's repairs newest first. */
export function groupByCustomer(tickets: RepairTicket[]): RepairCustomer[] {
  const map = new Map<string, RepairCustomer>();
  for (const ticket of sortNewest(tickets)) {
    const customer = map.get(ticket.phone);
    if (customer) customer.tickets.push(ticket);
    else map.set(ticket.phone, { phone: ticket.phone, name: ticket.customerName, tickets: [ticket] });
  }
  return [...map.values()];
}

export function sortNewest(tickets: RepairTicket[]): RepairTicket[] {
  return [...tickets].sort(
    (a, b) => b.broughtOn.localeCompare(a.broughtOn) || b.ticketNo - a.ticketNo,
  );
}

/**
 * Customers matching what was typed in the search: phone digits anywhere in
 * the number (Kurdish digits too), or a part of the name.
 */
export function searchCustomers(customers: RepairCustomer[], query: string): RepairCustomer[] {
  const text = query.trim().toLowerCase();
  if (!text) return customers;
  const digits = latinDigits(text).replace(/\D/g, '');
  const phone = digits.length >= 3 ? normalizePhone(digits) : '';
  return customers.filter(
    (c) =>
      (digits.length >= 3 && (c.phone.includes(digits) || (phone && c.phone.includes(phone)))) ||
      c.tickets.some((t) => t.customerName.toLowerCase().includes(text)),
  );
}
