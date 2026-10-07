import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

/**
 * GET /api/health (spec §21) - public service monitoring endpoint.
 * It requires no Core Hub authentication and exposes no internal detail.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: this.config.get<string>('subsystemId', 'csmju-q-teacher'),
    };
  }
}
