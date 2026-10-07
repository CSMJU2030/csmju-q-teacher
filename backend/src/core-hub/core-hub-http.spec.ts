import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../common/errors';
import { CoreHubCallError, coreHubFailure, retryAfterSeconds } from './core-hub-http';

describe('retryAfterSeconds', () => {
  it('reads delta-seconds', () => {
    expect(retryAfterSeconds('120')).toBe(120);
    expect(retryAfterSeconds(' 7 ')).toBe(7);
  });

  it('reads an HTTP date as the seconds left until it', () => {
    const now = Date.parse('2026-10-01T05:00:00Z');
    expect(retryAfterSeconds('Thu, 01 Oct 2026 05:01:30 GMT', now)).toBe(90);
    expect(retryAfterSeconds('Thu, 01 Oct 2026 04:59:00 GMT', now)).toBe(0);
  });

  it.each([null, '', 'soon', '-5', '1.5'])('ignores %p', (value) => {
    expect(retryAfterSeconds(value)).toBeUndefined();
  });
});

describe('coreHubFailure (reference-data.md 7.4)', () => {
  it('turns a Core Hub 401 into 401 UNAUTHORIZED, never 503', () => {
    const error = coreHubFailure(new CoreHubCallError('HTTP 401', 401));
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('turns a Core Hub 403 into 403 FORBIDDEN', () => {
    expect(coreHubFailure(new CoreHubCallError('HTTP 403', 403)).code).toBe(ErrorCode.FORBIDDEN);
  });

  it("passes a 429's Retry-After on with a 503", () => {
    const error = coreHubFailure(new CoreHubCallError('HTTP 429', 429, 45));
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(error.retryAfterSec).toBe(45);
  });

  it.each([
    ['a 5xx', new CoreHubCallError('HTTP 502', 502)],
    ['a timeout', new CoreHubCallError('no answer', 0)],
    ['a malformed answer', new Error('Response must be { success: true, data: [...] }')],
    ['a 429 without Retry-After', new CoreHubCallError('HTTP 429', 429)],
  ])('answers %s with 503 and Retry-After 30', (_label, cause) => {
    const error = coreHubFailure(cause);
    expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(error.retryAfterSec).toBe(30);
  });

  it('uses the wait the caller knows about when it gives one', () => {
    expect(coreHubFailure(new CoreHubCallError('HTTP 429', 429, 45), 60).retryAfterSec).toBe(60);
  });
});
