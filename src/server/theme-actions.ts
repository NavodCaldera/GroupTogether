"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, currentTheme } from "./theme";

/** Switches between light and dark for this browser for a year. */
export async function toggleThemeAction() {
  const next = (await currentTheme()) === "dark" ? "light" : "dark";
  (await cookies()).set(THEME_COOKIE, next, {
    path: "/",
    sameSite: "lax",
    maxAge: 365 * 86_400,
  });
}
