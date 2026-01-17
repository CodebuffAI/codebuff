import React, { memo, type ReactNode } from 'react'

import { useGridLayout } from '../hooks/use-grid-layout'

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

  // Single column layout
  if (columns === 1) {
    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          width: '100%',
          marginTop,
        }}
      >
        <box style={{ flexDirection: 'column', width: '100%', gap: 0 }}>
          {items.map((item, idx) => (
            <box key={getItemKey(item)} style={{ width: '100%' }}>
              {renderItem(item, idx, availableWidth)}
            </box>
          ))}
        </box>
        {footer}
      </box>
    )
  }

  // Multi-column layout
  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 1,
        width: '100%',
        marginTop,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
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
                minWidth: 0,
              }}
            >
              {columnItems.map((item, idx) => (
                <box key={getItemKey(item)} style={{ minWidth: 0 }}>
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
