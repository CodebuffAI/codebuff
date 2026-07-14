import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

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
 * A decoded read capability: a 1-indexed inclusive line range plus the sha256
 * hash of its LF-normalized content. Authenticated cap.v3 values also carry an
 * opaque project/path/run scope fingerprint; legacy values do not.
 */
export type ReplacementReadCapability = {
  startLine: number
  endLine: number
  hash: string
  /** Present only for authenticated, project/path/run-bound cap.v3 tokens. */
  scopeFingerprint?: string
  tokenVersion?: 'v3'
}

export type ReadCapabilityScope = {
  /** Stable project/root identity for the current runtime view. */
  projectId: string
  /** Canonical project-relative target path. */
  path: string
  /** Issuing agent run. Tokens are deliberately invalid across runs. */
  runId: string
}

export type ReadCapabilityIssuer = Pick<
  ReadCapabilityScope,
  'projectId' | 'runId'
>

export const READ_CAPABILITY_TOKEN_PREFIX = 'cap.'
const READ_CAPABILITY_TOKEN_VERSION = 'v2'
const SCOPED_READ_CAPABILITY_TOKEN_VERSION = 'v3'
const SHA256_HEX_PATTERN = /^sha256:([a-f0-9]{64})$/
const BASE64URL_SHA256_PATTERN = /^[A-Za-z0-9_-]{43}$/
// cap.v3 is an in-process runtime capability, not a reconstructable content
// checksum. Restarting the runtime invalidates outstanding tokens by design.
const READ_CAPABILITY_SIGNING_KEY = randomBytes(32)

function normalizeScopeComponent(value: string): string {
  return String(value ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
}

export function getReadCapabilityScopeFingerprint(
  scope: ReadCapabilityScope,
): string {
  const projectId = normalizeScopeComponent(scope.projectId)
  const targetPath = normalizeScopeComponent(scope.path).replace(/^\.\//, '')
  const runId = String(scope.runId ?? '').trim()
  return createHash('sha256')
    .update(`${projectId}\0${targetPath}\0${runId}`)
    .digest('base64url')
}

export function readCapabilityMatchesScope(
  capability: ReplacementReadCapability,
  scope: ReadCapabilityScope,
): boolean {
  return (
    capability.tokenVersion === SCOPED_READ_CAPABILITY_TOKEN_VERSION &&
    capability.scopeFingerprint === getReadCapabilityScopeFingerprint(scope)
  )
}

/**
 * Encodes a read capability as a single self-contained opaque token. The token
 * embeds {startLine, endLine, rangeHash} so the model only ever copies ONE
 * value from a read_files header instead of three coupled fields it could
 * mispair. read_files mints these tokens; str_replace decodes and re-validates
 * them statelessly against the current file (the hash is still the authority).
 *
 * Authorization format:
 * `cap.v3.<start>.<end>.<contentDigest>.<scopeDigest>.<hmac>`.
 * The authenticated scope binds project, normalized path, and issuing run.
 * The decoder continues to accept cap.v2/base64 legacy freshness tokens for
 * compatible non-strict flows, but callers decide whether those are safe.
 */
export function encodeReadCapabilityToken(params: {
  startLine: number
  endLine: number
  hash: string
  scope?: ReadCapabilityScope
}): string {
  const { startLine, endLine, hash, scope } = params
  const sha256Match = hash.match(SHA256_HEX_PATTERN)
  if (sha256Match) {
    const digest = Buffer.from(sha256Match[1]!, 'hex').toString('base64url')
    if (scope) {
      const scopeFingerprint = getReadCapabilityScopeFingerprint(scope)
      const signedPayload = `${SCOPED_READ_CAPABILITY_TOKEN_VERSION}.${startLine}.${endLine}.${digest}.${scopeFingerprint}`
      const signature = createHmac('sha256', READ_CAPABILITY_SIGNING_KEY)
        .update(signedPayload)
        .digest('base64url')
      return `${READ_CAPABILITY_TOKEN_PREFIX}${signedPayload}.${signature}`
    }
    return `${READ_CAPABILITY_TOKEN_PREFIX}${READ_CAPABILITY_TOKEN_VERSION}.${startLine}.${endLine}.${digest}`
  }

  if (scope) {
    throw new Error(
      'Scoped read capabilities require a canonical sha256 content hash.',
    )
  }

  // Preserve support for callers using a non-canonical hash during a gradual
  // migration. Production call sites use getContentHash() and therefore emit
  // the shorter v2 form above.
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
  token = normalizeCopiedReadCapabilityToken(token)
  if (token.startsWith('whole.')) {
    return `Invalid basedOnRead: ${JSON.stringify(token)} is a legacy mutation capability, not read authorization. New mutation results expose reusable cap.* tokens; for this legacy result, re-read the target with read_files and copy its readCapability.`
  }
  if (!token.startsWith(READ_CAPABILITY_TOKEN_PREFIX)) {
    return `Invalid basedOnRead: expected a read capability token ("${READ_CAPABILITY_TOKEN_PREFIX}...") or a { startLine, endLine, hash } object, but received ${JSON.stringify(token)}.`
  }
  const v2Prefix = `${READ_CAPABILITY_TOKEN_PREFIX}${READ_CAPABILITY_TOKEN_VERSION}.`
  const v3Prefix = `${READ_CAPABILITY_TOKEN_PREFIX}${SCOPED_READ_CAPABILITY_TOKEN_VERSION}.`
  if (token.startsWith(v3Prefix)) {
    const match = token.match(
      /^cap\.v3\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/,
    )
    if (!match) {
      return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
    }
    const startLine = Number(match[1])
    const endLine = Number(match[2])
    const digest = Buffer.from(match[3]!, 'base64url')
    const scopeFingerprint = match[4]!
    const signature = Buffer.from(match[5]!, 'base64url')
    const signedPayload = `${SCOPED_READ_CAPABILITY_TOKEN_VERSION}.${match[1]}.${match[2]}.${match[3]}.${scopeFingerprint}`
    const expectedSignature = createHmac(
      'sha256',
      READ_CAPABILITY_SIGNING_KEY,
    )
      .update(signedPayload)
      .digest()
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      digest.length !== 32 ||
      digest.toString('base64url') !== match[3] ||
      !BASE64URL_SHA256_PATTERN.test(scopeFingerprint) ||
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      return `Invalid basedOnRead capability token: authentication failed. Re-read the target range with read_files and copy the readCapability from the fresh header.`
    }
    return {
      startLine,
      endLine,
      hash: `sha256:${digest.toString('hex')}`,
      scopeFingerprint,
      tokenVersion: 'v3',
    }
  }
  if (token.startsWith(v2Prefix)) {
    const match = token.match(/^cap\.v2\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{43})$/)
    if (!match) {
      return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
    }
    const startLine = Number(match[1])
    const endLine = Number(match[2])
    const digest = Buffer.from(match[3]!, 'base64url')
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      digest.length !== 32 ||
      digest.toString('base64url') !== match[3]
    ) {
      return `Invalid basedOnRead capability token: malformed payload. Re-read the target range with read_files and copy the readCapability from the fresh header.`
    }
    return {
      startLine,
      endLine,
      hash: `sha256:${digest.toString('hex')}`,
    }
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

function normalizeCopiedReadCapabilityToken(token: string): string {
  let normalized = token.trim()
  normalized = normalized.replace(/^readCapability\s*=\s*/i, '')
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")) ||
      (normalized.startsWith('`') && normalized.endsWith('`')))
  ) {
    normalized = normalized.slice(1, -1).trim()
  }
  return normalized
}
