'use client'

import type { ComponentProps } from 'react'

import { UnifiedNavbar } from './UnifiedNavbar'

/**
 * Landing / marketing nav (home, /cli, /live, 404). Thin wrapper over the
 * shared {@link UnifiedNavbar}: just the brand on the left and the unified
 * product/social/account cluster on the right, tracking window scroll.
 */
export function LandingNavbar(props: ComponentProps<typeof UnifiedNavbar>) {
  return <UnifiedNavbar {...props} />
}
