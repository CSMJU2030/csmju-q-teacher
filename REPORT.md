# REPORT — csmju-q-teacher

วันที่: 2569-10-07 · standards v1.8.4 · branch `feature/q-teacher/bump-standards-v1-8-4`

## ผลรัน

```
$ ./standards/scripts/run-all-checks.sh .
  ✅ PASS  Convention Check            check-branch-name.sh
  ✅ PASS  Convention Check            check-commit-messages.sh
  ✅ PASS  Convention Check            check-ci-untouched.sh
  ✅ PASS  Standards Version Check     check-submodule-pointer.sh
  ✅ PASS  Security & Stack Scan       check-no-secrets.sh · check-no-local-storage.sh · check-no-jwt-verify.sh
  ✅ PASS  Security & Stack Scan       check-db-isolation.sh · check-authorized-deps.sh · check-backend-nestjs.sh · check-deploy-ready.sh
  ✅ PASS  API Contract Sync           check-openapi-sync.sh · check-api-conventions.sh
  ✅ PASS  Data Dictionary Compliance  check-field-aliases.sh · check-snake-case.sh · check-no-hardcoded-faculty.sh · check-money-fields.sh
  ✅ PASS  UI Token Compliance         check-ui-tokens.sh
  ✅ PASS  Code Quality                check-qa.sh
  ✅ PASS  Exception Validation        check-exceptions.sh
✅ All 20 checks passed.

$ pnpm -r typecheck && pnpm -r lint   → ผ่าน (exit 0)
$ pnpm test                           → 17 suites · 261 tests ผ่าน
$ pnpm test:e2e                       → 2 suites · 126 tests ผ่าน
$ node standards/conformance/run.js   → ยังไม่ได้รัน (ดูหัวข้อสุดท้าย)
```

ตรวจเพิ่มด้วยมือ: เปิด backend (Core Hub จำลอง + DB ในหน่วยความจำ) คู่กับ frontend ที่ build แล้ว เรียกทุกหน้าด้วย token ของ lecturer / student / admin
ทุกหน้าตอบ 200 ตามสิทธิ์ (นักศึกษาเปิด `/office-hours` ได้หน้า "ไม่มีสิทธิ์" · อาจารย์เปิด `/teachers` ได้หน้า "ไม่มีสิทธิ์") และกดเปิดเวลาที่ไม่ว่างในตารางแล้วขึ้นข้อความสำเร็จ

## ไฟล์ที่สร้าง/แก้ไข

- `.standards-version`, `standards/` — ปักหมุด v1.8.4
- `subsystem.yaml` — manifest (L3, base_url `http://localhost:3224`, probes ของ bookings / booking-exceptions)
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — pnpm 12.3.4 workspace (frontend + backend)
- `docker-compose.yml`, `.dockerignore`, `backend/Dockerfile`, `frontend/Dockerfile`, `backend/docker/entrypoint.sh` — deploy ตาม deployment.md
- `backend/prisma/` — schema 4 ตาราง (`office_hours`, `booking_exceptions`, `bookings`, `chat_messages`), migration `20261007000000_init`, seed
- `backend/src/office-hours/`, `booking-exceptions/`, `schedule/`, `bookings/`, `chat-messages/`, `teachers/` — โดเมนของระบบ (ตารางคำนวณฝั่ง server เวลา Asia/Bangkok)
- `backend/src/common/uuid.pipe.ts`, `common/swagger/api-envelope.ts` — UUID v4 pipe และ schema ของ envelope สำหรับ openapi
- `backend/scripts/generate-openapi.ts`, `backend/openapi.json` — สัญญา API (API-01)
- `backend/test/` — e2e (Core Hub จำลองให้ JWKS และ `/people/*`) และ helper
- `frontend/` — Next.js จาก template `csmju-subsystem-web`: ภาพรวม, ตารางนัดหมายรายสัปดาห์, อาจารย์, นัดหมาย + แชท, เวลาทำการ; `src/lib/api-types.ts` สร้างจาก `openapi.json`
- `README.md` — วิธีติดตั้ง รัน ทดสอบ ตารางสิทธิ์

