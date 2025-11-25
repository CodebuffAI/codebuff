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

import { spawnSync } from 'child_process'
import { openSync, closeSync, writeSync, createReadStream } from 'fs'

import type { Readable } from 'stream'

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
 * Build OSC query with proper wrapping for terminal multiplexers
 * @param oscCode - The OSC code (10 for foreground, 11 for background)
 */
function tmuxPassthroughState(): 'on' | 'off' | 'unknown' {
  if (!process.env.TMUX) {
    return 'off'
  }

  try {
    const result = spawnSync('tmux', ['show', '-gv', 'allow-passthrough'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (result.status === 0) {
      const value = (result.stdout ?? '').trim().toLowerCase()
      if (value === 'on' || value === 'all') return 'on'
      if (value === 'off') return 'off'
    }
  } catch {
    // Ignore tmux lookup errors
  }

  return 'unknown'
}

function buildOscQueries(oscCode: number): string[] {
  const base = `\x1b]${oscCode};?\x07`

  // tmux requires double-escaping when passthrough is allowed
  if (process.env.TMUX) {
    const queries = [base]
    const passthrough = `\x1bPtmux;${base.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`
    const passthroughState = tmuxPassthroughState()

    if (passthroughState === 'on') {
      queries.unshift(passthrough)
    } else if (passthroughState === 'unknown') {
      queries.unshift(passthrough)
    } else {
      queries.push(passthrough)
    }

    return queries
  }

  // screen/byobu wrapping
  if (process.env.STY) {
    return [`\x1bP${base}\x1b\\`, base]
  }

  return [base]
}

/**
 * Query the terminal for OSC color information via /dev/tty
 * @param oscCode - The OSC code (10 for foreground, 11 for background)
 * @returns The raw response string or null if query failed
 */
const OSC_QUERY_TIMEOUT_MS = 1000

async function sendOscQuery(
  ttyPath: string,
  query: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    let ttyReadFd: number | null = null
    let ttyWriteFd: number | null = null
    let timeout: NodeJS.Timeout | null = null
    let readStream: Readable | null = null

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      if (readStream) {
        readStream.removeAllListeners()
        readStream.destroy()
        readStream = null
      }
      if (ttyWriteFd !== null) {
        try {
          closeSync(ttyWriteFd)
        } catch {
          // Ignore close errors
        }
        ttyWriteFd = null
      }
      // ttyReadFd is managed by the stream, so we don't close it separately
    }

    try {
      // Open TTY for reading and writing
      try {
        ttyReadFd = openSync(ttyPath, 'r')
        ttyWriteFd = openSync(ttyPath, 'w')
      } catch {
        // Not in a TTY environment
        resolve(null)
        return
      }

      // Set timeout for terminal response
      timeout = setTimeout(() => {
        cleanup()
        resolve(null)
      }, OSC_QUERY_TIMEOUT_MS)

      // Create read stream to capture response
      readStream = createReadStream(ttyPath, {
        fd: ttyReadFd,
        encoding: 'utf8',
        autoClose: true,
      })

      let response = ''

      readStream.on('data', (chunk: Buffer | string) => {
        response += chunk.toString()

        // Check for complete response
        const hasBEL = response.includes('\x07')
        const hasST = response.includes('\x1b\\')
        const hasRGB =
          /rgb:[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}/.test(
            response,
          )

        if (hasBEL || hasST || hasRGB) {
          cleanup()
          resolve(response)
        }
      })

      readStream.on('error', () => {
        cleanup()
        resolve(null)
      })

      readStream.on('close', () => {
        // If stream closes before we get a complete response
        if (timeout) {
          cleanup()
          resolve(null)
        }
      })

      // Send OSC query
      writeSync(ttyWriteFd, query)
    } catch {
      cleanup()
      resolve(null)
    }
  })
}

export async function queryTerminalOSC(
  oscCode: number,
): Promise<string | null> {
  const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'
  const queries = Array.from(new Set(buildOscQueries(oscCode)))

  for (const query of queries) {
    const response = await sendOscQuery(ttyPath, query)
    if (response) {
      return response
    }
  }

  return null
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
 * Detect terminal theme by querying OSC 10/11
 * @returns 'dark', 'light', or null if detection failed
 */
export async function detectTerminalTheme(): Promise<'dark' | 'light' | null> {
  // Check if terminal supports OSC
  if (!terminalSupportsOSC()) {
    return null
  }

  try {
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

    // Fallback to COLORFGBG environment variable if available (common in tmux)
    const envBgRgb = detectBgColorFromEnv()
    if (envBgRgb) {
      return themeFromBgColor(envBgRgb)
    }

    return null // Detection failed
  } catch {
    return null
  }
}
