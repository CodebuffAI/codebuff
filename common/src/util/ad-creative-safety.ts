/** Terminal-safe normalization for advertiser-authored creative copy. */

const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
const OSC = /\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g
const STRING_COMMAND = /\x1b[PX^_][\s\S]*?(?:\x1b\\|\x07|$)/g
const SHORT_ESCAPE = /\x1b[\x20-\x2f]*[\x30-\x7e]?/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g
const BIDI_OVERRIDE = /[‪-‮⁦-⁩]/g
const INVISIBLE = /[​-‏⁠﻿]/g

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
    .replace(BIDI_OVERRIDE, '')
    .replace(INVISIBLE, '')
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
