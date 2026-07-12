export const LOGO = `
  ██████╗ ██████╗ ███████╗███╗   ██╗██████╗ ██╗   ██╗███████╗███████╗
 ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗██║   ██║██╔════╝██╔════╝
 ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██████╔╝██║   ██║█████╗  █████╗  
 ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔══██╗██║   ██║██╔══╝  ██╔══╝  
 ╚██████╔╝██║     ███████╗██║ ╚████║██████╔╝╚██████╔╝██║     ██║     
  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝     ╚═╝     
`

export const LOGO_SMALL = `
  ██████╗  ██████╗ 
 ██╔═══██╗ ██╔══██╗
 ██║   ██║ ██████╔╝
 ██║   ██║ ██╔══██╗
 ╚██████╔╝ ██████╔╝
  ╚═════╝  ╚═════╝ 
`

export const SHADOW_CHARS = new Set(['╔', '╗', '╚', '╝', '║', '═'])

export const SHEEN_STEP = 2
export const SHEEN_INTERVAL_MS = 80

export const WEBSITE_URL = 'https://openbuff.com'

/** Parse logo string into an array of trimmed lines, stripping leading/trailing blank lines. */
export function parseLogoLines(logo: string): string[] {
  const lines = logo.split('\n')
  // Trim leading blank lines
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift()
  }
  // Trim trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines
}

/**
 * Determines the color for a logo character based on sheen position.
 * Walk through the logo by character index (across all lines concatenated),
 * applying the sheen (accent color fill) to characters that fall within the
 * current sheen band, and reverting to original colors outside it.
 */
export function getSheenColor(
  char: string,
  charIndex: number,
  sheenPosition: number,
  logoColor: string,
  shadowChars: Set<string>,
  accentColor: string,
  blockColor: string,
  isReversing: boolean,
): string {
  const sheenWidth = 15
  const start = sheenPosition
  const end = sheenPosition + sheenWidth

  const inSheen = charIndex >= start && charIndex < end

  if (inSheen) {
    return isReversing ? logoColor : accentColor
  }

  // Default coloring: blocks get blockColor, shadows get accentColor
  if (char === '█') return blockColor
  if (shadowChars.has(char)) return accentColor
  return accentColor
}
