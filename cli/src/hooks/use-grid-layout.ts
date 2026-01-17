import { useMemo } from 'react'

import { computeSmartColumns, MIN_COLUMN_WIDTH } from '../utils/layout-helpers'

export const WIDTH_MD_THRESHOLD = 100
export const WIDTH_LG_THRESHOLD = 150
export const WIDTH_XL_THRESHOLD = 200

const WIDTH_THRESHOLDS = [WIDTH_MD_THRESHOLD, WIDTH_LG_THRESHOLD, WIDTH_XL_THRESHOLD] as const

export interface GridLayoutResult<T> {
  columns: number
  columnWidth: number
  columnGroups: T[][]
}

export function computeGridLayout<T>(
  items: T[],
  availableWidth: number,
): GridLayoutResult<T> {
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
