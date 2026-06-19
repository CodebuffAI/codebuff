'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppShell } from '@/vly/components/app-shell/AppShell'
import { AmbientBackdrop } from '@/vly/components/app-shell/AmbientBackdrop'
// NB: `@/components/*` is aliased to `src/vly/components/*`, so the landing
// footer is imported relatively.
import { CtaFooter } from '../../../components/landing/sections/CtaFooter'

const SUBNAV = [
  { label: 'Featured', href: '/web/community', exact: true },
  { label: 'Explore', href: '/web/community/explore' },
  { label: 'Leaderboard', href: '/web/community/leaderboard' },
]

/**
 * Wraps every community route in the shared {@link AppShell} so navigation
 * is identical to Projects / Pricing / Account, then adds a compact pill
 * sub-nav (Featured / Explore / Leaderboard). Profile and project-detail
 * pages don't match a sub-nav item, which is fine — none appears active.
 */
export function CommunityShell({
  title = 'Community',
  actions,
  children,
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`)

  return (
    <AppShell
      title={title}
      actions={actions}
      ambient={<AmbientBackdrop />}
      footer={<CtaFooter />}
      subnav={
        <div className="flex items-center gap-1 overflow-x-auto pb-2 pt-0.5">
          {SUBNAV.map(({ label, href, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-9 flex-shrink-0 items-center rounded-md px-2 text-sm transition-colors sm:px-3 ${
                  active ? 'text-white' : 'text-white/55 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </div>
      }
    >
      {children}
    </AppShell>
  )
}

export default CommunityShell
