import { SubsystemRole } from './core-hub-identity';

/**
 * Core Hub role -> Subsystem role (spec §14).
 *
 *   Core Hub Role      Subsystem Role
 *   ---------------------------------
 *   student            STUDENT
 *   lecturer           TEACHER
 *   admin              ADMIN
 *
 * alumni / staff / guest are not in the table: they cannot use Q-Teacher
 * (authenticated, but not authorized - 403). This is the same table that is
 * declared as `default_role_mapping` in the Core Hub Subsystem Registry; the
 * two must always match (authorization.md 3).
 *
 * The mapping is explicit and lives only in this subsystem. The Core Hub role
 * vocabulary can change without changing subsystem authorization logic - only
 * this table changes.
 */
export const CORE_ROLE_TO_SUBSYSTEM_ROLE: Readonly<Record<string, SubsystemRole>> = Object.freeze({
  student: SubsystemRole.STUDENT,
  lecturer: SubsystemRole.TEACHER,
  admin: SubsystemRole.ADMIN,
});

/**
 * Returns the subsystem role for a Core Hub role, or `null` when the Core Hub
 * role has no meaning in this subsystem (authenticated, but not authorized).
 */
export function mapCoreRoleToSubsystemRole(coreRole: string | undefined): SubsystemRole | null {
  if (typeof coreRole !== 'string') {
    return null;
  }
  return CORE_ROLE_TO_SUBSYSTEM_ROLE[coreRole.trim().toLowerCase()] ?? null;
}
