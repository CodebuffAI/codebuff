import React, { useCallback, useMemo, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'

type FormatLinesFn = (text: string, maxWidth?: number) => string[]

export interface TerminalLinkProps {
  text: string
  maxWidth?: number
  formatLines?: FormatLinesFn
  color?: string
  activeColor?: string
  underlineOnHover?: boolean
  isActive?: boolean
  onActivate?: () => void | Promise<any>
  containerStyle?: Record<string, unknown>
  lineWrap?: boolean
  inline?: boolean
}

const defaultFormatLines: FormatLinesFn = (text) => [text]
const PREFIXES_TO_STRIP = ['https://', 'http://']

export const TerminalLink: React.FC<TerminalLinkProps> = ({
  text,
  maxWidth,
  formatLines = defaultFormatLines,
  color,
  activeColor,
  underlineOnHover = true,
  isActive = false,
  onActivate,
  containerStyle,
  lineWrap = false,
  inline = false,
}) => {
  const theme = useTheme()

  // Use theme colors as defaults if not provided
  const linkColor = color ?? theme.info
  const linkActiveColor = activeColor ?? theme.success
  const [isHovered, setIsHovered] = useState(false)

  const displayLines = useMemo(() => {
    let displayText = text.trim()
    for (const prefix of PREFIXES_TO_STRIP) {
      if (displayText.startsWith(prefix)) {
        displayText = displayText.slice(prefix.length)
      }
    }

    const formatted = formatLines(displayText, maxWidth)
    if (formatted.length <= 1) {
      return formatted
    }
    return formatted.filter((line) => line.trim().length > 0)
  }, [formatLines, maxWidth, text])

  const displayColor = isActive ? linkActiveColor : linkColor
  const shouldUnderline = underlineOnHover && isHovered

  const handleActivate = useCallback(() => {
    if (onActivate) {
      onActivate()
    }
  }, [onActivate])

  // For inline mode, render without hover/click support (spans don't support mouse events)
  if (inline) {
    return <span fg={displayColor}>{text}</span>
  }

  return (
    <Button
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        gap: 0,
        ...containerStyle,
      }}
      onMouseOver={() => setIsHovered(true)}
      onMouseOut={() => setIsHovered(false)}
      onClick={handleActivate}
    >
      {displayLines.map((line: string, index: number) => {
        const coloredText = <span fg={displayColor}>{line}</span>
        return (
          <text key={index} style={{ wrapMode: lineWrap ? 'word' : 'none' }}>
            {shouldUnderline ? <u>{coloredText}</u> : coloredText}
          </text>
        )
      })}
    </Button>
  )
}
