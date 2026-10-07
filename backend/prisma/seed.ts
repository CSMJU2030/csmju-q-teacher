/**
 * Development seed data for Q-Teacher (sample office hours and one booking).
 *
 * IMPORTANT: no Core Hub users, passwords or sessions are seeded here, and the
 * server must never depend on a seed (deployment.md 6.1). The `*CoreUserId`
 * values are EXTERNAL REFERENCES to Core Hub identities (the `sub` claim of a
 * Core Hub access token) and carry no credentials. Like every row they keep no
 * name or email.
 *
 * To see the sample data when you sign in with a real Core Hub account, set the
 * `sub` of that account (GET /api/v1/me shows it) before seeding:
 *
 *   SEED_TEACHER_CORE_USER_ID=<sub of a lecturer>
 *   SEED_STUDENT_CORE_USER_ID=<sub of a student>
 *   SEED_STUDENT_PERSON_CODE=<that student's person code>
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { BookingStatus, DayOfWeek, PrismaClient } from '../generated/prisma/client';

// Prisma 7 driver adapter, bound to the subsystem's own DATABASE_URL.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const TEACHER = process.env.SEED_TEACHER_CORE_USER_ID ?? 'user-lecturer-sample';
const STUDENT = process.env.SEED_STUDENT_CORE_USER_ID ?? 'user-student-sample';
const STUDENT_PERSON_CODE = process.env.SEED_STUDENT_PERSON_CODE ?? null;

/** `days` from today at `hour`:00 Bangkok time (UTC+7). */
function at(days: number, hour: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour - 7, 0, 0, 0);
  return date;
}

async function main(): Promise<void> {
  console.log('[seed] seeding csmju_q_teacher_db ...');

  // Sample data is for a fresh database only - re-running leaves existing rows alone.
  if ((await prisma.officeHour.count()) === 0) {
    const weekly: Array<[DayOfWeek, number, number]> = [
      [DayOfWeek.MON, 9 * 60, 12 * 60],
      [DayOfWeek.WED, 13 * 60, 16 * 60],
      [DayOfWeek.THU, 9 * 60, 11 * 60],
    ];
    await prisma.officeHour.createMany({
      data: weekly.map(([dayOfWeek, startMinute, endMinute]) => ({
        teacherCoreUserId: TEACHER,
        teacherPersonCode: null,
        dayOfWeek,
        startMinute,
        endMinute,
        slotMinutes: 30,
        isAvailable: true,
      })),
    });
  }

  if ((await prisma.booking.count()) === 0) {
    const booking = await prisma.booking.create({
      data: {
        teacherCoreUserId: TEACHER,
        teacherPersonCode: null,
        studentCoreUserId: STUDENT,
        studentPersonCode: STUDENT_PERSON_CODE,
        startsAt: at(2, 10),
        endsAt: new Date(at(2, 10).getTime() + 30 * 60_000),
        topic: 'ปรึกษาแนวทางโครงงานพิเศษ',
        status: BookingStatus.CONFIRMED,
      },
    });
    await prisma.chatMessage.createMany({
      data: [
        { bookingId: booking.id, senderCoreUserId: TEACHER, message: 'เตรียมหัวข้อและแผนงานมาด้วยนะ', isRead: true },
        { bookingId: booking.id, senderCoreUserId: STUDENT, message: 'รับทราบ ขอบคุณครับ', isRead: false },
      ],
    });
  }

  console.log(
    `[seed] done: ${await prisma.officeHour.count()} office hours, ${await prisma.booking.count()} bookings`,
  );
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
