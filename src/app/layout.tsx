import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GroupTogether", template: "%s · GroupTogether" },
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:py-6">
          {children}
        </main>
        {/* Bottom padding on phones clears the fixed tab bar (and the home indicator). */}
        <footer className="border-t border-line px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] text-center text-xs text-subtle sm:pb-6">
          GroupTogether · Bulk surplus, bought together · Delivered by PickMe
        </footer>
      </body>
    </html>
  );
}
