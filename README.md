# csmju-q-teacher

Q-Teacher — ระบบย่อยของโครงการ CSMJU2030

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards)
สร้างจาก standards v1.0.0 · ปักหมุดอยู่ที่ **v1.8.4** (ดู `.standards-version`)

## เชื่อม Core Hub

- Core Hub: `https://csmju2030.jowave.com`
- frontend (ประตูเดียวของระบบ): `http://localhost:3224` · backend: `http://localhost:4224`
- Callback URL ที่ต้องลงทะเบียนในทะเบียนระบบย่อย: `http://localhost:3224/auth/callback` (Base URL เว้นว่าง)
- ขั้นตอนทั้งหมด: `standards/docs/connect-core-hub.md`

## เริ่มทำงาน

```bash
git submodule update --init standards/
pnpm install
git checkout -b feature/q-teacher/<เรื่องที่ทำ>
```

ห้ามใส่ `--remote` กับ `git submodule update` — จะเลื่อน `standards/` ไปที่ `main` ไม่ตรงกับ `.standards-version` แล้ว CI ตก `GH-04`
การเลื่อนเวอร์ชันทำเป็น PR แยกตาม `standards/docs/standards-versioning.md`

ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1
