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
  LogOut,
  Menu,
  X,
  MessageCircle,
  ChevronDown,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
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
 * Projects, Community, Account. Uses a persistent sidebar on
 * desktop and a slide-out drawer on mobile so navigation feels identical to
 * the project page + settings dashboard — minimal, borderless, dark.
 */
export function AppShell({
  title,
  subtitle,
  actions,
  subnav,
  children,
  /** When false the main area won't scroll (children manage their own). */
  scroll = true,
  contentClassName = '',
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  subnav?: React.ReactNode
  children: React.ReactNode
  scroll?: boolean
  contentClassName?: string
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isActive = useIsActive()

  return (
    // `fixed inset-0` so the shell fully owns the viewport and covers the
    // global site footer rendered by the root layout — the app surface
    // should feel self-contained (same approach as the project page).
    <div className="fixed inset-0 z-10 flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden h-full w-60 flex-shrink-0 flex-col bg-card/30 lg:flex">
        <SidebarContent isActive={isActive} />
      </aside>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col bg-card shadow-2xl shadow-black/50 transition-transform duration-300 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent
          isActive={isActive}
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
        />
      </aside>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header strip */}
        <header className="flex h-14 flex-shrink-0 items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Mobile inline logo so the brand is always present */}
          <Link href="/web" className="flex items-center lg:hidden" aria-label="Freebuff home">
            <FreebuffLogo size={28} />
          </Link>

          <div className="ml-1 flex min-w-0 flex-1 flex-col justify-center">
            {title && (
              <h1 className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>

          {actions && (
            <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>

        {/* Optional sub-navigation (e.g. Community tabs) */}
        {subnav && (
          <div className="flex-shrink-0 px-3 sm:px-5">{subnav}</div>
        )}

        {/* Body */}
        <main
          className={`min-h-0 flex-1 ${scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'} ${contentClassName}`}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarContent({
  isActive,
  onNavigate,
  onClose,
}: {
  isActive: (item: AppShellNavItem) => boolean
  onNavigate?: () => void
  onClose?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/web"
          onClick={onNavigate}
          className="flex items-center gap-2.5"
          aria-label="Freebuff home"
        >
          <FreebuffLogo size={30} />
          <span className="font-['Geist'] text-sm font-semibold tracking-tight text-foreground">
            Freebuff Web
          </span>
          <BetaBadge />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-muted/70 font-medium text-foreground'
                    : 'text-foreground/75 hover:bg-muted/40 hover:text-foreground'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <item.Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>

        <div className="my-3 h-px bg-border/50" />

        <a
          href="https://discord.gg/yXG3w7wxfs"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground/75 transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <MessageCircle className="h-[18px] w-[18px] flex-shrink-0" />
          Discord
        </a>
      </nav>

      {/* User block */}
      <div className="p-3">
        <UserBlock onNavigate={onNavigate} />
      </div>
    </div>
  )
}

function UserBlock({ onNavigate }: { onNavigate?: () => void }) {
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
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {userName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {userEmail}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            sideOffset={6}
            className="w-56 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-2xl shadow-black/40"
          >
            {currentUserId && (
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
                onClick={() => {
                  onNavigate?.()
                  router.push(`/web/community/profile/${currentUserId}`)
                }}
              >
                Profile
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="cursor-pointer rounded-md px-2.5 py-2 text-sm text-foreground/90 focus:bg-muted focus:text-foreground"
              onClick={() => {
                onNavigate?.()
                router.push('/web/settings')
              }}
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
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </>
  )
}

export default AppShell
