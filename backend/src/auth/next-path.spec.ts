import { SUBSYSTEM_BLOCKED_NEXT, safeNextPath } from './next-path';

const next = (raw: unknown) => safeNextPath(raw, SUBSYSTEM_BLOCKED_NEXT);
const backslash = String.fromCharCode(92);

describe('safeNextPath', () => {
  it.each([
    '/',
    '/bookings',
    '/bookings?status=PENDING&page=2',
    '/rooms/LAB-1#schedule',
    '/rooms/LAB-1?error=%E0%B8%81',
    '/authors',
    '/api/v1/auth-info',
  ])('keeps the in-site path %s', (value) => {
    expect(next(value)).toBe(value);
  });

  it.each([
    ['protocol-relative', '//evil.example.com'],
    ['backslash host', `/${backslash}evil.example.com`],
    ['backslash anywhere', `/a${backslash}b`],
    ['absolute URL', 'https://evil.example.com'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'bookings'],
    ['leading space', ' /bookings'],
    ['the login route', '/auth/login'],
    ['the callback', '/auth/callback'],
    ['the logout route', '/auth/logout'],
    ['the auth prefix itself', '/auth'],
    ['a dot segment into /auth', '/x/../auth/login'],
    ['/auth in capitals', '/AUTH/login'],
    ['/auth percent-encoded', '/%61uth/login'],
    ['a malformed percent-encoding', '/bookings%E0%A4%A'],
    ['a NUL', '/a\u0000b'],
    ['a tab', '/a\tb'],
    ['a DEL', '/a\u007fb'],
    ['an empty string', ''],
    ['513 characters', `/${'a'.repeat(512)}`],
  ])('refuses %s', (_label, value) => {
    expect(next(value)).toBeNull();
  });

  it.each([undefined, null, 42, ['/bookings'], { next: '/bookings' }])(
    'refuses the non-string %p',
    (value) => {
      expect(next(value)).toBeNull();
    },
  );

  it('accepts exactly 512 characters', () => {
    const value = `/${'a'.repeat(511)}`;
    expect(next(value)).toBe(value);
  });

  it('keeps percent-encoding as it is instead of decoding it into a host', () => {
    expect(next('/%2F%2Fevil.example.com')).toBe('/%2F%2Fevil.example.com');
  });
});
