export type CustomerGender = 'female' | 'male';
/** Whether this is the customer's first, second or a later purchase. */
export type OrderPurchase = 'first' | 'second' | 'repeat';
/** Part of the day the order came in, as on the old Google Form. */
export type OrderShift = 'morning' | 'afternoon' | 'night';
export type OrderStatus = 'new' | 'delivered' | 'cancelled' | 'returned';

/** One order a social media seller took, as the owner report sees it. */
export interface SalesOrder {
  id: string;
  /** Running number shown to the seller when they save, e.g. #1043. */
  orderNo: number;
  accountId: string | null;
  /** Who sold it, kept as written when it was saved. */
  sellerName: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  secondPhone: string;
  city: string;
  address: string;
  itemModel: string;
  itemCategory: string;
  /** Total price in IQD. */
  totalPrice: number;
  gender: CustomerGender | '';
  platform: string;
  purchase: OrderPurchase | '';
  /** How many times the customer has bought, as typed; null when not known. */
  purchaseCount: number | null;
  shift: OrderShift | '';
  note: string;
  status: OrderStatus;
  source: 'app' | 'import';
  /** When the seller changed it after saving, if they did. */
  editedAt?: string | null;
  /**
   * When it was saved. `createdAt` is the day of the order itself, which a
   * seller may set earlier for an order they forgot to save.
   */
  enteredAt?: string | null;
}

/** What a seller fills in. Seller, time and number are set by the server. */
export type NewSalesOrder = Pick<
  SalesOrder,
  | 'customerName'
  | 'customerPhone'
  | 'secondPhone'
  | 'city'
  | 'address'
  | 'itemModel'
  | 'itemCategory'
  | 'totalPrice'
  | 'gender'
  | 'platform'
  | 'purchase'
  | 'purchaseCount'
  | 'shift'
  | 'note'
> & {
  /** An earlier day for an order the seller forgot to save; left out means now. */
  orderDate?: string | null;
};

/** What the owner may change on a saved order. */
export type SalesOrderPatch = Partial<NewSalesOrder & Pick<SalesOrder, 'status' | 'sellerName' | 'createdAt'>>;

/** A row from the old Google Sheet, ready to be added. */
export interface ImportedOrder extends NewSalesOrder {
  createdAt: string;
  sellerName: string;
  accountId: string | null;
  /** Same row, same key: importing a file twice adds nothing the second time. */
  importKey: string;
}

/** A seller's sign-in for the order page. The password never leaves the server. */
export interface SocialAccount {
  id: string;
  displayName: string;
  username: string;
  employeeId: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface NewSocialAccount {
  displayName: string;
  username: string;
  password: string;
  employeeId: string | null;
}

/**
 * One of the seller's own orders, as their My orders page shows it — never
 * anyone else's. Includes the ones imported from the old sheet.
 */
export interface SellerOrder extends NewSalesOrder {
  id: string;
  orderNo: number;
  createdAt: string;
  /** When the seller saved it; differs from `createdAt` for a forgotten order. */
  enteredAt: string;
  editedAt: string | null;
  status: OrderStatus;
  source: 'app' | 'import';
  /** Saved in the app and still new: the seller may fix or delete it. */
  canChange: boolean;
}

/** Kept on the seller's phone after signing in. */
export interface SellerSession {
  token: string;
  displayName: string;
}
