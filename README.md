# csmju-q-teacher

Q-Teacher — ระบบนัดหมายเข้าพบอาจารย์ (office hours) ของโครงการ CSMJU2030

- อาจารย์เปิดเวลาทำการประจำสัปดาห์ ปรับเวลาเฉพาะวัน (เปิดเวลาที่ไม่ว่าง / ตั้งเวลาว่างเป็นไม่ว่าง) และเป็นผู้สร้างนัดหมายให้นักศึกษา
- นักศึกษาดูตารางว่างของอาจารย์ (ดูอย่างเดียว) ดูนัดหมายของตัวเอง และส่งข้อความกับอาจารย์ของนัดหมายนั้น
- เข้าสู่ระบบผ่าน Core Hub SSO เท่านั้น ระบบนี้ไม่มีหน้าเข้าสู่ระบบและไม่เก็บชื่อหรืออีเมลของใคร (เก็บเฉพาะ `core_user_id` กับ `person_code`)

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards)
สร้างจาก standards v1.0.0 · ปักหมุดอยู่ที่ **v1.8.4** (ดู `.standards-version`)

## โครงสร้าง

| โฟลเดอร์ | คืออะไร |
|---|---|
| `backend/` | NestJS 11 + Prisma 7 (PostgreSQL ของระบบนี้เอง) · `openapi.json` สร้างจากโค้ด |
| `frontend/` | Next.js 16 (App Router) + Tailwind v4 + `@/csmju` design system · เป็นประตูเดียวของระบบ proxy `/api/*` และ `/auth/*` ไป backend |
| `standards/` | submodule มาตรฐานกลาง (ห้ามแก้) |
| `subsystem.yaml` | manifest ที่ CI และ conformance อ่าน |

## เชื่อม Core Hub

- Core Hub: `https://csmju2030.jowave.com`
- frontend (ประตูเดียวของระบบ): `http://localhost:3224` · backend: `http://localhost:4224`
- Callback URL ที่ต้องลงทะเบียนในทะเบียนระบบย่อย: `http://localhost:3224/auth/callback` (Base URL เว้นว่าง)
- ขั้นตอนทั้งหมด: `standards/docs/connect-core-hub.md`

ข้อมูลที่ต้องกรอกตอนลงทะเบียน (admin เป็นผู้อนุมัติ):

| ช่อง | ค่า |
|---|---|
| name | `csmju-q-teacher` |
| Callback URL | `http://localhost:3224/auth/callback` |
| Base URL | (เว้นว่าง) |
| default_role_mapping | `student` → `STUDENT` · `lecturer` → `TEACHER` · `admin` → `ADMIN` |

role อื่นของ Core Hub (`staff`, `alumni`, `guest`) ไม่มี mapping ในระบบนี้ จึงเข้าใช้งานไม่ได้ (403)

## เริ่มทำงาน

ต้องมี Node.js 22+, pnpm 12.3.4 (`corepack enable`) และ PostgreSQL (หรือ Docker)

```bash
git submodule update --init standards/
pnpm install
git checkout -b feature/q-teacher/<เรื่องที่ทำ>
```

ห้ามใส่ `--remote` กับ `git submodule update` — จะเลื่อน `standards/` ไปที่ `main` ไม่ตรงกับ `.standards-version` แล้ว CI ตก `GH-04`
การเลื่อนเวอร์ชันทำเป็น PR แยกตาม `standards/docs/standards-versioning.md`

### รันในเครื่อง

```bash
cp backend/.env.example backend/.env      # แก้ DATABASE_URL ให้ตรงกับ PostgreSQL ของคุณ
cp frontend/.env.example frontend/.env.local
pnpm prisma:deploy                        # สร้างตารางด้วย migration
pnpm prisma:seed                          # (ไม่บังคับ) ข้อมูลตัวอย่าง
pnpm dev                                  # backend :4224 + frontend :3224
```

เปิด `http://localhost:3224` แล้วกด "เข้าสู่ระบบผ่าน CSMJU Core Hub"

### รันด้วย Docker

```bash
docker compose up --build
```

ค่าเริ่มต้นของ compose ใช้ได้ทันที (override ผ่านตัวแปร environment ได้) · compose มี 3 service: `db` (PostgreSQL ของระบบนี้), `api` (backend), `web` (frontend) — เปิดเฉพาะ `127.0.0.1:3224` ออกมา

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm typecheck` | ตรวจ type ทั้ง backend และ frontend |
| `pnpm lint` | ESLint ทั้งสองฝั่ง |
| `pnpm test` | unit test ของ backend |
| `pnpm test:e2e` | e2e ของ backend (Core Hub จำลอง + DB ในหน่วยความจำ) |
| `pnpm build` | build backend และ frontend |
| `pnpm generate:openapi` | สร้าง `backend/openapi.json` จากโค้ด — แก้ endpoint แล้วต้อง commit ไฟล์นี้ใน PR เดียวกัน (API-01) |
| `pnpm generate:api-types` | สร้าง `frontend/src/lib/api-types.ts` จาก `openapi.json` |
| `pnpm checks` | `standards/scripts/run-all-checks.sh .` |
| `pnpm conformance` | conformance L1–L3 กับ Core Hub จริง (ต้องมีไฟล์บัญชีทดสอบนอก repo — ดู `standards/docs/conformance.md`) |

หมายเหตุ: `prisma generate` เขียนไฟล์ใน `backend/generated/` — ถ้า Windows ฟ้อง `EPERM` ให้หยุด backend ที่รันอยู่ก่อน

## สิทธิ์

| ทำอะไร | นักศึกษา | อาจารย์ | ผู้ดูแลระบบ |
|---|---|---|---|
| ดูรายชื่ออาจารย์และตารางว่าง | ได้ | ได้ (ของตัวเอง) | ได้ |
| จัดการเวลาทำการและปรับตารางของตัวเอง | – | ได้ | แก้/ลบของคนอื่นได้ |
| สร้าง ยกเลิก หรือปิดนัดหมาย | – | ของตัวเอง | ปิดนัดหมายของทุกคนได้ |
| ดูนัดหมาย | ของตัวเอง | ของตัวเอง | ทั้งหมด |
| อ่าน/ส่งข้อความของนัดหมาย | คู่นัดหมาย | คู่นัดหมาย | – (ไม่เห็นแม้เป็นผู้ดูแล) |

backend ตรวจสิทธิ์ทุก endpoint เอง — เมนูและปุ่มในหน้าเว็บเป็นเพียงการซ่อนสิ่งที่ผู้ใช้ทำไม่ได้

ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1
