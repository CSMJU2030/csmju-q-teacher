/**
 * token ดิบของผู้ใช้ที่ CoreHubJwtGuard ตรวจผ่านแล้ว — ใช้ส่งต่อไป Core Hub (สเปก D7)
 * ห้าม log ค่านี้
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      coreHubAccessToken?: string;
    }
  }
}

export {};
