import { periodRange, type PeriodId } from './report';

/**
 * What the Profit page keeps while the owner goes to Model costs or a sponsor
 * and comes back: the period it showed, and a one-line "saved" message to
 * show once on return. Lives as long as the loaded app; a refresh starts on
 * this month.
 */
export interface ProfitPeriod {
  period: PeriodId | 'custom';
  from: string;
  to: string;
}

let period: ProfitPeriod | null = null;
let notice: string | null = null;

export function readProfitPeriod(): ProfitPeriod {
  return period ?? { period: 'month', ...periodRange('month') };
}

export function writeProfitPeriod(next: ProfitPeriod): void {
  period = next;
}

/** Set by a page that saved something, just before it goes back to Profit. */
export function setProfitNotice(text: string): void {
  notice = text;
}

export function readProfitNotice(): string | null {
  return notice;
}

export function clearProfitNotice(): void {
  notice = null;
}
