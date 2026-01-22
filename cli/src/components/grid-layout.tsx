import React, { memo, type ReactNode } from 'react'

import { useGridLayout } from '../hooks/use-grid-layout'
import { MIN_COLUMN_WIDTH } from '../utils/layout-helpers'

export interface GridLayoutProps<T> {
  items: T[]
  availableWidth: number
  getItemKey: (item: T) => string
  renderItem: (item: T, index: number, columnWidth: number) => ReactNode
  footer?: ReactNode
  marginTop?: number
}

function GridLayoutInner<T>({
  items,
  availableWidth,
  getItemKey,
  renderItem,
  footer,
  marginTop = 0,
}: GridLayoutProps<T>): ReactNode {
  const { columns, columnWidth, columnGroups } = useGridLayout(items, availableWidth)

  if (items.length === 0) return null

  // Unified structure for both single and multi-column layouts
  // Using a consistent DOM structure prevents reconciliation issues during resize transitions
  const isMultiColumn = columns > 1

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: isMultiColumn ? 1 : 0,
        width: '100%',
        marginTop,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          gap: isMultiColumn ? 1 : 0,
          width: '100%',
          alignItems: 'flex-start',
        }}
      >
        {columnGroups.map((columnItems, colIdx) => {
          const columnKey = columnItems[0]
            ? getItemKey(columnItems[0])
            : `col-${colIdx}`
          return (
            <box
              key={columnKey}
              style={{
                flexDirection: 'column',
                gap: 0,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                // Use MIN_COLUMN_WIDTH instead of 0 to prevent columns from collapsing
                // to zero during resize transitions (prevents 2→1 column transition bug)
                minWidth: MIN_COLUMN_WIDTH,
              }}
            >
              {columnItems.map((item, idx) => (
                <box key={getItemKey(item)} style={{ width: '100%' }}>
                  {renderItem(item, idx, columnWidth)}
                </box>
              ))}
            </box>
          )
        })}
      </box>
      {footer}
    </box>
  )
}

export const GridLayout = memo(GridLayoutInner) as typeof GridLayoutInner
