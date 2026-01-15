'use client'

import {
  Menu,
  DollarSign,
  LogIn,
  BarChart2,
  BookHeart,
  Bot,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

import { cn } from '@/lib/utils'

import { UserDropdown } from './user-dropdown'
import { Icons } from '../icons'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

export const Navbar = () => {
  const { data: session, status } = useSession()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <Link
          href="/"
          className="flex items-center space-x-2 group transition-all duration-300 hover:scale-105"
        >
          <Image
            src="/favicon/logo-and-name.ico"
            alt="Codebuff"
            width={200}
            height={100}
            priority
            className="rounded-sm transition-all duration-300 group-hover:brightness-110"
          />
        </Link>
        <nav className="hidden md:flex items-center space-x-1 ml-auto">
          <Link
            href="/docs"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground group"
          >
            <span className="relative z-10">Docs</span>
            <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
          <Link
            href="/pricing"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground group"
          >
            <span className="relative z-10">Pricing</span>
            <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            target="_blank"
            rel="noopener noreferrer"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground flex items-center gap-2 group"
          >
            <Icons.github className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span className="relative z-10">GitHub</span>
            <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
          <Link
            href="/store"
            className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground flex items-center gap-2 group"
          >
            <Bot className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span className="relative z-10">Agent Store</span>
            <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>

          {/* Only show Usage link when session is ready and user is authenticated */}
          {status !== 'loading' && session && (
            <Link
              href="/usage"
              className="relative font-medium px-3 py-2 rounded-md transition-all duration-200 hover:bg-accent hover:text-accent-foreground group"
            >
              <span className="relative z-10">Usage</span>
              <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
          )}
        </nav>
        <div className="flex items-center space-x-2 ml-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="transition-all duration-200 hover:bg-accent hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
            >
              <DropdownMenuItem asChild>
                <Link
                  href="/docs"
                  className="flex items-center cursor-pointer transition-colors"
                >
                  <BookHeart className="mr-2 h-4 w-4" />
                  <span>Docs</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/pricing"
                  className="flex items-center cursor-pointer transition-colors"
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  <span>Pricing</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="https://github.com/CodebuffAI/codebuff"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center cursor-pointer transition-colors"
                >
                  <Icons.github className="mr-2 h-4 w-4" />
                  <span>GitHub</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/store"
                  className="flex items-center cursor-pointer transition-colors"
                >
                  <Bot className="mr-2 h-4 w-4" />
                  <span>Agent Store</span>
                </Link>
              </DropdownMenuItem>

              {/* Only show Usage and Login links when session is ready */}
              {status !== 'loading' && session && (
                <DropdownMenuItem asChild>
                  <Link
                    href="/usage"
                    className="flex items-center cursor-pointer transition-colors"
                  >
                    <BarChart2 className="mr-2 h-4 w-4" />
                    <span>Usage</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {status !== 'loading' && !session && (
                <DropdownMenuItem asChild>
                  <Link
                    href="/login"
                    className="flex items-center cursor-pointer transition-colors"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    <span>Log in</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Authentication section with loading state */}
          {status === 'loading' ? (
            <div className="hidden md:flex items-center">
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          ) : session ? (
            <UserDropdown session={session} />
          ) : (
            <Link
              href="/login"
              className="hidden md:inline-block relative group"
            >
              <div className="absolute inset-0 bg-[rgb(255,110,11)] rounded-md translate-x-0.5 -translate-y-0.5 transition-all duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
              <Button
                className={cn(
                  'relative',
                  'bg-white text-black hover:bg-white',
                  'border border-white/50',
                  'transition-all duration-300',
                  'group-hover:-translate-x-0.5 group-hover:translate-y-0.5',
                  'group-hover:shadow-lg',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
              >
                Log in
              </Button>
            </Link>
          )}
          {/* <ThemeSwitcher /> */}
        </div>
      </div>
    </header>
  )
}
