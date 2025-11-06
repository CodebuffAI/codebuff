/**
 * Terminal Color Detection via OSC Escape Sequences
 *
 * Uses OSC 10 (foreground) and OSC 11 (background) queries to detect terminal colors.
 * This only works on terminals that support these queries (iTerm2, Terminal.app, Alacritty, etc.)
 *
 * IMPORTANT: This implementation writes directly to /dev/tty to avoid interfering with
 * Ink's stdout/stdin handling in the CLI app.
 */

import { openSync, closeSync, writeSync, createReadStream } from 'fs'

import type { ThemeName } from '../types/theme-system'

// Timing constants
const OSC_TIMEOUT_MS = 1000
const BRIGHTNESS_THRESHOLD = 128

// Luminance coefficients (ITU-R BT.709)
const LUMINANCE_RED = 0.2126
const LUMINANCE_GREEN = 0.7152
const LUMINANCE_BLUE = 0.0722

export function buildOscQuery(oscCode: number): string {
  const base = `\x1b]${oscCode};?\x07` // ESC ] <code> ; ? BEL

  // tmux passthrough: ESC P tmux; ESC ] ... BEL ESC \
  if (process.env.TMUX) {
    return `\x1bPtmux;${base.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`
  }

  // screen/byobu passthrough: ESC P ESC ] ... BEL ESC \
  if (process.env.STY) {
    return `\x1bP${base}\x1b\\`
  }

  return base
}

/**
 * Query terminal using OSC escape sequence by writing directly to TTY
 * @param oscCode - 10 for foreground, 11 for background
 * @returns RGB response string or null if failed
 */
function queryTerminalOSC(oscCode: number): Promise<string | null> {
  return new Promise((resolve) => {
    // Determine TTY device path
    const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'

    // Use separate read/write FDs to avoid double-closing issues
    let ttyReadFd: number | null = null
    let ttyWriteFd: number | null = null
    let timeout: NodeJS.Timeout | null = null

    try {
      // Open TTY separately for read and write
      ttyReadFd = openSync(ttyPath, 'r')
      ttyWriteFd = openSync(ttyPath, 'w')
    } catch {
      // Can't access TTY (might be in non-interactive environment)
      if (ttyReadFd !== null) {
        try {
          closeSync(ttyReadFd)
        } catch {}
      }
      if (ttyWriteFd !== null) {
        try {
          closeSync(ttyWriteFd)
        } catch {}
      }
      resolve(null)
      return
    }

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      // Close writer FD
      if (ttyWriteFd !== null) {
        try {
          closeSync(ttyWriteFd)
        } catch {}
        ttyWriteFd = null
      }
      // The reader FD is managed by the ReadStream (autoClose true)
      ttyReadFd = null
    }

    // Set up timeout
    timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, OSC_TIMEOUT_MS)

    try {
      // Create a non-blocking read stream from TTY (autoClose so it owns ttyReadFd)
      const readStream = createReadStream(ttyPath, {
        fd: ttyReadFd!,
        encoding: 'utf8',
        autoClose: true,
      })

      let response = ''
      const onData = (chunk: string | Buffer) => {
        response += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        const hasBEL = response.includes('\x07')
        const hasST = response.includes('\x1b\\')
        const hasRGB =
          /rgb:[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}/.test(
            response,
          )

        if (hasBEL || hasST || hasRGB) {
          readStream.removeListener('data', onData)
          readStream.removeListener('error', onError)
          try {
            // Prefer close() so stream owns its FD lifecycle
            ;(readStream as any).close?.()
          } catch {}
          cleanup()
          resolve(response)
        }
      }

      const onError = () => {
        readStream.removeListener('data', onData)
        readStream.removeListener('error', onError)
        try {
          ;(readStream as any).close?.()
        } catch {}
        cleanup()
        resolve(null)
      }

      readStream.on('data', onData)
      readStream.on('error', onError)

      // Send OSC query: ESC ] <code> ; ? BEL (wrapped if needed)
      const query = buildOscQuery(oscCode)
      const bytesWritten = writeSync(ttyWriteFd!, query)

      // Verify write succeeded
      if (bytesWritten < query.length) {
        readStream.removeListener('data', onData)
        readStream.removeListener('error', onError)
        try {
          ;(readStream as any).close?.()
        } catch {}
        cleanup()
        resolve(null)
        return
      }
    } catch {
      cleanup()
      resolve(null)
    }
  })
}

/**
 * Parse OSC response and extract RGB values
 * @param response - Raw OSC response string
 * @returns Array of [r, g, b] values (8-bit) or null if parsing failed
 */
