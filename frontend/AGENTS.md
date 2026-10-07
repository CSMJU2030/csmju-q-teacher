# คำสั่งสำหรับ AI ที่ทำงานในโปรเจกต์นี้

โปรเจกต์นี้คือหน้าเว็บ (`frontend/`) ของระบบย่อย CSMJU2030 สร้างจาก template `standards/templates/csmju-subsystem-web`

1. อ่าน `../standards/docs/ui-design-system.md` ทั้งไฟล์ก่อนเขียนโค้ดทุกครั้ง และทำตามข้อ 20.1 เป็น system prompt
2. **ช่วงนี้ยังไม่ประกาศใช้ package `@csmju2030/design-system`** — ห้าม import หรือติดตั้ง package นี้ ให้ import จาก `@/csmju` แทน
   (`CsmjuAppShell`, `CsmjuLogo`, `PageHeader`, `Modal`, `ConfirmDeleteModal`, `Tabs`, `StatusBadge`, ไอคอนทั้งหมด และ class ใน `ui.ts`)
3. ❌ ห้ามแก้ไฟล์ในโฟลเดอร์ `src/csmju/` และ `src/app/globals.css` — ถ้าของที่มีไม่พอ ให้หยุดและแจ้งผู้ใช้ตามข้อ 17.4
4. component ใหม่ของระบบนี้ใส่ใน `src/components/` และต้องประกอบจากของใน `@/csmju` + token ใน `globals.css` เท่านั้น
5. จัดสไตล์ด้วย Tailwind CSS เท่านั้น ห้าม hex ดิบ (`bg-[#...]`) ห้าม CSS Modules / Sass / CSS-in-JS
6. `CsmjuAppShell` ถูกเรียกใน `src/app/layout.tsx` แล้ว ห้ามเรียกซ้ำหรือวาด sidebar/header เอง
7. ทุก route segment ต้องมี `loading.tsx` / `error.tsx` / `not-found.tsx` ตามตัวอย่างใน `src/app/`
8. **เข้า/ออกจากระบบ** (`../standards/docs/auth-contract.md` ข้อ 5–7):
   - ห้ามทำหน้า login หรือฟอร์มรหัสผ่าน · เข้าสู่ระบบด้วยลิงก์ไป `/auth/login?next=<path>` ของระบบนี้เท่านั้น
   - ออกจากระบบคือฟอร์ม `POST /auth/logout` ที่อยู่ใน `CsmjuAppShell` แล้ว — ห้ามเปลี่ยนเป็นลิงก์
   - ห้ามแตะ token ใน `localStorage` / `sessionStorage` · ข้อมูลผู้ใช้อ่านจาก `GET /api/v1/me` ของ backend ระบบนี้
   - backend ตอบ `401` → ไป `/auth/login?next=…` แบบ top-level navigation ตามตัวอย่าง `ReSignIn.tsx` ใน `CSMJU2030/demo-student-subsystem`
9. ใช้ `pnpm` เท่านั้น · dependency ใหม่ต้องอยู่ใน `../standards/scripts/lib/allowed-deps.json`
10. Next.js เวอร์ชันนี้ใหม่กว่าที่ AI ส่วนใหญ่รู้จัก — อ่านคู่มือใน `node_modules/next/dist/docs/` ก่อนใช้ API ที่ไม่แน่ใจ (เช่น `error.tsx` ใช้ `retry()`, `middleware` เปลี่ยนชื่อเป็น `proxy`)
