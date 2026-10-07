# csmju-subsystem-web

Template หน้าเว็บ (`frontend/`) ของระบบย่อย CSMJU2030 — ได้สี ฟอนต์ ปุ่ม AppShell และโลโก้ตรงกับ
[`docs/ui-design-system.md`](../../docs/ui-design-system.md) ทันที · ใช้แทน package `@csmju2030/design-system`
ที่ยังไม่ประกาศใช้ (ข้อ 17.0)

template นี้อยู่ใน repo มาตรฐาน จึงมากับ submodule `standards/` ของทุกระบบย่อย และตรงกับเวอร์ชันใน `.standards-version` เสมอ

## เริ่มใช้งาน

**ระบบที่ยังไม่มี `frontend/`** — จากรากของ repo ระบบย่อย:

```bash
git submodule update --init standards/
cp -R standards/templates/csmju-subsystem-web/. frontend/
cp frontend/.env.example frontend/.env
pnpm install
```

แล้วแก้ตามนี้:
1. `package.json` — พอร์ต `3200` ใน `dev` / `start` เป็นพอร์ต frontend ของทีม (32xx)
2. `.env` — `BACKEND_URL` เป็นพอร์ต backend ของทีม (42xx) · `CORE_HUB_WEB_URL` = หน้าเว็บ Core Hub (ปุ่ม "กลับ CSMJU Portal")
3. `src/app/layout.tsx` — `TODO` 3 จุด: ชื่อระบบ (`DISPLAY_NAME`) · เมนู (`NAV`) · ข้อมูลผู้ใช้จาก `GET /api/v1/me`

**ระบบที่มี `frontend/` อยู่แล้ว** — copy เฉพาะของกลาง แล้วต่อเข้ากับของเดิมเอง (ห้ามทับ `package.json` · `next.config.ts` ของเดิมทั้งไฟล์):

```bash
cp -R standards/templates/csmju-subsystem-web/src/csmju frontend/src/
cp standards/templates/csmju-subsystem-web/src/app/globals.css frontend/src/app/globals.css
cp standards/templates/csmju-subsystem-web/public/csmju-logo.png frontend/public/
cp standards/templates/csmju-subsystem-web/Dockerfile frontend/Dockerfile
```

จากนั้นครอบหน้าด้วย `CsmjuAppShell` ใน `src/app/layout.tsx` ตามไฟล์ของ template (ส่ง `coreHubUrl` จาก env `CORE_HUB_WEB_URL`) · โหลดฟอนต์ตาม ui-design-system ข้อ 4.1 ·
ตั้ง alias `@/*` → `./src/*` ใน `tsconfig.json` · และให้ `next.config.ts` ส่ง `/api/*` `/auth/login` `/auth/callback` `/auth/logout` ไป backend
พร้อม `output: "standalone"` + `outputFileTracingRoot` (หัวข้อ Deploy)

## Deploy (Docker)

ทำตาม [`docs/deployment.md`](../../docs/deployment.md) — ไฟล์ของหน้าเว็บมาจาก template นี้แล้ว:

- `Dockerfile` → copy เป็น `frontend/Dockerfile` (ห้ามแก้) · build จากรากของ repo: `docker build -f frontend/Dockerfile .`
- `next.config.ts` ตั้ง `output: "standalone"` (`DEP-04`) — ระบบที่มี `frontend/` แล้วให้เพิ่ม `output` และ `outputFileTracingRoot` แบบไฟล์นี้
- `BACKEND_URL` ถูกฝังตอน build — image ใช้ `http://api:4000` (service `api` ใน compose) · `.env` ใช้แค่ตอน dev
- ไม่มีโฟลเดอร์ `public/` ก็ build ได้

ส่วน `backend/Dockerfile` · `.dockerignore` · `docker-compose.yml` copy จาก `demo-student-subsystem`

## โครงสร้าง

```
src/
  csmju/              ← ของกลาง (อนาคตคือ package @csmju2030/design-system) ❌ ห้ามแก้
    CsmjuAppShell.tsx   sidebar + top bar + footer · ปุ่ม "กลับ CSMJU Portal" · ปุ่มออกจากระบบ = ฟอร์ม POST /auth/logout
    CsmjuLogo.tsx       โลโก้ (ui-design-system ข้อ 14.1)
    PageHeader.tsx      ชื่อหน้า + คำอธิบาย
    Modal.tsx           Modal + ConfirmDeleteModal
    Tabs.tsx · StatusBadge.tsx · icons.tsx
    ui.ts               class ของปุ่ม / input / การ์ด / ตาราง
    index.ts            import ทุกอย่างจาก "@/csmju"
  app/
    globals.css         token สี/ฟอนต์/ขนาดตัวอักษร (@theme) ❌ ห้ามแก้
    layout.tsx          ฟอนต์ + CsmjuAppShell (แก้แค่ TODO)
    page.tsx            ตัวอย่างหน้ารายการ
    loading.tsx · error.tsx · not-found.tsx   สถานะบังคับ
  components/         ← component เฉพาะระบบของคุณ
public/csmju-logo.png
next.config.ts        ส่ง /api/* และ /auth/* ไป backend (auth-contract ข้อ 5) · output: "standalone"
Dockerfile            image ของหน้าเว็บ (deployment.md ข้อ 3)
AGENTS.md / CLAUDE.md ← คำสั่งที่ AI อ่านอัตโนมัติ
```

## เข้าและออกจากระบบ

หน้าเว็บไม่ทำ login เอง (auth-contract ข้อ 5 · ทำตาม `CSMJU2030/demo-student-subsystem`):
- ปุ่มเข้าสู่ระบบ → `/auth/login?next=<path ปัจจุบัน>` ของระบบนี้ · backend พาไป Core Hub แล้วกลับมาที่ `/auth/callback`
- ออกจากระบบ → ฟอร์ม `POST /auth/logout` (อยู่ใน `CsmjuAppShell` แล้ว) · backend ล้างคุกกี้แล้ว `303` ไป Core Hub `/logout`
- backend ตอบ `401` → พาเบราว์เซอร์ไป `/auth/login?next=…` แบบ top-level navigation (auth-contract ข้อ 7 · ดู `ReSignIn.tsx` ของ demo)
- ❌ ห้ามเก็บ token ใน `localStorage` / `sessionStorage` — session คือคุกกี้ HttpOnly ที่ backend ตั้ง

## ใช้กับ AI

1. เปิดแชตใหม่ วาง system prompt จาก `standards/docs/ui-design-system.md` ข้อ 20.1 + แนบไฟล์นั้น
   (Claude Code / Cursor / Copilot อ่าน `AGENTS.md` / `CLAUDE.md` ของโฟลเดอร์นี้ให้เองอยู่แล้ว)
2. สั่งงานทีละหน้าด้วยเทมเพลตข้อ 20.2
3. ก่อนเปิด PR ให้ AI ตรวจงานด้วยข้อ 20.3

## อัปเดตเมื่อมาตรฐานเปลี่ยน

เลื่อน `standards/` ตาม `standards-versioning.md` แล้ว copy `src/csmju/`, `src/app/globals.css`, `public/csmju-logo.png`
จาก `standards/templates/csmju-subsystem-web/` ทับของเดิม (ห้าม merge ทีละบรรทัด) — เมื่อ package `@csmju2030/design-system`
ประกาศใช้แล้ว ให้ลบโฟลเดอร์ `src/csmju/` และเปลี่ยน `from "@/csmju"` เป็น `from "@csmju2030/design-system"` ทั้งโปรเจกต์
