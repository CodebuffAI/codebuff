import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, DollarSign, Users, LogIn, BarChart2 } from 'lucide-react'
import { ThemeSwitcher } from '../theme-switcher'
import { Button } from '../ui/button'
import { UserDropdown } from './user-dropdown'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

export const Navbar = async () => {
  const session = await getServerSession(authOptions)

  return (
    <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
      <Link href="/" className="flex items-center space-x-2">
        <Image
          src="/favicon/favicon-16x16.ico"
          alt="Codebuff Logo"
          width={32}
          height={32}
          className="rounded-sm"
        />
        <span className="font-mono text-2xl font-bold">Codebuff</span>
      </Link>
      <nav className="hidden md:flex space-x-4">
        <Link href={`/docs`} className="hover:text-blue-400 transition-colors">
          Docs
        </Link>
        <Link href="/pricing" className="hover:text-blue-400 transition-colors">
          Pricing
        </Link>
        {session && (
          <Link
            href="/referrals"
            className="hover:text-blue-400 transition-colors"
          >
            Referrals
          </Link>
        )}
        {session && (
          <Link href="/usage" className="hover:text-blue-400 transition-colors">
            Usage
          </Link>
        )}
      </nav>
      <div className="flex items-center space-x-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href="/pricing" className="flex items-center">
                <DollarSign className="mr-2 h-4 w-4" />
                Pricing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/referrals" className="flex items-center">
                <Users className="mr-2 h-4 w-4" />
                Referrals
              </Link>
            </DropdownMenuItem>
            {session && (
              <DropdownMenuItem asChild>
                <Link href="/usage" className="flex items-center">
                  <BarChart2 className="mr-2 h-4 w-4" />
                  Usage
                </Link>
              </DropdownMenuItem>
            )}
            {!session && (
              <DropdownMenuItem asChild>
                <Link href="/login" className="flex items-center">
                  <LogIn className="mr-2 h-4 w-4" />
                  Log in
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {session ? (
          <UserDropdown session={session} />
        ) : (
          <Link href="/login" className="hidden md:inline-block">
            <Button className="bg-blue-600 hover:bg-blue-400 text-white transition-colors">
              Log in
            </Button>
          </Link>
        )}
        <ThemeSwitcher />
      </div>
    </header>
  )
}
