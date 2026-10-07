/** Subsystem-local roles. Deliberately NOT identical to Core Hub role names. */
export enum SubsystemRole {
  /** นักศึกษา: ดูตารางของอาจารย์ ดูคิวของตัวเอง และคุยในคิวของตัวเอง */
  STUDENT = 'STUDENT',
  /** อาจารย์: จัดเวลาว่างของตัวเอง สร้างและปิดคิว คุยในคิวของตัวเอง */
  TEACHER = 'TEACHER',
  ADMIN = 'ADMIN',
}

/**
 * Identity attached to a request. Every field originates from a
 * cryptographically verified Core Hub JWT claim - never from a header or body.
 */
export interface CoreHubIdentity {
  /** Core Hub user id (`sub`). */
  id: string;
  /** Core Hub email (`email`). */
  email: string;
  /** Core Hub central role (`role`). */
  coreRole: string;
  /** Core Hub session id (`sid`). */
  sessionId?: string;
  /** Result of the subsystem's own role mapping. */
  subsystemRole: SubsystemRole;
  /** When the verified token - and with it this session - expires (`exp`, epoch seconds). */
  exp?: number;
}

export interface CoreHubTokenPayload {
  sub: string;
  email?: string;
  role?: string;
  sid?: string;
  iss: string;
  aud: string | string[];
  iat?: number;
  exp?: number;
  /** Authorized party: the registered subsystem the token was issued for (when Core Hub sets it). */
  azp?: string;
}
