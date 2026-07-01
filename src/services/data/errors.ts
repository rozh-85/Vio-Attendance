/** Domain-level errors thrown by any DataService implementation. */

export type DataErrorCode =
  | 'PHONE_TAKEN'
  | 'STUDENT_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'CHECK_IN_CLOSED'
  | 'CHECK_OUT_CLOSED'
  | 'NOT_CHECKED_IN'
  | 'ALREADY_CHECKED_IN'
  | 'ALREADY_CHECKED_OUT'
  | 'NOT_IMPLEMENTED';

export class DataError extends Error {
  code: DataErrorCode;

  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = 'DataError';
    this.code = code;
  }
}

export function isDataError(err: unknown): err is DataError {
  return err instanceof DataError;
}
