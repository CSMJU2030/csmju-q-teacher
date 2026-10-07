import { Injectable, Logger } from '@nestjs/common';

/**
 * Structured logging สำหรับตัวเรียกข้อมูลอ้างอิง — รูปแบบเดียวกับ AuthEventsLogger
 * ห้าม log: access token, Authorization header (contracts/log-events.json → mustNeverLog)
 */
@Injectable()
export class ReferenceDataEventsLogger {
  private readonly logger = new Logger('ReferenceData');

  private emit(level: 'log' | 'warn', event: string, fields: Record<string, unknown>): void {
    this.logger[level](JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
  }

  refresh(fields: { dataset: string; reason: string; itemCount: number }): void {
    this.emit('log', 'core_data.refresh', fields);
  }

  refreshFailed(fields: { dataset: string; reason: string; cachedItemCount: number }): void {
    this.emit('warn', 'core_data.refresh.failure', fields);
  }
}
