/**
 * Utility functions for the login screen component
 */

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
