/**
 * End-to-end suite for Q-Teacher (spec §36, §38, §39).
 *
 * It boots the real NestJS application - global guards, validation pipe,
 * response interceptor and exception filter included - against:
 *   - a fake Core Hub that serves its JWKS document and the people endpoints
 *     (GET /api/v1/people/me and /people/:personCode), and
 *   - an in-memory stand-in for the subsystem database.
 *
 * The subsystem code under test is unchanged: it still downloads JWKS, selects
 * the key by `kid`, verifies RS256 signatures and enforces its own policies.
 */
import { INestApplication } from '@nestjs/common';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { bootApp } from './helpers/boot-app';
import { FakeCoreHub } from './helpers/fake-core-hub';
import { InMemoryPrisma } from './helpers/in-memory-prisma';
import {
  TestSigningKey,
  createAlgNoneToken,
  createSigningKey,
  signCoreHubToken,
  signHs256Token,
  tamperPayload,
} from './helpers/token-factory';

const TEACHER_ID = 'user-lect-1';
const OTHER_TEACHER_ID = 'user-lect-2';
const STUDENT_ID = 'user-6704101312';
const OTHER_STUDENT_ID = 'user-6704101399';
const ADMIN_ID = 'user-admin';

/** People as Core Hub's GET /api/v1/people/* returns them - the subsystem keeps ids and codes only. */
const TEACHER_PERSON = {
  personCode: 'somchai.p',
  personType: 'STAFF',
  staffType: 'LECTURER',
  fullNameTh: 'อาจารย์ ทดสอบ',
  universityEmail: 'somchai.p@example.test',
  status: 'ACTIVE',
  coreUserId: TEACHER_ID,
};
const OTHER_TEACHER_PERSON = { ...TEACHER_PERSON, personCode: 'wipha.v', fullNameTh: 'อาจารย์ อีกท่าน', coreUserId: OTHER_TEACHER_ID };
const STUDENT_PERSON = {
  personCode: '6704101312',
  personType: 'STUDENT',
  fullNameTh: 'นักศึกษา ทดสอบ',
  universityEmail: 'student.test@example.test',
  status: 'ACTIVE',
  coreUserId: STUDENT_ID,
};
const OTHER_STUDENT_PERSON = { ...STUDENT_PERSON, personCode: '6704101399', fullNameTh: 'นักศึกษา อีกคน', coreUserId: OTHER_STUDENT_ID };
/** A student Core Hub knows but who has never signed in: no account yet. */
const STUDENT_WITHOUT_ACCOUNT = { ...STUDENT_PERSON, personCode: '6704100001', coreUserId: null };

/** The Monday of the week that holds the next working day; its slots are always in the future. */
function nextMonday(): string {
  const now = new Date(Date.now() + 7 * 3_600_000);
  const day = now.getUTCDay();
  const ahead = day === 1 ? 7 : (8 - day) % 7 || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ahead)).toISOString().slice(0, 10);
}
const MONDAY = nextMonday();
/** `HH:mm` Bangkok time on the Monday above, as an ISO string. */
const monday = (time: string): string => `${MONDAY}T${time}:00+07:00`;

