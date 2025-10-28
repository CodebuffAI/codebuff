/**
 * Utility functions for the login screen component
 */

/**
 * Calculates the relative luminance of a hex color to determine if it's light or dark mode
 */
export function isLightModeColor(hexColor: string): boolean {
  if (!hexColor) return false

  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

/**
 * Formats a URL for display by wrapping it at logical breakpoints
 */
export function formatUrl(url: string, maxWidth?: number): string[] {
  if (!maxWidth || maxWidth <= 0 || url.length <= maxWidth) {
    return [url]
  }

  const lines: string[] = []
  let remaining = url

  while (remaining.length > 0) {
    if (remaining.length <= maxWidth) {
      lines.push(remaining)
      break
    }

    // Try to break at a logical point (after /, ?, &, =)
    let breakPoint = maxWidth
    for (let i = maxWidth - 1; i > maxWidth - 20 && i > 0; i--) {
      if (['/', '?', '&', '='].includes(remaining[i])) {
        breakPoint = i + 1
        break
      }
    }

    lines.push(remaining.substring(0, breakPoint))
    remaining = remaining.substring(breakPoint)
  }

  return lines
}

/**
 * Generates a unique fingerprint ID for CLI authentication
 */
export function generateFingerprintId(): string {
  return `codecane-cli-${Math.random().toString(36).substring(2, 15)}`
}

/**
 * Determines the color for a character based on its position relative to the sheen
 * Creates a "fill" effect where shadow characters permanently change to solid green as sheen passes
 */
export function getSheenColor(
  char: string,
  charIndex: number,
  sheenPosition: number,
  logoColor: string,
  shadowChars: Set<string>,
): string {
  // Only apply sheen to shadow/border characters
  if (!shadowChars.has(char)) {
    return logoColor
  }

  const sheenWidth = 5
  const distance = charIndex - sheenPosition

  // Characters at the sheen (bright, solid green - the active sheen)
  if (distance >= -sheenWidth && distance <= 0) {
    return '#00ff00' // Bright solid green at the sheen
  }

  // Characters behind the sheen stay solid green (permanent fill effect)
  if (distance < -sheenWidth) {
    return '#00cc00' // Solid green - stays filled permanently
  }

  // Characters ahead of the sheen remain original color (unfilled shadow)
  return logoColor
}

/**
 * Parses the logo string into individual lines
 */
export function parseLogoLines(logo: string): string[] {
  return logo.split('\n').filter((line) => line.length > 0)
}

/**
 * Calculates responsive layout dimensions based on terminal size
 */
export function calculateResponsiveLayout(
  terminalWidth: number,
  terminalHeight: number,
) {
  // Responsive breakpoints based on terminal height
  const isVerySmall = terminalHeight < 15 // Minimal UI
  const isSmall = terminalHeight >= 15 && terminalHeight < 20 // Compact UI
  const isMedium = terminalHeight >= 20 && terminalHeight < 30 // Standard UI
  const isLarge = terminalHeight >= 30 // Spacious UI

  // Responsive breakpoints based on terminal width
  const isNarrow = terminalWidth < 60

  // Dynamic spacing based on terminal size - compressed to prevent scrolling
  const containerPadding = isVerySmall ? 0 : 1
  const headerMarginTop = 0
  const headerMarginBottom = isVerySmall ? 0 : 1
  const sectionMarginBottom = isVerySmall ? 0 : 1
  const contentMaxWidth = Math.max(
    10,
    Math.min(terminalWidth - (containerPadding * 2 + 4), 80),
  )

  const maxUrlWidth = Math.min(terminalWidth - 10, 100)

  // Show full logo on all terminal sizes as long as width allows
  const showFullLogo = contentMaxWidth >= 60

  return {
    isVerySmall,
    isSmall,
    isMedium,
    isLarge,
    isNarrow,
    containerPadding,
    headerMarginTop,
    headerMarginBottom,
    sectionMarginBottom,
    contentMaxWidth,
    maxUrlWidth,
    showFullLogo,
  }
}

/**
 * Calculates modal height based on terminal size and whether credentials are invalid
 */
export function calculateModalDimensions(
  terminalHeight: number,
  hasInvalidCredentials: boolean,
  defaultHeight = 24,
  verticalMargin = 2,
  maxBaseHeight = 22,
  warningBannerHeight = 3,
) {
  // Calculate available terminal height
  const availableHeight = terminalHeight || defaultHeight

  // Calculate base modal height (terminal height minus margins, capped at max)
  const baseModalHeight = Math.min(
    availableHeight - verticalMargin,
    maxBaseHeight,
  )

  // Add warning banner height if credentials are invalid
  const totalContentHeight =
    baseModalHeight + (hasInvalidCredentials ? warningBannerHeight : 0)

  // Final modal height cannot exceed available terminal height
  const modalHeight = Math.min(totalContentHeight, availableHeight)

  return {
    modalHeight,
    baseModalHeight,
    availableHeight,
  }
}