## ชั้น auth ที่คัดลอกมา

- คัดลอกจาก demo-student-subsystem: `backend/src/auth/**`, `common/**`, `config/**`, `core-hub/**`, `health/**`, `prisma/**`, `app-setup.ts`, `main.ts`, `prisma.config.ts`, Dockerfile/entrypoint, ค่า jest/eslint/tsconfig · ฝั่ง frontend `ReSignIn.tsx`, `lib/sign-in.ts`, หน้า `signin-again`, `next.config.ts` (rewrites)
- แก้ไข (เฉพาะส่วนที่มาตรฐานอนุญาต):
  - `auth/core-hub-identity.ts` — `SubsystemRole` เป็น STUDENT / TEACHER / ADMIN
  - `auth/role-mapping.ts` (+spec) — student→STUDENT, lecturer→TEACHER, admin→ADMIN
  - `auth/permissions.ts` (+spec), `auth/guards/permissions.guard.spec.ts` — permission ของโดเมนนี้
  - `common/dto/pagination.dto.ts` — เพิ่ม `@ApiPropertyOptional` และข้อความไทย เพื่อให้ openapi.json ครบ
  - `core-hub/people.service.ts` (+spec) — เพิ่ม `findByPersonCode()` เรียก `GET /people/:personCode` ด้วย token ของอาจารย์ (ไม่ cache)
  - `ReSignIn.tsx` — เปลี่ยน class เป็นของ `@/csmju` และใส่ `eslint-disable` บรรทัดเดียวสำหรับ `setState` ใน effect (ต้องรู้ค่า sessionStorage หลัง mount)

## Role mapping ที่ประกาศ (ต้องตรงกับ default_role_mapping ในทะเบียน)

| core role | subsystem role |
|---|---|
| student | STUDENT |
| lecturer | TEACHER |
| admin | ADMIN |

## ข้อสมมติที่ตั้งเอง (เพราะมาตรฐานไม่ได้ระบุ)

1. อาจารย์เป็นผู้สร้างนัดหมายเท่านั้น (ตามที่ผู้สั่งงานระบุ) นักศึกษาดูตาราง ดูนัดหมายของตัวเอง และแชท ไม่มีสถานะ "รอยืนยัน" — นัดหมายเริ่มที่ `CONFIRMED` แล้วไป `CANCELLED` หรือ `COMPLETED`
2. นัดหมายระบุนักศึกษาด้วย `personCode` ที่อาจารย์พิมพ์ backend ตรวจกับ Core Hub (`/people/:personCode`) ด้วย token ของอาจารย์ และเก็บแค่ `core_user_id` + `person_code` ไม่เก็บชื่อ — อาจารย์เห็นชื่อ (`studentFullNameTh`) เมื่อ Core Hub ตอบได้ ณ ตอนนั้น ส่วนนักศึกษาเห็นรหัสบุคลากรของอาจารย์ เพราะอ่าน `/people` ของคนอื่นไม่ได้
3. นักศึกษาที่ยังไม่เคยเข้าระบบ (Core Hub ไม่มี account) สร้างนัดหมายให้ไม่ได้ เพราะยังไม่มี `core_user_id`
4. เวลาว่างคำนวณฝั่ง server: เวลาทำการรายสัปดาห์ (จันทร์–ศุกร์) → ข้อยกเว้นรายครั้ง (`UNAVAILABLE` ปิด, `AVAILABLE` เปิดเพิ่ม, อันล่าสุดชนะ) → นัดหมายที่ยังไม่ยกเลิก ช่วงที่ไม่มี slot คือ "ไม่ว่าง"
5. ปิดเวลาที่มีนัดหมาย `CONFIRMED` อยู่ → 409 ต้องยกเลิกนัดหมายก่อน
6. แชทอ่านและส่งได้เฉพาะคู่นัดหมาย ผู้ดูแลระบบก็อ่านไม่ได้ (ข้อมูลส่วนบุคคล) · หน้ารายละเอียดนัดหมายทำเครื่องหมาย "อ่านแล้ว" ให้ข้อความของอีกฝ่ายเมื่อเปิดดู
7. ตารางกริดใช้ความสูงแถวเท่ากับ slot ที่สั้นที่สุดของสัปดาห์ (ขั้นต่ำ 15 นาที) ช่วง 08:00–17:00 ขยายอัตโนมัติถ้ามี slot นอกช่วงนี้
8. ธีมน้ำเงิน–ขาว–ขาวนวลของผู้ใช้เดิมถูกแทนที่ด้วย design system กลาง (สีหลัก `primary-container` / `brand-navy` ซึ่งเป็นโทนฟ้า–น้ำเงินเหมือนกัน) เพราะ UI-01 ห้ามแก้ token และห้าม hex ดิบ
9. ข้อความตรวจความถูกต้องจาก ValidationPipe ที่ชุด `common/` คัดลอกมาส่งเป็น `details: string[]` (ไม่มี `details.field`) หน้าเว็บจึงแสดงเป็นข้อความรวมเหนือฟอร์มแทนข้อความใต้ช่อง
10. ตารางของหน้า "อาจารย์" มี pagination และสถานะว่าง แต่ไม่มีช่องค้นหา เพราะ `GET /api/v1/teachers` ยังไม่รับพารามิเตอร์ค้นหา (และห้ามค้นหาโดยโหลดทั้งหมดมากรองฝั่งเบราว์เซอร์)
11. ข้อมูลเดิมในโฟลเดอร์ `pt/back end` และ `pt/front end` ไม่อยู่ใน repo นี้และไม่ได้ย้ายข้อมูลมา (ระบบเดิมเก็บชื่อและ role เอง ซึ่งขัดกับ standard)

