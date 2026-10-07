import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { CollectionResult, SuccessResponse } from '../api-response';

/** Wraps every successful controller result in the standard envelope. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponse<unknown>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<SuccessResponse<unknown>> {
    return next.handle().pipe(
      map((payload) => {
        if (payload instanceof CollectionResult) {
          return { success: true as const, data: payload.data, meta: payload.meta };
        }
        return { success: true as const, data: payload ?? null };
      }),
    );
  }
}
