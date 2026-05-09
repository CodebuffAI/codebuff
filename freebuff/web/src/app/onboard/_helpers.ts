import { genAuthCode } from '@codebuff/common/util/credentials'

const OPAQUE_CLI_AUTH_CODE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function buildCliAuthCode(
  fingerprintId: string,
  expiresAt: string,
  fingerprintHash: string,
): string {
  return `${fingerprintId}.${expiresAt}.${fingerprintHash}`
}

export function isOpaqueCliAuthCodeToken(authCode: string): boolean {
  return OPAQUE_CLI_AUTH_CODE_TOKEN_RE.test(authCode.trim())
}

export async function resolveCliAuthCode(
  authCode: string,
  consumeCliAuthCodeToken: (authCodeToken: string) => Promise<string | null>,
): Promise<{ authCode: string; resolvedOpaqueToken: boolean }> {
  const normalizedAuthCode = authCode.trim()
  if (!isOpaqueCliAuthCodeToken(normalizedAuthCode)) {
    return { authCode: normalizedAuthCode, resolvedOpaqueToken: false }
  }

  const signedAuthCode = await consumeCliAuthCodeToken(normalizedAuthCode)
  if (!signedAuthCode) {
    return { authCode: normalizedAuthCode, resolvedOpaqueToken: false }
  }

  return {
    authCode: signedAuthCode,
    resolvedOpaqueToken: true,
  }
}

export function parseAuthCode(authCode: string): {
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

export function validateAuthCode(
  receivedHash: string,
  fingerprintId: string,
  expiresAt: string,
  secret: string,
): { valid: boolean; expectedHash: string } {
  const expectedHash = genAuthCode(fingerprintId, expiresAt, secret)
  return { valid: receivedHash === expectedHash, expectedHash }
}

export function isAuthCodeExpired(expiresAt: string): boolean {
  const expiresAtMs = Number(expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()
}
