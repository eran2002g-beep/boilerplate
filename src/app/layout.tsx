import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionWatcher } from "@/components/session-watcher";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Employee Directory",
  description: "Next.js employee CRUD with JWT auth and photo upload",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <SessionWatcher />
        {children}
      </body>
    </html>
  );
}
