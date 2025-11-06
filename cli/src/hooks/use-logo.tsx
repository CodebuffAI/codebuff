import React, { useMemo } from 'react'
import { LOGO, LOGO_SMALL } from '../login/constants'
import { parseLogoLines } from '../login/utils'

interface UseLogoOptions {
  /**
   * Available width for rendering the logo
   */
  availableWidth: number
  /**
   * Optional function to apply styling to each character (e.g., for sheen animation)
   */
  applySheenToChar?: (char: string, charIndex: number, lineIndex: number) => React.ReactNode
  /**
   * Color to apply to the text variant
   */
  textColor?: string
}

interface LogoResult {
  /**
   * The formatted logo as a React component ready to render in UI
   */
  component: React.ReactNode
  /**
   * The formatted logo string for plain text contexts (e.g., chat messages)
   * Empty string for narrow widths, formatted ASCII art otherwise
   */
  textBlock: string
}

/**
 * Hook to render a logo based on available width
 * Returns a fully formatted React component and text block that "just work"
 *
 * Returns:
 * - Full ASCII logo for width >= 70
 * - Small ASCII logo for width >= 40
 * - Text variant "CODEBUFF" or "Codebuff CLI" for narrow widths
 *
 * The hook handles ALL formatting internally including:
 * - Line parsing and width limiting
 * - Optional character-level styling (sheen animation) for React component
 * - Text wrapping and block formatting for plain text contexts
 * - No consumer needs to know about parseLogoLines, split, join, etc.
 */
export const useLogo = ({
  availableWidth,
  applySheenToChar,
  textColor,
}: UseLogoOptions): LogoResult => {
  const rawLogoString = useMemo(() => {
    if (availableWidth >= 70) return LOGO
    if (availableWidth >= 20) return LOGO_SMALL
    return 'CODEBUFF'
  }, [availableWidth])

  // Format text block for plain text contexts (chat messages, etc.)
  const textBlock = useMemo(() => {
    if (rawLogoString === 'CODEBUFF') {
      return '' // Don't show ASCII art for text-only variant in plain text contexts
    }
    // Parse and format for plain text display
    return parseLogoLines(rawLogoString)
      .map((line) => line.slice(0, availableWidth))
      .join('\n')
  }, [rawLogoString, availableWidth])

  // Format component for React contexts (login modal, etc.)
  const component = useMemo(() => {
    // Text-only variant for very narrow widths
    if (rawLogoString === 'CODEBUFF') {
      // Show shorter "Codebuff" for very narrow widths (< 30), otherwise "Codebuff CLI"
      const displayText = availableWidth < 30 ? 'Codebuff' : 'Codebuff CLI'

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

    // ASCII art variant
    const logoLines = parseLogoLines(rawLogoString)
    const displayLines = logoLines.map((line) => line.slice(0, availableWidth))

    return (
      <>
        {displayLines.map((line, lineIndex) => (
          <text key={`logo-line-${lineIndex}`} style={{ wrapMode: 'none' }}>
            {applySheenToChar
              ? line
                  .split('')
                  .map((char, charIndex) =>
                    applySheenToChar(char, charIndex, lineIndex),
                  )
              : line}
          </text>
        ))}
      </>
    )
  }, [rawLogoString, availableWidth, applySheenToChar, textColor])

  return { component, textBlock }
}
