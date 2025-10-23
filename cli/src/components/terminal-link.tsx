import React, { useCallback, useMemo, useState } from 'react'

type FormatLinesFn = (text: string, maxWidth?: number) => string[]

export interface TerminalLinkProps {
  text: string
  maxWidth?: number
  formatLines?: FormatLinesFn
  color?: string
  activeColor?: string
  underlineOnHover?: boolean
  isActive?: boolean
  onActivate?: () => void | Promise<void>
  containerStyle?: Record<string, unknown>
  lineWrap?: boolean
}

const defaultFormatLines: FormatLinesFn = (text) => [text]

export const TerminalLink: React.FC<TerminalLinkProps> = ({
  text,
  maxWidth,
  formatLines = defaultFormatLines,
  color = '#3b82f6',
  activeColor = '#22c55e',
  underlineOnHover = true,
  isActive = false,
  onActivate,
  containerStyle,
  lineWrap = false,
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const displayLines = useMemo(() => {
    const formatted = formatLines(text, maxWidth)
    if (formatted.length <= 1) {
      return formatted
    }
    return formatted.filter((line) => line.trim().length > 0)
  }, [formatLines, maxWidth, text])

  const displayColor = isActive ? activeColor : color
  const shouldUnderline = underlineOnHover && isHovered

  const handleActivate = useCallback(() => {
    if (onActivate) {
      void onActivate()
    }
  }, [onActivate])

  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        gap: 0,
        ...containerStyle,
      }}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
      onMouseDown={handleActivate}
    >
      {displayLines.map((line, index) => (
        <text key={index} wrap={lineWrap}>
          {shouldUnderline ? (
            <u>
              <span fg={displayColor}>{line}</span>
            </u>
          ) : (
            <span fg={displayColor}>{line}</span>
          )}
        </text>
      ))}
    </box>
  )
}
