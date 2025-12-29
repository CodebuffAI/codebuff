/**
 * SelectableList - A reusable list component with keyboard navigation and hover support
 *
 * Features:
 * - Keyboard navigation (controlled by parent via focusedIndex)
 * - Hover highlighting
 * - Scrollbox with configurable height
 * - Theme-aware highlighting (theme.primary background when focused/hovered)
 */

import { TextAttributes } from '@opentui/core'
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

import type { ScrollBoxRenderable } from '@opentui/core'

export interface SelectableListItem {
  id: string
  label: string
  icon?: string
  secondary?: string
  /** If true, the label will be displayed in an accent color */
  accent?: boolean
}

export interface SelectableListProps {
  items: SelectableListItem[]
  focusedIndex: number
  /** Optional max height - if not provided, list fills available space */
  maxHeight?: number
  onSelect: (item: SelectableListItem, index: number) => void
  onFocusChange?: (index: number) => void
  emptyMessage?: string
}

export interface SelectableListHandle {
  scrollToFocused: () => void
}

export const SelectableList = forwardRef<
  SelectableListHandle,
  SelectableListProps
>(
  (
    { items, focusedIndex, maxHeight, onSelect, onFocusChange, emptyMessage = 'No items' },
    ref,
  ) => {
    const theme = useTheme()
    const scrollRef = useRef<ScrollBoxRenderable | null>(null)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    const scrollToIndex = useCallback(
      (index: number) => {
        const scrollbox = scrollRef.current
        if (!scrollbox || items.length === 0) return

        const itemHeight = 1
        const focusedTop = index * itemHeight
        const focusedBottom = focusedTop + itemHeight

        const viewportHeight = scrollbox.viewport.height
        const currentScroll = scrollbox.scrollTop

        if (focusedTop < currentScroll) {
          scrollbox.scrollTop = focusedTop
        } else if (focusedBottom > currentScroll + viewportHeight) {
          scrollbox.scrollTop = focusedBottom - viewportHeight
        }
      },
      [items.length],
    )

    // Expose scroll method to parent
    useImperativeHandle(
      ref,
      () => ({
        scrollToFocused: () => {
          scrollToIndex(focusedIndex)
        },
      }),
      [focusedIndex, scrollToIndex],
    )

    // Auto-scroll when focusedIndex changes and clear hover state
    useEffect(() => {
      scrollToIndex(focusedIndex)
      // Clear hover state when keyboard navigation happens
      setHoveredIndex(null)
    }, [focusedIndex, scrollToIndex])

    if (items.length === 0) {
      return (
        <box style={{ paddingLeft: 1, paddingTop: 1 }}>
          <text style={{ fg: theme.muted }}>{emptyMessage}</text>
        </box>
      )
    }

    return (
      <scrollbox
        ref={scrollRef}
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: { width: 1 },
        }}
        style={{
          height: maxHeight ?? '100%',
          flexGrow: maxHeight ? 0 : 1,
          rootOptions: {
            flexDirection: 'row',
            backgroundColor: 'transparent',
          },
          wrapperOptions: {
            border: false,
            backgroundColor: 'transparent',
            flexDirection: 'column',
          },
          contentOptions: {
            flexDirection: 'column',
            gap: 0,
            backgroundColor: 'transparent',
          },
        }}
      >
        {items.map((item, idx) => {
          const isFocused = idx === focusedIndex
          const isHovered = idx === hoveredIndex
          const isHighlighted = isFocused || isHovered

          // Use subtle highlight that works in both light and dark themes
          const backgroundColor = isHighlighted ? theme.surfaceHover : 'transparent'
          const textColor = isHighlighted ? theme.foreground : theme.muted
          const textAttributes = isHighlighted ? TextAttributes.BOLD : undefined

          return (
            <Button
              key={item.id}
              onClick={() => onSelect(item, idx)}
              onMouseOver={() => {
                setHoveredIndex(idx)
                onFocusChange?.(idx)
              }}
              onMouseOut={() => {
                if (hoveredIndex === idx) {
                  setHoveredIndex(null)
                }
              }}
              style={{
                flexDirection: 'row',
                gap: 1,
                backgroundColor,
                paddingLeft: 1,
                paddingRight: 1,
                paddingTop: 0,
                paddingBottom: 0,
              }}
            >
              {item.icon && (
                <text style={{ fg: isHighlighted ? theme.foreground : theme.muted }}>
                  {item.icon}
                </text>
              )}
              <text
                style={{
                  fg: item.accent && !isHighlighted ? theme.primary : textColor,
                  attributes: item.accent || isHighlighted ? TextAttributes.BOLD : undefined,
                }}
              >
                {item.label}
              </text>
              {item.secondary && (
                <text style={{ fg: theme.muted }}>
                  {item.secondary}
                </text>
              )}
            </Button>
          )
        })}
      </scrollbox>
    )
  },
)

SelectableList.displayName = 'SelectableList'
