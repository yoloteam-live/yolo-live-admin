import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  updated: string;
  accent: 'pink' | 'violet';
  children: ReactNode;
};

export function LegalPage({
  eyebrow,
  title,
  description,
  updated,
  accent,
  children,
}: LegalPageProps) {
  const accentClasses = accent === 'pink'
    ? 'from-pink-500 to-rose-400 shadow-pink-500/20'
    : 'from-violet-500 to-fuchsia-400 shadow-violet-500/20';

  return (
    <div className="min-h-screen bg-[#0b0d18] text-slate-200 selection:bg-pink-500/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-36 -top-36 h-96 w-96 rounded-full bg-pink-600/10 blur-3xl" />
        <div className="absolute -right-36 top-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      <header className="relative border-b border-white/10 bg-[#0b0d18]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/privacy" className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400">
            <Image
              src="/popular-live-logo.png"
              alt="Popular Live"
              width={42}
              height={42}
              priority
              className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-black/30"
            />
            <div>
              <p className="text-sm font-black tracking-wide text-white">POPULAR LIVE</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Legal center</p>
            </div>
          </Link>
          <nav aria-label="Legal pages" className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 text-xs font-bold sm:text-sm">
            <Link href="/privacy" className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white">Privacy</Link>
            <Link href="/terms" className="rounded-lg px-3 py-2 text-slate-300 transition hover:bg-white/10 hover:text-white">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-20">
        <section className="mb-10 border-b border-white/10 pb-10 sm:mb-14 sm:pb-14">
          <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClasses} shadow-xl`}>
            <ShieldCheck size={25} className="text-white" aria-hidden="true" />
          </div>
          <p className="mb-3 text-xs font-black uppercase tracking-[0.25em] text-pink-400">{eyebrow}</p>
          <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">{description}</p>
          <p className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-400">
            Effective and last updated: {updated}
          </p>
        </section>

        <article className="legal-copy">{children}</article>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} Popular Live. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="transition hover:text-white">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
