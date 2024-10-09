import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import Link from 'next/link'
import { BrainCircuitIcon } from 'lucide-react'
import { ThemeSwitcher } from '../theme-switcher'
import { Button } from '../ui/button'
import { UserDropdown } from './user-dropdown'

export const Navbar = async () => {
  const session = await getServerSession(authOptions)

  return (
    <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
      <Link href="/" className="flex items-center space-x-2">
        <BrainCircuitIcon className="h-8 w-8 text-blue-500" />
        <span className="font-mono text-2xl font-bold">Manicode</span>
      </Link>
      <nav className="hidden md:flex space-x-4">
        <Link href="/pricing" className="hover:text-blue-400 transition-colors">
          Pricing
        </Link>
        {session && (
          <Link href="/referrals" className="hover:text-blue-400 transition-colors">
            Referrals
          </Link>
        )}
      </nav>
      <div className="flex items-center space-x-4">
        {session ? (
          <UserDropdown session={session} />
        ) : (
          <Link href="/login">
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
