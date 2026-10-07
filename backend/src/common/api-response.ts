/** Consistent API envelope (spec §27). */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Marker returned by controllers for collection endpoints so the response
 * interceptor can emit `{ success, data: [], meta: {} }`.
 */
export class CollectionResult<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: Record<string, unknown> = {},
  ) {}
}
