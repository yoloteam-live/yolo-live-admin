import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/auth/AuthGate";
import AdminShell from "@/components/AdminShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Care Live Super Admin",
  description: "Advanced Management Control Panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthGate>
          <AdminShell>{children}</AdminShell>
        </AuthGate>
      </body>
    </html>
  );
}
