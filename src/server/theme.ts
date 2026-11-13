import "server-only";
import { cookies } from "next/headers";

/** Light is the default (product owner, 2026-11-04); dark is an option remembered in a cookie. */
type Theme = "light" | "dark";

export const THEME_COOKIE = "gt_theme";

export async function currentTheme(): Promise<Theme> {
  return (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}