describe('Q-Teacher (e2e)', () => {
  let app: INestApplication;
  let coreHub: FakeCoreHub;
  let db: InMemoryPrisma;
  let key: TestSigningKey;
  let rotatedKey: TestSigningKey;

  let studentToken: string;
  let otherStudentToken: string;
  let teacherToken: string;
  let otherTeacherToken: string;
  let adminToken: string;

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    key = await createSigningKey('core-hub-2026');
    rotatedKey = await createSigningKey('core-hub-2027');

    coreHub = new FakeCoreHub();
    await coreHub.start([key]);
    coreHub.setPeople({
      [TEACHER_ID]: TEACHER_PERSON,
      [OTHER_TEACHER_ID]: OTHER_TEACHER_PERSON,
      [STUDENT_ID]: STUDENT_PERSON,
      [OTHER_STUDENT_ID]: OTHER_STUDENT_PERSON,
      'user-no-account': STUDENT_WITHOUT_ACCOUNT,
    });

    // The fake Core Hub gets a random port, so these are set here - the
    // configuration factory reads them when the testing module is compiled.
    process.env.CORE_HUB_URL = coreHub.url;
    process.env.CORE_HUB_JWKS_URL = coreHub.jwksUrl;

    db = new InMemoryPrisma();
    app = await bootApp(db);

    studentToken = await signCoreHubToken(key, { sub: STUDENT_ID, email: 'student@core.local', role: 'student' });
    otherStudentToken = await signCoreHubToken(key, { sub: OTHER_STUDENT_ID, email: 'other@core.local', role: 'student' });
    teacherToken = await signCoreHubToken(key, { sub: TEACHER_ID, email: 'lecturer@core.local', role: 'lecturer' });
    otherTeacherToken = await signCoreHubToken(key, { sub: OTHER_TEACHER_ID, email: 'lecturer2@core.local', role: 'lecturer' });
    adminToken = await signCoreHubToken(key, { sub: ADMIN_ID, email: 'admin@core.local', role: 'admin' });
  });

  beforeEach(() => {
    db.reset();
    // Every test starts with Core Hub up.
    coreHub.peopleFailure = null;
  });

  afterAll(async () => {
    await app?.close();
    await coreHub?.stop();
  });

  // ---------------------------------------------------------------- health --
  describe('GET /api/health (spec §21)', () => {
    it('is public and reports the service name', async () => {
      const response = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { status: 'ok', service: 'csmju-q-teacher' },
      });
    });
  });

  // ------------------------------------------------------- authentication --
  describe('Authentication (spec §36, §39)', () => {
    it('rejects a request with no token (401)', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a non-Bearer Authorization scheme (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set({ Authorization: 'Basic dXNlcjpwYXNz' })
        .expect(401);
    });

    it('rejects a malformed token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer('not-a-jwt')).expect(401);
    });

    it('rejects an expired token (401)', async () => {
      const expired = await signCoreHubToken(key, {
        role: 'staff',
        expiresInSec: -60,
        issuedAtOffsetSec: -600,
      });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(expired)).expect(401);
    });

    it('rejects a token signed by an attacker key (401)', async () => {
      const attackerKey = await createSigningKey('core-hub-2026');
      const forged = await signCoreHubToken(attackerKey, { role: 'admin' });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(forged)).expect(401);
    });

    it('rejects a token whose role claim was modified after signing (401)', async () => {
      const escalated = tamperPayload(studentToken, { role: 'admin' });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(escalated)).expect(401);
    });

    it('rejects a wrong issuer (401)', async () => {
      const token = await signCoreHubToken(key, { issuer: 'evil-hub' });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('rejects a wrong audience (401)', async () => {
      const token = await signCoreHubToken(key, { audience: 'other-platform' });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('rejects an HS256 token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set(bearer(await signHs256Token()))
        .expect(401);
    });

    it('rejects an unsigned alg=none token (401)', async () => {
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(createAlgNoneToken())).expect(401);
    });

    it('rejects an unknown kid (401)', async () => {
      const unknown = await createSigningKey('core-hub-1999');
      const token = await signCoreHubToken(unknown);
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('returns 403 for a Core Hub role this subsystem does not map', async () => {
      const token = await signCoreHubToken(key, { role: 'finance-officer' });
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set(bearer(token))
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects a token that lives longer than an access token - e.g. a refresh token (401)', async () => {
      const token = await signCoreHubToken(key, { expiresInSec: 7 * 24 * 60 * 60 });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('rejects a token without iat, whose lifetime cannot be checked (401)', async () => {
      const token = await signCoreHubToken(key, { omitIat: true });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('rejects a token Core Hub issued for another subsystem (401)', async () => {
      const token = await signCoreHubToken(key, { azp: 'csmju-equipment' });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(401);
    });

    it('accepts a token issued for this subsystem, and one with claims beyond the contract', async () => {
      const token = await signCoreHubToken(key, {
        azp: 'csmju-q-teacher',
        extraClaims: { faculty: 'SCI' },
      });
      await request(app.getHttpServer()).get('/api/v1/me').set(bearer(token)).expect(200);
    });

    it('never leaks a token or Authorization header in an error response', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set(bearer(studentToken.slice(0, -3)))
        .expect(401);

      expect(JSON.stringify(response.body)).not.toContain(studentToken.slice(0, 20));
    });
  });


  // ------------------------------------------------------------------ /me --
  describe('GET /api/v1/me (spec §22)', () => {
    it('returns the verified Core Hub identity plus the mapped subsystem role', async () => {
      const response = await api().get('/api/v1/me').set(bearer(teacherToken)).expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: TEACHER_ID,
          email: 'lecturer@core.local',
          coreRole: 'lecturer',
          subsystemRole: 'TEACHER',
          // The token's exp, so a frontend can renew ahead of it.
          session: {
            expiresAt: new Date((decodeJwt(teacherToken).exp as number) * 1000).toISOString(),
          },
        },
      });
    });

    it.each([
      ['student', 'STUDENT'],
      ['lecturer', 'TEACHER'],
      ['admin', 'ADMIN'],
    ])('maps core role %s to subsystem role %s', async (coreRole, subsystemRole) => {
      const token = await signCoreHubToken(key, { role: coreRole, sub: 'user-map' });
      const response = await api().get('/api/v1/me').set(bearer(token)).expect(200);

      expect(response.body.data.subsystemRole).toBe(subsystemRole);
    });

    it.each(['staff', 'alumni', 'guest'])(
      'answers 403 for the core role %s: it is not in the role mapping',
      async (coreRole) => {
        const token = await signCoreHubToken(key, { role: coreRole, sub: 'user-map' });
        const response = await api().get('/api/v1/me').set(bearer(token)).expect(403);

        expect(response.body.error.code).toBe('FORBIDDEN');
      },
    );
  });

  // ---------------------------------------------------------- office hours --
  describe('Office hours', () => {
    const hours = { dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' };
    const addHours = (token: string, body: Record<string, unknown> = hours) =>
      api().post('/api/v1/office-hours').set(bearer(token)).send(body);

    it('lets a TEACHER add their own office hours (201) and keeps only Core Hub ids', async () => {
      const response = await addHours(teacherToken).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        teacherCoreUserId: TEACHER_ID,
        teacherPersonCode: 'somchai.p',
        dayOfWeek: 'MON',
        startTime: '09:00',
        endTime: '11:00',
        slotMinutes: 30,
        isAvailable: true,
      });
      // Personal data is asked from Core Hub with the teacher's own token, every time.
      expect(coreHub.lastPeopleAuthorization).toBe(`Bearer ${teacherToken}`);
      expect(JSON.stringify(db.officeHour.rows)).not.toContain('อาจารย์ ทดสอบ');
      expect(JSON.stringify(db.officeHour.rows)).not.toContain('somchai.p@example.test');
    });

    it('answers 403 when a STUDENT tries to add office hours', async () => {
      const response = await addHours(studentToken).expect(403);

      expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(db.officeHour.rows).toHaveLength(0);
    });

    it('answers 400 VALIDATION_ERROR with readable details for a bad body', async () => {
      const response = await addHours(teacherToken, { dayOfWeek: 'SUN', startTime: '9am', endTime: '11:00' }).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.stringContaining('dayOfWeek'), expect.stringContaining('startTime')]),
      );
    });

    it('rejects an identity smuggled in the body (400)', async () => {
      await addHours(teacherToken, { ...hours, teacherCoreUserId: OTHER_TEACHER_ID }).expect(400);
      expect(db.officeHour.rows).toHaveLength(0);
    });

    it('answers 409 CONFLICT when it overlaps hours the teacher already has that day', async () => {
      await addHours(teacherToken).expect(201);

      const response = await addHours(teacherToken, { ...hours, startTime: '10:00', endTime: '12:00' }).expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('lists with meta, empty as data: [] - and a student may look at a named teacher', async () => {
      const empty = await api().get('/api/v1/office-hours').set(bearer(teacherToken)).expect(200);
      expect(empty.body).toEqual({ success: true, data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });

      await addHours(teacherToken).expect(201);
      const response = await api()
        .get('/api/v1/office-hours')
        .query({ teacherCoreUserId: TEACHER_ID })
        .set(bearer(studentToken))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('answers 400 for a limit over 100', async () => {
      const response = await api().get('/api/v1/office-hours').query({ limit: 101 }).set(bearer(teacherToken)).expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('lets the owner change and delete, answers 403 to another teacher and 200 { id, deleted: true }', async () => {
      const created = await addHours(teacherToken).expect(201);
      const id = created.body.data.id;

      const changed = await api().patch(`/api/v1/office-hours/${id}`).set(bearer(teacherToken)).send({ endTime: '12:00' }).expect(200);
      expect(changed.body.data.endTime).toBe('12:00');

      await api().patch(`/api/v1/office-hours/${id}`).set(bearer(otherTeacherToken)).send({ endTime: '10:00' }).expect(403);
      await api().delete(`/api/v1/office-hours/${id}`).set(bearer(otherTeacherToken)).expect(403);
      await api().patch(`/api/v1/office-hours/${id}`).set(bearer(studentToken)).send({ endTime: '10:00' }).expect(403);

      const deleted = await api().delete(`/api/v1/office-hours/${id}`).set(bearer(teacherToken)).expect(200);
      expect(deleted.body).toEqual({ success: true, data: { id, deleted: true } });
    });

    it('answers 404 for an id that does not exist and 400 for one that is not a UUID', async () => {
      await api().delete('/api/v1/office-hours/3f6f0f1e-6a5b-4c1c-9b53-1f0d7a8a1b11').set(bearer(teacherToken)).expect(404);
      await api().delete('/api/v1/office-hours/not-a-uuid').set(bearer(teacherToken)).expect(400);
    });
  });

  // ---------------------------------------------------------------- bookings --
  describe('Bookings', () => {
    const bookStudent = (token: string, over: Record<string, unknown> = {}) =>
      api()
        .post('/api/v1/bookings')
        .set(bearer(token))
        .send({ studentPersonCode: '6704101312', startsAt: monday('09:30'), endsAt: monday('10:00'), topic: 'ปรึกษาโครงงาน', ...over });

    it('lets a TEACHER put a student into their own queue (201), the student found with the teacher token', async () => {
      const response = await bookStudent(teacherToken).expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        teacherCoreUserId: TEACHER_ID,
        teacherPersonCode: 'somchai.p',
        studentCoreUserId: STUDENT_ID,
        studentPersonCode: '6704101312',
        status: 'CONFIRMED',
        topic: 'ปรึกษาโครงงาน',
        unreadCount: 0,
      });
      expect(response.body.data.startsAt).toBe(new Date(monday('09:30')).toISOString());
      expect(coreHub.personLookups).toBe(1);
      expect(coreHub.lastPeopleAuthorization).toBe(`Bearer ${teacherToken}`);
    });

    it('keeps no name or email of either person in the database', async () => {
      await bookStudent(teacherToken).expect(201);

      const stored = JSON.stringify(db.booking.rows);
      expect(stored).not.toContain('นักศึกษา ทดสอบ');
      expect(stored).not.toContain('student.test@example.test');
      expect(stored).not.toContain('อาจารย์ ทดสอบ');
    });

    it('answers 403 when a STUDENT tries to create a booking: only the teacher does', async () => {
      await bookStudent(studentToken).expect(403);
      expect(db.booking.rows).toHaveLength(0);
    });

    it('rejects an identity smuggled in the body (400)', async () => {
      await bookStudent(teacherToken, { studentCoreUserId: STUDENT_ID, teacherCoreUserId: OTHER_TEACHER_ID }).expect(400);
    });

    it('answers 400 for a code Core Hub does not know and for a code that is not a student', async () => {
      await bookStudent(teacherToken, { studentPersonCode: '0000000000' }).expect(400);
      await bookStudent(teacherToken, { studentPersonCode: 'wipha.v' }).expect(400);
    });

    it('answers 409 for a student who has never signed in (no account yet)', async () => {
      const response = await bookStudent(teacherToken, { studentPersonCode: '6704100001' }).expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('answers 409 when the teacher already has an appointment then, but allows the next free time', async () => {
      await bookStudent(teacherToken).expect(201);

      const clash = await bookStudent(teacherToken, { studentPersonCode: '6704101399', startsAt: monday('09:45'), endsAt: monday('10:15') }).expect(409);
      expect(clash.body.error.code).toBe('CONFLICT');

      await bookStudent(teacherToken, { studentPersonCode: '6704101399', startsAt: monday('10:00'), endsAt: monday('10:30') }).expect(201);
    });

    it('answers 409 when the student is already booked with another teacher then', async () => {
      await bookStudent(teacherToken).expect(201);

      await bookStudent(otherTeacherToken).expect(409);
    });

    it('answers 400 for a booking in the past, over 4 hours, or ending before it starts', async () => {
      await bookStudent(teacherToken, { startsAt: '2020-01-06T09:00:00+07:00', endsAt: '2020-01-06T09:30:00+07:00' }).expect(400);
      await bookStudent(teacherToken, { startsAt: monday('08:00'), endsAt: monday('13:00') }).expect(400);
      await bookStudent(teacherToken, { startsAt: monday('10:00'), endsAt: monday('09:00') }).expect(400);
    });

    it('does not book, and answers 503 + Retry-After, while Core Hub cannot be asked', async () => {
      coreHub.peopleFailure = { status: 503 };

      const response = await bookStudent(teacherToken).expect(503);

      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.headers['retry-after']).toBe('30');
      expect(db.booking.rows).toHaveLength(0);
    });

    it('does not book, and answers 401, when Core Hub has ended the session', async () => {
      coreHub.peopleFailure = { status: 401 };

      const response = await bookStudent(teacherToken).expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(db.booking.rows).toHaveLength(0);
    });

    describe('reading', () => {
      let id: string;

      beforeEach(async () => {
        id = (await bookStudent(teacherToken).expect(201)).body.data.id;
        await bookStudent(otherTeacherToken, { studentPersonCode: '6704101399' }).expect(201);
      });

      it('shows a teacher the bookings they run, a student their own, an admin everything', async () => {
        const teacherList = await api().get('/api/v1/bookings').set(bearer(teacherToken)).expect(200);
        expect(teacherList.body.data.map((b: { id: string }) => b.id)).toEqual([id]);
        expect(teacherList.body.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });

        const studentList = await api().get('/api/v1/bookings').set(bearer(studentToken)).expect(200);
        expect(studentList.body.data).toHaveLength(1);
        expect(studentList.body.data[0].studentCoreUserId).toBe(STUDENT_ID);

        const adminList = await api().get('/api/v1/bookings').set(bearer(adminToken)).expect(200);
        expect(adminList.body.data).toHaveLength(2);
      });

      it('filters by status and sorts on the server', async () => {
        const none = await api().get('/api/v1/bookings').query({ status: 'CANCELLED' }).set(bearer(teacherToken)).expect(200);
        expect(none.body.data).toEqual([]);

        await api().get('/api/v1/bookings').query({ sort: 'name' }).set(bearer(teacherToken)).expect(400);
        await api().get('/api/v1/bookings').query({ sort: '-createdAt' }).set(bearer(teacherToken)).expect(200);
      });

      it('gives the teacher the student name from Core Hub, and the student none', async () => {
        const asTeacher = await api().get(`/api/v1/bookings/${id}`).set(bearer(teacherToken)).expect(200);
        expect(asTeacher.body.data.studentFullNameTh).toBe('นักศึกษา ทดสอบ');

        const asStudent = await api().get(`/api/v1/bookings/${id}`).set(bearer(studentToken)).expect(200);
        expect(asStudent.body.data.studentFullNameTh).toBeNull();
      });

      it("answers 403 FORBIDDEN, not 404, when someone opens another person's booking", async () => {
        const response = await api().get(`/api/v1/bookings/${id}`).set(bearer(otherStudentToken)).expect(403);
        expect(response.body.error.code).toBe('FORBIDDEN');

        await api().get(`/api/v1/bookings/${id}`).set(bearer(otherTeacherToken)).expect(403);
      });

      it('answers 404 for an id that does not exist and 400 for one that is not a UUID', async () => {
        await api().get('/api/v1/bookings/3f6f0f1e-6a5b-4c1c-9b53-1f0d7a8a1b11').set(bearer(teacherToken)).expect(404);
        await api().get('/api/v1/bookings/not-a-uuid').set(bearer(teacherToken)).expect(400);
      });
    });

    describe('cancel and complete', () => {
      let id: string;

      beforeEach(async () => {
        id = (await bookStudent(teacherToken).expect(201)).body.data.id;
      });

      it('lets the teacher cancel, which frees the time for another student', async () => {
        const response = await api().patch(`/api/v1/bookings/${id}/cancel`).set(bearer(teacherToken)).expect(200);
        expect(response.body.data.status).toBe('CANCELLED');

        await bookStudent(teacherToken, { studentPersonCode: '6704101399' }).expect(201);
      });

      it('lets the teacher complete it', async () => {
        const response = await api().patch(`/api/v1/bookings/${id}/complete`).set(bearer(teacherToken)).expect(200);

        expect(response.body.data.status).toBe('COMPLETED');
      });

      it('answers 409 when it is closed a second time', async () => {
        await api().patch(`/api/v1/bookings/${id}/cancel`).set(bearer(teacherToken)).expect(200);

        const response = await api().patch(`/api/v1/bookings/${id}/complete`).set(bearer(teacherToken)).expect(409);
        expect(response.body.error.code).toBe('CONFLICT');
      });

      it('answers 403 to the student of the booking and to another teacher', async () => {
        await api().patch(`/api/v1/bookings/${id}/cancel`).set(bearer(studentToken)).expect(403);
        await api().patch(`/api/v1/bookings/${id}/cancel`).set(bearer(otherTeacherToken)).expect(403);
      });

      it("lets an ADMIN close anyone's booking", async () => {
        await api().patch(`/api/v1/bookings/${id}/cancel`).set(bearer(adminToken)).expect(200);
      });
    });
  });

  // ------------------------------------------------- exceptions and schedule --
  describe('Exceptions and the weekly schedule', () => {
    const addHours = () =>
      api().post('/api/v1/office-hours').set(bearer(teacherToken)).send({ dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' }).expect(201);
    const slots = (token: string, query: Record<string, unknown> = {}) =>
      api()
        .get('/api/v1/schedule-slots')
        .query({ teacherCoreUserId: TEACHER_ID, weekStart: MONDAY, limit: 100, ...query })
        .set(bearer(token));
    const exception = (token: string, status: string, from: string, to: string) =>
      api().post('/api/v1/booking-exceptions').set(bearer(token)).send({ startsAt: monday(from), endsAt: monday(to), status, reason: 'ทดสอบ' });

    it('cuts the office hours into slots that any role may look at', async () => {
      await addHours();

      const response = await slots(studentToken).expect(200);

      expect(response.body.data).toHaveLength(4);
      expect(response.body.data.every((slot: { status: string }) => slot.status === 'AVAILABLE')).toBe(true);
      expect(response.body.meta).toEqual({ total: 4, page: 1, limit: 100, totalPages: 1 });
    });

    it('tells a student only that a slot is taken, and whether it is theirs; the teacher sees who', async () => {
      await addHours();
      await api()
        .post('/api/v1/bookings')
        .set(bearer(teacherToken))
        .send({ studentPersonCode: '6704101312', startsAt: monday('09:30'), endsAt: monday('10:00'), topic: 'ปรึกษา' })
        .expect(201);

      const mine = (await slots(studentToken).expect(200)).body.data[1];
      expect(mine).toMatchObject({ status: 'BOOKED', bookedByMe: true, booking: null });

      const others = (await slots(otherStudentToken).expect(200)).body.data[1];
      expect(others).toMatchObject({ status: 'BOOKED', bookedByMe: false, booking: null });

      const asTeacher = (await slots(teacherToken).expect(200)).body.data[1];
      expect(asTeacher.booking).toMatchObject({ studentPersonCode: '6704101312', topic: 'ปรึกษา', status: 'CONFIRMED' });
    });

    it('opens a busy time with an AVAILABLE exception and closes a free one with UNAVAILABLE, newest wins', async () => {
      await addHours();

      await exception(teacherToken, 'AVAILABLE', '13:00', '14:00').expect(201);
      await exception(teacherToken, 'UNAVAILABLE', '09:00', '10:00').expect(201);
      const afterTwo = (await slots(studentToken).expect(200)).body.data;
      expect(afterTwo.map((slot: { startsAt: string }) => slot.startsAt.slice(11, 16))).toEqual(['03:00', '03:30', '06:00']);

      // "undo": delete the exception that closed 09:00-10:00
      const closing = db.bookingException.rows.find((row) => row.status === 'UNAVAILABLE');
      await api().delete(`/api/v1/booking-exceptions/${closing!.id}`).set(bearer(teacherToken)).expect(200);
      expect((await slots(studentToken).expect(200)).body.data).toHaveLength(5);
    });

    it('answers 403 when a STUDENT tries to open or close a time, and 403 for another teacher deleting', async () => {
      await exception(studentToken, 'AVAILABLE', '13:00', '14:00').expect(403);

      const created = await exception(teacherToken, 'AVAILABLE', '13:00', '14:00').expect(201);
      await api().delete(`/api/v1/booking-exceptions/${created.body.data.id}`).set(bearer(otherTeacherToken)).expect(403);
    });

    it('answers 409 when closing a time that holds a confirmed booking', async () => {
      await addHours();
      await api()
        .post('/api/v1/bookings')
        .set(bearer(teacherToken))
        .send({ studentPersonCode: '6704101312', startsAt: monday('09:30'), endsAt: monday('10:00'), topic: 'ปรึกษา' })
        .expect(201);

      const response = await exception(teacherToken, 'UNAVAILABLE', '09:00', '10:00').expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('answers 400 when a student names no teacher or a week that does not exist', async () => {
      await api().get('/api/v1/schedule-slots').set(bearer(studentToken)).expect(400);
      await slots(studentToken, { weekStart: '2026-13-45' }).expect(400);
      await slots(studentToken, { weekStart: 'next week' }).expect(400);
    });

    it('lists the teachers who have published office hours, by code', async () => {
      await addHours();

      const response = await api().get('/api/v1/teachers').set(bearer(studentToken)).expect(200);

      expect(response.body.data).toEqual([{ coreUserId: TEACHER_ID, personCode: 'somchai.p' }]);
      expect(response.body.meta.total).toBe(1);
    });
  });

  // ------------------------------------------------------------------- chat --
  describe('Chat between the teacher and the student of a booking', () => {
    let bookingId: string;
    const say = (token: string, message: string, id = bookingId) =>
      api().post('/api/v1/chat-messages').set(bearer(token)).send({ bookingId: id, message });

    beforeEach(async () => {
      bookingId = (
        await api()
          .post('/api/v1/bookings')
          .set(bearer(teacherToken))
          .send({ studentPersonCode: '6704101312', startsAt: monday('09:30'), endsAt: monday('10:00'), topic: 'ปรึกษา' })
          .expect(201)
      ).body.data.id;
    });

    it('lets both people write and read, oldest first, with paging meta', async () => {
      const sent = await say(studentToken, 'ขอเลื่อนนัดได้ไหม').expect(201);
      expect(sent.body.data).toMatchObject({ bookingId, senderCoreUserId: STUDENT_ID, isRead: false });
      await say(teacherToken, 'ได้').expect(201);

      const response = await api().get('/api/v1/chat-messages').query({ bookingId }).set(bearer(studentToken)).expect(200);

      expect(response.body.data.map((m: { message: string }) => m.message)).toEqual(['ขอเลื่อนนัดได้ไหม', 'ได้']);
      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
    });

    it("counts what the other person wrote and you have not read, and 'read' clears it", async () => {
      await say(studentToken, 'สวัสดี').expect(201);
      await say(studentToken, 'ขอเลื่อน').expect(201);

      const before = await api().get('/api/v1/bookings').set(bearer(teacherToken)).expect(200);
      expect(before.body.data[0].unreadCount).toBe(2);
      const ownBefore = await api().get('/api/v1/bookings').set(bearer(studentToken)).expect(200);
      expect(ownBefore.body.data[0].unreadCount).toBe(0);

      const messages = await api().get('/api/v1/chat-messages').query({ bookingId }).set(bearer(teacherToken)).expect(200);
      for (const message of messages.body.data) {
        const read = await api().patch(`/api/v1/chat-messages/${message.id}/read`).set(bearer(teacherToken)).expect(200);
        expect(read.body.data.isRead).toBe(true);
      }

      const after = await api().get('/api/v1/bookings').set(bearer(teacherToken)).expect(200);
      expect(after.body.data[0].unreadCount).toBe(0);
    });

    it('answers 403 to someone who is not in the booking - even an admin', async () => {
      await say(studentToken, 'ลับ').expect(201);

      await say(otherStudentToken, 'x').expect(403);
      await api().get('/api/v1/chat-messages').query({ bookingId }).set(bearer(otherStudentToken)).expect(403);
      await api().get('/api/v1/chat-messages').query({ bookingId }).set(bearer(adminToken)).expect(403);
      await api().get('/api/v1/chat-messages').query({ bookingId }).set(bearer(otherTeacherToken)).expect(403);
    });

    it('answers 400 for an empty message or a booking id that is not a UUID, and 404 for a booking that does not exist', async () => {
      await say(studentToken, '').expect(400);
      await say(studentToken, 'x', 'not-a-uuid').expect(400);
      await say(studentToken, 'x', '3f6f0f1e-6a5b-4c1c-9b53-1f0d7a8a1b11').expect(404);
      await api().get('/api/v1/chat-messages').set(bearer(studentToken)).expect(400);
    });

    it('rejects a sender smuggled in the body (400)', async () => {
      await api()
        .post('/api/v1/chat-messages')
        .set(bearer(studentToken))
        .send({ bookingId, message: 'x', senderCoreUserId: TEACHER_ID })
        .expect(400);
    });
  });

  // ------------------------------------------------------------- unknown route --
  describe('Unknown routes', () => {
    it('answers 404 NOT_FOUND in the standard envelope', async () => {
      const response = await api().get('/api/v1/rooms').set(bearer(teacherToken)).expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  // ------------------------------------------------------------- rotation --
  describe('Core Hub key rotation (spec §40)', () => {
    it('accepts a token signed with a newly rotated key after refreshing JWKS', async () => {
      coreHub.rotate([key, rotatedKey]);

      const rotatedToken = await signCoreHubToken(rotatedKey, {
        role: 'lecturer',
        sub: TEACHER_ID,
        email: 'lecturer@core.local',
      });

      const response = await api().get('/api/v1/me').set(bearer(rotatedToken)).expect(200);

      expect(response.body.data.subsystemRole).toBe('TEACHER');
    });
  });

  // ------------------------------------------------------------- scenario --
  describe('End-to-end scenario (spec §38)', () => {
    it('token -> JWKS -> verification -> role mapping -> a teacher runs a queue, the student follows it', async () => {
      const me = await api().get('/api/v1/me').set(bearer(teacherToken)).expect(200);
      expect(me.body.data).toMatchObject({ id: TEACHER_ID, coreRole: 'lecturer', subsystemRole: 'TEACHER' });

      await api()
        .post('/api/v1/office-hours')
        .set(bearer(teacherToken))
        .send({ dayOfWeek: 'MON', startTime: '09:00', endTime: '11:00' })
        .expect(201);
      const booking = await api()
        .post('/api/v1/bookings')
        .set(bearer(teacherToken))
        .send({ studentPersonCode: '6704101312', startsAt: monday('09:00'), endsAt: monday('09:30'), topic: 'ปรึกษา' })
        .expect(201);

      const mine = await api().get('/api/v1/bookings').set(bearer(studentToken)).expect(200);
      expect(mine.body.data.map((b: { id: string }) => b.id)).toEqual([booking.body.data.id]);

      // Core Hub was asked for its public keys, and for people with the caller's own token.
      expect(coreHub.requestCount).toBeGreaterThan(0);
      expect(coreHub.lastPeopleAuthorization).toBe(`Bearer ${teacherToken}`);
    });
  });
});
