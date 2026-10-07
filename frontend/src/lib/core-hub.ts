/**
 * Core Hub web origin for the "กลับ CSMJU Portal" link every subsystem shows
 * (ui-design-system.md 1, 5.1). Read on the server from env - never
 * hardcoded; no link when it is not set.
 */
export const CORE_HUB_WEB_URL = process.env.CORE_HUB_WEB_URL || undefined;
