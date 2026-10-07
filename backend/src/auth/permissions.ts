import { SubsystemRole } from './core-hub-identity';

/**
 * Subsystem permissions (spec §16).
 *
 *   Core JWT -> Core Role -> Subsystem Role -> Permission -> Business Operation
 *
 * Business code asks for a permission, never for `role === 'admin'`.
 * `:own` variants are scope hints: the guard lets the request through and the
 * service performs the ownership check against business data.
 *
 * "Own" means the record's `*_core_user_id` equals the token's `sub`
 * (authorization.md 4). For a booking there are two such people - its teacher
 * and its student - and either of them may read it and chat in it.
 */
export enum Permission {
  /** Look at a teacher's weekly schedule and the list of teachers. */
  SCHEDULE_READ = 'schedule:read',

  OFFICE_HOUR_CREATE = 'office-hour:create',
  OFFICE_HOUR_UPDATE_OWN = 'office-hour:update:own',
  OFFICE_HOUR_UPDATE_ANY = 'office-hour:update:any',
  OFFICE_HOUR_DELETE_OWN = 'office-hour:delete:own',
  OFFICE_HOUR_DELETE_ANY = 'office-hour:delete:any',

  BOOKING_EXCEPTION_CREATE = 'booking-exception:create',
  BOOKING_EXCEPTION_DELETE_OWN = 'booking-exception:delete:own',
  BOOKING_EXCEPTION_DELETE_ANY = 'booking-exception:delete:any',

  BOOKING_READ_OWN = 'booking:read:own',
  BOOKING_READ_ANY = 'booking:read:any',
  /** Only the teacher puts a student into the queue. */
  BOOKING_CREATE = 'booking:create',
  /** Cancel or complete a booking. */
  BOOKING_CLOSE_OWN = 'booking:close:own',
  BOOKING_CLOSE_ANY = 'booking:close:any',

  /** The two people of a booking talk to each other; nobody else reads the chat. */
  CHAT_MESSAGE_READ_OWN = 'chat-message:read:own',
  CHAT_MESSAGE_CREATE_OWN = 'chat-message:create:own',
}

/** Students look at schedules and follow and chat in their own bookings. */
const STUDENT_PERMISSIONS: Permission[] = [
  Permission.SCHEDULE_READ,
  Permission.BOOKING_READ_OWN,
  Permission.CHAT_MESSAGE_READ_OWN,
  Permission.CHAT_MESSAGE_CREATE_OWN,
];

/** Teachers run their own schedule and queue. */
const TEACHER_PERMISSIONS: Permission[] = [
  Permission.SCHEDULE_READ,
  Permission.OFFICE_HOUR_CREATE,
  Permission.OFFICE_HOUR_UPDATE_OWN,
  Permission.OFFICE_HOUR_DELETE_OWN,
  Permission.BOOKING_EXCEPTION_CREATE,
  Permission.BOOKING_EXCEPTION_DELETE_OWN,
  Permission.BOOKING_READ_OWN,
  Permission.BOOKING_CREATE,
  Permission.BOOKING_CLOSE_OWN,
  Permission.CHAT_MESSAGE_READ_OWN,
  Permission.CHAT_MESSAGE_CREATE_OWN,
];

const ADMIN_PERMISSIONS: Permission[] = Object.values(Permission);

export const ROLE_PERMISSIONS: Readonly<Record<SubsystemRole, readonly Permission[]>> =
  Object.freeze({
    [SubsystemRole.STUDENT]: Object.freeze(STUDENT_PERMISSIONS),
    [SubsystemRole.TEACHER]: Object.freeze(TEACHER_PERMISSIONS),
    [SubsystemRole.ADMIN]: Object.freeze(ADMIN_PERMISSIONS),
  });

/** Does this subsystem role hold the given permission? */
export function can(role: SubsystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Does this subsystem role hold at least one of the given permissions? */
export function canAny(role: SubsystemRole, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}
