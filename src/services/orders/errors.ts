export type OrdersErrorCode =
  | 'WRONG_LOGIN'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_EXPIRED'
  | 'ORDER_INCOMPLETE'
  | 'USERNAME_TAKEN'
  | 'ACCOUNT_INVALID'
  | 'PASSWORD_TOO_SHORT'
  | 'NOT_ALLOWED'
  | 'NOT_SET_UP';

export const MESSAGES: Record<OrdersErrorCode, string> = {
  WRONG_LOGIN: 'Wrong username or password.',
  ACCOUNT_LOCKED: 'Too many wrong passwords. Try again in 15 minutes.',
  SESSION_EXPIRED: 'You were signed out. Please sign in again.',
  ORDER_INCOMPLETE: 'Fill in the customer, phone, city, platform and price.',
  USERNAME_TAKEN: 'That username is already used by another account.',
  ACCOUNT_INVALID:
    'Give the account a name, and a username of 3–32 letters, numbers, dots, dashes or underscores.',
  PASSWORD_TOO_SHORT: 'The password needs at least 6 characters.',
  NOT_ALLOWED: 'This account cannot manage seller accounts.',
  NOT_SET_UP:
    'Orders are not set up in the database yet. Run supabase/social-orders.sql once in the Supabase SQL editor.',
};

export class OrdersError extends Error {
  code: OrdersErrorCode;

  constructor(code: OrdersErrorCode, message = MESSAGES[code]) {
    super(message);
    this.name = 'OrdersError';
    this.code = code;
  }
}

export function ordersErrorMessage(err: unknown): string {
  if (err instanceof OrdersError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
