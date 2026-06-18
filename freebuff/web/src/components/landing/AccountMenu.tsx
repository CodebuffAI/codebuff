'use client'

import { motion } from 'framer-motion'
import { LogOut, Settings } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/vly/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'

const PRODUCT_LINKS = [
  { label: 'CLI', href: '/cli' },
  { label: 'Web', href: '/web' },
  { label: 'Chat', href: '/chat' },
  { label: 'Live', href: '/live' },
]

const ITEM_CLASS =
  'cursor-pointer rounded-md px-2.5 py-2 text-sm text-white/80 focus:bg-white/10 focus:text-white'

/**
 * Logged-in account menu. Renders nothing when signed out, so it can be dropped
 * into any unauthenticated page chrome (landing, /cli, /live, chat sidebar) and
 * only appears once the user has a session. Lets them jump between products,
 * open settings, and sign out — consistent across pages.
 */
export function AccountMenu({
  align = 'end',
  size = 28,
}: {
  align?: 'start' | 'end'
  size?: number
}) {
  const router = useRouter()
  const { data: session, status } = useSession()

  if (status !== 'authenticated') return null

  const user = session?.user
  const name = user?.name || 'Account'
  const email = user?.email || ''
  const image = user?.image || undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          aria-label="Account menu"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center rounded-full p-0.5 outline-none ring-white/20 transition-opacity hover:opacity-90 focus-visible:ring-2"
        >
          <Avatar style={{ height: size, width: size }}>
            <AvatarImage src={image} alt={name} />
            <AvatarFallback className="bg-white/10 text-xs text-white">
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={8}
        className="w-56 rounded-xl border border-white/10 bg-[#0c0c0f] p-1 text-white shadow-2xl shadow-black/50"
      >
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          {email && <p className="truncate text-xs text-white/45">{email}</p>}
        </div>
        <DropdownMenuSeparator className="bg-white/10" />
        {PRODUCT_LINKS.map((l) => (
          <DropdownMenuItem
            key={l.href}
            className={ITEM_CLASS}
            onClick={() => router.push(l.href)}
          >
            {l.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem
          className={ITEM_CLASS}
          onClick={() => router.push('/web/settings')}
        >
          <Settings className="mr-2.5 h-4 w-4 text-white/45" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          className={ITEM_CLASS}
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          <LogOut className="mr-2.5 h-4 w-4 text-white/45" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
