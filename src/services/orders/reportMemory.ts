import type { OrderFilters, PeriodId } from './report';

/**
 * Where the owner was in the orders report, kept in memory while they open
 * an order on its own page and come back. A page refresh starts afresh, on
 * all time, because this lives only as long as the loaded app.
 */
export interface ReportMemory {
  period: PeriodId | 'custom';
  filters: OrderFilters;
  view: 'table' | 'charts';
  sort: { key: 'date' | 'seller' | 'customer' | 'city' | 'price' | 'status'; dir: 'asc' | 'desc' };
  pageSize: number;
  page: number;
  scrollY: number;
  /** The order just edited, to highlight on return. */
  highlightId: string | null;
  /** A one-line message to show on return, e.g. "Order #845 saved". */
  notice: string | null;
}

let memory: ReportMemory | null = null;

export function readReportMemory(): ReportMemory | null {
  return memory;
}

export function writeReportMemory(next: ReportMemory): void {
  memory = next;
}

/** Called by the order page after a save or delete. */
export function markReportReturn(highlightId: string | null, notice: string): void {
  if (memory) memory = { ...memory, highlightId, notice };
}

/** The highlight and notice are shown once. */
export function clearReportReturn(): void {
  if (memory) memory = { ...memory, highlightId: null, notice: null };
}
