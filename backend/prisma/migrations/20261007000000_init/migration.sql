-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "office_hours" (
    "id" TEXT NOT NULL,
    "teacher_core_user_id" TEXT NOT NULL,
    "teacher_person_code" TEXT,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "slot_minutes" INTEGER NOT NULL DEFAULT 30,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_exceptions" (
    "id" TEXT NOT NULL,
    "teacher_core_user_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "ExceptionStatus" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "teacher_core_user_id" TEXT NOT NULL,
    "teacher_person_code" TEXT,
    "student_core_user_id" TEXT NOT NULL,
    "student_person_code" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "closed_by_core_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "sender_core_user_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "office_hours_teacher_core_user_id_day_of_week_idx" ON "office_hours"("teacher_core_user_id", "day_of_week");

-- CreateIndex
CREATE INDEX "booking_exceptions_teacher_core_user_id_starts_at_idx" ON "booking_exceptions"("teacher_core_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_teacher_core_user_id_starts_at_idx" ON "bookings"("teacher_core_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_student_core_user_id_idx" ON "bookings"("student_core_user_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "chat_messages_booking_id_created_at_idx" ON "chat_messages"("booking_id", "created_at");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
