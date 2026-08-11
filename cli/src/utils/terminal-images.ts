/**
 * Terminal image rendering utilities
 * Supports iTerm2 inline images protocol and Kitty graphics protocol
 *
 * Kitty protocol reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 * iTerm2 protocol reference: https://iterm2.com/documentation-images.html
 */

import { getCliEnv } from './env'

import type { CliEnv } from '../types/env'

export type TerminalImageProtocol = 'iterm2' | 'kitty' | 'sixel' | 'none'

let cachedProtocol: TerminalImageProtocol | null = null

/**
 * Clear the cached detection result. Tests change the env between assertions,
 * so they reset the cache; the CLI itself only ever detects once.
 */
export function resetTerminalImageSupportCache(): void {
  cachedProtocol = null
}

/**
 * Detect which image protocol the terminal supports.
 *
 * Kitty's own spec lists these terminals as graphics-protocol compatible:
 * kitty itself, Ghostty, Konsole, Warp, WezTerm, iTerm2, xterm.js, st, wayst.
 * Detection is env-var based (cheap, synchronous); terminals that don't set a
 * recognizable variable fall back to 'none' and render a metadata card.
 */
export function detectTerminalImageSupport(
  env: CliEnv = getCliEnv(),
): TerminalImageProtocol {
  if (cachedProtocol !== null) {
    return cachedProtocol
  }

  // Check for iTerm2
  if (env.TERM_PROGRAM === 'iTerm.app') {
    cachedProtocol = 'iterm2'
    return cachedProtocol
  }

  // Check for kitty proper (TERM or the kitty-specific env var it exports)
  if (
    env.TERM === 'xterm-kitty' ||
    env.KITTY_WINDOW_ID !== undefined
  ) {
    cachedProtocol = 'kitty'
    return cachedProtocol
  }

  // WezTerm ships a full kitty-graphics implementation (since 2022) and
  // exports TERM_PROGRAM. Ghostty, Warp and Konsole likewise implement the
  // kitty protocol and identify themselves via TERM_PROGRAM / KONSOLE_VERSION.
  // TERM_PROGRAM casing varies by terminal (Ghostty exports lowercase
  // 'ghostty'), so compare case-insensitively.
  const termProgram = (env.TERM_PROGRAM ?? '').toLowerCase()
  if (
    termProgram === 'wezterm' ||
    termProgram === 'ghostty' ||
    termProgram === 'warpterminal' ||
    env.KONSOLE_VERSION !== undefined
  ) {
    cachedProtocol = 'kitty'
    return cachedProtocol
  }

  // Check for Sixel support (less common; Windows Terminal and some Linux
  // terminals). Honored via env override since it can't be sniffed reliably.
  if (
    env.TERM?.includes('sixel') ||
    env.SIXEL_SUPPORT === 'true'
  ) {
    cachedProtocol = 'sixel'
    return cachedProtocol
  }

  cachedProtocol = 'none'
  return cachedProtocol
}

/**
 * Check if terminal supports inline images
 */
export function supportsInlineImages(): boolean {
  return detectTerminalImageSupport() !== 'none'
}

/** Map a media type to the iTerm2/kitty-friendly display name. */
function normalizeMediaType(mediaType?: string): string {
  if (!mediaType) return 'image/png'
  return mediaType.startsWith('image/') ? mediaType : `image/${mediaType}`
}

/**
 * Kitty graphics format ids: 100 = PNG, 101 = PNG with alpha, 102 = JPEG,
 * 103 = WebP, 104 = GIF. Anything unknown falls back to PNG (100); the
 * terminal will fail to decode a mismatched payload, so this must match the
 * actual bytes being sent.
 */
export function getKittyFormat(mediaType?: string): number {
  switch (normalizeMediaType(mediaType)) {
    case 'image/jpeg':
    case 'image/jpg':
      return 102
    case 'image/webp':
      return 103
    case 'image/gif':
      return 104
    case 'image/png':
    default:
      return 100
  }
}

/**
 * Generate iTerm2 inline image escape sequence
 * @param base64Data - Base64 encoded image data
 * @param options - Display options
 */
