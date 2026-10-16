import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "GroupTogether", template: "%s · GroupTogether" },
  description:
    "Factory-surplus and B-grade shoes and apparel at bulk prices. Share a cart, reach the minimum together.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">{children}</main>
        <footer className="border-t border-line py-6 text-center text-xs text-subtle">
          GroupTogether · Bulk surplus, bought together · Delivered by PickMe
        </footer>
      </body>
    </html>
  );
}
