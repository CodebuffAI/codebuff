import React from 'react'
import stringWidth from 'string-width'

type PillSegment = {
  text: string
  fg?: string
  attr?: number
}

interface RaisedPillProps {
  segments: PillSegment[]
  frameColor: string
  textColor: string
  fillColor?: string
  padding?: number
  onPress?: () => void
  style?: Record<string, unknown>
}

const buildHorizontal = (length: number): string => {
  if (length <= 0) return ''
  return '─'.repeat(length)
}

export const RaisedPill = ({
  segments,
  frameColor,
  textColor,
  fillColor,
  padding = 2,
  onPress,
  style,
}: RaisedPillProps): React.ReactNode => {
  const leftRightPadding =
    padding > 0
      ? [{ text: ' '.repeat(padding), fg: textColor }]
      : []

  const normalizedSegments: Array<{
    text: string
    fg?: string
    attr?: number
  }> = [
    ...leftRightPadding,
    ...segments.map((segment) => ({
      text: segment.text,
      fg: segment.fg ?? textColor,
      attr: segment.attr,
    })),
    ...leftRightPadding,
  ]

  const contentText = normalizedSegments.map((segment) => segment.text).join('')
  const contentWidth = Math.max(0, stringWidth(contentText))
  const horizontal = buildHorizontal(contentWidth)

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        backgroundColor: 'transparent',
        ...style,
      }}
      onMouseDown={onPress}
    >
      <text>
        <span fg={frameColor}>{`╭${horizontal}╮`}</span>
      </text>
      <text>
        <span fg={frameColor}>
          │
        </span>
        {normalizedSegments.map((segment, idx) => (
          <span
            key={idx}
            fg={segment.fg}
            bg={fillColor ?? 'transparent'}
            attributes={segment.attr}
          >
            {segment.text}
          </span>
        ))}
        <span fg={frameColor}>
          │
        </span>
      </text>
      <text>
        <span fg={frameColor}>{`╰${horizontal}╯`}</span>
      </text>
    </box>
  )
}
