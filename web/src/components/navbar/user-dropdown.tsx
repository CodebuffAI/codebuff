'use client'

import Image from 'next/image'
import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import posthog from 'posthog-js'
import { useRouter } from 'next/navigation'
import { env } from '@/env.mjs'
import { Gift, CreditCard, Users } from 'lucide-react'

import { Icons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export const UserDropdown = ({ session: { user } }: { session: Session }) => {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <div className="relative group">
          <div className="absolute inset-0 bg-[rgb(255,110,11)] translate-x-0.5 -translate-y-0.5 rounded-md"></div>
          <div className="relative bg-white border border-white/50 rounded-md overflow-hidden transition-all duration-300 group-hover:-translate-x-0.5 group-hover:translate-y-0.5">
            <Image
              className="w-8 h-8"
              src={`${user?.image}`}
              alt={`${user?.name}`}
              width={32}
              height={32}
            />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => router.push('/orgs')}>
          <Users className="mr-2 size-4" /> <span>Organizations</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/referrals')}>
          <Gift className="mr-2 size-4" /> <span>Referrals</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/usage')}>
          <CreditCard className="mr-2 size-4" /> <span>Buy Credits</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            posthog.capture('auth.logout_completed')
            signOut()
          }}
        >
          <Icons.logOut className="mr-2 size-4" /> <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
