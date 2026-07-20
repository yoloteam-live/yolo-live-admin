import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/auth/AuthGate";
import AdminShell from "@/components/AdminShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Popular Live Admin",
  description: "Popular Live management control panel",
  icons: {
    icon: "/popular-live-logo.png",
    apple: "/popular-live-logo.png",
  },
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
