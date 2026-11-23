import type { Metadata, Viewport } from "next";
import { NavDepth } from "@/components/client";
import { SiteHeader } from "@/components/site-header";
import { FlashToast } from "@/components/toast";
import { getCurrentUser } from "@/server/auth/session";
import { currentTheme } from "@/server/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GroupBasket", template: "%s · GroupBasket" },
  description: "Family packs from the companies you know, bought together with families near you.",
};

export async function generateViewport(): Promise<Viewport> {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: (await currentTheme()) === "dark" ? "#0d1110" : "#ffffff",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, theme] = await Promise.all([getCurrentUser(), currentTheme()]);
  return (
    <html lang="en" data-theme={theme} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:py-6">
          {children}
        </main>
        {/* Clears the phone tab bar, when there is one, and the home indicator. */}
        <footer
          className={`border-t border-line px-4 pt-6 text-center text-xs text-subtle sm:pb-6 ${user ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"}`}
        >
          GroupBasket · Family packs, bought together
        </footer>
        <FlashToast />
        <NavDepth />
      </body>
    </html>
  );
}
