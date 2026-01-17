export const MIN_COLUMN_WIDTH = 10
export const MAX_AGENT_DEPTH = 10
export const AGENT_CONTENT_HORIZONTAL_PADDING = 12

// Prefers balanced grids (2x2 over 3+1)
export function computeSmartColumns(itemCount: number, maxColumns: number): number {
  if (itemCount === 0) return 1
  if (itemCount <= maxColumns) return itemCount

  // If we can make a perfect grid with maxColumns, do it
  if (itemCount % maxColumns === 0) return maxColumns

  // Special case for 4 items on a 3-column screen: prefer 2x2 over 3+1
  if (itemCount === 4 && maxColumns === 3) return 2

  // Iterate down from maxColumns to find a divisor or better balance
  // We prioritize using more columns (larger width) over perfect balance, unless it's very egregious
  for (let c = maxColumns; c >= 2; c--) {
    // If perfect match (divisor)
    if (itemCount % c === 0) return c
  }

  // Default to max columns if no nice divisor found
  return maxColumns
}
