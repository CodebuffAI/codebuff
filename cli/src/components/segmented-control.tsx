import React, { useState } from 'react'
import stringWidth from 'string-width'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

import type { ChatTheme } from '../types/theme-system'

export interface Segment {
  id: string
  label: string
  isBold?: boolean
  isSelected?: boolean
  defaultHighlighted?: boolean // Highlighted when nothing else is hovered
  disabled?: boolean // Gray out and de-emphasize disabled items
}

/**
 * SegmentedControlProps
 *
 * Renders a bordered segmented toggle. Pure UI; all behavior is driven by
 * the parent via callbacks.
 */
interface SegmentedControlProps {
  segments: Segment[]
  onSegmentClick?: (id: string) => void
  onMouseOver?: () => void
  onMouseOut?: () => void
}

export const SegmentedControl = ({
  segments,
  onSegmentClick,
  onMouseOver,
  onMouseOut,
}: SegmentedControlProps) => {
  const theme = useTheme()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hasHoveredSinceOpen, setHasHoveredSinceOpen] = useState(false)

  const processedSegments = processSegments(
    segments,
    hoveredId,
    hasHoveredSinceOpen,
    theme,
  )
  const hoveredIndex = hoveredId
    ? processedSegments.findIndex((s) => s.id === hoveredId)
    : processedSegments.length - 1

  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 0,
        backgroundColor: 'transparent',
      }}
      onMouseOver={onMouseOver}
      onMouseOut={() => {
        setHoveredId(null)
        onMouseOut && onMouseOut()
      }}
    >
      {/* Segments rendered with dynamic left/right edges based on hover */}
      {processedSegments.map((seg, idx) => {
        const leftOfHovered = idx <= hoveredIndex
        const rightOfHovered = idx >= hoveredIndex

        return (
          <React.Fragment key={seg.id}>
            {leftOfHovered ? (
              <box style={{ flexDirection: 'column', gap: 0 }}>
                <text fg={seg.frameColor} selectable={false}>╭</text>
                <text fg={seg.frameColor} selectable={false}>│</text>
                <text fg={seg.frameColor} selectable={false}>╰</text>
              </box>
            ) : null}

            <Button
              onClick={() => onSegmentClick && onSegmentClick(seg.id)}
              onMouseOver={() => {
                setHoveredId(seg.id)
                setHasHoveredSinceOpen(true)
              }}
              style={{
                flexDirection: 'column',
                gap: 0,
                width: seg.width,
                minWidth: seg.width,
              }}
            >
              <text fg={seg.frameColor}>{seg.topBorder}</text>
              <text fg={seg.textColor}>
                {seg.isItalic ? (
                  <i>{seg.content}</i>
                ) : seg.isBold ? (
                  <b>{seg.content}</b>
                ) : (
                  seg.content
                )}
              </text>
              <text fg={seg.frameColor}>{seg.bottomBorder}</text>
            </Button>

            {rightOfHovered ? (
              <box style={{ flexDirection: 'column', gap: 0 }}>
                <text fg={seg.frameColor} selectable={false}>╮</text>
                <text fg={seg.frameColor} selectable={false}>│</text>
                <text fg={seg.frameColor} selectable={false}>╯</text>
              </box>
            ) : null}
          </React.Fragment>
        )
      })}
    </box>
  )
}

export type ProcessedSegment = {
  id: string
  topBorder: string
  content: string
  bottomBorder: string
  frameColor: string
  leftBorderColor: string
  textColor: string
  isHovered: boolean
  isBold: boolean
  isItalic: boolean
  label: string
  width: number
}

/**
 * Pure function that maps input segments + UI state to render-ready
 * segment descriptors. This is exported for unit testing.
 */
export const processSegments = (
  segments: Segment[],
  hoveredId: string | null,
  hasHoveredSinceOpen: boolean,
  theme: ChatTheme,
): ProcessedSegment[] => {
  return segments.map((seg) => {
    // Normalized flags
    const isDisabled = !!seg.disabled
    const isSelected = !!seg.isSelected
    const defaultHL = !!seg.defaultHighlighted

    // Hover and highlight state
    const canHover = !isSelected || defaultHL
    const isHovered = hoveredId === seg.id && canHover
    const isDefaultHighlighted = defaultHL && !hasHoveredSinceOpen
    const isHighlighted = isHovered || isDefaultHighlighted

    // Emphasis
    const isBold = !!(seg.isBold || isHovered || (isSelected && isHighlighted))

    // Colors
    const frameColor = isHighlighted ? theme.foreground : theme.border
    const textMuted = isDisabled || (isSelected && !isHighlighted)
    const textColor = textMuted ? theme.muted : theme.foreground

    // Content + metrics
    const content = ` ${seg.label} `
    const width = stringWidth(content)
    const horizontal = '─'.repeat(width)

    // Return render-ready descriptor
    // - Computed (complex conditions): frameColor, textColor, isBold
    // - Inlined (simple): isItalic (disabled), leftBorderColor (= frameColor)
    return {
      id: seg.id,
      topBorder: horizontal,
      content,
      bottomBorder: horizontal,
      frameColor,
      leftBorderColor: frameColor,
      textColor,
      isHovered,
      isBold,
      isItalic: isDisabled,
      label: seg.label,
      width,
    }
  })
}
