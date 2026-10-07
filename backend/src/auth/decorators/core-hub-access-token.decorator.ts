import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../common/errors';

/**
 * Injects the caller's Core Hub access token, which CoreHubJwtGuard attaches
 * once it has verified it. Pass it on to Core Hub APIs (reference data) so
 * Core Hub applies the caller's own permissions. Never log it.
 */
export const CoreHubAccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const token = ctx.switchToHttp().getRequest<Request>().coreHubAccessToken;
    if (!token) {
      throw AppException.unauthorized('A Core Hub Bearer access token is required');
    }
    return token;
  },
);
