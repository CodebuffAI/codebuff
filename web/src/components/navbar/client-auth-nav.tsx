'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { LogIn, BarChart2 } from 'lucide-react'
import { UserDropdown } from './user-dropdown'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { DropdownMenuItem } from '../ui/dropdown-menu'

interface ClientAuthNavProps {
  className?: string
  isMobile?: boolean
}

export function ClientAuthNav({
  className,
  isMobile = false,
}: ClientAuthNavProps) {
  const { data: session, status } = useSession()

  // Server container handles spacing, no need for placeholder here
  if (status === 'loading') {
    return null
  }

  if (isMobile) {
    // Mobile dropdown item
    if (!session) {
      return (
        <DropdownMenuItem asChild>
          <Link href="/login" className="flex items-center">
            <LogIn className="mr-2 h-4 w-4" />
            Log in
          </Link>
        </DropdownMenuItem>
      )
    }
    return null // Usage link is handled separately in mobile menu
  }

  // Desktop version
  if (session) {
    return <UserDropdown session={session} />
  }

  return (
    <Link href="/login" className="relative group">
      <div className="absolute inset-0 bg-[rgb(255,110,11)] translate-x-0.5 -translate-y-0.5" />
      <Button
        className={cn(
          'relative',
          'bg-white text-black hover:bg-white',
          'border border-white/50',
          'transition-all duration-300',
          'group-hover:-translate-x-0.5 group-hover:translate-y-0.5'
        )}
      >
        Log in
      </Button>
    </Link>
  )
}

export function ClientUsageLink() {
  const { data: session, status } = useSession()

  // Server container handles spacing, just return null when not logged in
  if (!session) {
    return null
  }

  return (
    <Link
      href="/usage"
      className="hover:text-blue-400 transition-colors font-medium px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
    >
      Usage
    </Link>
  )
}

export function ClientMobileUsageLink() {
  const { data: session } = useSession()

  if (!session) return null

  return (
    <DropdownMenuItem asChild>
      <Link href="/usage" className="flex items-center">
        <BarChart2 className="mr-2 h-4 w-4" />
        Usage
      </Link>
    </DropdownMenuItem>
  )
}
