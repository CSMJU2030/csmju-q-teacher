import { Injectable, Logger } from '@nestjs/common';

/**
 * Structured logging for authentication/authorization events (spec §35).
 *
 * Never logs: access tokens, refresh tokens, Authorization headers, private
 * keys or passwords. Only event names, subject ids, kids and reasons.
 */
@Injectable()
export class AuthEventsLogger {
  private readonly logger = new Logger('AuthEvents');

  private emit(level: 'log' | 'warn' | 'error', event: string, fields: Record<string, unknown>): void {
    this.logger[level](JSON.stringify({ event, ...fields, at: new Date().toISOString() }));
  }

  jwtVerified(fields: { sub: string; kid?: string; coreRole?: string; subsystemRole?: string }): void {
    this.emit('log', 'jwt.verification.success', fields);
  }

  jwtRejected(fields: { reason: string; kid?: string; path?: string }): void {
    this.emit('warn', 'jwt.verification.failure', fields);
  }

  unknownKid(fields: { kid: string; knownKids: string[] }): void {
    this.emit('warn', 'jwks.unknown_kid', fields);
  }

  jwksRefresh(fields: { url?: string; reason: string; keyCount?: number; kids?: string[] }): void {
    this.emit('log', 'jwks.refresh', fields);
  }

  jwksRefreshFailed(fields: { reason: string; cachedKeyCount: number }): void {
    this.emit('error', 'jwks.refresh.failure', fields);
  }

  roleMappingFailed(fields: { sub: string; coreRole?: string }): void {
    this.emit('warn', 'authorization.role_mapping_failed', fields);
  }

  authorizationDenied(fields: {
    sub: string;
    subsystemRole?: string;
    required?: string[];
    path?: string;
    reason?: string;
  }): void {
    this.emit('warn', 'authorization.denied', fields);
  }
}
