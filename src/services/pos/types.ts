/** One colour of an item, with its own model code and photo. */
export interface PosVariant {
  code: string;
  color: string;
  /** Photo without its size: `/pos-items/v-801b` → `-256.webp` / `-640.webp`. */
  image: string;
}

/** An item on the till: one model, in one or more colours. Its prices are in dollars. */
export interface PosItem {
  id: string;
  model: string;
  name: string;
  /** The Kurdish name, also printed on the invoice. */
  ku: string;
  category: string;
  /** "10 L · 1800 W". */
  spec: string;
  /** The regular retail (موفرەد) price of one piece, in dollars. */
  price: number;
  /** The price while the offer runs, in dollars. */
  offer?: number;
  /** What the price list prints beside it; worked out when the price was changed. */
  percent?: number;
  image: string;
  variants?: PosVariant[];
  /** Not shown on the till. */
  hidden?: boolean;
  /** Added by the owner, rather than from the price list. */
  custom?: boolean;
}

export interface PosCategory {
  id: string;
  name: string;
  ku: string;
}

/** The days the offer prices count, `yyyy-MM-dd`, both included. */
export interface PosOffer {
  name: string;
  from: string;
  to: string;
}

/** One set of settings for every till. */
export interface PosSettings {
  offer: PosOffer;
  /** Dinars for one dollar; any till may change it. */
  rate: number;
  /** Whether anyone has set the rate yet, or it is still the built-in one. */
  rateSet: boolean;
  /** Dinar prices are rounded to this. */
  rounding: number;
  /** Printed on the invoice when filled in. */
  phone: string;
  address: string;
}

/** The owner's change to one item, kept over the price list. */
export interface PosItemChange {
  id: string;
  price?: number;
  /** null takes the offer off. */
  offer?: number | null;
  hidden?: boolean;
  /** Off the price list and every till; kept so it can be brought back. */
  deleted?: boolean;
  /** A whole item, when the owner added it. */
  custom?: Omit<PosItem, 'id'>;
}

/** One line of an invoice, as it was sold. Dinars, but for `usd`. */
export interface SaleLine {
  id: string;
  itemId: string;
  code: string;
  name: string;
  ku: string;
  category: string;
  color: string;
  image: string;
  qty: number;
  /** What one piece was sold for, before the discount. */
  price: number;
  /** Taken off the whole line. */
  discount: number;
  /** The price of one piece that day, before the seller changed it. */
  list: number;
  /** The same without the offer. */
  regular: number;
  /** The price of one piece that day, in dollars. */
  usd: number;
}

export interface SaleReturn {
  id: string;
  at: string;
  reason: string;
  by: string;
  refund: number;
  lines: { id: string; qty: number }[];
}

export interface SaleEvent {
  at: string;
  action: 'edit' | 'return' | 'undo_return' | 'delete' | 'restore';
  by: string;
  note: string;
  before?: {
    total: number;
    discount: number;
    customerName?: string;
    lines: { code: string; qty: number; price: number; discount?: number }[];
  };
}

/** What the till sends: a new sale, or the new version of one. */
export interface SaleDraft {
  id: string;
  ref: string;
  soldAt: string;
  seller: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  note: string;
  lines: SaleLine[];
  /** Dinars for one dollar at the time. */
  rate: number;
  device: string;
}

export interface Sale extends SaleDraft {
  /** The invoice number; null until a sale made offline reaches the server. */
  saleNo: number | null;
  subtotal: number;
  discount: number;
  total: number;
  returns: SaleReturn[];
  refunded: number;
  history: SaleEvent[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteReason: string;
  /** Still only on this device. */
  pending?: boolean;
}

export type SaleStatus = 'sold' | 'part' | 'returned' | 'deleted';
