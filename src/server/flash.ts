import { cookies } from "next/headers";

/**
 * A one-time success message for the next page: `FlashToast` in the root layout shows it as a
 * pop-up and clears it. Call it from a server action before `redirect()` (or before returning).
 */
export async function flash(message: string) {
  (await cookies()).set("flash", message, { path: "/", maxAge: 60, sameSite: "lax" });
}
