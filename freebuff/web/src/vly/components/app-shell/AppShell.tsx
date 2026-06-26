'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Cloud, Menu, X } from 'lucide-react'
import { cn } from '@/vly/lib/utils'
// NB: `@/components/*` is aliased to `src/vly/components/*`, so the shared
// landing nav is imported relatively.
import { UnifiedNavbar } from '../../../components/landing/UnifiedNavbar'
import { FreebuffLogo } from './FreebuffLogo'
import { BetaBadge } from './BetaBadge'

export interface AppShellNavItem {
  label: string
  href: string
  /** Match exactly instead of prefix (used for the "/web" home item). */
  exact?: boolean
  badge?: React.ReactNode
  mobileIcon?: React.ReactNode
}

const NAV_ITEMS: AppShellNavItem[] = [
  { label: 'Projects', href: '/web', exact: true },
  {
    label: 'Cloud',
    href: '/cloud',
    badge: (
      <span className="ml-1.5 rounded-full border border-forest-bright/25 px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none text-forest-bright/90">
        beta
      </span>
    ),
    mobileIcon: <Cloud className="h-4 w-4" />,
  },
  { label: 'Community', href: '/web/community' },
  { label: 'Referrals', href: '/web/referrals' },
  { label: 'Settings', href: '/web/settings' },
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
  /** Optional footer rendered at the end of the scrollable content area. */
  footer,
  brandName = 'Freebuff Web',
  brandHref = '/',
  brandBadge,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  subnav?: React.ReactNode
  children: React.ReactNode
  scroll?: boolean
  contentClassName?: string
  ambient?: React.ReactNode
  footer?: React.ReactNode
  brandName?: string
  brandHref?: string
  brandBadge?: React.ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isActive = useIsActive()
  const mainRef = useRef<HTMLElement>(null)

  const desktopTabs = (
    <nav className="ml-1 hidden items-center sm:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-2 py-2 text-[13px] transition-colors sm:px-3 sm:text-sm',
              active ? 'text-white' : 'text-white/55 hover:text-white',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <span className="inline-flex items-center">
              {item.label}
              {item.badge}
            </span>
          </Link>
        )
      })}
    </nav>
  )

  const brand = (
    <Link
      href={brandHref}
      className="flex flex-shrink-0 items-center gap-2"
      aria-label={`${brandName} home`}
    >
      <FreebuffLogo size={28} />
      <span className="hidden font-['Geist'] text-sm font-semibold tracking-tight text-white sm:inline">
        {brandName}
      </span>
      {brandBadge ?? <BetaBadge />}
    </Link>
  )

  const mobileTrigger = (
    <button
      type="button"
      onClick={() => setMenuOpen((v) => !v)}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
      aria-label="Toggle navigation"
      aria-expanded={menuOpen}
    >
      {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  )

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
      {/* ── Top navigation bar (shared, unified) ─────────────────────── */}
      <div className="relative z-30 flex-shrink-0">
        <UnifiedNavbar
          sticky={false}
          showSignIn
          hideRightOnMobile
          scrollContainerRef={mainRef}
          containerClassName="px-3 py-2.5 sm:px-5"
          brand={brand}
          leftNav={desktopTabs}
          rightExtras={actions}
          mobileTrigger={mobileTrigger}
        />
      </div>

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
                  'rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'text-white' : 'text-white/55 hover:text-white',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span className="inline-flex items-center gap-2">
                  {item.mobileIcon}
                  <span>{item.label}</span>
                  {item.badge}
                </span>
              </Link>
            )
          })}
          <div className="my-1 h-px bg-white/10" />
          {[
            { label: 'CLI', href: '/cli' },
            { label: 'Web', href: '/web' },
            { label: 'Cloud', href: '/cloud' },
            { label: 'Chat', href: '/chat' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white"
          >
            Discord
          </a>
        </div>
      )}

      {/* Optional sub-navigation (e.g. Community tabs) */}
      {subnav && <div className="relative z-20 flex-shrink-0 px-3 sm:px-5">{subnav}</div>}

      {/* Body */}
      <main
        ref={mainRef}
        className={cn(
          'relative z-10 min-h-0 flex-1',
          scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden',
          contentClassName,
        )}
      >
        {children}
        {footer}
      </main>
    </div>
  )
}

export default AppShell
