import React, { useEffect, useMemo, useState } from 'react'

import { LOGO, LOGO_SMALL, SHADOW_CHARS } from '../login/constants'
import { parseLogoLines } from '../login/utils'
import { IS_FREEBUFF } from '../utils/constants'
import { useTheme } from './use-theme'

const SUBTITLE_SHIMMER_STEPS = 10
const SUBTITLE_SHIMMER_INTERVAL_MS = 180
const SUBTITLE_SHIMMER_COLORS = {
  dark: { base: '#9EFC62', bright: '#CCFF99', peak: '#ffffff' },
  light: { base: '#65A83E', bright: '#88D458', peak: '#ffffff' },
} as const

interface UseLogoOptions {
  /**
   * Available width for rendering the logo
   */
  availableWidth: number
  /**
   * Optional function to apply styling to each character (e.g., for sheen animation)
   * If not provided, default coloring is applied (white blocks, accent shadows)
   */
  applySheenToChar?: (char: string, charIndex: number, lineIndex: number) => React.ReactNode
  /**
   * Color to apply to the text variant
   */
  textColor?: string
  /**
   * Accent color for shadow/border characters (defaults to acid green #9EFC62)
   */
  accentColor?: string
  /**
   * Block color for solid block characters (white for dark mode, black for light mode)
   */
  blockColor?: string
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
  accentColor = '#9EFC62',
  blockColor = '#ffffff',
}: UseLogoOptions): LogoResult => {
  const rawLogoString = useMemo(() => {
    if (availableWidth >= 70) return LOGO
    if (availableWidth >= 20) return LOGO_SMALL
    return IS_FREEBUFF ? 'FREEBUFF' : 'CODEBUFF'
  }, [availableWidth])

  // Format text block for plain text contexts (chat messages, etc.)
  const textBlock = useMemo(() => {
    if (rawLogoString === 'CODEBUFF' || rawLogoString === 'FREEBUFF') {
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
    if (rawLogoString === 'CODEBUFF' || rawLogoString === 'FREEBUFF') {
      const brandName = IS_FREEBUFF ? 'Freebuff' : 'Codebuff'
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

    // ASCII art variant
    const logoLines = parseLogoLines(rawLogoString)
    const displayLines = logoLines.map((line) => line.slice(0, availableWidth))

    // Default coloring function: blockColor for blocks, accent color for shadows
    const defaultColorChar = (char: string, charIndex: number) => {
      if (char === ' ' || char === '\n') {
        return <span key={charIndex}>{char}</span>
      }
      // Block characters use blockColor (white in dark mode, black in light mode)
      if (char === '█') {
        return <span key={charIndex} fg={blockColor}>{char}</span>
      }
      // Shadow/border characters get accent color
      if (SHADOW_CHARS.has(char)) {
        return <span key={charIndex} fg={accentColor}>{char}</span>
      }
      // Other characters use accent color
      return <span key={charIndex} fg={accentColor}>{char}</span>
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
  }, [rawLogoString, availableWidth, applySheenToChar, textColor, accentColor, blockColor])

  // Freebuff subtitle: "The free coding agent" with shimmer wave on "free"
  const theme = useTheme()
  const [shimmerPos, setShimmerPos] = useState(0)

  useEffect(() => {
    if (!IS_FREEBUFF) return
    const interval = setInterval(() => {
      setShimmerPos(prev => (prev + 1) % SUBTITLE_SHIMMER_STEPS)
    }, SUBTITLE_SHIMMER_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const componentWithSubtitle = useMemo(() => {
    if (!IS_FREEBUFF) return component

    const colors = SUBTITLE_SHIMMER_COLORS[theme.name] ?? SUBTITLE_SHIMMER_COLORS.dark

    // Calculate logo width to center the subtitle
    const subtitleText = 'The free coding agent'
    const logoLines = rawLogoString === 'CODEBUFF' || rawLogoString === 'FREEBUFF'
      ? [rawLogoString]
      : parseLogoLines(rawLogoString).map((line) => line.slice(0, availableWidth))
    const logoWidth = Math.max(...logoLines.map((l) => l.length))
    const padding = Math.max(0, Math.floor((logoWidth - subtitleText.length) / 2))
    const pad = ' '.repeat(padding)

    const subtitle = (
      <text style={{ wrapMode: 'none' }}>
        <span>{pad}</span>
        <span fg={theme.foreground}>The </span>
        <b>
          {'free'.split('').map((char, i) => {
            const distance = Math.abs(shimmerPos - 1 - i)
            const color = distance === 0 ? colors.peak : distance === 1 ? colors.bright : colors.base
            return <span key={i} fg={color}>{char}</span>
          })}
        </b>
        <span fg={theme.foreground}> coding agent</span>
      </text>
    )

    return (
      <>
        {component}
        {subtitle}
      </>
    )
  }, [component, shimmerPos, theme.name, theme.foreground, rawLogoString, availableWidth])

  return { component: componentWithSubtitle, textBlock }
}
