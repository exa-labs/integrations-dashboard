import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Integrations Dashboard",
  description: "Monitor integration health, discover new repos, track activity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">{children}</body>
    </html>
  );
}
