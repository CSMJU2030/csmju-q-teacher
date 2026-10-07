import { SubsystemRole } from './core-hub-identity';
import { Permission, ROLE_PERMISSIONS, can, canAny } from './permissions';

describe('Subsystem permission model (spec §15, §16)', () => {
  describe('STUDENT', () => {
    const role = SubsystemRole.STUDENT;

    it('can look at schedules and follow and chat in its own bookings', () => {
      expect(can(role, Permission.SCHEDULE_READ)).toBe(true);
      expect(can(role, Permission.BOOKING_READ_OWN)).toBe(true);
      expect(can(role, Permission.CHAT_MESSAGE_READ_OWN)).toBe(true);
      expect(can(role, Permission.CHAT_MESSAGE_CREATE_OWN)).toBe(true);
    });

    it('cannot edit a schedule or put anyone into the queue (the teacher does)', () => {
      expect(can(role, Permission.OFFICE_HOUR_CREATE)).toBe(false);
      expect(can(role, Permission.OFFICE_HOUR_UPDATE_OWN)).toBe(false);
      expect(can(role, Permission.BOOKING_EXCEPTION_CREATE)).toBe(false);
      expect(can(role, Permission.BOOKING_CREATE)).toBe(false);
      expect(can(role, Permission.BOOKING_CLOSE_OWN)).toBe(false);
    });

    it("cannot see other people's bookings", () => {
      expect(can(role, Permission.BOOKING_READ_ANY)).toBe(false);
      expect(can(role, Permission.BOOKING_CLOSE_ANY)).toBe(false);
    });
  });

  describe('TEACHER', () => {
    const role = SubsystemRole.TEACHER;

    it('runs its own schedule and queue', () => {
      expect(can(role, Permission.OFFICE_HOUR_CREATE)).toBe(true);
      expect(can(role, Permission.OFFICE_HOUR_UPDATE_OWN)).toBe(true);
      expect(can(role, Permission.OFFICE_HOUR_DELETE_OWN)).toBe(true);
      expect(can(role, Permission.BOOKING_EXCEPTION_CREATE)).toBe(true);
      expect(can(role, Permission.BOOKING_CREATE)).toBe(true);
      expect(can(role, Permission.BOOKING_CLOSE_OWN)).toBe(true);
    });

    it("cannot touch another teacher's schedule or bookings", () => {
      expect(can(role, Permission.OFFICE_HOUR_UPDATE_ANY)).toBe(false);
      expect(can(role, Permission.OFFICE_HOUR_DELETE_ANY)).toBe(false);
      expect(can(role, Permission.BOOKING_EXCEPTION_DELETE_ANY)).toBe(false);
      expect(can(role, Permission.BOOKING_READ_ANY)).toBe(false);
      expect(can(role, Permission.BOOKING_CLOSE_ANY)).toBe(false);
    });
  });

  describe('ADMIN', () => {
    it('holds every permission', () => {
      for (const permission of Object.values(Permission)) {
        expect(can(SubsystemRole.ADMIN, permission)).toBe(true);
      }
    });
  });

  it('canAny passes when at least one permission matches', () => {
    expect(
      canAny(SubsystemRole.STUDENT, [Permission.BOOKING_READ_ANY, Permission.BOOKING_READ_OWN]),
    ).toBe(true);
    expect(
      canAny(SubsystemRole.STUDENT, [Permission.BOOKING_CREATE, Permission.OFFICE_HOUR_CREATE]),
    ).toBe(false);
  });

  it('defines permissions for every subsystem role', () => {
    for (const role of Object.values(SubsystemRole)) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('names every permission as <resource>:<action>[:own|:any]', () => {
    for (const permission of Object.values(Permission)) {
      expect(permission).toMatch(/^[a-z][a-z-]*:[a-z]+(:own|:any)?$/);
    }
  });
});
