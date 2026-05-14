import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rapid KL Real-time Tracker",
  description: "Track Rapid KL buses in real-time with notifications",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
