import { SubsystemRole } from './core-hub-identity';
import { mapCoreRoleToSubsystemRole } from './role-mapping';

describe('Core role -> subsystem role mapping (spec §14)', () => {
  it.each([
    ['student', SubsystemRole.STUDENT],
    ['lecturer', SubsystemRole.TEACHER],
    ['admin', SubsystemRole.ADMIN],
  ])('maps core role "%s" to %s', (coreRole, expected) => {
    expect(mapCoreRoleToSubsystemRole(coreRole)).toBe(expected);
  });

  it.each(['alumni', 'staff', 'guest'])(
    'does not let the core role "%s" in (authenticated but not authorized)',
    (coreRole) => {
      expect(mapCoreRoleToSubsystemRole(coreRole)).toBeNull();
    },
  );

  it('is case and whitespace tolerant', () => {
    expect(mapCoreRoleToSubsystemRole('  LECTURER ')).toBe(SubsystemRole.TEACHER);
  });

  it('returns null for a Core Hub role this subsystem does not know', () => {
    expect(mapCoreRoleToSubsystemRole('finance-officer')).toBeNull();
  });

  it('returns null when the token carries no role claim', () => {
    expect(mapCoreRoleToSubsystemRole(undefined)).toBeNull();
  });
});
