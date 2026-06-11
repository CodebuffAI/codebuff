const OPAQUE_CLI_AUTH_CODE_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
// 16 random bytes -> 22 base64url chars. Keeps the full login URL inside 80
// terminal columns so the CLI never has to wrap it (a wrapped URL gets
// truncated when users click or copy only the first line).
export const CLI_AUTH_CODE_TOKEN_BYTES = 16
const base64UrlLength = (byteCount: number) => Math.ceil((byteCount * 4) / 3)
// Lengths of opaque tokens we have ever issued (43 = older randomBytes(32) deploys).
const ISSUED_CLI_AUTH_CODE_TOKEN_LENGTHS = new Set([
  base64UrlLength(CLI_AUTH_CODE_TOKEN_BYTES),
  43,
])
// Looser than the opaque-token check: a dot-free base64url-ish string of the
// wrong length is almost always a token whose tail was lost to terminal
// line-wrapping when the user copied or clicked the login URL.
const TRUNCATED_CLI_AUTH_CODE_TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/
const CLI_AUTH_CODE_HASH_RE = /^[a-f0-9]{64}$/i

export function isOpaqueCliAuthCodeToken(authCode: string): boolean {
  return OPAQUE_CLI_AUTH_CODE_TOKEN_RE.test(authCode.trim())
}

export function isLikelyTruncatedCliAuthCodeToken(authCode: string): boolean {
  const normalizedAuthCode = authCode.trim()
  return (
    TRUNCATED_CLI_AUTH_CODE_TOKEN_RE.test(normalizedAuthCode) &&
    !ISSUED_CLI_AUTH_CODE_TOKEN_LENGTHS.has(normalizedAuthCode.length)
  )
}

export function parseCliAuthCodeShape(authCode: string): {
  fingerprintId: string
  expiresAt: string
  receivedHash: string
} {
  const normalizedAuthCode = authCode.trim()
  const hashSeparatorIndex = normalizedAuthCode.lastIndexOf('.')
  const expiresSeparatorIndex = normalizedAuthCode.lastIndexOf(
    '.',
    hashSeparatorIndex - 1,
  )

  if (hashSeparatorIndex === -1 || expiresSeparatorIndex === -1) {
    const legacyMatch = normalizedAuthCode.match(
      /^(?<fingerprintId>.+)-(?<expiresAt>\d+)-(?<receivedHash>[a-f0-9]{64})$/i,
    )
    if (legacyMatch?.groups) {
      return {
        fingerprintId: legacyMatch.groups.fingerprintId,
        expiresAt: legacyMatch.groups.expiresAt,
        receivedHash: legacyMatch.groups.receivedHash,
      }
    }

    return { fingerprintId: '', expiresAt: '', receivedHash: '' }
  }

  const fingerprintId = normalizedAuthCode.slice(0, expiresSeparatorIndex)
  const expiresAt = normalizedAuthCode.slice(
    expiresSeparatorIndex + 1,
    hashSeparatorIndex,
  )
  const receivedHash = normalizedAuthCode.slice(hashSeparatorIndex + 1)

  return { fingerprintId, expiresAt, receivedHash }
}

export function isCliAuthCodeCandidate(authCode: string): boolean {
  if (isOpaqueCliAuthCodeToken(authCode)) {
    return true
  }

  const { fingerprintId, expiresAt, receivedHash } =
    parseCliAuthCodeShape(authCode)
  return (
    fingerprintId.length > 0 &&
    /^\d+$/.test(expiresAt) &&
    CLI_AUTH_CODE_HASH_RE.test(receivedHash)
  )
}

export function getCliAuthOnboardSearchParams(
  searchParams: URLSearchParams,
  authCode: string,
): URLSearchParams {
  const onboardParams = new URLSearchParams()
  searchParams.forEach((value, key) => {
    if (key !== 'auth_code') {
      onboardParams.append(key, value)
    }
  })
  onboardParams.set('auth_code', authCode)
  return onboardParams
}

export function getCliAuthOnboardPath(
  searchParams: URLSearchParams,
  authCode: string,
): string {
  return `/onboard?${getCliAuthOnboardSearchParams(
    searchParams,
    authCode,
  ).toString()}`
}
