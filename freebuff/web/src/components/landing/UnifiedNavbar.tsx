'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Cloud, MessageCircle } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'
import {
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'

import { AccountMenu } from './AccountMenu'
import { GitHubStarLink } from './GitHubStarLink'
import { NavSocialLinks } from './NavSocialLinks'
import { TooltipProvider } from '@/vly/components/ui/tooltip'

type ProductLink = {
  label: string
  href: string
  icon?: ReactNode
  mobileIconOnly?: boolean
  beta?: boolean
}

const PRODUCT_LINKS: ProductLink[] = [
  { label: 'CLI', href: '/cli' },
  { label: 'Web', href: '/web' },
  {
    label: 'Cloud',
    href: '/cloud',
    icon: <Cloud className="h-4 w-4" />,
    mobileIconOnly: true,
    beta: true,
  },
  { label: 'Chat', href: '/chat', icon: <MessageCircle className="h-4 w-4" />, mobileIconOnly: true },
]

/**
 * The single site-wide nav bar. The right cluster (CLI · Web · Chat · GitHub ·
 * Discord · blog · account) is identical on every page so the chrome feels unified;
 * left cluster is a brand mark (always linking home) plus an optional
 * page-specific tab group (`leftNav`). It always overlays the content as a
 * `fixed` bar — transparent at the top of the page/scroll container, fading in
 * a shadow-gradient mask *within its own bounds* as you scroll, restoring on
 * the way up. All scroll-linked properties are transform/opacity only so it
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
  // Fully transparent at the top so content shows through, then fade the
  // gradient mask in on scroll — the mask lives entirely inside the bar's own
  // bounds (`inset-0`), it never extends past its bottom edge.
  const bgOpacity = useTransform(scrollY, [0, 90], [0, 1])

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
      className="lp-gpu fixed inset-x-0 top-0 z-50"
    >
      {/* Shadow gradient mask only — no blur/glass, no border. Confined to
          the header's own box (`inset-0`) so it never bleeds into the
          content below; content scrolls underneath the fixed bar instead. */}
      <motion.div
        aria-hidden
        style={{ opacity: bgOpacity }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/55 to-transparent"
      />

      <motion.div
        style={{ y }}
        className={cn(
          'relative flex min-w-0 items-center justify-between gap-2 sm:gap-3',
          containerClassName ??
            'mx-auto max-w-6xl px-6 py-4 sm:px-10 lg:px-12',
        )}
      >
        {/* Left cluster: brand (→ home) + optional page tabs */}
        <motion.div
          style={{ scale }}
          className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2 lg:gap-3"
        >
          {brand ?? <DefaultBrand />}
          {leftNav}
        </motion.div>

        {/* Right cluster: unified product links · socials · account */}
        <motion.div
          style={{ scale }}
          className="flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3"
        >
          <TooltipProvider delayDuration={200}>
            {rightExtras}
            <ProductLinks
              className={hideRightOnMobile ? 'hidden sm:flex' : 'flex'}
              trailing={
                <GitHubStarLink hideOnMobile className="ml-1 sm:ml-2" />
              }
            />

            {/* Divider + socials are supplementary — hidden on mobile so the
                brand/logo never gets squeezed by a crowded right cluster. */}
            <span className="mx-1 hidden h-4 w-px bg-white/15 sm:mx-2 sm:block" />

            <NavSocialLinks hideOnMobile />
          </TooltipProvider>

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

function ProductLinks({
  className,
  trailing,
}: {
  className?: string
  trailing?: ReactNode
}) {
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
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2 text-[13px] transition-colors sm:px-2 lg:px-3 lg:text-sm',
            isActive(link.href)
              ? 'text-white'
              : 'text-white/55 hover:text-white',
          )}
          aria-label={link.mobileIconOnly ? link.label : undefined}
        >
          {link.icon && (
            <span className={link.mobileIconOnly ? 'sm:hidden' : ''}>
              {link.icon}
            </span>
          )}
          <span className={link.mobileIconOnly ? 'hidden sm:inline' : ''}>
            {link.label}
          </span>
          {link.beta && (
            <span className="hidden rounded-full bg-white/10 px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-white/60 sm:inline-block">
              beta
            </span>
          )}
        </Link>
      ))}
      {trailing}
    </nav>
  )
}

function DefaultBrand() {
  return (
    <Link
      href="/"
      className="group flex flex-shrink-0 items-center gap-2.5 opacity-65 transition-opacity duration-200 hover:opacity-100"
    >
      <Image
        src="/logo-icon.png"
        alt="Freebuff"
        width={24}
        height={24}
        className="h-6 w-6 flex-shrink-0 rounded-[5px]"
      />
      <span className="hidden lp-serif text-lg tracking-wide text-white/85 transition-colors group-hover:text-white sm:inline">
        freebuff
      </span>
    </Link>
  )
}
