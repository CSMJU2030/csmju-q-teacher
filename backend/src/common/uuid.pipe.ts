import { ParseUUIDPipe } from '@nestjs/common';

/**
 * Every id this subsystem creates is a UUID v4, so a path parameter that is
 * anything else answers 400 (api-conventions.md 1). A `coreUserId` is never a
 * path parameter: it is an opaque string and not always a UUID.
 */
export const parseUuid = (): ParseUUIDPipe => new ParseUUIDPipe({ version: '4' });
