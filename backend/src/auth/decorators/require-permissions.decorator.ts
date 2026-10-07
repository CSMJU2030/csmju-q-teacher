import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * Declares the permissions a route needs. The request passes when the caller's
 * subsystem role holds AT LEAST ONE of them (e.g. `read:any` OR `read:own`);
 * the service then narrows `:own` access against the actual business record.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
