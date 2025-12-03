/**
 * Terminal image rendering utilities
 * Supports iTerm2 inline images protocol and Kitty graphics protocol
 */


export type TerminalImageProtocol = 'iterm2' | 'kitty' | 'sixel' | 'none'

let cachedProtocol: TerminalImageProtocol | null = null

/**
 * Detect which image protocol the terminal supports
 */
export function detectTerminalImageSupport(): TerminalImageProtocol {
  if (cachedProtocol !== null) {
    return cachedProtocol
  }

  // Check for iTerm2
  if (process.env.TERM_PROGRAM === 'iTerm.app') {
    cachedProtocol = 'iterm2'
    return cachedProtocol
  }

  // Check for Kitty
  if (
    process.env.TERM === 'xterm-kitty' ||
    process.env.KITTY_WINDOW_ID !== undefined
  ) {
    cachedProtocol = 'kitty'
    return cachedProtocol
  }

  // Check for Sixel support (less common)
  if (
    process.env.TERM?.includes('sixel') ||
    process.env.SIXEL_SUPPORT === 'true'
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

  // Add size parameter (required)
  params.push(`size=${base64Data.length}`)

  const paramString = params.join(';')

  // Format: ESC ] 1337 ; File = [params] : base64data BEL
  // Using \x1b for ESC and \x07 for BEL
  return `\x1b]1337;File=${paramString}:${base64Data}\x07`
}

/**
 * Generate Kitty graphics protocol escape sequence
 * @param base64Data - Base64 encoded image data
 * @param options - Display options
 */
function generateKittyImageSequence(
  base64Data: string,
  options: {
    width?: number // cells
    height?: number // cells
    id?: number
  } = {},
): string {
  const { width, height, id } = options

  // Build key-value pairs for the control data
  const kvPairs: string[] = [
    'a=T', // action: transmit and display
    'f=100', // format: PNG (100) - let Kitty auto-detect
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

  // Kitty requires chunked transmission for large images
  // For simplicity, we'll send in one chunk if small enough
  const CHUNK_SIZE = 4096

  if (base64Data.length <= CHUNK_SIZE) {
    // Single chunk: ESC _ G <control> ; <data> ESC \
    return `\x1b_G${controlData};${base64Data}\x1b\\`
  }

  // Multi-chunk transmission
  const chunks: string[] = []
  for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
    const chunk = base64Data.slice(i, i + CHUNK_SIZE)
    const isLast = i + CHUNK_SIZE >= base64Data.length
    const chunkControl = isLast ? controlData : `${controlData},m=1` // m=1 means more chunks coming
    chunks.push(`\x1b_G${chunkControl};${chunk}\x1b\\`)
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
