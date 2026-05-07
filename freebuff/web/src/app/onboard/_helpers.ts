import { genAuthCode } from '@codebuff/common/util/credentials'

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
