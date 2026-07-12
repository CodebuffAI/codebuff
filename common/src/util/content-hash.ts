import { createHash } from 'node:crypto'

/**
 * Canonical CRLF→LF normalization shared by the read/edit toolchain so that
 * file-content hashes are stable across Windows/Unix checkouts.
 */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n')
}

/**
 * Canonical sha256 content hash used by `read_files`, `apply_patch`,
 * `replace_range`, and `str_replace` for stale-edit / capability-token
 * validation. The hash is computed over the normalized (LF) content and
 * prefixed with `sha256:` so callers can distinguish it from legacy hashes.
 */
export function getContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(normalizeLineEndings(content)).digest('hex')}`
}

// ---------------------------------------------------------------------------
// Read capability tokens
// ---------------------------------------------------------------------------

/**
 * A validated read capability: a 1-indexed inclusive line range plus the
 * sha256 hash of its (LF-normalized) content. `read_files` mints these from
 * range/slice headers; `str_replace` / `apply_patch` decode and re-validate
 * them statelessly against the current file (the hash is the authority).
 */
export type ReplacementReadCapability = {
  startLine: number
  endLine: number
  hash: string
}

export const READ_CAPABILITY_TOKEN_PREFIX = 'cap.'

/**
 * Encodes a read capability as a single self-contained opaque token. The token
 * embeds {startLine, endLine, rangeHash} so the model only ever copies ONE
 * value from a read_files header instead of three coupled fields it could
 * mispair. read_files mints these tokens; str_replace decodes and re-validates
 * them statelessly against the current file (the hash is still the authority).
 *
 * Format: `cap.` + base64url(`${startLine}:${endLine}:${hash}`).
 * Keep this format byte-identical to the decoder below.
 */
export function encodeReadCapabilityToken(params: {
  startLine: number
  endLine: number
  hash: string
}): string {
  const { startLine, endLine, hash } = params
  return (
    READ_CAPABILITY_TOKEN_PREFIX +
    Buffer.from(`${startLine}:${endLine}:${hash}`).toString('base64url')
  )
}

/**
 * Decodes an opaque read capability token back into its concrete
 * { startLine, endLine, hash } object. Returns a human-readable error string
 * (recoverable) when the token is malformed, so callers can surface it to the
 * model without throwing.
 */
export function decodeReadCapabilityToken(
  token: string,
): ReplacementReadCapability | string {
  if (token.startsWith('whole.')) {
    return `Invalid basedOnRead: ${JSON.stringify(token)} is a legacy mutation capability, not read authorization. New mutation results expose reusable cap.* tokens; for this legacy result, re-read the target with read_files and copy its readCapability.`
  }
  if (!token.startsWith(READ_CAPABILITY_TOKEN_PREFIX)) {
    return `Invalid basedOnRead: expected a read capability token ("${READ_CAPABILITY_TOKEN_PREFIX}...") or a { startLine, endLine, hash } object, but received ${JSON.stringify(token)}.`
  }
  let decoded: string
  try {
    decoded = Buffer.from(
      token.slice(READ_CAPABILITY_TOKEN_PREFIX.length),
      'base64url',
    ).toString('utf8')
  } catch {
    return `Invalid basedOnRead capability token: could not decode ${JSON.stringify(token)}. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  const firstSep = decoded.indexOf(':')
  const secondSep = decoded.indexOf(':', firstSep + 1)
  if (firstSep === -1 || secondSep === -1) {
    return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  const startLine = Number(decoded.slice(0, firstSep))
  const endLine = Number(decoded.slice(firstSep + 1, secondSep))
  const hash = decoded.slice(secondSep + 1)
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || !hash) {
    return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
  }
  return { startLine, endLine, hash }
}