function generateITerm2ImageSequence(
  base64Data: string,
  options: {
    width?: number | string // cells or 'auto'
    height?: number | string // cells or 'auto'
    preserveAspectRatio?: boolean
    inline?: boolean
    name?: string
  } = {},
): string {
  const {
    width = 'auto',
    height = 'auto',
    preserveAspectRatio = true,
    inline = true,
    name,
  } = options

  // Build the parameter string
  const params: string[] = []

  if (inline) {
    params.push('inline=1')
  }

  if (width !== 'auto') {
    params.push(`width=${width}`)
  }

  if (height !== 'auto') {
    params.push(`height=${height}`)
  }

  if (!preserveAspectRatio) {
    params.push('preserveAspectRatio=0')
  }

  if (name) {
    params.push(`name=${Buffer.from(name).toString('base64')}`)
  }

  // The size parameter is the byte length of the DECODED image data, not the
  // base64-encoded length. iTerm2 uses it to size its backing store, so an
  // inflated value (4/3x) can break rendering of larger images. Base64 padding
  // ('=') does not encode bytes, so it must be subtracted.
  const padding = base64Data.endsWith('==')
    ? 2
    : base64Data.endsWith('=')
      ? 1
      : 0
  const decodedSize = Math.floor((base64Data.length * 3) / 4) - padding
  params.push(`size=${decodedSize}`)

  const paramString = params.join(';')

  // Format: ESC ] 1337 ; File = [params] : base64data BEL
  // Using \x1b for ESC and \x07 for BEL
  return `\x1b]1337;File=${paramString}:${base64Data}\x07`
}

/**
 * Generate Kitty graphics protocol escape sequence.
 *
 * Spec-compliant chunked transmission:
 *   - only the FIRST chunk carries the full control data (a, f, t, c, r, ...)
 *   - subsequent chunks carry ONLY `m=<0|1>` (and optionally `q`)
 *   - every chunk except the last has `m=1`; the LAST chunk has `m=0`
 *     (a missing m=0 leaves the transmission open, so the terminal never
 *     renders the image or renders a fragment)
 *   - non-final chunk payloads must be a multiple of 4 bytes of base64
 *
 * @param base64Data - Base64 encoded image data
 * @param options - Display options
 */
function generateKittyImageSequence(
  base64Data: string,
  options: {
    width?: number // cells
    height?: number // cells
    id?: number
    mediaType?: string
  } = {},
): string {
  const { width, height, id, mediaType } = options

  // Build key-value pairs for the control data (first chunk only)
  const kvPairs: string[] = [
    'a=T', // action: transmit and display
    // Format must match the payload bytes. JPEG (102) is what image-handler
    // produces after compression; kitty/WezTerm/Ghostty decode it natively.
    // Terminals that only implement the spec's mandatory RGB/RGBA/PNG set
    // won't render non-PNG payloads — the metadata-card fallback covers them.
    `f=${getKittyFormat(mediaType)}`,
    't=d', // transmission: direct (data follows)
  ]

  if (width) {
    kvPairs.push(`c=${width}`) // columns
  }

  if (height) {
    kvPairs.push(`r=${height}`) // rows
  }

  if (id) {
    kvPairs.push(`i=${id}`) // image id
  }

  const controlData = kvPairs.join(',')

  // Chunk size in base64 characters; 4096 is a multiple of 4 so every
  // non-final chunk meets the spec's multiple-of-4 requirement.
  const CHUNK_SIZE = 4096

  const chunks: string[] = []
  for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
    const chunk = base64Data.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= base64Data.length

    // First chunk: full control data + m. Subsequent chunks: m only, so the
    // terminal continues the same transmission instead of starting a new
    // image (repeating a=T on every chunk fragments the image).
    const control = i === 0 ? `${controlData},m=${isLast ? 0 : 1}` : `m=${isLast ? 0 : 1}`

    chunks.push(`\x1b_G${control};${chunk}\x1b\\`)
  }

  return chunks.join('')
}

/**
 * Render an image inline in the terminal
 * @param base64Data - Base64 encoded image data
 * @param options - Display options
 * @returns The escape sequence string, or null if not supported
 */
export function renderInlineImage(
  base64Data: string,
  options: {
    width?: number
    height?: number
    filename?: string
    mediaType?: string
  } = {},
): string | null {
  const protocol = detectTerminalImageSupport()

  switch (protocol) {
    case 'iterm2':
      return generateITerm2ImageSequence(base64Data, {
        width: options.width,
        height: options.height,
        name: options.filename,
      })

    case 'kitty':
      return generateKittyImageSequence(base64Data, {
        width: options.width,
        height: options.height,
        mediaType: options.mediaType,
      })

    case 'sixel':
      // Sixel is more complex and requires actual image decoding
      // For now, return null and fall back to metadata display
      return null

    case 'none':
    default:
      return null
  }
}

/**
 * Get a user-friendly description of the terminal image support
 */
export function getImageSupportDescription(): string {
  const protocol = detectTerminalImageSupport()

  switch (protocol) {
    case 'iterm2':
      return 'iTerm2 inline images'
    case 'kitty':
      return 'Kitty graphics protocol'
    case 'sixel':
      return 'Sixel graphics'
    case 'none':
      return 'No inline image support'
  }
}
