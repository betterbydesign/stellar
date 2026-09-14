import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar",
  description: "A workspace for designing, building, and maintaining websites.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
