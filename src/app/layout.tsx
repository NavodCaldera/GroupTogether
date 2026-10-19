import type { Metadata, Viewport } from "next";
import { SiteHeader, hasTabBar } from "@/components/site-header";
import { FlashToast } from "@/components/toast";
import { getCurrentUser } from "@/server/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GroupBasket", template: "%s · GroupBasket" },
  description:
    "Factory-surplus and B-grade shoes and apparel at bulk prices. Share a cart, reach the minimum together.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1110" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const tabBar = hasTabBar(user);
  // Packing staff get no footer: their pages show only what they need (product owner, 2026-10-19).
  const footer = user?.role !== "PACKER";
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main
          className={`mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-5 sm:pt-6 ${footer ? "pb-5 sm:pb-6" : "pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6"}`}
        >
          {children}
        </main>
        {/* Bottom padding on phones clears the fixed tab bar, when there is one, and the home indicator. */}
        {footer && (
          <footer
            className={`border-t border-line px-4 pt-6 text-center text-xs text-subtle sm:pb-6 ${tabBar ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"}`}
          >
            GroupBasket · Bulk surplus, bought together · Delivered by PickMe
          </footer>
        )}
        <FlashToast />
      </body>
    </html>
  );
}
