/**
 * Terminal Color Detection using OSC 10/11 Escape Sequences
 *
 * This module provides utilities for detecting terminal theme (dark/light) by querying
 * the terminal's foreground and background colors using OSC (Operating System Command)
 * escape sequences.
 *
 * OSC 10: Query foreground (text) color
 * OSC 11: Query background color
 */

import { openSync, closeSync, writeSync, readSync, constants } from 'fs'

// Timeout constants
const OSC_QUERY_TIMEOUT_MS = 500 // Timeout for individual OSC query
const GLOBAL_OSC_TIMEOUT_MS = 2000 // Global timeout for entire detection process

/**
 * Wrap a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutValue - Value to return on timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutValue: T,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(timeoutValue)
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

/**
 * Check if the current terminal supports OSC color queries
 */
export function terminalSupportsOSC(): boolean {
  const term = process.env.TERM || ''
  const termProgram = process.env.TERM_PROGRAM || ''

  // Known compatible terminals
  const supportedPrograms = [
    'iTerm.app',
    'Apple_Terminal',
    'WezTerm',
    'Alacritty',
    'kitty',
    'Ghostty',
    'vscode',
  ]

  if (supportedPrograms.some((p) => termProgram.includes(p))) {
    return true
  }

  const supportedTerms = [
    'xterm-256color',
    'xterm-kitty',
    'alacritty',
    'wezterm',
    'ghostty',
  ]

  if (supportedTerms.some((t) => term.includes(t))) {
    return true
  }

  // Check if we have a TTY
  return process.stdin.isTTY === true
}

/**
 * Build OSC query string
 * @param oscCode - The OSC code (10 for foreground, 11 for background)
 */
function buildOscQuery(oscCode: number): string {
  return `\x1b]${oscCode};?\x07`
}

/**
 * Query the terminal for OSC color information via /dev/tty
 * Uses synchronous reads with polling to avoid blocking forever
 * @param oscCode - The OSC code (10 for foreground, 11 for background)
 * @returns The raw response string or null if query failed
 */
async function sendOscQuery(
  ttyPath: string,
  query: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    let ttyFd: number | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let pollIntervalId: NodeJS.Timeout | null = null
    let resolved = false

    const cleanup = () => {
      if (resolved) return
      resolved = true

      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (pollIntervalId) {
        clearInterval(pollIntervalId)
        pollIntervalId = null
      }
      if (ttyFd !== null) {
        try {
          closeSync(ttyFd)
        } catch {
          // Ignore close errors
        }
        ttyFd = null
      }
    }

    const resolveWith = (value: string | null) => {
      if (resolved) return
      cleanup()
      resolve(value)
    }

    try {
      // Open TTY with O_RDWR and O_NONBLOCK for non-blocking reads
      // O_NONBLOCK = 0x0004 on macOS, 0x0800 on Linux
      const O_NONBLOCK =
        process.platform === 'darwin' ? 0x0004 : constants.O_NONBLOCK || 0x0800
      const O_RDWR = constants.O_RDWR

      try {
        ttyFd = openSync(ttyPath, O_RDWR | O_NONBLOCK)
      } catch {
        resolveWith(null)
        return
      }

      // Set overall timeout
      timeoutId = setTimeout(() => {
        resolveWith(null)
      }, OSC_QUERY_TIMEOUT_MS)

      // Write the OSC query
      try {
        writeSync(ttyFd, query)
      } catch {
        resolveWith(null)
        return
      }

      // Poll for response using non-blocking reads
      let response = ''
      const buffer = Buffer.alloc(256)
      let pollCount = 0
      const maxPolls = OSC_QUERY_TIMEOUT_MS / 10 // Poll every 10ms

      pollIntervalId = setInterval(() => {
        pollCount++

        if (ttyFd === null || pollCount > maxPolls) {
          resolveWith(response.length > 0 ? response : null)
          return
        }

        try {
          const bytesRead = readSync(ttyFd, buffer, 0, buffer.length, null)
          if (bytesRead > 0) {
            const chunk = buffer.toString('utf8', 0, bytesRead)
            response += chunk

            // Check for complete response
            const hasBEL = response.includes('\x07')
            const hasST = response.includes('\x1b\\')
            const hasRGB =
              /rgb:[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}/.test(
                response,
              )

            // A complete response has RGB data AND a terminator (BEL or ST)
            // Some terminals might send RGB without proper terminator, so we accept that too
            if (hasRGB && (hasBEL || hasST || response.length > 20)) {
              resolveWith(response)
              return
            }
          }
        } catch (error: unknown) {
          // EAGAIN/EWOULDBLOCK means no data available yet - this is expected
          const code = (error as NodeJS.ErrnoException)?.code
          if (code !== 'EAGAIN' && code !== 'EWOULDBLOCK') {
            // On actual error, stop polling
            resolveWith(response.length > 0 ? response : null)
          }
        }
      }, 10)
    } catch {
      resolveWith(null)
    }
  })
}

/**
 * Query terminal for OSC color
 */
export async function queryTerminalOSC(
  oscCode: number,
): Promise<string | null> {
  const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'
  const query = buildOscQuery(oscCode)
  return sendOscQuery(ttyPath, query)
}

/**
 * Parse RGB values from OSC response
 * @param response - The raw OSC response string
 * @returns RGB tuple [r, g, b] normalized to 0-255, or null if parsing failed
 */
