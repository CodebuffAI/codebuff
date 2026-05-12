import { createHash } from 'node:crypto'

import { genAuthCode } from '@codebuff/common/util/credentials'

const OPAQUE_CLI_AUTH_CODE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const CLI_AUTH_CODE_HASH_RE = /^[a-f0-9]{64}$/i
const CLI_AUTH_CODE_TOKEN_IDENTIFIER_PREFIX = 'cli-login:'
const CONSUMED_CLI_AUTH_CODE_TOKEN_IDENTIFIER_PREFIX = 'cli-login-consumed:'
const CONSUMED_CLI_AUTH_CODE_TOKEN_VALUE = 'consumed'

function getCliAuthCodeHash(authCode: string): string {
  return createHash('sha256').update(authCode.trim()).digest('hex')
}

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

export function isCliAuthCodeCandidate(authCode: string): boolean {
  if (isOpaqueCliAuthCodeToken(authCode)) {
    return true
  }

  const { fingerprintId, expiresAt, receivedHash } = parseAuthCode(authCode)
  return (
    fingerprintId.length > 0 &&
    /^\d+$/.test(expiresAt) &&
    CLI_AUTH_CODE_HASH_RE.test(receivedHash)
  )
}

export function getCliAuthCodeHashPrefix(authCode: string): string {
  return getCliAuthCodeHash(authCode).slice(0, 12)
}

export function getCliAuthCodeTokenIdentifier(authCodeToken: string): string {
  return `${CLI_AUTH_CODE_TOKEN_IDENTIFIER_PREFIX}${authCodeToken}`
}

export function getConsumedCliAuthCodeTokenIdentifier(
  authCodeToken: string,
): string {
  return `${CONSUMED_CLI_AUTH_CODE_TOKEN_IDENTIFIER_PREFIX}${getCliAuthCodeHash(
    authCodeToken,
  )}`
}

export function getConsumedCliAuthCodeTokenValue(): string {
  return CONSUMED_CLI_AUTH_CODE_TOKEN_VALUE
}

export type CliAuthCodeTokenConsumeResult =
  | { status: 'resolved'; authCode: string }
  | { status: 'already_consumed' }
  | { status: 'missing' }

export type CliAuthCodeResolution =
  | {
      status: 'ready'
      authCode: string
      resolvedOpaqueToken: boolean
    }
  | {
      status: 'already_consumed'
      authCode: string
      resolvedOpaqueToken: false
    }
  | {
      status: 'missing'
      authCode: string
      resolvedOpaqueToken: false
    }

export async function resolveCliAuthCode(
  authCode: string,
  consumeCliAuthCodeToken: (
    authCodeToken: string,
  ) => Promise<CliAuthCodeTokenConsumeResult>,
): Promise<CliAuthCodeResolution> {
  const normalizedAuthCode = authCode.trim()
  if (!isOpaqueCliAuthCodeToken(normalizedAuthCode)) {
    return {
      status: 'ready',
      authCode: normalizedAuthCode,
      resolvedOpaqueToken: false,
    }
  }

  const tokenResult = await consumeCliAuthCodeToken(normalizedAuthCode)
  if (tokenResult.status === 'resolved') {
    return {
      status: 'ready',
      authCode: tokenResult.authCode,
      resolvedOpaqueToken: true,
    }
  }

  if (tokenResult.status === 'already_consumed') {
    return {
      status: 'already_consumed',
      authCode: normalizedAuthCode,
      resolvedOpaqueToken: false,
    }
  }

  return {
    status: 'missing',
    authCode: normalizedAuthCode,
    resolvedOpaqueToken: false,
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
