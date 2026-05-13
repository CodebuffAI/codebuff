const OPAQUE_CLI_AUTH_CODE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const CLI_AUTH_CODE_HASH_RE = /^[a-f0-9]{64}$/i

export function isOpaqueCliAuthCodeToken(authCode: string): boolean {
  return OPAQUE_CLI_AUTH_CODE_TOKEN_RE.test(authCode.trim())
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
