import Image from 'next/image'
import Link from 'next/link'

import { blogConfig } from '@/lib/blog/config'

export function BlogNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        {/*
         * Sibling links — never nest <Link>s. <a> inside <a> is invalid HTML
         * and Next.js will (correctly) hydration-error on it.
         */}
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="group flex items-center gap-2 text-white transition-opacity hover:opacity-90"
          >
            <Image
              src="/logo-icon.png"
              alt={`${blogConfig.brand} logo`}
              width={24}
              height={24}
              className="rounded-sm"
            />
            <span className="font-serif text-lg tracking-wide text-zinc-200 group-hover:text-white">
              freebuff
            </span>
          </Link>
          <span className="hidden text-zinc-700 sm:inline">/</span>
          <Link
            href={blogConfig.basePath}
            className="hidden text-sm text-zinc-400 hover:text-white sm:inline"
          >
            blog
          </Link>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href={blogConfig.basePath}
            className="rounded-md px-3 py-1.5 text-zinc-400 hover:text-white"
          >
            All posts
          </Link>
          <Link
            href="/"
            className="rounded-md bg-acid-matrix/15 px-3 py-1.5 font-medium text-acid-matrix ring-1 ring-acid-matrix/30 transition-colors hover:bg-acid-matrix/20"
          >
            Get Freebuff
          </Link>
        </nav>
      </div>
    </header>
  )
}
