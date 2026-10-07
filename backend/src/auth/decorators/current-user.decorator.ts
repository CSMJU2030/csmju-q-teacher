import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { CoreHubIdentity } from '../core-hub-identity';

/** Injects the verified Core Hub identity attached by CoreHubJwtGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CoreHubIdentity => {
    const request = ctx.switchToHttp().getRequest<{ user?: CoreHubIdentity }>();
    return request.user as CoreHubIdentity;
  },
);