export function parseOSCResponse(
  response: string,
): [number, number, number] | null {
  // Search anywhere in the response (handles tmux/screen DCS wrapping)
  const match = response.match(
    /rgb:([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})/,
  )
  if (!match) {
    return null
  }

  const [, rHex, gHex, bHex] = match
  if (!rHex || !gHex || !bHex) {
    return null
  }

  // Convert hex to decimal
  let r = parseInt(rHex, 16)
  let g = parseInt(gHex, 16)
  let b = parseInt(bHex, 16)

  // If values are 16-bit (4 hex digits), normalize to 8-bit
  if (rHex.length === 4) {
    r = Math.floor(r / 257)
    g = Math.floor(g / 257)
    b = Math.floor(b / 257)
  }

  const rgb: [number, number, number] = [r, g, b]
  return rgb
}

/**
 * Calculate perceived brightness from RGB values
 * Uses relative luminance formula: Y = 0.2126*R + 0.7152*G + 0.0722*B
 * @param rgb - Array of [r, g, b] values (8-bit)
 * @returns Brightness value 0-255
 */
function calculateBrightness([r, g, b]: [number, number, number]): number {
  return Math.floor(LUMINANCE_RED * r + LUMINANCE_GREEN * g + LUMINANCE_BLUE * b)
}

function themeFromRgb(rgb: [number, number, number]): ThemeName {
  const brightness = calculateBrightness(rgb)
  return brightness > BRIGHTNESS_THRESHOLD ? 'light' : 'dark'
}

function themeFromForegroundRgb(rgb: [number, number, number]): ThemeName {
  const brightness = calculateBrightness(rgb)
  // Bright foreground implies dark overall theme, and vice versa
  return brightness > BRIGHTNESS_THRESHOLD ? 'dark' : 'light'
}

/**
 * Query foreground color as fallback when background query fails
 * @returns Theme based on foreground color, or null if detection failed
 */
async function queryForegroundFallback(): Promise<ThemeName | null> {
  const fgResponse = await queryTerminalOSC(10)
  if (!fgResponse) return null
  const fgRgb = parseOSCResponse(fgResponse)
  if (!fgRgb) return null
  return themeFromForegroundRgb(fgRgb)
}

/**
 * Detect terminal theme by querying background color
 * @returns 'dark' or 'light' based on background brightness, or null if detection failed
 */
export async function detectTerminalTheme(): Promise<ThemeName | null> {
  try {
    // Query background color (OSC 11)
    const bgResponse = await queryTerminalOSC(11)
    if (!bgResponse) {
      return await queryForegroundFallback()
    }

    const bgRgb = parseOSCResponse(bgResponse)
    if (!bgRgb) {
      return await queryForegroundFallback()
    }

    // Calculate brightness and determine theme
    return themeFromRgb(bgRgb)
  } catch {
    return null
  }
}

/**
 * Check if terminal likely supports OSC queries
 * This is a heuristic based on TERM environment variable
 */
export function terminalLikelySupportsOSC(): boolean {
  const term = process.env.TERM || ''
  const termProgram = process.env.TERM_PROGRAM || ''
  const ghosttyEnv =
    (typeof Bun !== 'undefined' && (Bun.env as any)?.GHOSTTY_RESOURCES_DIR) ||
    process.env.GHOSTTY_RESOURCES_DIR

  // Known terminals that support OSC
  const supportedTermPrograms = [
    'iTerm.app',
    'Apple_Terminal',
    'WezTerm',
    'Alacritty',
    'kitty',
    'Ghostty',
  ]

  if (supportedTermPrograms.some((p) => termProgram.includes(p))) {
    return true
  }

  // Check TERM variable
  const supportedTerms = [
    'xterm-256color',
    'xterm-kitty',
    'alacritty',
    'wezterm',
    'xterm-ghostty',
  ]

  if (supportedTerms.some((t) => term.includes(t))) {
    return true
  }

  if (ghosttyEnv) {
    return true
  }

  // Don't try OSC in tmux/screen unless passthrough is explicitly enabled
  // We support passthrough wrapping now, so allow probing even under tmux/screen.
  if (process.env.TMUX || process.env.STY) {
    return true
  }

  // Default to trying if we have a TTY
  const isTTY = process.stdin.isTTY === true
  if (isTTY) {
    return true
  }

  // As a last resort, try opening the controlling terminal directly
  try {
    const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'
    const fd = openSync(ttyPath, 'r+')
    closeSync(fd)
    return true
  } catch {
    // Could not open TTY; give up
  }
  return false
}
