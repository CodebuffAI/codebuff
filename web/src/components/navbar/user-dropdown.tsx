'use client'

import Image from 'next/image'
import { Session } from 'next-auth'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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
        <Image
          className="overflow-hidden rounded-full"
          src={`${user?.image}`}
          alt={`${user?.name}`}
          width={32}
          height={32}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col items-center justify-center p-2">
          <Image
            className="overflow-hidden rounded-full"
            src={`${user?.image}`}
            alt={`${user?.name}`}
            width={100}
            height={100}
          />
          <h2 className="py-2 text-lg font-bold">{user?.name}</h2>
          <Button
            onClick={() => router.push('/pricing')}
            disabled={user?.subscription_active}
            className="w-64"
          >
            {user?.subscription_active ? (
              <p>You are on the pro tier!</p>
            ) : (
              <>Upgrade to pro</>
            )}
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <Icons.logOut className="mr-2 size-4" /> <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
