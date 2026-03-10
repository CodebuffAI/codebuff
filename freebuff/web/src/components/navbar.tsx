'use client'

import Image from 'next/image'
import Link from 'next/link'

import { Icons } from './icons'

export function Navbar() {

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link
          href="/"
          className="flex items-center space-x-2 group transition-all duration-300 hover:scale-105"
        >
          <Image
            src="/logo-icon.png"
            alt="Freebuff"
            width={28}
            height={28}
            className="rounded-sm transition-all duration-300 group-hover:brightness-110"
          />
          <span className="text-xl tracking-widest font-serif text-white">
            freebuff
          </span>
        </Link>

        <nav className="flex items-center space-x-1">
          {/* <Link
            href="https://codebuff.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground text-sm"
          >
            Docs
          </Link> */}
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground flex items-center gap-2 text-sm"
          >
            <Icons.github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>

        </nav>
      </div>
    </header>
  )
}
