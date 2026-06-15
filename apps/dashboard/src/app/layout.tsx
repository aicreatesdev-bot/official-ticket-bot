import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rose Ticket Dashboard",
  description: "Discord ticket management dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
