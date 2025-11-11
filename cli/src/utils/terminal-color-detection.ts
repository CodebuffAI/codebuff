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

import { openSync, closeSync, writeSync, createReadStream } from 'fs'
import { Readable } from 'stream'

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
function buildOscQuery(oscCode: number): string {
	const base = `\x1b]${oscCode};?\x07`

	// tmux requires double-escaping
	if (process.env.TMUX) {
		return `\x1bPtmux;${base.replace(/\x1b/g, '\x1b\x1b')}\x1b\\`
	}

	// screen/byobu wrapping
	if (process.env.STY) {
		return `\x1bP${base}\x1b\\`
	}

	return base
}

/**
 * Query the terminal for OSC color information via /dev/tty
 * @param oscCode - The OSC code (10 for foreground, 11 for background)
 * @returns The raw response string or null if query failed
 */
export async function queryTerminalOSC(
	oscCode: number,
): Promise<string | null> {
	// OSC 10/11 logic commented out
	return null
	// return new Promise((resolve) => {
	// 	const ttyPath = process.platform === 'win32' ? 'CON' : '/dev/tty'

	// 	let ttyReadFd: number | null = null
	// 	let ttyWriteFd: number | null = null
	// 	let timeout: NodeJS.Timeout | null = null
	// 	let readStream: Readable | null = null

	// 	const cleanup = () => {
	// 		if (timeout) {
	// 			clearTimeout(timeout)
	// 			timeout = null
	// 		}
	// 		if (readStream) {
	// 			readStream.removeAllListeners()
	// 			readStream.destroy()
	// 			readStream = null
	// 		}
	// 		if (ttyWriteFd !== null) {
	// 			try {
	// 				closeSync(ttyWriteFd)
	// 			} catch {
	// 				// Ignore close errors
	// 			}
	// 			ttyWriteFd = null
	// 		}
	// 		// ttyReadFd is managed by the stream, so we don't close it separately
	// 	}

	// 	try {
	// 		// Open TTY for reading and writing
	// 		try {
	// 			ttyReadFd = openSync(ttyPath, 'r')
	// 			ttyWriteFd = openSync(ttyPath, 'w')
	// 		} catch {
	// 			// Not in a TTY environment
	// 			resolve(null)
	// 			return
	// 		}

	// 		// Set timeout for terminal response
	// 		timeout = setTimeout(() => {
	// 			cleanup()
	// 			resolve(null)
	// 		}, 1000) // 1 second timeout

	// 		// Create read stream to capture response
	// 		readStream = createReadStream(ttyPath, {
	// 			fd: ttyReadFd,
	// 			encoding: 'utf8',
	// 			autoClose: true,
	// 		})

	// 		let response = ''

	// 		readStream.on('data', (chunk: Buffer | string) => {
	// 			response += chunk.toString()

	// 			// Check for complete response
	// 			const hasBEL = response.includes('\x07')
	// 			const hasST = response.includes('\x1b\\')
	// 			const hasRGB =
	// 				/rgb:[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}\/[0-9a-fA-F]{2,4}/.test(
	// 					response,
	// 				)

	// 			if (hasBEL || hasST || hasRGB) {
	// 				cleanup()
	// 				resolve(response)
	// 			}
	// 		})

	// 		readStream.on('error', () => {
	// 			cleanup()
	// 			resolve(null)
	// 		})

	// 		readStream.on('close', () => {
	// 			// If stream closes before we get a complete response
	// 			if (timeout) {
	// 				cleanup()
	// 				resolve(null)
	// 			}
	// 		})

	// 		// Send OSC query
	// 		const query = buildOscQuery(oscCode)
	// 		writeSync(ttyWriteFd, query)
	// 	} catch {
	// 		cleanup()
	// 		resolve(null)
	// 	}
	// })
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

	return Math.floor(LUMINANCE_RED * r + LUMINANCE_GREEN * g + LUMINANCE_BLUE * b)
}

/**
 * Determine theme from background color
 * @param rgb - RGB tuple [r, g, b]
 * @returns 'dark' if background is dark, 'light' if background is light
 */
export function themeFromBgColor(rgb: [number, number, number]): 'dark' | 'light' {
	const brightness = calculateBrightness(rgb)
	const THRESHOLD = 128 // Middle of 0-255 range

	return brightness > THRESHOLD ? 'light' : 'dark'
}

/**
 * Determine theme from foreground color (inverted logic)
 * @param rgb - RGB tuple [r, g, b]
 * @returns 'dark' if foreground is bright (dark background), 'light' if foreground is dark
 */
export function themeFromFgColor(rgb: [number, number, number]): 'dark' | 'light' {
	const brightness = calculateBrightness(rgb)
	// Bright foreground = dark background theme
	return brightness > 128 ? 'dark' : 'light'
}

/**
 * Detect terminal theme by querying OSC 10/11
 * @returns 'dark', 'light', or null if detection failed
 */
export async function detectTerminalTheme(): Promise<'dark' | 'light' | null> {
	// OSC 10/11 logic commented out
	return null
	// // Check if terminal supports OSC
	// if (!terminalSupportsOSC()) {
	// 	return null
	// }

	// try {
	// 	// Try background color first (OSC 11) - more reliable
	// 	const bgResponse = await queryTerminalOSC(11)
	// 	if (bgResponse) {
	// 		const bgRgb = parseOSCResponse(bgResponse)
	// 		if (bgRgb) {
	// 			return themeFromBgColor(bgRgb)
	// 		}
	// 	}

	// 	// Fallback to foreground color (OSC 10)
	// 	const fgResponse = await queryTerminalOSC(10)
	// 	if (fgResponse) {
	// 		const fgRgb = parseOSCResponse(fgResponse)
	// 		if (fgRgb) {
	// 			return themeFromFgColor(fgRgb)
	// 		}
	// 	}

	// 	return null // Detection failed
	// } catch {
	// 	return null
	// }
}

