import type { ReactNode } from "react";
import ReSignIn from "@/app/_components/ReSignIn";
import { getMe, hasSession, type Me } from "@/lib/api";
import SignedOut from "./SignedOut";

/**
 * The first thing every page does: who is this? A session that ended renews
 * itself (ReSignIn); a visitor who never signed in gets the sign-in page. Either
 * way `view` is what the page returns instead of its content.
 */
export async function requireMe(next: string): Promise<{ me: Me; view?: undefined } | { me?: undefined; view: ReactNode }> {
  const me = await getMe();
  if (me.ok) return { me: me.data };
  if (me.status === 401 && (await hasSession())) return { view: <ReSignIn next={next} /> };
  return { view: <SignedOut reason={me.status === 401 ? null : me.message} next={next} /> };
}
