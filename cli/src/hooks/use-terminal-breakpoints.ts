import { useRenderer } from '@opentui/react'
import { useMemo } from 'react'

import {
  HEIGHT_MD_BREAKPOINT,
  HEIGHT_XS_BREAKPOINT,
  WIDTH_MD_BREAKPOINT,
  WIDTH_XS_BREAKPOINT,
} from './use-terminal-layout'

export interface TerminalBreakpoints {
  // Width-based
  width: number
  isNarrow: boolean // < 60 cols
  isMediumWidth: boolean // >= 60 && < 100
  isWide: boolean // >= 100 cols

  // Height-based
  height: number
  isVerySmall: boolean // < 15 rows (minimal UI)
  isSmall: boolean // >= 15 && < 20 rows (compact UI)
  isMedium: boolean // >= 20 && < 30 rows (standard UI)
  isLarge: boolean // >= 30 rows (spacious UI)
  isTall: boolean // >= 20 rows (alias for backward compatibility)
}

const WIDTH_BREAKPOINTS = {
  narrow: WIDTH_XS_BREAKPOINT,
  mediumWidth: WIDTH_MD_BREAKPOINT,
} as const

const HEIGHT_BREAKPOINTS = {
  verySmall: 15,
  small: HEIGHT_XS_BREAKPOINT,
  medium: HEIGHT_MD_BREAKPOINT,
} as const

/**
 * Hook to get responsive breakpoints based on terminal dimensions.
 * Similar to useMediaQuery in web apps, but for terminal-based UIs.
 *
 * @returns Object with terminal dimensions and boolean breakpoint flags
 *
 * @example
 * const { isNarrow, isVerySmall, width, height } = useTerminalBreakpoints()
 *
 * // Use breakpoints for conditional rendering
 * {isNarrow && <CompactView />}
 * {!isNarrow && <FullView />}
 *
 * // Use dimensions for calculations
 * const maxWidth = Math.min(width - 10, 100)
 */
export const useTerminalBreakpoints = (): TerminalBreakpoints => {
  const renderer = useRenderer()

  return useMemo(() => {
    const width = renderer?.width || 80
    const height = renderer?.height || 24

    return {
      width,
      height,

      // Width breakpoints
      isNarrow: width < WIDTH_BREAKPOINTS.narrow,
      isMediumWidth:
        width >= WIDTH_BREAKPOINTS.narrow &&
        width < WIDTH_BREAKPOINTS.mediumWidth,
      isWide: width >= WIDTH_BREAKPOINTS.mediumWidth,

      // Height breakpoints
      isVerySmall: height < HEIGHT_BREAKPOINTS.verySmall,
      isSmall:
        height >= HEIGHT_BREAKPOINTS.verySmall &&
        height < HEIGHT_BREAKPOINTS.small,
      isMedium:
        height >= HEIGHT_BREAKPOINTS.small &&
        height < HEIGHT_BREAKPOINTS.medium,
      isLarge: height >= HEIGHT_BREAKPOINTS.medium,
      isTall: height >= HEIGHT_BREAKPOINTS.small, // Alias for backward compatibility
    }
  }, [renderer?.width, renderer?.height])
}
