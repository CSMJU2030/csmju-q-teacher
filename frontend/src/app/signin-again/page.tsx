import ReSignIn from "@/app/_components/ReSignIn";
import { sameSitePath } from "@/lib/sign-in";

export const dynamic = "force-dynamic";
export const metadata = { title: "เข้าสู่ระบบอีกครั้ง" };

/**
 * Where a form action goes when the backend answered 401 (see actions.ts): a
 * server action cannot navigate the top-level page itself, so it lands here,
 * and the user is asked - not sent away - before signing in again. `next` is
 * the page the form was on, with a message saying why it is empty again.
 */
export default async function SignInAgainPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return <ReSignIn next={sameSitePath(next)} ask />;
}
