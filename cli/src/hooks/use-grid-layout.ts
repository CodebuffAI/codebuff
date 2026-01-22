import { useMemo } from 'react'

import { computeSmartColumns, MIN_COLUMN_WIDTH } from '../utils/layout-helpers'

/**
 * Terminal column width thresholds for responsive grid layout.
 * These are character counts (not pixels) representing terminal width breakpoints:
 * - Below 100 cols: 1 column (narrow terminal)
 * - 100-149 cols: up to 2 columns (medium terminal)
 * - 150-199 cols: up to 3 columns (large terminal)  
 * - 200+ cols: up to 4 columns (extra large terminal)
 */
export const WIDTH_MD_THRESHOLD = 100
export const WIDTH_LG_THRESHOLD = 150
export const WIDTH_XL_THRESHOLD = 200

/** Ordered thresholds for determining max columns based on terminal width */
const WIDTH_THRESHOLDS = [WIDTH_MD_THRESHOLD, WIDTH_LG_THRESHOLD, WIDTH_XL_THRESHOLD] as const

export interface GridLayoutResult<T> {
  columns: number
  columnWidth: number
  columnGroups: T[][]
}

/** Gap between columns in multi-column layout */
const COLUMN_GAP = 1

export function computeGridLayout<T>(
  items: T[],
  availableWidth: number,
): GridLayoutResult<T> {
  // Force single column for very narrow terminals where multi-column wouldn't fit
  const minWidthForTwoColumns = MIN_COLUMN_WIDTH * 2 + COLUMN_GAP
  if (availableWidth < minWidthForTwoColumns) {
    return {
      columns: 1,
      columnWidth: Math.max(1, availableWidth),
      columnGroups: [items],
    }
  }

  // Determine max columns from width thresholds
  const maxColumns = WIDTH_THRESHOLDS.filter(t => availableWidth >= t).length + 1

  const columns = computeSmartColumns(items.length, maxColumns)

  let columnWidth: number
  if (columns === 1) {
    columnWidth = availableWidth
  } else {
    const totalGap = columns - 1
    const rawWidth = Math.floor((availableWidth - totalGap) / columns)
    columnWidth = Math.max(MIN_COLUMN_WIDTH, rawWidth)
  }

  const columnGroups: T[][] = Array.from({ length: columns }, () => [])
  items.forEach((item, idx) => {
    columnGroups[idx % columns].push(item)
  })

  return { columns, columnWidth, columnGroups }
}

export function useGridLayout<T>(
  items: T[],
  availableWidth: number,
): GridLayoutResult<T> {
  return useMemo(
    () => computeGridLayout(items, availableWidth),
    [items, availableWidth],
  )
}
