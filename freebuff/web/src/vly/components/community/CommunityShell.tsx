'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Star, Trophy } from 'lucide-react'
import { AppShell } from '@/vly/components/app-shell/AppShell'
import { AmbientBackdrop } from '@/vly/components/app-shell/AmbientBackdrop'
// NB: `@/components/*` is aliased to `src/vly/components/*`, so the landing
// footer is imported relatively.
import { CtaFooter } from '../../../components/landing/sections/CtaFooter'

const SUBNAV = [
  { label: 'Featured', href: '/web/community', Icon: Star, exact: true },
  { label: 'Explore', href: '/web/community/explore', Icon: Compass },
  { label: 'Leaderboard', href: '/web/community/leaderboard', Icon: Trophy },
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
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 pt-0.5">
          {SUBNAV.map(({ label, href, Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" />
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
