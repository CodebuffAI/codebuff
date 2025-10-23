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
 * Creates a "fill" effect where characters behind the sheen are filled in
 */
export function getSheenColor(
  char: string,
  charIndex: number,
  sheenPosition: number,
  logoColor: string,
): string {
  // Shadow characters that should have the sheen effect
  const shadowChars = ['╚', '═', '╝']

  if (!shadowChars.includes(char)) {
    return logoColor
  }

  const sheenWidth = 5
  const distance = charIndex - sheenPosition

  // Characters behind the sheen (already filled)
  if (distance < -sheenWidth) {
    return '#00cc00' // Filled green
  }

  // Characters at the leading edge (bright sheen)
  if (distance >= -sheenWidth && distance <= 0) {
    return '#00ff00' // Bright green at the sheen edge
  }

  // Characters ahead of the sheen (not yet filled)
  return logoColor
}

/**
 * Parses the logo string into individual lines
 */
export function parseLogoLines(logo: string): string[] {
  return logo.split('\n').filter((line) => line.length > 0)
}