## สิ่งที่ยังทำไม่ได้ / เคสที่ยังไม่ผ่าน

- **conformance L1–L3 ยังไม่ได้รัน** ต้องมีไฟล์บัญชีทดสอบนอก repo (`CONFORMANCE_ACCOUNTS_FILE`) และระบบต้องลงทะเบียนกับ Core Hub จริงให้ admin อนุมัติก่อน
- **ลงทะเบียนในทะเบียน Core Hub** ต้องให้ admin ทำ: name `csmju-q-teacher`, Callback URL `http://localhost:3224/auth/callback`, `default_role_mapping` ตามตารางด้านบน (role อื่นเข้าไม่ได้จนกว่า mapping จะตรง)
- **ยังไม่ได้ทดสอบ `docker compose up`** และการรัน migration กับ PostgreSQL จริงบนเครื่องนี้ (ไม่มี Docker/PostgreSQL) — e2e ใช้ DB ในหน่วยความจำ ส่วน SQL ใน migration เขียนตรงกับ `schema.prisma` แต่ยังไม่เคยถูกรันจริง ควรรัน `pnpm prisma:deploy` กับ DB เปล่าหนึ่งครั้งก่อนใช้งาน
- **ยังไม่ได้ลองเข้าสู่ระบบด้วย Core Hub จริงจากเบราว์เซอร์** (flow `/auth/login` → `/auth/callback`) เพราะต้องมี account และการลงทะเบียนข้างต้น — ทดสอบหน้าเว็บด้วย token จำลองที่ลงลายเซ็นด้วยกุญแจทดสอบแทน
- เทสต์ฝั่งหน้าเว็บ (component/e2e) ยังไม่มี — template ไม่มีชุดทดสอบให้ตรวจเฉพาะ typecheck + lint + build + ใช้งานจริงตามข้างบน
- Modal ของ design system ยังไม่มี focus trap / คืน focus (ตามที่ ui-design-system.md ข้อ 8.3 ระบุไว้ว่าเป็นข้อจำกัดของ `src/csmju` ที่ห้ามแก้) — `ConfirmForm` ใช้ Modal ตัวนั้นตรง ๆ
- ยังไม่มีหน้ารายการ/ลบข้อยกเว้นรายวัน (booking-exceptions) — API รองรับ (`DELETE /api/v1/booking-exceptions/:id`) แต่หน้าเว็บใช้วิธี "เปิดเวลานี้" / "ตั้งเป็นไม่ว่าง" ซึ่งสร้างข้อยกเว้นใหม่ทับของเดิม
