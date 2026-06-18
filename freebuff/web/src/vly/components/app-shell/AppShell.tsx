'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery } from 'convex/react'
import {
  FolderKanban,
  Users,
  Settings,
  Gift,
  LogOut,
  Menu,
  X,
  MessageCircle,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { cn } from '@/vly/lib/utils'
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@/vly/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/vly/components/ui/dropdown-menu'
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'
import { FreebuffLogo } from './FreebuffLogo'
import { BetaBadge } from './BetaBadge'

export interface AppShellNavItem {
  label: string
  href: string
  Icon: typeof FolderKanban
  /** Match exactly instead of prefix (used for the "/web" home item). */
  exact?: boolean
}

const NAV_ITEMS: AppShellNavItem[] = [
  { label: 'Projects', href: '/web', Icon: FolderKanban, exact: true },
  { label: 'Community', href: '/web/community', Icon: Users },
  { label: 'Referrals', href: '/web/referrals', Icon: Gift },
  { label: 'Settings', href: '/web/settings', Icon: Settings },
]

function useIsActive() {
  const pathname = usePathname()
  return (item: AppShellNavItem) => {
    if (!pathname) return false
    if (item.exact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }
}

/**
 * Consistent application shell for the Freebuff Web "logged-in app" surface:
 * Projects, Community, Settings. Navigation lives in a top tab bar (instead of
 * a left sidebar) so the content area gets the full width and the chrome stays
 * out of the way — minimal, borderless, dark.
 *
 * `title` / `subtitle` are accepted for backwards-compatibility but are no
 * longer rendered: per-page headers were intentionally removed.
 */
export function AppShell({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  title,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  subtitle,
  actions,
  subnav,
  children,
  /** When false the main area won't scroll (children manage their own). */
  scroll = true,
  contentClassName = '',
  /**
   * Optional full-bleed backdrop rendered behind the chrome (e.g. the
   * landing-style night sky + stars). When provided the shell surface flips
   * to pure black so the backdrop reads as a seamless extension of it.
   */
  ambient,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  subnav?: React.ReactNode
  children: React.ReactNode
  scroll?: boolean
  contentClassName?: string
  ambient?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isActive = useIsActive()

  return (
    // `fixed inset-0` so the shell fully owns the viewport and covers the
    // global site footer rendered by the root layout — the app surface
    // should feel self-contained (same approach as the project page).
    <div
      className={cn(
        'fixed inset-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden text-foreground',
        ambient ? 'bg-black' : 'bg-background',
      )}
    >
      {ambient && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          {ambient}
        </div>
      )}
      {/* ── Top navigation bar ───────────────────────────────────────── */}
      <header className="relative z-30 flex h-14 flex-shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        {/* Brand */}
        <Link
          href="/web"
          className="flex flex-shrink-0 items-center gap-2"
          aria-label="Freebuff home"
        >
          <FreebuffLogo size={28} />
          <span className="hidden font-['Geist'] text-sm font-semibold tracking-tight text-foreground sm:inline">
            Freebuff Web
          </span>
          <BetaBadge />
        </Link>

        {/* Desktop nav tabs */}
        <nav className="ml-1 hidden items-center gap-1 sm:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-muted/70 font-medium text-foreground'
                    : 'text-foreground/70 hover:bg-muted/40 hover:text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          {actions}

          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 items-center gap-2 rounded-lg px-3 text-sm text-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground sm:flex"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            Discord
          </a>

          <UserMenu />

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* ── Mobile nav menu ──────────────────────────────────────────── */}
      {menuOpen && (
        <div className="relative z-30 flex flex-col gap-0.5 px-3 pb-2 sm:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-muted/70 font-medium text-foreground'
                    : 'text-foreground/75 hover:bg-muted/40 hover:text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/75 transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <MessageCircle className="h-[18px] w-[18px] flex-shrink-0" />
            Discord
          </a>
        </div>
      )}

      {/* Optional sub-navigation (e.g. Community tabs) */}
      {subnav && <div className="relative z-20 flex-shrink-0 px-3 sm:px-5">{subnav}</div>}

      {/* Body */}
      <main
        className={cn(
          'relative z-10 min-h-0 flex-1',
          scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden',
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  )
}

function UserMenu() {
  const router = useRouter()
  const { data: session } = useSession()
  const currentUserId = useQuery(api.community.getCurrentUserId)
  const user = session?.user
  const userName = user?.name || 'User'
  const userEmail = user?.email || ''
  const userImage = user?.image || undefined

  return (
    <>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg p-0.5 transition-colors hover:bg-muted/50"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl shadow-black/40"
          >
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-foreground">
                {userName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {userEmail}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border/60" />
            {currentUserId && (
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() =>
                  router.push(`/web/community/profile/${currentUserId}`)
                }
              >
                Profile
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
              onClick={() => router.push('/web/settings')}
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border/60" />
            <DropdownMenuItem
              className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
              onClick={() => signOut({ callbackUrl: '/web' })}
            >
              <LogOut className="mr-2.5 h-4 w-4 text-muted-foreground" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" asChild>
          <button className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </>
  )
}

export default AppShell
