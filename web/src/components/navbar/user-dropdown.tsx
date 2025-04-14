'use client'

import Image from 'next/image'
import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import posthog from 'posthog-js'
import { useRouter } from 'next/navigation'
import { env } from '@/env.mjs'

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
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col items-center justify-center p-2">
          <div className="relative">
            <div className="absolute inset-0 bg-[rgb(255,110,11)] translate-x-1.5 -translate-y-1.5 rounded-md"></div>
            <div className="relative bg-white border border-white/50 rounded-md overflow-hidden">
              <Image
                className="w-24 h-24"
                src={`${user?.image}`}
                alt={`${user?.name}`}
                width={96}
                height={96}
              />
            </div>
          </div>
          <h2 className="py-2 text-lg font-bold">{user?.name}</h2>
          {user?.subscription_active ? (
            <Button
              onClick={() => window.location.href = `${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${encodeURIComponent(user?.email ?? '')}`}
              className="w-64"
            >
              Manage Billing
            </Button>
          ) : (
            <Button
              onClick={() => router.push('/pricing')}
              className="w-64"
            >
              Upgrade to pro
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          posthog.capture('auth.logout_completed')
          signOut()
        }}>
          <Icons.logOut className="mr-2 size-4" /> <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
