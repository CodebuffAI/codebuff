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
    <header className="container mx-auto p-4 flex justify-between items-center relative z-10">
      <Link
        href="/"
        className="flex items-center space-x-2 transition-transform hover:scale-105"
      >
        <Image
          src="/favicon/logo-and-name.ico"
          alt="Codebuff"
          width={200}
          height={100}
          priority
          className="rounded-sm"
        />
      </Link>
      <nav className="hidden md:flex space-x-6 ml-auto">
        <Link
          href={`/docs`}
          className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          Docs
        </Link>
        <Link
          href="/pricing"
          className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
        >
          Pricing
        </Link>
        <Link
          href="https://github.com/CodebuffAI/codebuff"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
        >
          <Icons.github className="h-4 w-4" />
          GitHub
        </Link>
        <Link
          href="/store"
          className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
        >
          <Bot className="h-4 w-4" />
          Agent Store
        </Link>

        {/* Only show Usage link when session is ready and user is authenticated */}
        {status !== 'loading' && session && (
          <Link
            href="/usage"
            className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            Usage
          </Link>
        )}
      </nav>
      <div className="flex items-center space-x-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/docs" className="flex items-center">
                <BookHeart className="mr-2 h-4 w-4" />
                Docs
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/pricing" className="flex items-center">
                <DollarSign className="mr-2 h-4 w-4" />
                Pricing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="https://github.com/CodebuffAI/codebuff"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center"
              >
                <Icons.github className="mr-2 h-4 w-4" />
                GitHub
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/store" className="flex items-center">
                <Bot className="mr-2 h-4 w-4" />
                Agent Store
              </Link>
            </DropdownMenuItem>

            {/* Only show Usage and Login links when session is ready */}
            {status !== 'loading' && session && (
              <DropdownMenuItem asChild>
                <Link href="/usage" className="flex items-center">
                  <BarChart2 className="mr-2 h-4 w-4" />
                  Usage
                </Link>
              </DropdownMenuItem>
            )}
            {status !== 'loading' && !session && (
              <DropdownMenuItem asChild>
                <Link href="/login" className="flex items-center">
                  <LogIn className="mr-2 h-4 w-4" />
                  Log in
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Authentication section with loading state */}
        {status === 'loading' ? (
          <div className="hidden md:flex items-center">
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
        ) : session ? (
          <UserDropdown session={session} />
        ) : (
          <Link href="/login" className="hidden md:inline-block relative group">
            <div className="absolute inset-0 bg-[rgb(255,110,11)] translate-x-0.5 -translate-y-0.5" />
            <Button
              className={cn(
                'relative',
                'bg-white text-black hover:bg-white',
                'border border-white/50',
                'transition-all duration-300',
                'group-hover:-translate-x-0.5 group-hover:translate-y-0.5',
              )}
            >
              Log in
            </Button>
          </Link>
        )}
        {/* <ThemeSwitcher /> */}
      </div>
    </header>
  )
}
