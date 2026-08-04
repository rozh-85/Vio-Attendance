/** Domain-level errors thrown by any DataService implementation. */

import { MAX_STUDENTS_PER_DEVICE } from '@/utils/device';

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
  | 'DEVICE_LIMIT_REACHED'
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

/**
 * Shown when one phone has been used to check in too many different students.
 * Shared by both backends so the student sees the same wording either way.
 */
export const DEVICE_LIMIT_MESSAGE =
  `This phone has already checked in ${MAX_STUDENTS_PER_DEVICE} students. ` +
  'Please check in from your own phone, or ask your lecturer to add you.';
