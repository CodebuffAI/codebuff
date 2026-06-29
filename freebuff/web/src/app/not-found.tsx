import Link from 'next/link'

// NB: `@/components/*` is aliased to vly in this package, so import relatively.
import { LandingNavbar } from '../components/landing/Navbar'
import { Starfield } from '../components/landing/Starfield'

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black font-paragraph text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#070b11_0%,#070d12_36%,#05080c_70%,#000000_100%)]" />
      <div className="lp-gpu pointer-events-none absolute inset-0 opacity-40">
        <Starfield />
      </div>
      <LandingNavbar />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
          404
        </p>
        <h1 className="lp-hero-heading text-balance text-4xl font-normal leading-[1.1] text-white md:text-6xl">
          This page wandered off
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/55">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm text-white/90 transition-colors hover:border-forest/50 hover:text-white"
        >
          Back to home <span aria-hidden>→</span>
        </Link>
      </main>
    </div>
  )
}
