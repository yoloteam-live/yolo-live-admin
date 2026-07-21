"use client";
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileNavOpen]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-[#0E111E]">
      {/* Sidebar - Fixed width on large screens */}
      <div className="hidden lg:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Compact mobile header and off-canvas navigation. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#251B45] bg-[#151225]/95 px-4 backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/popular-live-logo.png"
            alt="Popular Live"
            width={38}
            height={38}
            priority
            className="h-[38px] w-[38px] shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">POPULAR LIVE</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">Admin Panel</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#352853] bg-[#1E1A34] text-white"
        >
          {mobileNavOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] shadow-2xl shadow-black/60">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-black/30 text-gray-300 hover:text-white"
            >
              <X size={19} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="min-h-screen min-w-0 flex-1 pt-16 lg:pl-64 lg:pt-0">
        <div className="admin-content mx-auto w-full max-w-7xl min-w-0 p-3 sm:p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
