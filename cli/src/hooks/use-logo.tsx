import React, { useMemo } from 'react'

import {
  LOGO,
  LOGO_SMALL,
  SHADOW_CHARS,
  parseLogoLines,
} from '../components/logo-constants'

interface UseLogoOptions {
  /** Available width for rendering the logo */
  availableWidth: number
  /** Optional function to apply styling to each character (e.g., for sheen animation) */
  applySheenToChar?: (
    char: string,
    charIndex: number,
    lineIndex: number,
  ) => React.ReactNode
  /** Color to apply to the text variant */
  textColor?: string
  /** Accent color for shadow/border characters */
  accentColor?: string
  /** Block color for solid block characters */
  blockColor?: string
}

interface LogoResult {
  /** The formatted logo as a React component ready to render in UI */
  component: React.ReactNode
  /** The formatted logo string for plain text contexts */
  textBlock: string
}

export const useLogo = ({
  availableWidth,
  applySheenToChar,
  textColor,
  accentColor = '#9EFC62',
  blockColor = '#ffffff',
}: UseLogoOptions): LogoResult => {
  const rawLogoString = useMemo(() => {
    if (availableWidth >= 70) return LOGO
    if (availableWidth >= 20) return LOGO_SMALL
    return 'OPENBUFF'
  }, [availableWidth])

  const textBlock = useMemo(() => {
    if (rawLogoString === 'OPENBUFF') {
      return ''
    }
    return parseLogoLines(rawLogoString)
      .map((line) => line.slice(0, availableWidth))
      .join('\n')
  }, [rawLogoString, availableWidth])

  const component = useMemo(() => {
    if (rawLogoString === 'OPENBUFF') {
      const brandName = 'Openbuff'
      const displayText = availableWidth < 30 ? brandName : `${brandName} CLI`

      return (
        <text style={{ wrapMode: 'none' }}>
          <b>
            {textColor ? (
              <span fg={textColor}>{displayText}</span>
            ) : (
              <>{displayText}</>
            )}
          </b>
        </text>
      )
    }

    const logoLines = parseLogoLines(rawLogoString)
    const displayLines = logoLines.map((line) => line.slice(0, availableWidth))

    const defaultColorChar = (char: string, charIndex: number) => {
      if (char === ' ' || char === '\n') {
        return <span key={charIndex}>{char}</span>
      }
      if (char === '█') {
        return (
          <span key={charIndex} fg={blockColor}>
            {char}
          </span>
        )
      }
      if (SHADOW_CHARS.has(char)) {
        return (
          <span key={charIndex} fg={accentColor}>
            {char}
          </span>
        )
      }
      return (
        <span key={charIndex} fg={accentColor}>
          {char}
        </span>
      )
    }

    return (
      <>
        {displayLines.map((line, lineIndex) => (
          <text key={`logo-line-${lineIndex}`} style={{ wrapMode: 'none' }}>
            {line
              .split('')
              .map((char, charIndex) =>
                applySheenToChar
                  ? applySheenToChar(char, charIndex, lineIndex)
                  : defaultColorChar(char, charIndex),
              )}
          </text>
        ))}
      </>
    )
  }, [
    rawLogoString,
    availableWidth,
    applySheenToChar,
    textColor,
    accentColor,
    blockColor,
  ])

  return { component, textBlock }
}
