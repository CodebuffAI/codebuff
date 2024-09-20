import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { SignInButton } from '@/components/navbar/sign-in-button'
import { UserDropdown } from '@/components/navbar/user-dropdown'
import Link from 'next/link'
import { BrainCircuitIcon } from 'lucide-react'
import { ThemeSwitcher } from '../theme-switcher'

export const Navbar = async () => {
  const session = await getServerSession(authOptions)

  return (
    <header className="container mx-auto px-4 py-6 flex justify-between items-center relative z-10">
      <Link href="/" className="flex items-center space-x-2">
        <BrainCircuitIcon className="h-8 w-8 text-blue-500" />
        <span className="font-mono text-2xl font-bold">Manicode</span>
      </Link>
      <nav className="hidden md:flex space-x-4">
        <a href="#features" className="hover:text-blue-400 transition-colors">
          Features
        </a>
        <a href="#pricing" className="hover:text-blue-400 transition-colors">
          Pricing
        </a>
        <a href="#docs" className="hover:text-blue-400 transition-colors">
          Docs
        </a>
      </nav>
      <div className="flex items-center space-x-4">
        {session ? <UserDropdown session={session} /> : <SignInButton />}
        <ThemeSwitcher />
      </div>
    </header>
  )
}
