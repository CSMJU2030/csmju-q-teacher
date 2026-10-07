import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { Request, Response } from 'express';
import { ErrorResponse } from '../api-response';
import { AppException, ErrorCode as Codes } from '../errors';

const STATUS_TO_CODE: Record<number, string> = {
  400: Codes.BAD_REQUEST,
  401: Codes.UNAUTHORIZED,
  403: Codes.FORBIDDEN,
  404: Codes.NOT_FOUND,
  409: Codes.CONFLICT,
  429: Codes.TOO_MANY_REQUESTS,
  500: Codes.INTERNAL_ERROR,
  503: Codes.SERVICE_UNAVAILABLE,
};

/** contracts/error-codes.json: a 429 or 503 always tells the caller when to retry. */
const NEEDS_RETRY_AFTER = new Set<number>([
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.SERVICE_UNAVAILABLE,
]);
const DEFAULT_RETRY_AFTER_SEC = 30;

/**
 * Single place that turns any thrown error into the standard error envelope.
 * Internal details and stack traces stay in the server log (spec §27, §29).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.render(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Full detail server-side only - never in the HTTP response. The path
      // goes without its query: /auth/callback carries the access token there.
      this.logger.error(
        JSON.stringify({
          event: 'request.unhandled_error',
          method: request.method,
          path: request.path,
          status,
        }),
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // A handler that already answered cannot get a second, error response.
    if (response.headersSent) {
      return;
    }

    if (NEEDS_RETRY_AFTER.has(status)) {
      const retryAfter =
        exception instanceof AppException && exception.retryAfterSec !== undefined
          ? exception.retryAfterSec
          : DEFAULT_RETRY_AFTER_SEC;
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))));
    }

    response.status(status).json(body);
  }

  private render(exception: unknown): { status: number; body: ErrorResponse } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      return { status, body: this.fromHttpException(status, payload) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        error: { code: Codes.INTERNAL_ERROR, message: 'Internal server error' },
      },
    };
  }

  private fromHttpException(status: number, payload: unknown): ErrorResponse {
    const fallbackCode = STATUS_TO_CODE[status] ?? Codes.INTERNAL_ERROR;

    if (typeof payload === 'string') {
      return { success: false, error: { code: fallbackCode, message: payload } };
    }

    const record = (payload ?? {}) as Record<string, unknown>;
    const rawMessage = record.message;

    // class-validator produces `message: string[]`
    if (Array.isArray(rawMessage)) {
      return {
        success: false,
        error: {
          code: Codes.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: rawMessage,
        },
      };
    }

    return {
      success: false,
      error: {
        code: typeof record.code === 'string' ? record.code : fallbackCode,
        message:
          typeof rawMessage === 'string' && rawMessage.length > 0
            ? rawMessage
            : 'Request failed',
        ...(record.details !== undefined && record.details !== null
          ? { details: record.details }
          : {}),
      },
    };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): { status: number; body: ErrorResponse } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            success: false,
            error: {
              code: Codes.CONFLICT,
              message: 'A record with the same unique value already exists',
              details: (exception.meta as { target?: unknown } | undefined)?.target,
            },
          },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          body: {
            success: false,
            error: { code: Codes.BAD_REQUEST, message: 'Referenced record does not exist' },
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { success: false, error: { code: Codes.NOT_FOUND, message: 'Record not found' } },
        };
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}`);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            success: false,
            error: { code: Codes.INTERNAL_ERROR, message: 'Internal server error' },
          },
        };
    }
  }
}
