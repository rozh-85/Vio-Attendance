import type { CustomerGender, OrderPurchase, OrderShift, OrderStatus } from './types';

/**
 * Choices on the seller's order form. Cities and categories are written the
 * way the old Google Sheet has them, so new orders and imported ones group
 * together in the report. Most-used first.
 */
export const CITIES = [
  'سلێمانی',
  'هەولێر',
  'بەغداد',
  'دهۆک',
  'کەرکوک',
  'بەسرە',
  'کەلار',
  'هەلەبجە',
  'موسڵ',
  'خانەقین',
] as const;

export const CATEGORIES = [
  'هیتەر',
  'چوپەر',
  'جیهازی قاوە',
  'سەماوەر',
  'جیم بڵێندەر',
  'عەجانە',
  'بوخار شۆر',
  'کتری',
  'کتری سێت',
  'موبەریدە',
  'ئایەرفرای',
  'سێتی بلندەر',
  'ئامێری دروستکردنی ئەزبەری',
  'عەسارەی شوشە',
  'عەسارەی ٤ کارە',
  'فرن',
  'میکسەر',
  'ئوتوو',
  'گسکی شەحن',
  'گسکی ماوس',
  'بوخاری کارەبای',
  'سبلت',
  'پانکە',
  'پارچەی یەدەگ',
] as const;

export const PLATFORMS = ['Instagram', 'Facebook', 'WhatsApp', 'TikTok', 'Snapchat', 'Other'] as const;

export const GENDER_LABEL: Record<CustomerGender, { en: string; ku: string }> = {
  female: { en: 'Female', ku: 'مێ' },
  male: { en: 'Male', ku: 'نێر' },
};

export const PURCHASE_LABEL: Record<OrderPurchase, { en: string; ku: string }> = {
  first: { en: 'First time', ku: 'یەکەم جارە' },
  second: { en: 'Second time', ku: 'دووەم جارە' },
  repeat: { en: 'More than twice', ku: 'زیاتر لە چەند جارێکە' },
};

export const SHIFT_LABEL: Record<OrderShift, { en: string; ku: string; hours: string }> = {
  morning: { en: 'Morning', ku: 'بەیانی', hours: '8–12' },
  afternoon: { en: 'Afternoon', ku: 'ئێوارە', hours: '12–5' },
  night: { en: 'Night', ku: 'شەو', hours: '5–12' },
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** Cancelled and returned orders brought in no money. */
export function countsAsSale(status: OrderStatus): boolean {
  return status === 'new' || status === 'delivered';
}

/** The shift an order taken right now belongs to. */
export function shiftAt(date = new Date()): OrderShift {
  const hour = date.getHours();
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'night';
}

export function formatIqd(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} IQD`;
}

/** Short money for tight spots: 1.2M, 450K. */
export function formatIqdShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${+(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

/** One colour per seller, the same on every chart, chip and export. */
const SELLER_COLORS = ['#A5292B', '#4F46E5', '#0E9F6E', '#D97706', '#0284C7', '#9333EA', '#DB2777', '#475569'];

export function sellerColor(index: number): string {
  return SELLER_COLORS[((index % SELLER_COLORS.length) + SELLER_COLORS.length) % SELLER_COLORS.length];
}

/** The text to show for a seller whose name was left blank on the sheet. */
export const UNKNOWN_SELLER = 'Unknown seller';
