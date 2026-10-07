/**
 * Where every sign-in starts: this subsystem's own GET /auth/login
 * (auth-contract 5), which next.config.ts passes on to the backend. It mints
 * the anti-forgery state and sends the browser on to Core Hub, which comes
 * back to /auth/callback and then to `next`.
 *
 * `next` is a path of this site, with its query - the backend checks it
 * again before following it. Shared by server and client components, so it
 * imports nothing server-only.
 */
export function loginHref(next: string): string {
  return `/auth/login?next=${encodeURIComponent(next)}`;
}

/** A `next` that is a path of this site, or the home page. The backend re-checks it. */
export function sameSitePath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}
