/**
 * Hook for determining responsive layout mode based on terminal width
 */

import { useMemo } from 'react'

import { LAYOUT_BREAKPOINTS } from '../constants'

import type { LayoutMode } from '../types'

/**
 * Determine layout mode based on terminal width
 */
export function useLayoutMode(width: number): LayoutMode {
  return useMemo(() => {
    if (width >= LAYOUT_BREAKPOINTS.SPACIOUS) {
      return 'spacious'
    }
    if (width >= LAYOUT_BREAKPOINTS.COMFORTABLE) {
      return 'comfortable'
    }
    return 'compact'
  }, [width])
}

/**
 * Check if we have room for inline buttons
 */
export function useHasRoomForInlineButtons(width: number): boolean {
  return useMemo(() => {
    return width >= LAYOUT_BREAKPOINTS.COMFORTABLE
  }, [width])
}
