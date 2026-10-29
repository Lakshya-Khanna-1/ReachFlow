import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";
export const metadata: Metadata = {
  title: "ReachFlow",
  description: "A quieter workspace for thoughtful outreach.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-zinc-900 focus:p-4"
        >
          Skip to content
        </a>
        <div className="min-h-screen md:flex">
          <Sidebar />
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
