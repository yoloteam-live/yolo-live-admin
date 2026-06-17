"use client";
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#0E111E]">
      {/* Sidebar - Fixed width on large screens */}
      <div className="hidden lg:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}