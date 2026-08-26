/** Terminal-safe normalization for advertiser-authored creative copy. */

const CSI = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g
const OSC = /(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g
const STRING_COMMAND =
  /(?:\x1b[PX^_]|[\x90\x98\x9e\x9f])[\s\S]*?(?:\x1b\\|\x07|\x9c|$)/g
const SHORT_ESCAPE = /\x1b[\x20-\x2f]*[\x30-\x7e]?/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g

/**
 * Unicode Default_Ignorable_Code_Point characters are invisible, so they can
 * split a prohibited word or change its display without changing what a
 * reviewer sees. Keep this explicit rather than relying on a runtime Unicode
 * table: creative validation must be deterministic across our supported Bun
 * and browser runtimes. This covers the full property as of Unicode 16,
 * including bidi controls, tags, and both variation-selector blocks.
 */
const DEFAULT_IGNORABLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]/gu

/**
 * Strip sequences that can repaint a terminal, write its clipboard, disguise
 * text direction, or break width calculations. Applied at serve even when the
 * campaign API also validates at ingest: old/admin-written rows are untrusted.
 */
export function sanitizeAdText(input: string): string {
  return input
    .replace(OSC, '')
    .replace(STRING_COMMAND, '')
    .replace(CSI, '')
    .replace(SHORT_ESCAPE, '')
    .replace(DEFAULT_IGNORABLE, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .replace(CONTROL, '')
    .trim()
}

export function isAdTextSafe(input: string): boolean {
  return sanitizeAdText(input) === input.trim()
}

export function sanitizeAdUrl(raw: string): string {
  const cleaned = sanitizeAdText(raw)
  let parsed: URL
  try {
    parsed = new URL(cleaned)
  } catch {
    throw new Error('creative url is not a valid absolute URL')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`creative url protocol not allowed: ${parsed.protocol}`)
  }
  return parsed.toString()
}
