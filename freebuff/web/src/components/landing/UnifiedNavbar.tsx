'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'
import {
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'

import { AccountMenu } from './AccountMenu'
import { DiscordIcon, GitHubIcon } from './icons'

const PRODUCT_LINKS = [
  { label: 'CLI', href: '/cli' },
  { label: 'Web', href: '/web' },
  { label: 'Chat', href: '/chat' },
]

const DISCORD_URL = 'https://discord.gg/yXG3w7wxfs'
const GITHUB_URL = 'https://github.com/CodebuffAI/codebuff'

/**
 * The single site-wide nav bar. The right cluster (CLI · Web · Chat · Discord ·
 * GitHub · account) is identical on every page so the chrome feels unified; the
 * left cluster is a brand mark (always linking home) plus an optional
 * page-specific tab group (`leftNav`). It scrubs with scroll exactly like the
 * landing hero: compacts + reveals a shadow gradient on the way down, restores
 * on the way up. All scroll-linked properties are transform/opacity only so it
 * stays on the compositor.
 *
 * `scrollContainerRef` lets surfaces whose content scrolls inside an inner
 * element (e.g. the /web AppShell `<main>`) drive the same animation; omit it to
 * track the window (landing / cli).
 */
export function UnifiedNavbar({
  brand,
  leftNav,
  rightExtras,
  mobileTrigger,
  sticky = true,
  showSignIn = false,
  hideRightOnMobile = false,
  scrollContainerRef,
  containerClassName,
}: {
  brand?: ReactNode
  leftNav?: ReactNode
  /** Page-specific controls rendered at the start of the right cluster. */
  rightExtras?: ReactNode
  /** Mobile-only control (e.g. a hamburger) shown at the far right under sm. */
  mobileTrigger?: ReactNode
  /** When true the bar is `fixed` and overlays content (landing/cli/chat). */
  sticky?: boolean
  /** Render a Sign in button (right cluster) when signed out. */
  showSignIn?: boolean
  /**
   * Hide the product links + social icons under `sm` (used on surfaces that
   * already have a mobile menu / sidebar trigger so the bar doesn't crowd).
   */
  hideRightOnMobile?: boolean
  scrollContainerRef?: RefObject<HTMLElement | null>
  containerClassName?: string
}) {
  const { scrollY } = useScroll(
    scrollContainerRef
      ? { container: scrollContainerRef as RefObject<HTMLElement> }
      : undefined,
  )

  const y = useTransform(scrollY, [0, 90], [0, -7])
  const scale = useTransform(scrollY, [0, 90], [1, 0.9])
  const bgOpacity = useTransform(scrollY, [0, 90], [0, 1])

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      className={cn(
        'lp-gpu z-50',
        sticky ? 'fixed inset-x-0 top-0' : 'relative flex-shrink-0',
      )}
    >
      {/* Shadow gradient mask only — no blur/glass, no border */}
      <motion.div
        aria-hidden
        style={{ opacity: bgOpacity }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/55 to-transparent"
      />

      <motion.div
        style={{ y }}
        className={cn(
          'relative flex items-center justify-between gap-3',
          containerClassName ??
            'mx-auto max-w-6xl px-6 py-4 sm:px-10 lg:px-12',
        )}
      >
        {/* Left cluster: brand (→ home) + optional page tabs */}
        <motion.div
          style={{ scale }}
          className="flex min-w-0 origin-left items-center gap-1.5 sm:gap-3"
        >
          {brand ?? <DefaultBrand />}
          {leftNav}
        </motion.div>

        {/* Right cluster: unified product links · socials · account */}
        <motion.div
          style={{ scale }}
          className="flex flex-shrink-0 origin-right items-center gap-1 sm:gap-2"
        >
          {rightExtras}
          <ProductLinks
            className={hideRightOnMobile ? 'hidden sm:flex' : 'flex'}
          />

          <span
            className={cn(
              'mx-0.5 h-4 w-px bg-white/15 sm:mx-1',
              hideRightOnMobile ? 'hidden sm:block' : 'block',
            )}
          />

          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className={cn(
              'items-center rounded-md p-2 text-white/50 transition-colors hover:text-white',
              hideRightOnMobile ? 'hidden sm:flex' : 'flex',
            )}
          >
            <DiscordIcon className="h-[18px] w-[18px]" />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className={cn(
              'items-center rounded-md p-2 text-white/50 transition-colors hover:text-white',
              hideRightOnMobile ? 'hidden sm:flex' : 'flex',
            )}
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>

          <AccountMenu />
          {showSignIn && (
            <SignedOut>
              <SignInButton mode="modal" asChild>
                <button className="flex items-center justify-center rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/15">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
          )}

          {mobileTrigger}
        </motion.div>
      </motion.div>
    </motion.header>
  )
}

function ProductLinks({ className }: { className?: string }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`)

  return (
    <nav className={cn('items-center', className ?? 'flex')}>
      {PRODUCT_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href) ? 'page' : undefined}
          className={cn(
            'rounded-md px-2 py-2 text-[13px] transition-colors sm:px-3 sm:text-sm',
            isActive(link.href)
              ? 'text-white'
              : 'text-white/55 hover:text-white',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

function DefaultBrand() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 opacity-65 transition-opacity duration-200 hover:opacity-100"
    >
      <Image
        src="/logo-icon.png"
        alt="Freebuff"
        width={24}
        height={24}
        className="h-6 w-6 rounded-[5px]"
      />
      <span className="hidden lp-serif text-lg tracking-wide text-white/85 transition-colors group-hover:text-white sm:inline">
        freebuff
      </span>
    </Link>
  )
}
