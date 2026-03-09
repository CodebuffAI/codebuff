import { genAuthCode } from '@codebuff/common/util/credentials'

export function parseAuthCode(authCode: string): {
  fingerprintId: string
  expiresAt: string
  receivedHash: string
} {
  const [fingerprintId, expiresAt, receivedHash] = authCode.split('.')
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
  return expiresAt < Date.now().toString()
}
