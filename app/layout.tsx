import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Food Diary",
  description: "Log meals out and find places that suit everyone at the table.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Food Diary", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#F5F6F2",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Browser extensions (e.g. Scribe) add attributes to <html> before React
    // hydrates. This ignores attribute differences on <html> only, not its children.
    <html
      lang="en"
      className={`${inter.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col text-body">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
