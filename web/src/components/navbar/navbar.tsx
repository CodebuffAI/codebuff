import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import Link from 'next/link'
import Image from 'next/image'
import {
  Menu,
  DollarSign,
  Users,
  LogIn,
  BarChart2,
  BookHeart,
} from 'lucide-react'
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
    <header className="container mx-auto p-4 flex justify-between items-center relative z-10">
      <Link 
        href="/" 
        className="flex items-center space-x-2 transition-transform hover:scale-105"
      >
        <Image
          src="/favicon/favicon-16x16.ico"
          alt="Codebuff Logo"
          width={32}
          height={32}
          className="rounded-sm"
        />
        <span className="font-mono text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
          Codebuff
        </span>
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
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105">
              Log in
            </Button>
          </Link>
        )}
        <ThemeSwitcher />
      </div>
    </header>
  )
}
