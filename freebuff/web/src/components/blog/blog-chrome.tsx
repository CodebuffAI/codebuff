'use client'

import Link from 'next/link'

import { LandingNavbar } from '@/components/landing/Navbar'
import { Starfield } from '@/components/landing/Starfield'
import { CtaFooter } from '@/components/landing/sections/CtaFooter'
import { blogConfig } from '@/lib/blog/config'

export function BlogChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen isolate bg-[#03060a] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(100vh,820px)] overflow-hidden"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#03060a_0%,#05080c_30%,#070b0e_55%,#050708_78%,#000000_100%)]" />
        <div className="absolute inset-x-0 top-0 h-[55%] bg-[radial-gradient(ellipse_55%_60%_at_50%_-15%,rgba(36,107,55,0.07),transparent_72%)]" />
        <div className="absolute inset-x-0 top-0 h-full opacity-40">
          <Starfield />
        </div>
      </div>

      <LandingNavbar
        leftNav={
          <>
            <span className="hidden text-white/25 sm:inline">/</span>
            <Link
              href={blogConfig.basePath}
              className="hidden rounded-md px-2 py-1 text-sm text-white/55 transition-colors hover:text-white sm:inline"
            >
              blog
            </Link>
          </>
        }
      />

      <main className="relative z-10">{children}</main>
      <div className="relative z-10">
        <CtaFooter />
      </div>
    </div>
  )
}
