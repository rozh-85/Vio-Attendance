/** One faulty item a customer brought in (عەتڵ). */
export interface RepairTicket {
  id: string;
  /** Printed on the receipt and the label. */
  ticketNo: number;
  customerName: string;
  /** Digits only, `07XXXXXXXXX` for Iraqi mobiles. */
  phone: string;
  itemType: string;
  /** `yyyy-MM-dd` — بەرواری هێنان. */
  broughtOn: string;
  /** `yyyy-MM-dd` — بەرواری چاکردن, or null while it is not repaired. */
  repairedOn: string | null;
  note: string;
  /** When it was repaired and handed back to the customer. */
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the form sends: a new repair, or a change to one when `id` is set. */
export interface RepairDraft {
  id?: string;
  customerName: string;
  phone: string;
  itemType: string;
  broughtOn: string;
  repairedOn: string | null;
  note: string;
}

export interface RepairSession {
  token: string;
  displayName: string;
}

/** Where a repair is: still in the shop, repaired and waiting, or handed back. */
export type RepairStatus = 'waiting' | 'ready' | 'delivered';
