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

/** Byte-exact sha256 used by filesystem mutation receipts and snapshots. */
export function getExactContentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

/**
 * Canonical sha256 content hash used by `read_files`, `apply_patch`,
 * `replace_range`, and `str_replace` for stale-edit / capability-token
 * validation. The hash is computed over the normalized (LF) content and
 * prefixed with `sha256:`.
 */
export function getContentHash(content: string): string {
  return getExactContentHash(normalizeLineEndings(content))
}

// ---------------------------------------------------------------------------
// Read capability tokens
// ---------------------------------------------------------------------------

/**
 * A successfully decoded authenticated read capability: a 1-indexed inclusive
 * line range, the canonical sha256 hash of its LF-normalized content, and its
 * opaque project/path/run scope fingerprint.
 */
export type ReplacementReadCapability = {
  startLine: number
  endLine: number
  hash: string
  scopeFingerprint: string
  tokenVersion: 'v3'
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
const READ_CAPABILITY_TOKEN_VERSION = 'v3'
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
    capability.tokenVersion === READ_CAPABILITY_TOKEN_VERSION &&
    capability.scopeFingerprint === getReadCapabilityScopeFingerprint(scope)
  )
}

/**
 * Encodes an authenticated, scoped read capability as
 * `cap.v3.<start>.<end>.<contentDigest>.<scopeDigest>.<hmac>`.
 * The scope binds the capability to its project, normalized path, and issuing
 * run; the canonical sha256 hash binds it to the content returned by the read.
 */
export function encodeReadCapabilityToken(params: {
  startLine: number
  endLine: number
  hash: string
  scope: ReadCapabilityScope
}): string {
  const { startLine, endLine, hash, scope } = params
  const sha256Match = hash.match(SHA256_HEX_PATTERN)
  if (!sha256Match) {
    throw new Error(
      'Read capabilities require a canonical sha256 content hash.',
    )
  }

  const digest = Buffer.from(sha256Match[1]!, 'hex').toString('base64url')
  const scopeFingerprint = getReadCapabilityScopeFingerprint(scope)
  const signedPayload = `${READ_CAPABILITY_TOKEN_VERSION}.${startLine}.${endLine}.${digest}.${scopeFingerprint}`
  const signature = createHmac('sha256', READ_CAPABILITY_SIGNING_KEY)
    .update(signedPayload)
    .digest('base64url')
  return `${READ_CAPABILITY_TOKEN_PREFIX}${signedPayload}.${signature}`
}

/**
 * Decodes an authenticated cap.v3 read capability. Returns a human-readable,
 * recoverable re-read error when the supplied value is malformed, unauthenticated,
 * or from any retired capability format.
 */
export function decodeReadCapabilityToken(
  token: string,
): ReplacementReadCapability | string {
  token = normalizeCopiedReadCapabilityToken(token)
  if (token.startsWith('whole.')) {
    return `Invalid basedOnRead: ${JSON.stringify(token)} is a legacy mutation capability, not cap.v3 read authorization. Re-read the target with read_files and copy its readCapability from the fresh editAnchor.`
  }

  const v3Prefix = `${READ_CAPABILITY_TOKEN_PREFIX}${READ_CAPABILITY_TOKEN_VERSION}.`
  if (!token.startsWith(v3Prefix)) {
    return `Invalid basedOnRead: expected an authenticated scoped cap.v3 readCapability, but received ${JSON.stringify(token)}. Re-read the target with read_files and copy its readCapability from the fresh editAnchor.`
  }

  const match = token.match(
    /^cap\.v3\.(\d+)\.(\d+)\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/,
  )
  if (!match) {
    return `Invalid basedOnRead capability token: malformed cap.v3 payload. Re-read the target range with read_files and copy the readCapability from the fresh editAnchor.`
  }

  const startLine = Number(match[1])
  const endLine = Number(match[2])
  const digest = Buffer.from(match[3]!, 'base64url')
  const scopeFingerprint = match[4]!
  const signature = Buffer.from(match[5]!, 'base64url')
  const signedPayload = `${READ_CAPABILITY_TOKEN_VERSION}.${match[1]}.${match[2]}.${match[3]}.${scopeFingerprint}`
  const expectedSignature = createHmac('sha256', READ_CAPABILITY_SIGNING_KEY)
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
    return `Invalid basedOnRead capability token: authentication failed. Re-read the target range with read_files and copy the readCapability from the fresh editAnchor.`
  }

  return {
    startLine,
    endLine,
    hash: `sha256:${digest.toString('hex')}`,
    scopeFingerprint,
    tokenVersion: 'v3',
  }
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