export function parseOSCResponse(
  response: string,
): [number, number, number] | null {
  // Extract RGB values from response
  const match = response.match(
    /rgb:([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})\/([0-9a-fA-F]{2,4})/,
  )

  if (!match) return null

  const [, rHex, gHex, bHex] = match
  if (!rHex || !gHex || !bHex) return null

  // Convert hex to decimal
  let r = parseInt(rHex, 16)
  let g = parseInt(gHex, 16)
  let b = parseInt(bHex, 16)

  // Normalize 16-bit (4 hex digits) to 8-bit
  if (rHex.length === 4) {
    r = Math.floor(r / 257)
    g = Math.floor(g / 257)
    b = Math.floor(b / 257)
  }

  return [r, g, b]
}

const XTERM_COLOR_STEPS = [0, 95, 135, 175, 215, 255]
const ANSI_16_COLORS: [number, number, number][] = [
  [0, 0, 0],
  [205, 0, 0],
  [0, 205, 0],
  [205, 205, 0],
  [0, 0, 238],
  [205, 0, 205],
  [0, 205, 205],
  [229, 229, 229],
  [127, 127, 127],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [92, 92, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
]

function xtermColorToRGB(index: number): [number, number, number] | null {
  if (!Number.isFinite(index) || index < 0) {
    return null
  }

  if (index < ANSI_16_COLORS.length) {
    return ANSI_16_COLORS[index]
  }

  if (index >= 16 && index <= 231) {
    const base = index - 16
    const r = Math.floor(base / 36)
    const g = Math.floor((base % 36) / 6)
    const b = base % 6
    return [
      XTERM_COLOR_STEPS[r] ?? 0,
      XTERM_COLOR_STEPS[g] ?? 0,
      XTERM_COLOR_STEPS[b] ?? 0,
    ]
  }

  if (index >= 232 && index <= 255) {
    const level = 8 + (index - 232) * 10
    return [level, level, level]
  }

  return null
}

function detectBgColorFromEnv(): [number, number, number] | null {
  const termBackground = process.env.TERM_BACKGROUND?.toLowerCase()
  if (termBackground === 'dark') {
    return [0, 0, 0]
  }
  if (termBackground === 'light') {
    return [255, 255, 255]
  }

  const colorFgBg = process.env.COLORFGBG
  if (!colorFgBg) return null

  const parts = colorFgBg
    .split(';')
    .map((part) => parseInt(part, 10))
    .filter((value) => Number.isFinite(value))

  if (parts.length === 0) {
    return null
  }

  const bgIndex = parts[parts.length - 1]
  return xtermColorToRGB(bgIndex)
}

/**
 * Calculate brightness using ITU-R BT.709 luminance formula
 * @param rgb - RGB tuple [r, g, b] in 0-255 range
 * @returns Brightness value 0-255
 */
export function calculateBrightness([r, g, b]: [
  number,
  number,
  number,
]): number {
  // Relative luminance coefficients (ITU-R BT.709)
  const LUMINANCE_RED = 0.2126
  const LUMINANCE_GREEN = 0.7152
  const LUMINANCE_BLUE = 0.0722

  return Math.floor(
    LUMINANCE_RED * r + LUMINANCE_GREEN * g + LUMINANCE_BLUE * b,
  )
}

/**
 * Determine theme from background color
 * @param rgb - RGB tuple [r, g, b]
 * @returns 'dark' if background is dark, 'light' if background is light
 */
export function themeFromBgColor(
  rgb: [number, number, number],
): 'dark' | 'light' {
  const brightness = calculateBrightness(rgb)
  const THRESHOLD = 128 // Middle of 0-255 range

  return brightness > THRESHOLD ? 'light' : 'dark'
}

/**
 * Determine theme from foreground color (inverted logic)
 * @param rgb - RGB tuple [r, g, b]
 * @returns 'dark' if foreground is bright (dark background), 'light' if foreground is dark
 */
export function themeFromFgColor(
  rgb: [number, number, number],
): 'dark' | 'light' {
  const brightness = calculateBrightness(rgb)
  // Bright foreground = dark background theme
  return brightness > 128 ? 'dark' : 'light'
}

/**
 * Core detection logic without any timeout wrapping
 * This is the actual detection implementation
 */
async function detectTerminalThemeCore(): Promise<'dark' | 'light' | null> {
  // Check if terminal supports OSC
  if (!terminalSupportsOSC()) {
    return null
  }

  // Try background color first (OSC 11) - more reliable
  const bgResponse = await queryTerminalOSC(11)
  if (bgResponse) {
    const bgRgb = parseOSCResponse(bgResponse)
    if (bgRgb) {
      return themeFromBgColor(bgRgb)
    }
  }

  // Fallback to foreground color (OSC 10)
  const fgResponse = await queryTerminalOSC(10)
  if (fgResponse) {
    const fgRgb = parseOSCResponse(fgResponse)
    if (fgRgb) {
      return themeFromFgColor(fgRgb)
    }
  }

  // Fallback to COLORFGBG environment variable if available
  const envBgRgb = detectBgColorFromEnv()
  if (envBgRgb) {
    return themeFromBgColor(envBgRgb)
  }

  return null
}

/**
 * Detect terminal theme by querying OSC 10/11
 * Wrapped with a global timeout to prevent hanging
 * @returns 'dark', 'light', or null if detection failed
 */
export async function detectTerminalTheme(): Promise<'dark' | 'light' | null> {
  try {
    return await withTimeout(
      detectTerminalThemeCore(),
      GLOBAL_OSC_TIMEOUT_MS,
      null,
    )
  } catch {
    return null
  }
}

/**
 * Get the global OSC timeout value (for testing/debugging)
 */
export function getGlobalOscTimeout(): number {
  return GLOBAL_OSC_TIMEOUT_MS
}

/**
 * Get the per-query OSC timeout value (for testing/debugging)
 */
export function getQueryOscTimeout(): number {
  return OSC_QUERY_TIMEOUT_MS
}
