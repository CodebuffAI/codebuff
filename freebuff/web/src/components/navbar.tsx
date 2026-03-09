'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

import { Icons } from './icons'
import { Button } from './ui/button'

import { cn } from '@/lib/utils'

export function Navbar() {
  const { data: session, status } = useSession()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link
          href="/"
          className="flex items-center space-x-2 group transition-all duration-300 hover:scale-105"
        >
          <span className="text-xl font-bold tracking-tight">
            <span className="text-acid-green">Free</span>
            <span className="text-white">buff</span>
          </span>
        </Link>

        <nav className="flex items-center space-x-1">
          <Link
            href="https://codebuff.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground text-sm"
          >
            Docs
          </Link>
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground flex items-center gap-2 text-sm"
          >
            <Icons.github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>

          <div className="ml-2">
            {status === 'loading' ? (
              <div className="h-9 w-20 rounded-md bg-secondary animate-pulse" />
            ) : session ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {session.user?.name || session.user?.email}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/' })}
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <Link href="/login">
                <div className="relative group inline-block">
                  <div className="absolute inset-0 bg-acid-green rounded-md translate-x-0.5 -translate-y-0.5 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                  <Button
                    className={cn(
                      'relative',
                      'bg-white text-black hover:bg-white',
                      'border border-white/50',
                      'transition-all duration-300',
                      'group-hover:-translate-x-0.5 group-hover:translate-y-0.5',
                    )}
                    size="sm"
                  >
                    Log in
                  </Button>
                </div>
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
