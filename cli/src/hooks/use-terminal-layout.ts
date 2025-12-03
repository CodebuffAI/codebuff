import { useMemo } from 'react'

import { useTerminalDimensions } from './use-terminal-dimensions'

/**
 * Terminal width layout size breakpoints (Tailwind-style naming)
 * - xs: Extra small/narrow terminals (< 80 cols) - minimize UI chrome
 * - sm: Small/standard terminal widths (80-120 cols) - balanced layout
 * - md: Medium/wide terminals (120-160 cols) - extra spacing/features
 * - lg: Large/fullscreen terminals (> 160 cols) - maximum real estate
 */
export type TerminalWidthSize = 'xs' | 'sm' | 'md' | 'lg'

/**
 * Terminal height layout size breakpoints (Tailwind-style naming)
 * - xs: Extra small/short terminals (< 20 rows) - minimize vertical chrome
 * - sm: Small/standard terminal heights (20-40 rows) - balanced layout
 * - md: Medium/tall terminals (> 40 rows) - extra vertical space available
 */
export type TerminalHeightSize = 'xs' | 'sm' | 'md'

// Width breakpoints
export const WIDTH_XS_BREAKPOINT = 50
export const WIDTH_MD_BREAKPOINT = 100
export const WIDTH_LG_BREAKPOINT = 150

// Height breakpoints
export const HEIGHT_XS_BREAKPOINT = 20
export const HEIGHT_MD_BREAKPOINT = 40

/** Ordered list of width sizes from smallest to largest */
const WIDTH_SIZE_ORDER: TerminalWidthSize[] = ['xs', 'sm', 'md', 'lg']

/** Ordered list of height sizes from smallest to largest */
const HEIGHT_SIZE_ORDER: TerminalHeightSize[] = ['xs', 'sm', 'md']

/**
 * Helper object for checking width layout size.
 * Provides type-safe methods that enforce mutual exclusivity.
 */
export interface WidthLayoutHelper {
  /** Current layout size */
  size: TerminalWidthSize
  /** Check if current size exactly matches the given size */
  is: (size: TerminalWidthSize) => boolean
  /** Check if current size is at least the given size (inclusive) */
  atLeast: (size: TerminalWidthSize) => boolean
  /** Check if current size is at most the given size (inclusive) */
  atMost: (size: TerminalWidthSize) => boolean
}

/**
 * Helper object for checking height layout size.
 * Provides type-safe methods that enforce mutual exclusivity.
 */
export interface HeightLayoutHelper {
  /** Current layout size */
  size: TerminalHeightSize
  /** Check if current size exactly matches the given size */
  is: (size: TerminalHeightSize) => boolean
  /** Check if current size is at least the given size (inclusive) */
  atLeast: (size: TerminalHeightSize) => boolean
  /** Check if current size is at most the given size (inclusive) */
  atMost: (size: TerminalHeightSize) => boolean
}

export interface TerminalLayout {
  /** Width layout helper with is/atLeast/atMost methods */
  width: WidthLayoutHelper
  /** Height layout helper with is/atLeast/atMost methods */
  height: HeightLayoutHelper
  /** Raw terminal width in columns */
  terminalWidth: number
  /** Raw terminal height in rows */
  terminalHeight: number
}

/**
 * Create a width layout helper for a given size.
 */
const createWidthHelper = (size: TerminalWidthSize): WidthLayoutHelper => {
  const sizeIndex = WIDTH_SIZE_ORDER.indexOf(size)

  return {
    size,
    is: (targetSize: TerminalWidthSize) => size === targetSize,
    atLeast: (targetSize: TerminalWidthSize) => {
      const targetIndex = WIDTH_SIZE_ORDER.indexOf(targetSize)
      return sizeIndex >= targetIndex
    },
    atMost: (targetSize: TerminalWidthSize) => {
      const targetIndex = WIDTH_SIZE_ORDER.indexOf(targetSize)
      return sizeIndex <= targetIndex
    },
  }
}

/**
 * Create a height layout helper for a given size.
 */
const createHeightHelper = (size: TerminalHeightSize): HeightLayoutHelper => {
  const sizeIndex = HEIGHT_SIZE_ORDER.indexOf(size)

  return {
    size,
    is: (targetSize: TerminalHeightSize) => size === targetSize,
    atLeast: (targetSize: TerminalHeightSize) => {
      const targetIndex = HEIGHT_SIZE_ORDER.indexOf(targetSize)
      return sizeIndex >= targetIndex
    },
    atMost: (targetSize: TerminalHeightSize) => {
      const targetIndex = HEIGHT_SIZE_ORDER.indexOf(targetSize)
      return sizeIndex <= targetIndex
    },
  }
}

/**
 * Determine the width layout size from terminal width.
 */
const getWidthSize = (terminalWidth: number): TerminalWidthSize => {
  if (terminalWidth < WIDTH_XS_BREAKPOINT) {
    return 'xs'
  } else if (terminalWidth > WIDTH_LG_BREAKPOINT) {
    return 'lg'
  } else if (terminalWidth > WIDTH_MD_BREAKPOINT) {
    return 'md'
  } else {
    return 'sm'
  }
}

/**
 * Determine the height layout size from terminal height.
 */
const getHeightSize = (terminalHeight: number): TerminalHeightSize => {
  if (terminalHeight < HEIGHT_XS_BREAKPOINT) {
    return 'xs'
  } else if (terminalHeight > HEIGHT_MD_BREAKPOINT) {
    return 'md'
  } else {
    return 'sm'
  }
}

/**
 * Pure function to compute terminal layout from dimensions.
 * Exported for testing purposes.
 */
export const computeTerminalLayout = (
  terminalWidth: number,
  terminalHeight: number,
): TerminalLayout => {
  const widthSize = getWidthSize(terminalWidth)
  const heightSize = getHeightSize(terminalHeight)

  return {
    width: createWidthHelper(widthSize),
    height: createHeightHelper(heightSize),
    terminalWidth,
    terminalHeight,
  }
}

/**
 * Hook providing semantic terminal layout information.
 * Use this instead of raw dimension checks for responsive terminal UI.
 *
 * @example
 * const { width, height } = useTerminalLayout()
 *
 * // Check exact size
 * if (width.is('xs')) { ... }  // extra small (< 80 cols)
 * if (height.is('xs')) { ... } // extra small (< 20 rows)
 *
 * // Check ranges
 * if (width.atLeast('sm')) { ... }  // sm, md, or lg
 * if (height.atMost('sm')) { ... }  // xs or sm
 */
export const useTerminalLayout = (): TerminalLayout => {
  const { terminalWidth, terminalHeight } = useTerminalDimensions()

  const layout = useMemo(
    () => computeTerminalLayout(terminalWidth, terminalHeight),
    [terminalWidth, terminalHeight],
  )

  return layout
}
