import { Menu, DollarSign, BookHeart, Bot } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'

import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Icons } from '../icons'

// TODO: This dynamic pattern might not be the best way to handle the navbar. Reconsider from first principles.

// Dynamically import client auth components to prevent SSR and enable SSG
const ClientAuthNav = dynamic(
  () =>
    import('./client-auth-nav').then((mod) => ({ default: mod.ClientAuthNav })),
  {
    ssr: false,
    loading: () => <div className="w-[50px] h-[40px]" />, // Placeholder to prevent layout shift
  }
)

const ClientUsageLink = dynamic(
  () =>
    import('./client-auth-nav').then((mod) => ({
      default: mod.ClientUsageLink,
    })),
  {
    ssr: false,
  }
)

const ClientMobileUsageLink = dynamic(
  () =>
    import('./client-auth-nav').then((mod) => ({
      default: mod.ClientMobileUsageLink,
    })),
  {
    ssr: false,
  }
)

const ClientMobileAuthNav = dynamic(
  () =>
    import('./client-auth-nav').then((mod) => ({ default: mod.ClientAuthNav })),
  {
    ssr: false,
  }
)

export const Navbar = () => {
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
        <div className="min-w-[50px] flex items-center">
          <ClientUsageLink />
        </div>
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
            <ClientMobileUsageLink />
            <ClientMobileAuthNav isMobile />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-[50px] h-[44px] flex items-center justify-end -ml-3">
          <ClientAuthNav />
        </div>
        {/* <ThemeSwitcher /> */}
      </div>
    </header>
  )
}
