import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Machine-readable error codes (spec §27): the closed list of
 * standards/contracts/error-codes.json - never invent another.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  /** 429 - always with a Retry-After header. */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** 503 - something this subsystem depends on is down for now; always with Retry-After. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * HttpException carrying an explicit error code. The exception filter renders
 * it as `{ success: false, error: { code, message } }`, and sends
 * `retryAfterSec` as the Retry-After header.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
    readonly retryAfterSec?: number,
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(message: string, details?: unknown): AppException {
    return new AppException(ErrorCode.BAD_REQUEST, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Authentication is required'): AppException {
    return new AppException(ErrorCode.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
  ): AppException {
    return new AppException(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static notFound(message: string): AppException {
    return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, details?: unknown): AppException {
    return new AppException(ErrorCode.CONFLICT, message, HttpStatus.CONFLICT, details);
  }

  /** A dependency (Core Hub) cannot answer now. Never for a bug - that is a 500. */
  static serviceUnavailable(message: string, retryAfterSec: number): AppException {
    return new AppException(
      ErrorCode.SERVICE_UNAVAILABLE,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      undefined,
      retryAfterSec,
    );
  }
}
